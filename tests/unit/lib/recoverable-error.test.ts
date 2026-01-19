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

    it('should redact inside arrays', () => {
        const result = redactSecrets({
            servers: [
                { host: 'a.com', accessKey: 'secret1' },
                { host: 'b.com', secretKey: 'secret2' },
            ]
        });
        expect((result as any).servers[0].accessKey).toBe('[REDACTED]');
        expect((result as any).servers[0].host).toBe('a.com');
        expect((result as any).servers[1].secretKey).toBe('[REDACTED]');
    });

    it('should match keys containing sensitive patterns (camelCase)', () => {
        const result = redactSecrets({
            accessKey: 'x',
            secretKey: 'y',
            myPassword: 'z',
            authToken: 'w',
            username: 'john'
        });
        expect(result.accessKey).toBe('[REDACTED]');
        expect(result.secretKey).toBe('[REDACTED]');
        expect(result.myPassword).toBe('[REDACTED]');
        expect(result.authToken).toBe('[REDACTED]');
        expect(result.username).toBe('john');
    });
});
