import { describe, it, expect } from 'vitest';
import { RecoverableError, redactSecrets } from '../../../src/lib/errors';

describe('RecoverableError', () => {
    describe('constructor', () => {
        it('should create error with all properties', () => {
            const error = new RecoverableError(
                'Bucket not found',
                'upload_file',
                'Check bucket name',
                { bucket: 'default' },
                true
            );

            expect(error.message).toBe('Bucket not found');
            expect(error.toolName).toBe('upload_file');
            expect(error.recoverySuggestion).toBe('Check bucket name');
            expect(error.modifiedParams).toEqual({ bucket: 'default' });
            expect(error.retryable).toBe(true);
            expect(error.name).toBe('RecoverableError');
        });

        it('should default retryable to true', () => {
            const error = new RecoverableError('msg', 'tool', 'suggestion');
            expect(error.retryable).toBe(true);
        });
    });

    describe('toPrompt', () => {
        it('should format error as prompt', () => {
            const error = new RecoverableError(
                'File not found',
                'read_file',
                'Check the file path exists'
            );

            const prompt = error.toPrompt();
            expect(prompt).toContain('[Tool Error: read_file]');
            expect(prompt).toContain('File not found');
            expect(prompt).toContain('Recovery: Check the file path exists');
        });

        it('should include modified params when present', () => {
            const error = new RecoverableError(
                'Invalid format',
                'convert',
                'Use supported format',
                { format: 'png' }
            );

            const prompt = error.toPrompt();
            expect(prompt).toContain('Suggested params:');
            expect(prompt).toContain('"format":"png"');
        });

        it('should redact sensitive values in params', () => {
            const error = new RecoverableError(
                'Auth failed',
                'api_call',
                'Check credentials',
                { apiKey: 'secret123', bucket: 'my-bucket' }
            );

            const prompt = error.toPrompt();
            expect(prompt).toContain('[REDACTED]');
            expect(prompt).not.toContain('secret123');
            expect(prompt).toContain('my-bucket');
        });

        it('should truncate long prompts', () => {
            const longSuggestion = 'x'.repeat(2000);
            const error = new RecoverableError(
                'Error',
                'tool',
                longSuggestion
            );

            const prompt = error.toPrompt({ maxLength: 100 });
            expect(prompt.length).toBe(100);
            expect(prompt.endsWith('...')).toBe(true);
        });
    });
});

describe('redactSecrets', () => {
    it('should redact password fields', () => {
        const result = redactSecrets({ password: 'secret', user: 'john' });
        expect(result).toEqual({ password: '[REDACTED]', user: 'john' });
    });

    it('should redact api_key and apiKey', () => {
        const result = redactSecrets({ api_key: 'key1', apiKey: 'key2', name: 'test' });
        expect(result).toEqual({ api_key: '[REDACTED]', apiKey: '[REDACTED]', name: 'test' });
    });

    it('should redact nested objects', () => {
        const result = redactSecrets({
            config: { token: 'abc123', host: 'localhost' },
            name: 'app'
        });
        expect(result).toEqual({
            config: { token: '[REDACTED]', host: 'localhost' },
            name: 'app'
        });
    });

    it('should preserve arrays', () => {
        const result = redactSecrets({ items: ['a', 'b'], token: 'x' });
        expect(result).toEqual({ items: ['a', 'b'], token: '[REDACTED]' });
    });

    it('should be case insensitive', () => {
        const result = redactSecrets({ PASSWORD: 'x', Token: 'y', API_KEY: 'z' });
        expect(result.PASSWORD).toBe('[REDACTED]');
        expect(result.Token).toBe('[REDACTED]');
        expect(result.API_KEY).toBe('[REDACTED]');
    });
});
