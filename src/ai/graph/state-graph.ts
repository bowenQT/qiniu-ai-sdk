/**
 * StateGraph - LangGraph-inspired graph builder.
 * Minimal implementation for Phase 1.
 */

import type {
    NodeFunction,
    EdgeResolver,
    GraphNode,
    GraphEdge,
    CompiledGraph,
    InvokeOptions,
    StateGraphConfig,
} from './types';
import { END } from './types';

/** Maximum steps error */
export class MaxGraphStepsError extends Error {
    constructor(public readonly maxSteps: number) {
        super(`Graph execution exceeded maximum steps: ${maxSteps}`);
        this.name = 'MaxGraphStepsError';
    }
}

/**
 * StateGraph builder for agent workflows.
 */
export class StateGraph<S extends object> {
    private nodes = new Map<string, GraphNode<S>>();
    private edges: GraphEdge<S>[] = [];
    private entryPoint: string | null = null;

    constructor(private config: StateGraphConfig<S> = {}) {
        if (config.entryPoint) {
            this.entryPoint = config.entryPoint;
        }
    }

    /**
     * Add a node to the graph.
     */
    addNode(name: string, fn: NodeFunction<S>): this {
        this.nodes.set(name, { name, fn });

        // First node is default entry point
        if (!this.entryPoint) {
            this.entryPoint = name;
        }

        return this;
    }

    /**
     * Add an edge between nodes.
     */
    addEdge(from: string, to: string): this {
        this.edges.push({ from, to });
        return this;
    }

    /**
     * Add a conditional edge.
     */
    addConditionalEdge(from: string, resolver: EdgeResolver<S>): this {
        this.edges.push({ from, to: resolver });
        return this;
    }

    /**
     * Set the entry point.
     */
    setEntryPoint(name: string): this {
        this.entryPoint = name;
        return this;
    }

    /**
     * Compile the graph into an executable form.
     */
    compile(): CompiledGraph<S> {
        if (!this.entryPoint) {
            throw new Error('Graph has no entry point');
        }

        const nodes = new Map(this.nodes);
        const edges = [...this.edges];
        const entryPoint = this.entryPoint;

        return {
            invoke: async (initialState: S, options?: InvokeOptions): Promise<S> => {
                const maxSteps = options?.maxSteps ?? 100;
                let state = { ...initialState };
                let currentNode = entryPoint;
                let steps = 0;

                while (currentNode && steps < maxSteps) {
                    const node = nodes.get(currentNode);
                    if (!node) {
                        throw new Error(`Node not found: ${currentNode}`);
                    }

                    // Execute node
                    const update = await node.fn(state);
                    state = { ...state, ...update };
                    steps++;

                    // Find next node
                    const edge = edges.find(e => e.from === currentNode);
                    if (!edge) {
                        break; // No outgoing edge, stop
                    }

                    if (typeof edge.to === 'string') {
                        currentNode = edge.to;
                    } else {
                        const next = edge.to(state);
                        if (next === END) {
                            break;
                        }
                        currentNode = next as string;
                    }
                }

                if (steps >= maxSteps) {
                    throw new MaxGraphStepsError(maxSteps);
                }

                return state;
            },

            stream: async function* (initialState: S, options?: InvokeOptions) {
                const maxSteps = options?.maxSteps ?? 100;
                let state = { ...initialState };
                let currentNode = entryPoint;
                let steps = 0;

                while (currentNode && steps < maxSteps) {
                    const node = nodes.get(currentNode);
                    if (!node) {
                        throw new Error(`Node not found: ${currentNode}`);
                    }

                    // Execute node
                    const update = await node.fn(state);
                    state = { ...state, ...update };
                    steps++;

                    // Yield current state
                    yield { node: currentNode, state };

                    // Find next node
                    const edge = edges.find(e => e.from === currentNode);
                    if (!edge) {
                        break;
                    }

                    if (typeof edge.to === 'string') {
                        currentNode = edge.to;
                    } else {
                        const next = edge.to(state);
                        if (next === END) {
                            break;
                        }
                        currentNode = next as string;
                    }
                }

                if (steps >= maxSteps) {
                    throw new MaxGraphStepsError(maxSteps);
                }
            },
        };
    }
}
