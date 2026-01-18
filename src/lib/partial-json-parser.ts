/**
 * Incremental JSON parser for streaming structured output.
 * Parses partial JSON strings as they arrive, returning the most complete object possible.
 * 
 * @example
 * ```typescript
 * const parser = new PartialJsonParser();
 * 
 * parser.append('{"title": "Hello');
 * console.log(parser.getPartial()); // { title: 'Hello' }
 * 
 * parser.append('", "done": true}');
 * console.log(parser.getPartial()); // { title: 'Hello', done: true }
 * ```
 */

/**
 * Result of parsing attempt.
 */
export interface ParseResult<T = unknown> {
    /** Whether the JSON is complete and valid */
    complete: boolean;
    /** The parsed partial object (may be incomplete) */
    value: T | null;
    /** Parsing error if any */
    error?: string;
}

/**
 * Incremental JSON parser that handles partial JSON strings.
 */
export class PartialJsonParser {
    private buffer = '';

    /**
     * Append new content to the buffer.
     */
    append(chunk: string): void {
        this.buffer += chunk;
    }

    /**
     * Get the current buffer content.
     */
    getBuffer(): string {
        return this.buffer;
    }

    /**
     * Reset the parser.
     */
    reset(): void {
        this.buffer = '';
    }

    /**
     * Try to parse the current buffer as complete JSON.
     */
    parseComplete<T = unknown>(): ParseResult<T> {
        try {
            const value = JSON.parse(this.buffer) as T;
            return { complete: true, value };
        } catch {
            return { complete: false, value: null };
        }
    }

    /**
     * Parse the current buffer, attempting to complete partial JSON.
     * Returns the most complete object possible.
     */
    parsePartial<T = unknown>(): ParseResult<T> {
        // Try complete parse first
        const complete = this.parseComplete<T>();
        if (complete.complete) {
            return complete;
        }

        // Try to complete partial JSON
        const completed = this.completePartialJson(this.buffer);
        if (completed) {
            try {
                const value = JSON.parse(completed) as T;
                return { complete: false, value };
            } catch {
                return { complete: false, value: null, error: 'Failed to parse completed JSON' };
            }
        }

        return { complete: false, value: null };
    }

    /**
     * Attempt to complete partial JSON by adding missing closing brackets.
     */
    private completePartialJson(json: string): string | null {
        if (!json.trim()) {
            return null;
        }

        // Track open brackets
        const stack: string[] = [];
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < json.length; i++) {
            const char = json[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }

            if (inString) {
                continue;
            }

            if (char === '{') {
                stack.push('}');
            } else if (char === '[') {
                stack.push(']');
            } else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }

        // If in string, close it
        let completed = json;
        if (inString) {
            completed += '"';
        }

        // Close all open brackets in reverse order
        while (stack.length > 0) {
            completed += stack.pop();
        }

        return completed;
    }
}

/**
 * Parse a partial JSON string, returning the most complete object possible.
 * Convenience function for one-shot parsing.
 */
export function parsePartialJson<T = unknown>(json: string): ParseResult<T> {
    const parser = new PartialJsonParser();
    parser.append(json);
    return parser.parsePartial<T>();
}
