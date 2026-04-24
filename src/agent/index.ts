import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Browser, BrowserContext, Page } from "playwright";
import { v4 as uuidv4 } from "uuid";

import { BrowserProviders, BrowserAgentConfig } from "@/types/config";
import {
  ActionContext,
  ActionOutput,
  ActionType,
  AgentActionDefinition,
  AgentPlan,
  endTaskStatuses,
  ReplayOptions,
  ResolvedLocator,
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
import {
  loadPlanFromFile,
  replayPlan as replayPlanInternal,
  savePlanToFile,
  taskOutputToPlan,
} from "./replay";
import { DOMState, InteractiveElement } from "@/context-providers/dom/types";

export class BrowserAgent<T extends BrowserProviders = "Local"> {
  private llm?: BaseChatModel;
  private tasks: Record<string, TaskState> = {};
  private tokenLimit = 128000;
  private debug = false;
  private verbose = false;
  private verboseIncludeScreenshots = false;
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

  constructor(params: BrowserAgentConfig<T>) {
    this.llm = params.llm;
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
    this.verbose = params.verbose ?? false;
    this.verboseIncludeScreenshots = params.verboseIncludeScreenshots ?? false;
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
        ignoreHTTPSErrors: true,
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
      return [
        ...this.actions,
        generateCompleteActionWithOutputDefinition(outputSchema),
      ];
    } else {
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
    if (!this.llm) {
      throw new BrowserAgentError(
        "No LLM provider configured. Pass `llm` to BrowserAgent to use .ai() / .aiAsync() / .extract().",
        400
      );
    }
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
    runAgentTask(
      {
        llm: this.llm,
        actions: this.getActions(params?.outputSchema),
        tokenLimit: this.tokenLimit,
        debug: this.debug,
        verbose: this.verbose,
        verboseIncludeScreenshots: this.verboseIncludeScreenshots,
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
    if (!this.llm) {
      throw new BrowserAgentError(
        "No LLM provider configured. Pass `llm` to BrowserAgent to use .ai() / .aiAsync() / .extract().",
        400
      );
    }
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
    try {
      return await runAgentTask(
        {
          llm: this.llm,
          actions: this.getActions(params?.outputSchema),
          tokenLimit: this.tokenLimit,
          debug: this.debug,
          verbose: this.verbose,
          verboseIncludeScreenshots: this.verboseIncludeScreenshots,
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

  /**
   * Flatten a TaskOutput into a portable AgentPlan and optionally persist it
   * to disk. Replayable without an LLM via `agent.replay(...)`.
   */
  public async savePlan(
    task: string,
    output: TaskOutput,
    filePath?: string
  ): Promise<AgentPlan> {
    if (filePath) {
      return savePlanToFile(task, output, filePath);
    }
    return taskOutputToPlan(task, output);
  }

  /**
   * Deterministically replay a previously recorded AgentPlan without
   * contacting an LLM. If the plan is passed as a string it is loaded from
   * disk. Pass `opts.aiFallback = true` to fall back to `.ai()` for any
   * individual action that fails (requires an `llm` to be configured).
   */
  public async replay(
    plan: AgentPlan | string,
    opts: ReplayOptions = {}
  ): Promise<void> {
    const resolvedPlan =
      typeof plan === "string" ? await loadPlanFromFile(plan) : plan;
    const page = opts.page ?? (await this.getCurrentPage());
    const aiRunner = opts.aiFallback
      ? async (p: Page, t: string) => {
          if (!this.llm) {
            throw new BrowserAgentError(
              "aiFallback requires `llm` to be configured on BrowserAgent.",
              400
            );
          }
          await this.executeTask(t, { maxSteps: 3 }, p);
        }
      : undefined;

    await replayPlanInternal(
      {
        page,
        actions: this.getActions(),
        tokenLimit: this.tokenLimit,
        variables: this._variables,
        llm: this.llm,
      },
      resolvedPlan,
      opts,
      aiRunner
    );
  }

  /**
   * Run a single registered action against a page with a synthesized
   * ActionContext. Accepts either an index (only meaningful if a DOM state
   * has been recorded), a Playwright selector string, or a ResolvedLocator.
   */
  private async runActionDirect(
    page: Page,
    type: string,
    params: Record<string, unknown>,
    target?: number | string | ResolvedLocator
  ): Promise<ActionOutput> {
    const handler = this.actions.find((a) => a.type === type);
    if (!handler) {
      return { success: false, message: `Unknown action type "${type}"` };
    }

    let domState: DOMState = {
      elements: new Map<number, InteractiveElement>(),
      domState: "",
      screenshot: "",
    };
    let finalParams = { ...params };

    if (target !== undefined) {
      const indexKey = 0;
      let resolved: ResolvedLocator | null = null;

      if (typeof target === "number") {
        return {
          success: false,
          message:
            "Numeric indices require a live DOM state; use a selector string or ResolvedLocator instead.",
        };
      } else if (typeof target === "string") {
        const selector = target.trim();
        const isXpath =
          selector.startsWith("xpath=") ||
          selector.startsWith("/") ||
          selector.startsWith("(");
        resolved = {
          xpath: isXpath
            ? selector.startsWith("xpath=")
              ? selector.slice("xpath=".length)
              : selector
            : "",
          cssPath: isXpath ? "" : selector,
          isUnderShadowRoot: false,
        };
      } else {
        resolved = target;
      }

      const elements = new Map<number, InteractiveElement>();
      elements.set(indexKey, {
        element: {} as HTMLElement,
        isUnderShadowRoot: resolved.isUnderShadowRoot,
        rect: {} as DOMRect,
        cssPath: resolved.cssPath,
        xpath: resolved.xpath,
      });
      domState = { elements, domState: "", screenshot: "" };
      finalParams = { ...params, index: indexKey };
    }

    const actionCtx: ActionContext = {
      page,
      domState,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llm: this.llm as any,
      tokenLimit: this.tokenLimit,
      variables: Object.values(this._variables),
    };

    try {
      return await handler.run(actionCtx, finalParams);
    } catch (err) {
      return {
        success: false,
        message: `Action "${type}" threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  private setupAgentPage(page: Page): AgentPage {
    const agentPage = page as AgentPage;
    agentPage.ai = (task: string, params?: TaskParams) =>
      this.executeTask(task, params, page);
    agentPage.aiAsync = (task: string, params?: TaskParams) =>
      this.executeTaskAsync(task, params, page);

    agentPage.navigateTo = (url: string) =>
      this.runActionDirect(page, "goToUrl", { url });
    agentPage.clickElement = (target) =>
      this.runActionDirect(page, "clickElement", {}, target);
    agentPage.inputText = (target, text) =>
      this.runActionDirect(page, "inputText", { text }, target);
    agentPage.selectOptionByText = (target, text) =>
      this.runActionDirect(page, "selectOption", { text }, target);
    agentPage.scrollDirection = (direction) =>
      this.runActionDirect(page, "scroll", { direction });
    agentPage.keyPress = (text) =>
      this.runActionDirect(page, "keyPress", { text });
    agentPage.back = () => this.runActionDirect(page, "pageBack", {});
    agentPage.forward = () => this.runActionDirect(page, "pageForward", {});
    agentPage.refresh = () => this.runActionDirect(page, "refreshPage", {});

    agentPage.savePlan = (
      task: string,
      output: TaskOutput,
      filePath?: string
    ) => this.savePlan(task, output, filePath);
    agentPage.replay = (plan: AgentPlan | string, opts?: ReplayOptions) =>
      this.replay(plan, { ...(opts ?? {}), page });

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
