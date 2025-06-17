import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { Browser, BrowserContext, Page } from "playwright";
import { v4 as uuidv4 } from "uuid";

import { BrowserProviders, BrowserAgentConfig } from "@/types/config";
import {
  ActionType,
  AgentActionDefinition,
  endTaskStatuses,
  Task,
  TaskOutput,
  TaskParams,
  TaskState,
  TaskStatus,
} from "@/types";
import {
  CompleteActionDefinition,
  DEFAULT_ACTIONS,
  generateCompleteActionWithOutputDefinition,
} from "./actions";
import {
  LocalBrowserProvider,
  ServerlessBrowserProvider,
  RemoteBrowserProvider,
} from "../browser-providers";
import { BrowserAgentError } from "./error";
import { runAgentTask } from "./tools/agent";
import { AgentPage, AgentVariable } from "@/types/agent/types";
import { z } from "zod";
import { ErrorEmitter } from "@/utils";

export class BrowserAgent<T extends BrowserProviders = "Local"> {
  private llm: BaseChatModel;
  private tasks: Record<string, TaskState> = {};
  private tokenLimit = 128000;
  private debug = false;
  private browserProvider: T extends "Serverless"
    ? ServerlessBrowserProvider
    : T extends "Remote"
      ? RemoteBrowserProvider
      : LocalBrowserProvider;
  private browserProviderType: T;
  private actions: Array<AgentActionDefinition> = [...DEFAULT_ACTIONS];

  public browser: Browser | null = null;
  public context: BrowserContext | null = null;
  private _currentPage: Page | null = null;
  private _variables: Record<string, AgentVariable> = {};
  private errorEmitter: ErrorEmitter;

  public get currentPage(): AgentPage | null {
    if (this._currentPage) {
      return this.setupAgentPage(this._currentPage);
    }
    return null;
  }

  public set currentPage(page: Page) {
    this._currentPage = page;
  }

  constructor(params: BrowserAgentConfig<T> = {}) {
    if (!params.llm) {
      if (process.env.OPENAI_API_KEY) {
        this.llm = new ChatOpenAI({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: "gpt-4o-mini",
          temperature: 0,
        });
      } else {
        throw new BrowserAgentError("No LLM provider provided", 400);
      }
    } else {
      this.llm = params.llm;
    }
    this.browserProviderType = (params.browserProvider ?? "Local") as T;

    this.browserProvider = (
      this.browserProviderType === "Serverless"
        ? new ServerlessBrowserProvider(params.serverlessConfig!)
        : this.browserProviderType === "Remote"
          ? new RemoteBrowserProvider(params.remoteConfig!)
          : new LocalBrowserProvider(params.localConfig ?? {})
    ) as T extends "Serverless"
      ? ServerlessBrowserProvider
      : T extends "Remote"
        ? RemoteBrowserProvider
        : LocalBrowserProvider;

    if (params.customActions) {
      params.customActions.forEach(this.registerAction, this);
    }

    this.debug = params.debug ?? false;
    this.errorEmitter = new ErrorEmitter();
  }

  /**
   *  This is just exposed as a utility function. You don't need to call it explicitly.
   * @returns A reference to the current Playwright browser instance.
   */
  public async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await this.browserProvider.start();
      this.context = await this.browser.newContext({
        viewport: null,
      });

      // Inject script to track event listeners
      await this.context.addInitScript(() => {
        // TODO: Check this list of events
        const interactiveEvents = new Set([
          "click",
          "mousedown",
          "mouseup",
          "keydown",
          "keyup",
          "keypress",
          "submit",
          "change",
          "input",
          "focus",
          "blur",
        ]); // Add more events as needed

        const originalAddEventListener = Element.prototype.addEventListener;
        Element.prototype.addEventListener = function (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions
        ) {
          if (interactiveEvents.has(type.toLowerCase())) {
            this.setAttribute("data-has-interactive-listener", "true");
          }
          originalAddEventListener.call(this, type, listener, options);
        };
      });

