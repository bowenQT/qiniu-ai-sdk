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

    return {
        async kickoff(options: CrewKickoffOptions): Promise<CrewResult> {
            const startTime = Date.now();
            const agentResults: AgentResult[] = [];

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

            // Manager planning phase
            const managerStart = Date.now();
            try {
                if (options.abortSignal?.aborted) {
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

                if (verbose) {
                    console.log(`[Crew] Manager delegated: ${managerResult.text}`);
                }

                // Parse manager's delegation
                let delegations: Array<{ agent: string; task: string }> = [];
                try {
                    // Extract JSON from response
                    const jsonMatch = managerResult.text.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        delegations = JSON.parse(jsonMatch[0]);
                    }
                } catch {
                    if (verbose) {
                        console.warn('[Crew] Failed to parse manager response, running all agents');
                    }
                    // Fallback: run all agents with original task
                    delegations = agents.map(a => ({ agent: a.id, task: options.task }));
                }

                // Execute delegated tasks
                const workerOutputs: string[] = [];
                for (const delegation of delegations) {
                    const worker = agents.find(a => a.id === delegation.agent);
                    if (!worker) {
                        if (verbose) {
                            console.warn(`[Crew] Unknown agent: ${delegation.agent}`);
                        }
                        continue;
                    }

                    const workerStart = Date.now();

                    if (options.abortSignal?.aborted) {
                        throw new Error('Crew execution aborted');
                    }

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
                    }
                }

                // Aggregate results
                const output = workerOutputs.length > 0
                    ? workerOutputs.join('\n\n---\n\n')
                    : 'No workers completed successfully';

                return {
                    output,
                    agentResults,
                    totalDurationMs: Date.now() - startTime,
                    orchestration: 'hierarchical',
                };
            } catch (error) {
                agentResults.push({
                    agentId: manager.id,
                    output: '',
                    durationMs: Date.now() - managerStart,
                    success: false,
                    error: error instanceof Error ? error : new Error(String(error)),
                });

                return {
                    output: 'Manager failed to delegate',
                    agentResults,
                    totalDurationMs: Date.now() - startTime,
                    orchestration: 'hierarchical',
                };
            }
        },

        getAgents(): Agent[] {
            return [manager, ...agents];
        },
    };
}
