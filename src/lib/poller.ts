import { Logger, noopLogger } from './logger';

/**
 * Options for task polling
 */
export interface PollerOptions<T> {
    /**
     * Polling interval in milliseconds
     */
    intervalMs: number;

    /**
     * Maximum time to wait before timeout (milliseconds)
     */
    timeoutMs: number;

    /**
     * Maximum consecutive errors before giving up
     */
    maxRetries?: number;

    /**
     * AbortSignal for cancellation
     */
    signal?: AbortSignal;

    /**
     * Function to check if result is in terminal state
     */
    isTerminal: (result: T) => boolean;

    /**
     * Function to get current status
     */
    getStatus: (id: string) => Promise<T>;

    /**
     * Logger instance
     */
    logger?: Logger;

    /**
     * Optional callback for each poll result (for progress tracking)
     */
    onPoll?: (result: T, pollCount: number) => void;
}

/**
 * Poll result with metadata
 */
export interface PollResult<T> {
    /**
     * Final result
     */
    result: T;

    /**
     * Number of polls performed
     */
    pollCount: number;

    /**
     * Total duration in milliseconds
     */
    duration: number;
}

/**
 * Poll for task completion with configurable options.
 * Supports retry on transient errors, cancellation, and timeout.
 *
 * @param id - Task identifier
 * @param options - Polling configuration
 * @returns Final result when task reaches terminal state
 *
 * @example
 * ```typescript
 * const result = await pollUntilComplete('task-123', {
 *   intervalMs: 2000,
 *   timeoutMs: 120000,
 *   maxRetries: 3,
 *   isTerminal: (r) => r.status === 'succeed' || r.status === 'failed',
 *   getStatus: (id) => client.get(`/tasks/${id}`),
 *   logger: consoleLogger,
 * });
 * ```
 */
export async function pollUntilComplete<T>(
    id: string,
    options: PollerOptions<T>
): Promise<PollResult<T>> {
    const {
        intervalMs,
        timeoutMs,
        maxRetries = 3,
        signal,
        isTerminal,
        getStatus,
        logger = noopLogger,
        onPoll,
    } = options;

    if (intervalMs <= 0 || timeoutMs <= 0) {
        throw new Error('intervalMs and timeoutMs must be positive numbers');
    }

    logger.debug('Starting task polling', { id, intervalMs, timeoutMs, maxRetries });

    const startTime = Date.now();
    let pollCount = 0;
    let consecutiveErrors = 0;

    while (Date.now() - startTime < timeoutMs) {
        // Check for cancellation
        if (signal?.aborted) {
            logger.info('Task polling cancelled', { id, pollCount });
            throw new Error('Operation cancelled');
        }

        pollCount++;

        try {
            const result = await getStatus(id);
            consecutiveErrors = 0; // Reset on success

            // Invoke progress callback if provided
            if (onPoll) {
                onPoll(result, pollCount);
            }

            // Check for terminal state
            if (isTerminal(result)) {
                const duration = Date.now() - startTime;
                logger.info('Task completed', { id, pollCount, duration });
                return { result, pollCount, duration };
            }
        } catch (error) {
            consecutiveErrors++;
            logger.warn('Transient error during polling', {
                id,
                attempt: consecutiveErrors,
                maxRetries,
                error: error instanceof Error ? error.message : String(error),
            });

            if (consecutiveErrors >= maxRetries) {
                throw new Error(
                    `Failed to get task status after ${maxRetries} retries: ` +
                    `${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // Wait before next poll
        await waitWithCancellation(intervalMs, signal);
    }

    const duration = Date.now() - startTime;
    logger.error('Task polling timeout', { id, timeoutMs, pollCount, duration });
    throw new Error(`Timeout waiting for task after ${timeoutMs}ms`);
}

/**
 * Wait for specified duration with cancellation support
 */
async function waitWithCancellation(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Operation cancelled'));
            return;
        }

        const timeoutHandle = setTimeout(resolve, ms);

        if (signal) {
            const abortHandler = () => {
                clearTimeout(timeoutHandle);
                reject(new Error('Operation cancelled'));
            };

            signal.addEventListener('abort', abortHandler, { once: true });

            // Cleanup listener after timeout
            setTimeout(() => {
                signal.removeEventListener('abort', abortHandler);
            }, ms + 10);
        }
    });
}

/**
 * Create a reusable poller factory for a specific task type.
 * Useful when you have consistent polling settings across multiple calls.
 *
 * @example
 * ```typescript
 * const imagePoller = createPoller<ImageTaskResponse>({
 *   intervalMs: 2000,
 *   timeoutMs: 120000,
 *   isTerminal: (r) => ['succeed', 'failed'].includes(r.status || ''),
 *   getStatus: (id) => client.image.get(id),
 * });
 *
 * // Use it multiple times
 * const result1 = await imagePoller.poll('task-1');
 * const result2 = await imagePoller.poll('task-2');
 * ```
 */
export function createPoller<T>(baseOptions: Omit<PollerOptions<T>, 'signal' | 'onPoll'>) {
    return {
        /**
         * Poll for a specific task
         */
        poll: (
            id: string,
            overrides?: Partial<Pick<PollerOptions<T>, 'signal' | 'onPoll' | 'timeoutMs' | 'intervalMs'>>
        ): Promise<PollResult<T>> => {
            return pollUntilComplete(id, { ...baseOptions, ...overrides });
        },
    };
}
