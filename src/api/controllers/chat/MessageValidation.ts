/**
 * MessageValidation - Message Validation
 *
 * Handles message validation, format checking, and content verification.
 */

import { logger } from "../../../utils/logger";

export interface ValidationResult<T = any> {
  valid: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

export interface MessagePart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ValidatedMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | MessagePart[];
  name?: string;
}

/**
 * MessageValidation - Message Validation
 *
 * Responsible for validating chat messages and their content.
 */
export class MessageValidation {
  private allowedRoles: Set<string>;
  private maxMessageLength: number;
  private maxContentArrayLength: number;

  constructor(
    options: {
      allowedRoles?: string[];
      maxMessageLength?: number;
      maxContentArrayLength?: number;
    } = {}
  ) {
    this.allowedRoles = new Set(options.allowedRoles || ["system", "user", "assistant"]);
    this.maxMessageLength = options.maxMessageLength || 100000;
    this.maxContentArrayLength = options.maxContentArrayLength || 100;
    logger.info("MessageValidation initialized", {
      allowedRoles: Array.from(this.allowedRoles),
      maxMessageLength: this.maxMessageLength,
    });
  }

  /**
   * Validate a single message
   */
  validateMessage(message: any): ValidationResult<ValidatedMessage> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check role
    if (!message.role) {
      errors.push("Message role is required");
    } else if (!this.allowedRoles.has(message.role)) {
      errors.push(`Invalid message role: ${message.role}`);
    }

    // Check content
    if (message.content === undefined || message.content === null) {
      errors.push("Message content is required");
    } else if (typeof message.content === "string") {
      if (message.content.length > this.maxMessageLength) {
        errors.push(`Message content exceeds maximum length of ${this.maxMessageLength}`);
      }
    } else if (Array.isArray(message.content)) {
      if (message.content.length > this.maxContentArrayLength) {
        errors.push(`Content array exceeds maximum length of ${this.maxContentArrayLength}`);
      }

      // Validate content parts
      for (let i = 0; i < message.content.length; i++) {
        const part = message.content[i];
        const partValidation = this.validateContentPart(part);

        if (!partValidation.valid) {
          errors.push(`Content part ${i}: ${partValidation.error}`);
        }

        warnings.push(...(partValidation.warnings || []));
      }
    } else {
      errors.push("Message content must be a string or array");
    }

    if (errors.length > 0) {
      return {
        valid: false,
        error: errors.join("; "),
        warnings,
      };
    }

    return {
      valid: true,
      data: {
        role: message.role,
        content: message.content,
        name: message.name,
      },
      warnings,
    };
  }

  /**
   * Validate content part
   */
  validateContentPart(part: any): ValidationResult<MessagePart> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!part.type) {
      errors.push("Content part type is required");
      return { valid: false, error: errors.join("; "), warnings };
    }

    if (!["text", "image_url"].includes(part.type)) {
      errors.push(`Invalid content part type: ${part.type}`);
    }

    if (part.type === "text") {
      if (typeof part.text !== "string" || part.text.length === 0) {
        errors.push("Text part must have non-empty text");
      }
    } else if (part.type === "image_url") {
      if (!part.image_url) {
        errors.push("Image URL part must have image_url");
      } else if (
        typeof part.image_url !== "string" &&
        (!part.image_url.url || typeof part.image_url.url !== "string")
      ) {
        errors.push("Image URL must be a valid URL string");
      } else if (typeof part.image_url === "string" && part.image_url.length > 2000) {
        warnings.push("Image URL is very long, may affect performance");
      }
    }

    return {
      valid: errors.length === 0,
      data: part,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      warnings,
    };
  }

  /**
   * Validate message array
   */
  validateMessageArray(messages: any[]): ValidationResult<ValidatedMessage[]> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validatedMessages: ValidatedMessage[] = [];

    if (!Array.isArray(messages)) {
      return { valid: false, error: "Messages must be an array" };
    }

    if (messages.length === 0) {
      return { valid: false, error: "Messages array cannot be empty" };
    }

    for (let i = 0; i < messages.length; i++) {
      const messageValidation = this.validateMessage(messages[i]);

      if (!messageValidation.valid) {
        errors.push(`Message ${i}: ${messageValidation.error}`);
      } else if (messageValidation.data) {
        validatedMessages.push(messageValidation.data);
      }

      warnings.push(...(messageValidation.warnings || []));
    }

    if (errors.length > 0) {
      return {
        valid: false,
        error: errors.join("; "),
        warnings,
      };
    }

    return {
      valid: true,
      data: validatedMessages,
      warnings,
    };
  }

  /**
   * Check if message has multimodal content
   */
  hasMultimodalContent(message: any): boolean {
    if (Array.isArray(message.content)) {
      return message.content.some((part: any) => part.type === "image_url");
    }
    return false;
  }

  /**
   * Count multimodal messages
   */
  countMultimodalMessages(messages: any[]): number {
    return messages.filter((m) => this.hasMultimodalContent(m)).length;
  }

  /**
   * Extract image URLs from messages
   */
  extractImageUrls(messages: any[]): string[] {
    const urls: string[] = [];

    for (const message of messages) {
      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "image_url") {
            const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
            if (url) {
              urls.push(url);
            }
          }
        }
      }
    }

    return urls;
  }

  /**
   * Add allowed role
   */
  addAllowedRole(role: string): void {
    this.allowedRoles.add(role);
  }

  /**
   * Remove allowed role
   */
  removeAllowedRole(role: string): void {
    this.allowedRoles.delete(role);
  }

  /**
   * Get allowed roles
   */
  getAllowedRoles(): string[] {
    return Array.from(this.allowedRoles);
  }
}

/**
 * Create MessageValidation instance
 */
export function createMessageValidation(options?: {
  allowedRoles?: string[];
  maxMessageLength?: number;
  maxContentArrayLength?: number;
}): MessageValidation {
  return new MessageValidation(options);
}
