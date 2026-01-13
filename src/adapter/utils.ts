export function generatorToReadableStream<T>(
    generator: AsyncGenerator<T>
): ReadableStream<T> {
    const ReadableStreamConstructor = (globalThis as { ReadableStream?: unknown }).ReadableStream;
    if (!ReadableStreamConstructor) {
        throw new Error('ReadableStream is not available in this environment.');
    }

    const constructor = ReadableStreamConstructor as new (underlyingSource: any) => ReadableStream<T>;

    return new constructor({
        async pull(controller: { close: () => void; enqueue: (chunk: T) => void }) {
            const { value, done } = await generator.next();
            if (done) {
                controller.close();
                return;
            }
            controller.enqueue(value);
        },
        async cancel() {
            if (typeof generator.return === 'function') {
                await generator.return(undefined);
            }
        },
    });
}
