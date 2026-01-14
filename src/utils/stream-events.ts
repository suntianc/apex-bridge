/**
 * Stream event utilities
 * Unified helpers for SSE (Server-Sent Events) event serialization
 */

/**
 * Base event data structure
 */
export interface BaseEventData {
  event_type?: string;
  data?: unknown;
  iteration: number;
  step_number?: number;
}

/**
 * Reasoning start event
 */
export interface ReasoningStartEvent extends BaseEventData {
  event_type: "reasoning-start";
  data: string;
}

/**
 * Reasoning delta event (thinking content)
 */
export interface ReasoningDeltaEvent extends BaseEventData {
  reasoning_content: string;
  content: null;
  step_number: number;
}

/**
 * Reasoning end event
 */
export interface ReasoningEndEvent extends BaseEventData {
  event_type: "reasoning-end";
  data: string;
}

/**
 * Step start event
 */
export interface StepStartEvent extends BaseEventData {
  event_type: "step-start";
  data: string;
  step_number: number;
}

/**
 * Step finish event
 */
export interface StepFinishEvent extends BaseEventData {
  event_type: "step-finish";
  data: string;
  step_number: number;
}

/**
 * Content event (final response)
 */
export interface ContentEvent extends BaseEventData {
  reasoning_content: null;
  content: string;
  step_number: number;
}

/**
 * Tool start event
 */
export interface ToolStartEvent extends BaseEventData {
  event_type: "tool_start";
  data: string;
  step_number: number;
}

/**
 * Tool end event
 */
export interface ToolEndEvent extends BaseEventData {
  event_type: "tool_end";
  data: string;
  step_number: number;
}

/**
 * Done event (stream completed)
 */
export interface DoneEvent extends BaseEventData {
  event_type: "done";
  data: string;
}

/**
 * Error event
 */
export interface ErrorEvent extends BaseEventData {
  event_type: "error";
  data: string;
}

/**
 * Create reasoning start event
 */
export function createReasoningStartEvent(data: string, iteration: number): string {
  return JSON.stringify({
    event_type: "reasoning-start",
    data,
    iteration,
  });
}

/**
 * Create reasoning delta event
 */
export function createReasoningDeltaEvent(
  data: string,
  stepNumber: number,
  iteration: number
): string {
  return JSON.stringify({
    reasoning_content: data,
    content: null,
    step_number: stepNumber,
    iteration,
  });
}

/**
 * Create reasoning end event
 */
export function createReasoningEndEvent(data: string, iteration: number): string {
  return JSON.stringify({
    event_type: "reasoning-end",
    data,
    iteration,
  });
}

/**
 * Create step start event
 */
export function createStepStartEvent(data: string, stepNumber: number, iteration: number): string {
  return JSON.stringify({
    event_type: "step-start",
    data,
    iteration,
    step_number: stepNumber,
  });
}

/**
 * Create step finish event
 */
export function createStepFinishEvent(data: string, stepNumber: number, iteration: number): string {
  return JSON.stringify({
    event_type: "step-finish",
    data,
    iteration,
    step_number: stepNumber,
  });
}

/**
 * Create content event (final response)
 */
export function createContentEvent(data: string, stepNumber: number, iteration: number): string {
  return JSON.stringify({
    reasoning_content: null,
    content: data,
    step_number: stepNumber,
    iteration,
  });
}

/**
 * Create tool start event
 */
export function createToolStartEvent(data: string, stepNumber: number, iteration: number): string {
  return JSON.stringify({
    event_type: "tool_start",
    data,
    iteration,
    step_number: stepNumber,
  });
}

/**
 * Create tool end event
 */
export function createToolEndEvent(data: string, stepNumber: number, iteration: number): string {
  return JSON.stringify({
    event_type: "tool_end",
    data,
    iteration,
    step_number: stepNumber,
  });
}

/**
 * Create done event (stream completed)
 */
export function createDoneEvent(data: string, iteration: number): string {
  return JSON.stringify({
    event_type: "done",
    data,
    iteration,
  });
}

/**
 * Create error event
 */
export function createErrorEvent(data: string, iteration: number): string {
  return JSON.stringify({
    event_type: "error",
    data,
    iteration,
  });
}

/**
 * Serialize any event to JSON string
 */
export function serializeEvent(event: unknown): string {
  return JSON.stringify(event);
}

/**
 * Event type to serializer mapping
 */
export const eventSerializers: Record<
  string,
  (data: unknown, stepNumber?: number, iteration?: number) => string
> = {
  "reasoning-start": (data: unknown, _stepNumber?: number, iteration?: number) =>
    createReasoningStartEvent(data as string, iteration || 0),
  "reasoning-delta": (data: unknown, stepNumber?: number, iteration?: number) =>
    createReasoningDeltaEvent(data as string, stepNumber || 0, iteration || 0),
  "reasoning-end": (data: unknown, _stepNumber?: number, iteration?: number) =>
    createReasoningEndEvent(data as string, iteration || 0),
  "step-start": (data: unknown, stepNumber?: number, iteration?: number) =>
    createStepStartEvent(data as string, stepNumber || 0, iteration || 0),
  "step-finish": (data: unknown, stepNumber?: number, iteration?: number) =>
    createStepFinishEvent(data as string, stepNumber || 0, iteration || 0),
  content: (data: unknown, stepNumber?: number, iteration?: number) =>
    createContentEvent(data as string, stepNumber || 0, iteration || 0),
  tool_start: (data: unknown, stepNumber?: number, iteration?: number) =>
    createToolStartEvent(data as string, stepNumber || 0, iteration || 0),
  tool_end: (data: unknown, stepNumber?: number, iteration?: number) =>
    createToolEndEvent(data as string, stepNumber || 0, iteration || 0),
  done: (data: unknown, _stepNumber?: number, iteration?: number) =>
    createDoneEvent(data as string, iteration || 0),
  error: (data: unknown, _stepNumber?: number, iteration?: number) =>
    createErrorEvent(data as string, iteration || 0),
};

/**
 * Serialize event using appropriate serializer
 */
export function serializeStreamEvent(
  eventType: string,
  data: unknown,
  stepNumber?: number,
  iteration?: number
): string {
  const serializer = eventSerializers[eventType];
  if (serializer) {
    return serializer(data, stepNumber, iteration);
  }
  // Fallback to generic serialization
  return serializeEvent({ type: eventType, data, step_number: stepNumber, iteration });
}
