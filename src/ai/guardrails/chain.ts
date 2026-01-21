/**
 * Guardrail Chain - Execute guardrails in sequence.
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    GuardrailChainResult,
    GuardrailPhase,
    GuardrailAction,
} from './types';
import { ACTION_PRIORITY } from './types';

// ============================================================================
// Chain
// ============================================================================

/**
 * Execute a chain of guardrails.
 */
export class GuardrailChain {
    private guardrails: Guardrail[] = [];

    constructor(guardrails: Guardrail[] = []) {
        this.guardrails = guardrails;
    }

    /**
     * Add a guardrail to the chain.
     */
    add(guardrail: Guardrail): this {
        this.guardrails.push(guardrail);
        return this;
    }

    /**
     * Execute all guardrails for a given phase.
     */
    async execute(
        phase: GuardrailPhase,
        context: Omit<GuardrailContext, 'phase'>
    ): Promise<GuardrailChainResult> {
        const fullContext: GuardrailContext = { ...context, phase };
        const results: GuardrailResult[] = [];
        let currentContent = context.content;
        let highestAction: GuardrailAction = 'pass';

        // Filter guardrails for this phase
        const applicableGuardrails = this.guardrails.filter(g => {
            const phases = Array.isArray(g.phase) ? g.phase : [g.phase];
            return phases.includes(phase);
        });

        // Execute each guardrail
        for (const guardrail of applicableGuardrails) {
            try {
                const result = await guardrail.process({
                    ...fullContext,
                    content: currentContent,
                });

                // Add guardrail name
                result.guardrailName = guardrail.name;
                results.push(result);

                // Update highest action
                if (ACTION_PRIORITY[result.action] > ACTION_PRIORITY[highestAction]) {
                    highestAction = result.action;
                }

                // Apply content modification
                if (result.action === 'redact' && result.modifiedContent !== undefined) {
                    currentContent = result.modifiedContent;
                }

                // Stop on block
                if (result.action === 'block') {
                    break;
                }
            } catch (error) {
                // Treat errors as block
                results.push({
                    action: 'block',
                    reason: `Guardrail error: ${error instanceof Error ? error.message : String(error)}`,
                    guardrailName: guardrail.name,
                });
                highestAction = 'block';
                break;
            }
        }

        return {
            action: highestAction,
            content: currentContent,
            results,
            shouldProceed: highestAction !== 'block',
        };
    }

    /**
     * Get all registered guardrails.
     */
    getGuardrails(): Guardrail[] {
        return [...this.guardrails];
    }
}

// ============================================================================
// Error
// ============================================================================

export class GuardrailBlockedError extends Error {
    readonly code = 'GUARDRAIL_BLOCKED' as const;
    readonly results: GuardrailResult[];

    constructor(message: string, results: GuardrailResult[]) {
        super(message);
        this.name = 'GuardrailBlockedError';
        this.results = results;
    }
}
