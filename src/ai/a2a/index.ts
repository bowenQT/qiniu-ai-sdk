/**
 * A2A (Agent-to-Agent) Protocol - Public exports.
 */

// Types
export type {
    A2AMessage,
    A2AError,
    A2AErrorCode,
    RateLimitConfig,
    AgentExpertConfig,
    CallToolRequest,
    RunTaskRequest,
    RunTaskResult,
} from './types';

// Utilities
export {
    generateRequestId,
    createA2ARequest,
    createA2AResponse,
    createA2AError,
} from './types';

// Validation
export {
    validateSchema,
    sanitizeArgs,
    cloneAndSanitize,
    type ValidationResult,
    type JsonSchema,
} from './validation';

// Rate Limiter
export { A2ARateLimiter, RateLimitError } from './rate-limiter';

// AgentExpert
export { AgentExpert } from './expert';
