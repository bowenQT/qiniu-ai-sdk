/**
 * Phase 5A — CLI skill add command test.
 *
 * Tests the actual CLI routing, argument parsing,
 * and error handling for `qiniu-ai skill add`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the exported functions from skill-cli
// by calling runCLI directly with mocked args.

describe('CLI skill add (5A)', () => {
    let originalExitCode: number | undefined;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        originalExitCode = process.exitCode as number | undefined;
        process.exitCode = undefined;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        vi.restoreAllMocks();
    });

    it('shows usage when add is called without URL', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        runCLI(['skill', 'add']);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Usage: qiniu-ai skill add')
        );
        expect(process.exitCode).toBe(1);
    });

    it('shows usage when add URL starts with --', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        runCLI(['skill', 'add', '--sha256']);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Usage: qiniu-ai skill add')
        );
        expect(process.exitCode).toBe(1);
    });

    it('rejects --sha256 when followed by another flag and does NOT attempt install', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');

        // --sha256 --allow-actions → getArgValue should reject
        runCLI(['skill', 'add', 'https://example.com/skill.json', '--sha256', '--allow-actions']);

        // Wait a tick for any async commandAdd to resolve if it was called
        await new Promise(r => setTimeout(r, 50));

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('--sha256 requires a value')
        );
        expect(process.exitCode).toBe(1);

        // Must NOT have a secondary install error
        const allErrors = consoleErrorSpy.mock.calls.map((c: any[]) => c[0]);
        expect(allErrors).not.toContainEqual(
            expect.stringContaining('Failed to install skill')
        );
    });

    it('rejects --auth when followed by another flag and does NOT attempt install', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');

        runCLI(['skill', 'add', 'https://example.com/skill.json', '--auth', '--sha256']);

        await new Promise(r => setTimeout(r, 50));

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('--auth requires a value')
        );
        expect(process.exitCode).toBe(1);

        const allErrors = consoleErrorSpy.mock.calls.map((c: any[]) => c[0]);
        expect(allErrors).not.toContainEqual(
            expect.stringContaining('Failed to install skill')
        );
    });

    it('includes add in help output', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        runCLI(['help']);

        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('add <url>')
        );
    });

    it('shows updated default usage for unknown subcommand', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        runCLI(['skill', 'unknown']);

        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('list|add|verify|remove')
        );
    });
});
