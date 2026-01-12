/**
 * chat controller module - Unified Exports
 *
 * Main entry point for the chat controller module.
 */

// Main controller
export { ChatController, createChatController } from "./ChatController";

// Sub-modules
export { ChatCompletionsHandler, createChatCompletionsHandler } from "./ChatCompletionsHandler";
export type { CompletionsResult } from "./ChatCompletionsHandler";

export { StreamResponseHandler, createStreamResponseHandler } from "./StreamResponseHandler";

export { MessageValidation, createMessageValidation } from "./MessageValidation";
export type { ValidationResult, ValidatedMessage, MessagePart } from "./MessageValidation";
