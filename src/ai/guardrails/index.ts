/**
 * Guardrails Module - Public exports
 */

// Types
export type {
    Guardrail,
    GuardrailPhase,
    CanonicalGuardrailPhase,
    GuardrailAction,
    GuardrailContext,
    GuardrailResult,
    GuardrailChainResult,
    ContentFilterConfig,
    ContentCategory,
    TokenLimiterConfig,
    GuardrailTokenStore,
} from './types';

export { ACTION_PRIORITY } from './types';

// Governance
export {
    InMemoryGuardrailPolicyStore,
    buildGuardrailPromotionDecision,
    createGuardrailPolicyRecord,
    createGuardrailPolicyRecordFromLabels,
    evaluateGuardrailPolicy,
} from './governance';
export type {
    GuardrailPolicyEvaluationInput,
    GuardrailPolicyEvaluationResult,
    GuardrailPolicyEvaluationStatus,
    GuardrailPolicyPromotionDecisionInput,
    GuardrailPolicyRecord,
    GuardrailPolicyStore,
} from './governance';

// Chain
export { GuardrailChain, GuardrailBlockedError } from './chain';

// Built-in guardrails
export { inputFilter } from './input-filter';
export { outputFilter } from './output-filter';
export { toolFilter } from './tool-filter';
export { tokenLimiter } from './token-limiter';
