import { z } from "zod";
import { ActionOutput, ResolvedLocator } from "./actions/types";
import { Page } from "playwright";
import { ErrorEmitter } from "@/utils";

export const AgentOutputFn = (
  actionsSchema: z.ZodTypeAny
) =>
  z.object({
    thoughts: z
      .string()
      .describe(
        "Your thoughts on the task at hand, was the previous goal successful?"
      ),
    memory: z
      .string()
      .describe(
        "Information that you need to remember to accomplish subsequent goals"
      ),
    nextGoal: z
      .string()
      .describe(
        "The next goal you are trying to accomplish with the actions you have chosen"
      ),
    actions: z.array(actionsSchema),
  });

export type AgentOutput = z.infer<ReturnType<typeof AgentOutputFn>>;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentStep {
  idx: number;
  agentOutput: AgentOutput;
  actionOutputs: ActionOutput[];
  tokenUsage?: TokenUsage;
}

export interface TaskParams {
  maxSteps?: number;
  debugDir?: string;
  outputSchema?: z.AnyZodObject;
  onStep?: (step: AgentStep) => Promise<void> | void;
  onComplete?: (output: TaskOutput) => Promise<void> | void;
  debugOnAgentOutput?: (step: AgentOutput) => void;
}

export interface TaskOutput {
  status?: TaskStatus;
  steps: AgentStep[];
  output?: string;
  /**
   * URL the page was on when the task started. Captured so that a plan
   * derived from this output can be replayed from a blank page.
   */
  startingUrl?: string;
}

export interface Task {
  getStatus: () => TaskStatus;
  pause: () => TaskStatus;
  resume: () => TaskStatus;
  cancel: () => TaskStatus;
  emitter: ErrorEmitter;
}

export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  PAUSED = "paused",
  CANCELLED = "cancelled",
  COMPLETED = "completed",
  FAILED = "failed",
}

export const endTaskStatuses = new Set([
  TaskStatus.CANCELLED,
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
]);

export interface TaskState {
  id: string;
  task: string;
  status: TaskStatus;
  startingPage: Page;
  steps: AgentStep[];
  output?: string;
  error?: string;
}

export interface AgentVariable {
  key: string;
  value: string;
  description: string;
}

export interface PlannedAction {
  type: string;
  params: Record<string, unknown>;
  resolvedLocator?: ResolvedLocator;
}

export interface AgentPlan {
  version: 1;
  task: string;
  createdAt: string;
  steps: PlannedAction[];
  output?: string;
  /**
   * URL to navigate to before running the first step. Captured from the page
   * at record time when the task did not itself begin with a `goToUrl`
   * action.
   */
  startingUrl?: string;
}

export interface ReplayOptions {
  page?: Page;
  variables?: Record<string, AgentVariable>;
  onStep?: (action: PlannedAction, output: ActionOutput) => void | Promise<void>;
  onError?: (
    action: PlannedAction,
    error: Error
  ) => "abort" | "skip" | Promise<"abort" | "skip">;
  aiFallback?: boolean;
  aiFallbackTask?: (action: PlannedAction) => string;
  /**
   * Per-step timeout (ms) used for the pre-action visibility wait. Defaults
   * to 10_000. Increase for slow-loading pages.
   */
  stepTimeoutMs?: number;
  /**
   * Override the URL to navigate to before running the first step. When
   * provided, takes precedence over the plan's own `startingUrl`.
   */
  startingUrl?: string;
}

export interface AgentPage extends Page {
  ai: (task: string, params?: TaskParams) => Promise<TaskOutput>;
  aiAsync: (task: string, params?: TaskParams) => Promise<Task>;
  extract<T extends z.AnyZodObject | undefined = undefined>(
    task?: string,
    outputSchema?: T
  ): Promise<T extends z.AnyZodObject ? z.infer<T> : string>;

  navigateTo: (url: string) => Promise<ActionOutput>;
  clickElement: (
    target: string | ResolvedLocator
  ) => Promise<ActionOutput>;
  inputText: (
    target: string | ResolvedLocator,
    text: string
  ) => Promise<ActionOutput>;
  selectOptionByText: (
    target: string | ResolvedLocator,
    text: string
  ) => Promise<ActionOutput>;
  scrollDirection: (
    dir: "up" | "down" | "left" | "right"
  ) => Promise<ActionOutput>;
  keyPress: (text: string) => Promise<ActionOutput>;
  back: () => Promise<ActionOutput>;
  forward: () => Promise<ActionOutput>;
  refresh: () => Promise<ActionOutput>;

  savePlan: (
    task: string,
    output: TaskOutput,
    filePath?: string
  ) => Promise<AgentPlan>;
  replay: (
    plan: AgentPlan | string,
    opts?: ReplayOptions
  ) => Promise<void>;
}
