export interface TaskHandle<TState, TResult = TState, TWaitOptions = unknown> {
    id: string;
    get(): Promise<TState>;
    wait(options?: TWaitOptions): Promise<TResult>;
    cancel(): Promise<void>;
}

export function createUnsupportedTaskCancellation(kind: string, id: string): () => Promise<void> {
    return async () => {
        throw new Error(`${kind} task cancellation is not supported for task ${id}`);
    };
}