      return this.browser;
    }
    return this.browser;
  }

  /**
   * Use this function instead of accessing this.actions directly.
   * This function configures if there is a need for an output schema as a part of the complete action.
   * @param outputSchema
   * @returns
   */
  private getActions(
    outputSchema?: z.AnyZodObject
  ): Array<AgentActionDefinition> {
    if (outputSchema) {
      console.log("output schema", JSON.stringify(outputSchema, null, 2));
      return [
        ...this.actions,
        generateCompleteActionWithOutputDefinition(outputSchema),
      ];
    } else {
      console.log("no output schema");
      return [...this.actions, CompleteActionDefinition];
    }
  }

  /**
   * Get all variables
   * @returns Record of variables
   */
  public getVariables(): Record<string, AgentVariable> {
    return this._variables;
  }

  /**
   * Set a variable
   * @param key Key of the variable
   * @param value Value of the variable
   */
  public addVariable(variable: AgentVariable): void {
    this._variables[variable.key] = variable;
  }

  /**
   * Get a variable
   * @param key Key of the variable
   * @returns Value of the variable
   */
  public getVariable(key: string): AgentVariable | undefined {
    return this._variables[key];
  }

  /**
   * Delete a variable
   * @param key Key of the variable
   */
  public deleteVariable(key: string): void {
    delete this._variables[key];
  }

  /**
   * Get all pages in the context
   * @returns Array of AgentPage objects
   */
  public async getPages(): Promise<AgentPage[]> {
    if (!this.browser) {
      await this.initBrowser();
    }
    if (!this.context) {
      throw new BrowserAgentError("No context found");
    }
    return this.context.pages().map(this.setupAgentPage.bind(this), this);
  }

  /**
   * Create a new page in the context
   * @returns AgentPage object
   */
  public async newPage(): Promise<AgentPage> {
    if (!this.browser) {
      await this.initBrowser();
    }
    if (!this.context) {
      throw new BrowserAgentError("No context found");
    }
    const page = await this.context.newPage();
    return this.setupAgentPage(page);
  }

  /**
   * Close the agent and all associated resources
   */
  public async closeAgent(): Promise<void> {
    for (const taskId in this.tasks) {
      const task = this.tasks[taskId];
      if (!endTaskStatuses.has(task.status)) {
        task.status = TaskStatus.CANCELLED;
      }
    }

    if (this.browser) {
      await this.browserProvider.close();
      this.browser = null;
      this.context = null;
    }
  }

  /**
   * Get the current page or create a new one if none exists
   * @returns The current page
   */
  public async getCurrentPage(): Promise<Page> {
    if (!this.browser) {
      await this.initBrowser();
    }
    if (!this.context) {
      throw new BrowserAgentError("No context found");
    }
    if (!this.currentPage || this.currentPage.isClosed()) {
      this._currentPage = await this.context.newPage();

      return this.setupAgentPage(this._currentPage);
    }
    return this.currentPage;
  }

  /**
   * Get task control object for a specific task
   * @param taskId ID of the task
   * @returns Task control object
   */
  private getTaskControl(taskId: string): Task {
    const taskState = this.tasks[taskId];
    if (!taskState) {
      throw new BrowserAgentError(`Task ${taskId} not found`);
    }
    return {
      getStatus: () => taskState.status,
      pause: () => {
        if (taskState.status === TaskStatus.RUNNING) {
          taskState.status = TaskStatus.PAUSED;
        }
        return taskState.status;
      },
      resume: () => {
        if (taskState.status === TaskStatus.PAUSED) {
          taskState.status = TaskStatus.RUNNING;
        }
        return taskState.status;
      },
      cancel: () => {
        if (taskState.status !== TaskStatus.COMPLETED) {
          taskState.status = TaskStatus.CANCELLED;
        }
        return taskState.status;
      },
      emitter: this.errorEmitter,
    };
  }

  /**
   * Execute a task asynchronously and return a Task control object
   * @param task The task to execute
   * @param params Optional parameters for the task
   * @param initPage Optional page to use for the task
   * @returns A promise that resolves to a Task control object for managing the running task
   */
  public async executeTaskAsync(
    task: string,
    params?: TaskParams,
    initPage?: Page
  ): Promise<Task> {
    const taskId = uuidv4();
    const page = initPage || (await this.getCurrentPage());
    const taskState: TaskState = {
      id: taskId,
      task: task,
      status: TaskStatus.PENDING,
      startingPage: page,
      steps: [],
    };
    this.tasks[taskId] = taskState;
    console.log(
      "actions async",
      JSON.stringify(this.getActions(params?.outputSchema), null, 2)
    );
    runAgentTask(
      {
        llm: this.llm,
        actions: this.getActions(params?.outputSchema),
        tokenLimit: this.tokenLimit,
        debug: this.debug,
        variables: this._variables,
      },
      taskState,
      params
    ).catch((error: Error) => {
      // Retrieve the correct state to update
      const failedTaskState = this.tasks[taskId];
      if (failedTaskState) {
        failedTaskState.status = TaskStatus.FAILED;
        failedTaskState.error = error.message;
        // Emit error on the central emitter, including the taskId
        this.errorEmitter.emit("error", error);
      } else {
        // Fallback if task state somehow doesn't exist
        console.error(`Task state ${taskId} not found during error handling.`);
      }
    });
    return this.getTaskControl(taskId);
  }

  /**
   * Execute a task and wait for completion
   * @param task The task to execute
   * @param params Optional parameters for the task
   * @param initPage Optional page to use for the task
   * @returns A promise that resolves to the task output
   */
  public async executeTask(
    task: string,
    params?: TaskParams,
    initPage?: Page
  ): Promise<TaskOutput> {
    const taskId = uuidv4();
    const page = initPage || (await this.getCurrentPage());
    const taskState: TaskState = {
      id: taskId,
      task: task,
      status: TaskStatus.PENDING,
      startingPage: page,
      steps: [],
    };
    this.tasks[taskId] = taskState;
    console.log("actions sync", JSON.stringify(params?.outputSchema, null, 2));
    try {
      return await runAgentTask(
        {
          llm: this.llm,
          actions: this.getActions(params?.outputSchema),
          tokenLimit: this.tokenLimit,
          debug: this.debug,
          variables: this._variables,
        },
        taskState,
        params
      );
    } catch (error) {
      taskState.status = TaskStatus.FAILED;
      throw error;
    }
  }

  /**
   * Register a new action with the agent
   * @param action The action to register
   */
  private async registerAction(action: AgentActionDefinition) {
    if (action.type === "complete") {
      throw new BrowserAgentError(
        "Could not add an action with the name 'complete'. Complete is a reserved action.",
        400
      );
    }
    const actionsList = new Set(
      this.actions.map((registeredAction) => registeredAction.type)
    );
    if (actionsList.has(action.type)) {
      throw new Error(
        `Could not register action of type ${action.type}. Action with the same name is already registered`
      );
    } else {
      this.actions.push(action);
    }
  }

  /**
   * Pretty print an action
   * @param action The action to print
   * @returns Formatted string representation of the action
   */
  public pprintAction(action: ActionType): string {
    const foundAction = this.actions.find(
      (actions) => actions.type === action.type
    );
    if (foundAction && foundAction.pprintAction) {
      return foundAction.pprintAction(action.params);
    }
    return "";
  }

  public getSession() {
    const session = this.browserProvider.getSession();
    if (!session) {
      return null;
    }
    return session;
  }

  private setupAgentPage(page: Page): AgentPage {
    const agentPage = page as AgentPage;
    agentPage.ai = (task: string, params?: TaskParams) =>
      this.executeTask(task, params, page);
    agentPage.aiAsync = (task: string, params?: TaskParams) =>
      this.executeTaskAsync(task, params, page);
    agentPage.extract = async (task, outputSchema) => {
      if (!task && !outputSchema) {
        throw new BrowserAgentError(
          "No task description or output schema specified",
          400
        );
      }
      if (task) {
        const res = await this.executeTask(
          `You have to perform an extraction on the current page. You have to perform the extraction according to the task: ${task}. Make sure your final response only contains the extracted content`,
          {
            maxSteps: 2,
            outputSchema,
          },
          page
        );
        if (outputSchema) {
          return JSON.parse(res.output as string);
        }
        return res.output as string;
      } else {
        const res = await this.executeTask(
          "You have to perform a data extraction on the current page. Make sure your final response only contains the extracted content",
          { maxSteps: 2, outputSchema },
          page
        );
        return JSON.parse(res.output as string);
      }
    };
    return agentPage;
  }
}
