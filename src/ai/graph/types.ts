/**
 * Graph Runtime types.
 * Minimal implementation for Phase 1.
 */

/** Graph node function signature */
export type NodeFunction<S> = (state: S) => Promise<Partial<S>> | Partial<S>;

/** Edge destination resolver */
export type EdgeResolver<S> = (state: S) => string | typeof END;

/** Special end symbol */
export const END = Symbol('END');

/** Graph node definition */
export interface GraphNode<S> {
    name: string;
    fn: NodeFunction<S>;
}

/** Graph edge definition */
export interface GraphEdge<S> {
    from: string;
    to: string | EdgeResolver<S>;
}

/** Compiled graph */
export interface CompiledGraph<S> {
    invoke: (initialState: S, options?: InvokeOptions) => Promise<S>;
    stream: (initialState: S, options?: InvokeOptions) => AsyncGenerator<{ node: string; state: S }>;
}

/** Invoke options */
export interface InvokeOptions {
    /** Thread ID for checkpointing */
    threadId?: string;
    /** Maximum number of steps */
    maxSteps?: number;
}

/** Graph builder config */
export interface StateGraphConfig<S> {
    /** Entry point node */
    entryPoint?: string;
}
