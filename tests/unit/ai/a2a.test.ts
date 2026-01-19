/**
 * A2A Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    validateSchema,
    sanitizeArgs,
    cloneAndSanitize,
    generateRequestId,
    createA2ARequest,
    createA2AResponse,
    createA2AError,
    A2ARateLimiter,
    RateLimitError,
} from '../../../src/ai/a2a';

// ============================================================================
// Validation Tests
// ============================================================================

describe('validateSchema', () => {
    it('should pass valid arguments', () => {
        const schema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'number' },
            },
            required: ['name'],
        };

        const result = validateSchema({ name: 'Alice', age: 30 }, schema);
        expect(result.valid).toBe(true);
    });

    it('should fail on missing required field', () => {
        const schema = {
            properties: { name: { type: 'string' } },
            required: ['name'],
        };

        const result = validateSchema({}, schema);
        expect(result.valid).toBe(false);
        expect(result.error?.code).toBe('VALIDATION_ERROR');
        expect(result.error?.message).toContain('Missing required field');
    });

    it('should fail on type mismatch', () => {
        const schema = {
            properties: {
                age: { type: 'number' },
            },
        };

        const result = validateSchema({ age: 'not a number' }, schema);
        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('expected number');
    });

    it('should validate enum values', () => {
        const schema = {
            properties: {
                status: { enum: ['active', 'inactive'] },
            },
        };

        expect(validateSchema({ status: 'active' }, schema).valid).toBe(true);
        expect(validateSchema({ status: 'unknown' }, schema).valid).toBe(false);
    });

    it('should validate string constraints', () => {
        const schema = {
            properties: {
                code: { type: 'string', minLength: 3, maxLength: 10 },
            },
        };

        expect(validateSchema({ code: 'abc' }, schema).valid).toBe(true);
        expect(validateSchema({ code: 'ab' }, schema).valid).toBe(false);
        expect(validateSchema({ code: 'a'.repeat(11) }, schema).valid).toBe(false);
    });
});

describe('sanitizeArgs', () => {
    it('should remove sensitive fields', () => {
        const args = {
            name: 'test',
            password: 'secret123',
            apiKey: 'key123',
        };

        sanitizeArgs(args);

        expect(args.name).toBe('test');
        expect(args.password).toBeUndefined();
        expect(args.apiKey).toBeUndefined();
    });

    it('should redact when option is set', () => {
        const args = {
            name: 'test',
            password: 'secret123',
        };

        sanitizeArgs(args, { redact: true });

        expect(args.name).toBe('test');
        expect(args.password).toBe('[REDACTED]');
    });

    it('should sanitize nested objects', () => {
        const args = {
            user: {
                name: 'test',
                settings: {
                    apiKey: 'abc123',
                },
            },
        };

        sanitizeArgs(args);

        expect((args.user as any).name).toBe('test');
        expect((args.user as any).settings.apiKey).toBeUndefined();
    });
});

describe('cloneAndSanitize', () => {
    it('should not modify original object', () => {
        const original = { password: 'secret' };
        const cloned = cloneAndSanitize(original);

        expect(original.password).toBe('secret');
        expect(cloned.password).toBeUndefined();
    });
});

// ============================================================================
// Types & Utilities Tests
// ============================================================================

describe('generateRequestId', () => {
    it('should generate unique IDs', () => {
        const id1 = generateRequestId();
        const id2 = generateRequestId();

        expect(id1).not.toBe(id2);
        expect(id1).toMatch(/^a2a_\d+_[a-z0-9]+$/);
    });
});

describe('A2A Message Creation', () => {
    it('should create request message', () => {
        const msg = createA2ARequest('agent1', 'agent2', 'search', { query: 'test' });

        expect(msg.type).toBe('request');
        expect(msg.from).toBe('agent1');
        expect(msg.to).toBe('agent2');
        expect(msg.tool).toBe('search');
        expect(msg.args).toEqual({ query: 'test' });
        expect(msg.requestId).toBeDefined();
        expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('should create response message', () => {
        const request = createA2ARequest('agent1', 'agent2', 'search', {});
        const response = createA2AResponse(request, { results: [] });

        expect(response.type).toBe('response');
        expect(response.requestId).toBe(request.requestId);
        expect(response.from).toBe('agent2');
        expect(response.to).toBe('agent1');
        expect(response.result).toEqual({ results: [] });
    });

    it('should create error message', () => {
        const request = createA2ARequest('agent1', 'agent2', 'search', {});
        const error = createA2AError(request, 'TOOL_NOT_FOUND', 'Tool not found');

        expect(error.type).toBe('error');
        expect(error.requestId).toBe(request.requestId);
        expect(error.error?.code).toBe('TOOL_NOT_FOUND');
        expect(error.error?.message).toBe('Tool not found');
    });
});

// ============================================================================
// Rate Limiter Tests
// ============================================================================

describe('A2ARateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('should allow calls within limit', () => {
        const limiter = new A2ARateLimiter({
            maxCalls: 3,
            windowMs: 1000,
            scope: 'agent',
            onLimit: 'reject',
        });

        expect(limiter.isAllowed('agent1', 'tool1')).toBe(true);
        limiter.track('agent1', 'tool1');

        expect(limiter.isAllowed('agent1', 'tool1')).toBe(true);
        limiter.track('agent1', 'tool1');

        expect(limiter.isAllowed('agent1', 'tool1')).toBe(true);
        limiter.track('agent1', 'tool1');

        // Should be blocked now
        expect(limiter.isAllowed('agent1', 'tool1')).toBe(false);
    });

    it('should scope by tool when configured', () => {
        const limiter = new A2ARateLimiter({
            maxCalls: 1,
            windowMs: 1000,
            scope: 'tool',
            onLimit: 'reject',
        });

        limiter.track('agent1', 'tool1');

        // Same tool blocked
        expect(limiter.isAllowed('agent1', 'tool1')).toBe(false);

        // Different tool allowed
        expect(limiter.isAllowed('agent1', 'tool2')).toBe(true);
    });

    it('should reset after window expires', () => {
        const limiter = new A2ARateLimiter({
            maxCalls: 1,
            windowMs: 1000,
            scope: 'agent',
            onLimit: 'reject',
        });

        limiter.track('agent1', 'tool1');
        expect(limiter.isAllowed('agent1', 'tool1')).toBe(false);

        // Advance time past window
        vi.advanceTimersByTime(1001);

        expect(limiter.isAllowed('agent1', 'tool1')).toBe(true);
    });

    it('should reset correctly for agent scope', () => {
        const limiter = new A2ARateLimiter({
            maxCalls: 1,
            windowMs: 1000,
            scope: 'agent',
            onLimit: 'reject',
        });

        limiter.track('agent1', 'tool1');
        expect(limiter.isAllowed('agent1', 'tool1')).toBe(false);

        // Reset for this agent
        limiter.reset('agent1');

        // Should be allowed again
        expect(limiter.isAllowed('agent1', 'tool1')).toBe(true);
    });

    it('should queue calls and track them properly in queue mode', async () => {
        const limiter = new A2ARateLimiter({
            maxCalls: 1,
            windowMs: 100,
            scope: 'agent',
            onLimit: 'queue',
        });

        const results: number[] = [];

        // First call goes through immediately
        const p1 = limiter.execute('agent1', 'tool1', async () => {
            results.push(1);
            return 1;
        });

        // Second call should be queued
        const p2 = limiter.execute('agent1', 'tool1', async () => {
            results.push(2);
            return 2;
        });

        // Advance time to allow second call
        vi.advanceTimersByTime(150);

        await Promise.all([p1, p2]);

        expect(results).toEqual([1, 2]);
    });

    it('should throw RateLimitError on reject mode', async () => {
        const limiter = new A2ARateLimiter({
            maxCalls: 0,
            windowMs: 1000,
            scope: 'agent',
            onLimit: 'reject',
        });

        await expect(
            limiter.execute('agent1', 'tool1', async () => 'result')
        ).rejects.toThrow(RateLimitError);
    });
});
