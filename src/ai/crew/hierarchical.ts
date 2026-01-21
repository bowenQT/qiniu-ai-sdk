/**
 * Hierarchical Orchestrator - Manager delegates to workers.
 * 
 * A manager agent decides which worker agents to invoke based on the task.
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

/**
 * Validate and normalize delegation entry.
 */
function validateDelegation(
    entry: unknown,
    validAgentIds: Set<string>
): { agent: string; task: string } | null {
    if (typeof entry !== 'object' || entry === null) {
        return null;
    }

    const obj = entry as Record<string, unknown>;
    const agent = obj.agent;
    const task = obj.task;

    // Validate agent ID
    if (typeof agent !== 'string' || !validAgentIds.has(agent)) {
        return null;
    }

    // Validate task
    if (typeof task !== 'string' || task.trim() === '') {
        return null;
    }

    return { agent, task };
}

/**
 * Build prompt with context.
 */
function buildPromptWithContext(task: string, context?: Record<string, unknown>): string {
    if (!context) {
        return task;
    }
    return `Context:\n${safeStringify(context)}\n\nTask: ${task}`;
}

// ============================================================================
// Hierarchical Crew
// ============================================================================

/**
 * Create a crew with hierarchical orchestration.
 * A manager agent delegates tasks to worker agents.
 */
export function createHierarchicalCrew(config: CrewConfig): Crew {
    const { agents, manager, verbose = false } = config;

    if (!manager) {
        throw new Error('Hierarchical orchestration requires a manager agent');
    }

    // Valid agent IDs for delegation validation
    const validAgentIds = new Set(agents.map(a => a.id));

    return {
        async kickoff(options: CrewKickoffOptions): Promise<CrewResult> {
            const startTime = Date.now();
            const agentResults: AgentResult[] = [];
            let aborted = false;

            if (verbose) {
                console.log(`[Crew] Hierarchical execution with manager: ${manager.id}`);
            }

            // Build worker descriptions for manager
            const workerDescriptions = agents
                .map(a => `- ${a.id}`)
                .join('\n');

            // Build context string
            let contextStr = '';
            if (options.context) {
                contextStr = `\nContext:\n${safeStringify(options.context)}`;
            }

            // Ask manager to delegate
            const managerPrompt = `You are a manager coordinating a team of agents.

Available workers:
${workerDescriptions}

Task: ${options.task}${contextStr}

Decide which worker(s) to assign and provide specific instructions for each.
Respond with a JSON array: [{"agent": "agent_id", "task": "specific task"}]
Only use agent IDs from the list above.`;

            // Phase 1: Manager planning
            const managerStart = Date.now();
            let managerSucceeded = false;
            let delegations: Array<{ agent: string; task: string }> = [];

            try {
                if (options.abortSignal?.aborted) {
                    aborted = true;
                    throw new Error('Crew execution aborted');
                }

                const managerResult = await manager.run({
                    prompt: managerPrompt,
                    abortSignal: options.abortSignal,
                });

                agentResults.push({
                    agentId: manager.id,
                    output: managerResult.text,
                    durationMs: Date.now() - managerStart,
                    success: true,
                });

                managerSucceeded = true;

                if (verbose) {
                    console.log(`[Crew] Manager delegated: ${managerResult.text}`);
                }

                // Parse and validate manager's delegation
                try {
                    const jsonMatch = managerResult.text.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
                        for (const entry of parsed) {
                            const validated = validateDelegation(entry, validAgentIds);
                            if (validated) {
                                delegations.push(validated);
                            } else if (verbose) {
                                console.warn('[Crew] Invalid delegation entry:', entry);
                            }
                        }
                    }
                } catch {
                    if (verbose) {
                        console.warn('[Crew] Failed to parse manager response');
                    }
                }

                // Fallback: run all agents with context-aware task
                if (delegations.length === 0) {
                    if (verbose) {
                        console.log('[Crew] No valid delegations, running all agents');
                    }
                    const fallbackTask = buildPromptWithContext(options.task, options.context);
                    delegations = agents.map(a => ({ agent: a.id, task: fallbackTask }));
                }
            } catch (error) {
                // Manager failed - check if aborted
                if (options.abortSignal?.aborted) {
                    aborted = true;
                }

                agentResults.push({
                    agentId: manager.id,
                    output: '',
                    durationMs: Date.now() - managerStart,
                    success: false,
                    error: error instanceof Error ? error : new Error(String(error)),
                });

                return {
                    output: aborted ? 'Execution aborted' : 'Manager failed to delegate',
                    agentResults,
                    totalDurationMs: Date.now() - startTime,
                    orchestration: 'hierarchical',
                };
            }

            // Phase 2: Execute delegated tasks
            const workerOutputs: string[] = [];

            for (const delegation of delegations) {
                // Check abort before each worker
                if (options.abortSignal?.aborted) {
                    aborted = true;
                    break;
                }

                const worker = agents.find(a => a.id === delegation.agent);
                if (!worker) {
                    // Should not happen due to validation, but be safe
                    continue;
                }

                const workerStart = Date.now();

                try {
                    const workerResult = await worker.run({
                        prompt: delegation.task,
                        abortSignal: options.abortSignal,
                    });

                    agentResults.push({
                        agentId: worker.id,
                        output: workerResult.text,
                        durationMs: Date.now() - workerStart,
                        success: true,
                    });

                    workerOutputs.push(`[${worker.id}]\n${workerResult.text}`);

                    if (verbose) {
                        console.log(`[Crew] Worker ${worker.id} completed`);
                    }
                } catch (error) {
                    // Check if this specific error is an abort
                    if (options.abortSignal?.aborted) {
                        aborted = true;
                    }

                    agentResults.push({
                        agentId: worker.id,
                        output: '',
                        durationMs: Date.now() - workerStart,
                        success: false,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });

                    if (verbose) {
                        console.error(`[Crew] Worker ${worker.id} failed:`, error);
                    }

                    // Continue to next worker on error (don't abort entire crew)
                }
            }

            // Build final output
            let output: string;
            if (aborted) {
                output = workerOutputs.length > 0
                    ? `Execution aborted (partial results):\n\n${workerOutputs.join('\n\n---\n\n')}`
                    : 'Execution aborted';
            } else if (workerOutputs.length > 0) {
                output = workerOutputs.join('\n\n---\n\n');
            } else {
                output = 'No workers completed successfully';
            }

            return {
                output,
                agentResults,
                totalDurationMs: Date.now() - startTime,
                orchestration: 'hierarchical',
            };
        },

        getAgents(): Agent[] {
            // Deduplicate: don't include manager if it's also in agents
            const agentIds = new Set(agents.map(a => a.id));
            if (agentIds.has(manager.id)) {
                return [...agents];
            }
            return [manager, ...agents];
        },
    };
}
