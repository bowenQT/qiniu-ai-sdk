/**
 * Parallel Orchestrator - Execute agents concurrently.
 * 
 * All agents run in parallel, results are aggregated.
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
// Parallel Crew
// ============================================================================

/**
 * Create a crew with parallel orchestration.
 * All agents execute concurrently with the same task.
 */
export function createParallelCrew(config: CrewConfig): Crew {
    const { agents, verbose = false } = config;

    return {
        async kickoff(options: CrewKickoffOptions): Promise<CrewResult> {
            const startTime = Date.now();

            if (verbose) {
                console.log(`[Crew] Starting parallel execution with ${agents.length} agents`);
            }

            // Build context-aware prompt with safe serialization
            let prompt = options.task;
            if (options.context) {
                const contextStr = safeStringify(options.context);
                prompt = `Context:\n${contextStr}\n\nTask: ${options.task}`;
            }

            // Execute all agents in parallel
            const agentPromises = agents.map(async (agent): Promise<AgentResult> => {
                const agentStart = Date.now();

                if (verbose) {
                    console.log(`[Crew] Starting agent: ${agent.id}`);
                }

                try {
                    // Check abort signal before starting
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

                    if (verbose) {
                        console.log(`[Crew] Agent ${agent.id} completed in ${agentResult.durationMs}ms`);
                    }

                    return agentResult;
                } catch (error) {
                    const agentResult: AgentResult = {
                        agentId: agent.id,
                        output: '',
                        durationMs: Date.now() - agentStart,
                        success: false,
                        error: error instanceof Error ? error : new Error(String(error)),
                    };

                    if (verbose) {
                        console.error(`[Crew] Agent ${agent.id} failed:`, error);
                    }

                    return agentResult;
                }
            });

            // Wait for all agents to complete
            const agentResults = await Promise.all(agentPromises);

            // Aggregate outputs from successful agents
            const successfulOutputs = agentResults
                .filter(r => r.success)
                .map(r => `[${r.agentId}]\n${r.output}`)
                .join('\n\n---\n\n');

            return {
                output: successfulOutputs || 'All agents failed',
                agentResults,
                totalDurationMs: Date.now() - startTime,
                orchestration: 'parallel',
            };
        },

        getAgents(): Agent[] {
            return [...agents];
        },
    };
}
