/**
 * Sequential Orchestrator - Execute agents in sequence.
 * 
 * Each agent receives the output of the previous agent as context.
 */

import type { Agent } from '../create-agent';
import type {
    CrewConfig,
    CrewKickoffOptions,
    CrewResult,
    AgentResult,
    Crew,
} from './types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safely serialize context to string, handling circular references.
 */
function safeStringify(obj: unknown): string {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        // Handle circular references
        const seen = new WeakSet();
        return JSON.stringify(obj, (_key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }
            return value;
        }, 2);
    }
}

// ============================================================================
// Sequential Crew
// ============================================================================

/**
 * Create a crew with sequential orchestration.
 * Agents execute one after another, passing output as context.
 */
export function createSequentialCrew(config: CrewConfig): Crew {
    const { agents, verbose = false } = config;

    return {
        async kickoff(options: CrewKickoffOptions): Promise<CrewResult> {
            const startTime = Date.now();
            const agentResults: AgentResult[] = [];
            let currentContext = options.task;

            for (const agent of agents) {
                const agentStart = Date.now();

                if (verbose) {
                    console.log(`[Crew] Executing agent: ${agent.id}`);
                }

                try {
                    // Build prompt with context
                    let prompt = options.task;

                    // Include initial context if provided (safe serialization)
                    if (options.context && agentResults.length === 0) {
                        const contextStr = safeStringify(options.context);
                        prompt = `Context:\n${contextStr}\n\nTask: ${options.task}`;
                    }

                    // Include previous agent output
                    if (agentResults.length > 0) {
                        prompt = `Previous agent output:\n${currentContext}\n\nYour task: ${options.task}`;
                    }

                    // Check abort signal
                    if (options.abortSignal?.aborted) {
                        throw new Error('Crew execution aborted');
                    }

                    // Pass abort signal to agent for in-flight cancellation
                    const result = await agent.run({
                        prompt,
                        abortSignal: options.abortSignal,
                    });

                    const agentResult: AgentResult = {
                        agentId: agent.id,
                        output: result.text,
                        durationMs: Date.now() - agentStart,
                        success: true,
                    };

                    agentResults.push(agentResult);
                    currentContext = result.text;

                    if (verbose) {
                        console.log(`[Crew] Agent ${agent.id} completed in ${agentResult.durationMs}ms`);
                    }
                } catch (error) {
                    const agentResult: AgentResult = {
                        agentId: agent.id,
                        output: '',
                        durationMs: Date.now() - agentStart,
                        success: false,
                        error: error instanceof Error ? error : new Error(String(error)),
                    };

                    agentResults.push(agentResult);

                    // Stop on error
                    if (verbose) {
                        console.error(`[Crew] Agent ${agent.id} failed:`, error);
                    }
                    break;
                }
            }

            return {
                output: currentContext,
                agentResults,
                totalDurationMs: Date.now() - startTime,
                orchestration: 'sequential',
            };
        },

        getAgents(): Agent[] {
            return [...agents];
        },
    };
}
