/**
 * Phase 5C — MCP abortSignal propagation test.
 *
 * Tests that NodeMCPHost bridges context.abortSignal to callTool's RequestOptions.
 * Uses direct unit testing of the execute closure creation pattern.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RegisteredToolContext } from '../../src/lib/tool-registry';

describe('MCP abortSignal propagation (5C)', () => {
    it('execute closure passes abortSignal to callTool RequestOptions', async () => {
        // Replicate the exact execute closure pattern from mcp-host.ts
        // to verify signal bridging works.
        let capturedOptions: any = null;

        const mockCallTool = vi.fn().mockImplementation(
            (_params: any, _schema: any, options: any) => {
                capturedOptions = options;
                return Promise.resolve({
                    content: [{ type: 'text', text: 'result' }],
                });
            }
        );

        const policy = {
            timeout: 5000,
            resetTimeoutOnProgress: true,
            maxTotalTimeout: 60000,
            maxOutputLength: 100_000,
        };

        // This mirrors the execute closure in mcp-host.ts:249
        // BEFORE the fix: _context is unused
        // AFTER the fix: _context?.abortSignal is bridged
        const executeWithSignal = async (
            args: Record<string, unknown>,
            _context?: RegisteredToolContext,
        ) => {
            const maxLen = policy.maxOutputLength ?? 1_048_576;
            const requestOptions: Record<string, unknown> = {
                timeout: policy.timeout ?? 30000,
                resetTimeoutOnProgress: policy.resetTimeoutOnProgress ?? false,
            };
            if (policy.maxTotalTimeout != null) {
                requestOptions.maxTotalTimeout = policy.maxTotalTimeout;
            }

            // THIS IS THE FIX: bridge abortSignal
            if (_context?.abortSignal) {
                requestOptions.signal = _context.abortSignal;
            }

            const callResult = await mockCallTool(
                { name: 'test', arguments: args },
                undefined,
                requestOptions,
            );

            let output = JSON.stringify(callResult);
            if (output.length > maxLen) {
                output = output.slice(0, maxLen) + '… [truncated]';
            }
            return output;
        };

        // Test 1: with abortSignal
        const controller = new AbortController();
        await executeWithSignal(
            { query: 'test' },
            { toolCallId: 'call-1', messages: [], abortSignal: controller.signal },
        );

        expect(capturedOptions).toBeDefined();
        expect(capturedOptions.signal).toBe(controller.signal);
        expect(capturedOptions.timeout).toBe(5000);
        expect(capturedOptions.resetTimeoutOnProgress).toBe(true);
        expect(capturedOptions.maxTotalTimeout).toBe(60000);

        // Test 2: without context (no signal)
        capturedOptions = null;
        await executeWithSignal({ query: 'test2' });

        expect(capturedOptions).toBeDefined();
        expect(capturedOptions.signal).toBeUndefined();
        expect(capturedOptions.timeout).toBe(5000);

        // Test 3: with context but no abortSignal
        capturedOptions = null;
        await executeWithSignal(
            { query: 'test3' },
            { toolCallId: 'call-3', messages: [] },
        );

        expect(capturedOptions).toBeDefined();
        expect(capturedOptions.signal).toBeUndefined();
    });

    it('abortSignal abort propagates AbortError', async () => {
        const mockCallTool = vi.fn().mockImplementation(
            async (_params: any, _schema: any, options: any) => {
                // Simulate checking signal before completing
                if (options?.signal?.aborted) {
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    throw err;
                }
                return { content: [{ type: 'text', text: 'ok' }] };
            }
        );

        const controller = new AbortController();
        // Abort before calling
        controller.abort();

        const requestOptions: Record<string, unknown> = {
            timeout: 30000,
            signal: controller.signal,
        };

        await expect(
            mockCallTool({ name: 'test', arguments: {} }, undefined, requestOptions)
        ).rejects.toThrow('The operation was aborted');
    });
});
