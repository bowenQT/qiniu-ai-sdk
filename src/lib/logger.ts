/**
 * Logger interface for SDK observability.
 * Users can provide their own logger (e.g., pino, winston, console).
 */
export interface Logger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Default no-op logger (silent)
 */
export const noopLogger: Logger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};

/**
 * Console logger for development/debugging
 */
export const consoleLogger: Logger = {
    debug: (msg, meta) => console.debug(`[QiniuAI:DEBUG] ${msg}`, meta ?? ''),
    info: (msg, meta) => console.info(`[QiniuAI:INFO] ${msg}`, meta ?? ''),
    warn: (msg, meta) => console.warn(`[QiniuAI:WARN] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[QiniuAI:ERROR] ${msg}`, meta ?? ''),
};

/**
 * Log levels for filtering
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};

/**
 * Creates a filtered logger that only logs messages at or above the specified level
 */
export function createFilteredLogger(baseLogger: Logger, level: LogLevel): Logger {
    const minPriority = LOG_LEVEL_PRIORITY[level];

    return {
        debug: (msg, meta) => {
            if (LOG_LEVEL_PRIORITY.debug >= minPriority) {
                baseLogger.debug(msg, meta);
            }
        },
        info: (msg, meta) => {
            if (LOG_LEVEL_PRIORITY.info >= minPriority) {
                baseLogger.info(msg, meta);
            }
        },
        warn: (msg, meta) => {
            if (LOG_LEVEL_PRIORITY.warn >= minPriority) {
                baseLogger.warn(msg, meta);
            }
        },
        error: (msg, meta) => {
            if (LOG_LEVEL_PRIORITY.error >= minPriority) {
                baseLogger.error(msg, meta);
            }
        },
    };
}
