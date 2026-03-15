import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCLI } from '../../src/cli/skill-cli';
import {
    DEFAULT_LIVE_VERIFY_GATE_LANES,
    parseLiveVerifyGateLanes,
    verifyLiveGate,
} from '../../src/cli/live-verify';

describe('CLI live verification gate', () => {
    let originalExitCode: number | undefined;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        originalExitCode = process.exitCode;
        process.exitCode = undefined;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        vi.restoreAllMocks();
    });

    it('parses gate lanes, dedupes entries, and falls back to defaults', () => {
        expect(parseLiveVerifyGateLanes()).toEqual(DEFAULT_LIVE_VERIFY_GATE_LANES);
        expect(parseLiveVerifyGateLanes('cloud-surface,node-integrations,cloud-surface')).toEqual([
            'cloud-surface',
            'node-integrations',
        ]);
        expect(() => parseLiveVerifyGateLanes('unknown-lane')).toThrow('Unknown live verification lane');
    });

    it('aggregates lane checks and prefixes them with lane names', async () => {
        const result = await verifyLiveGate({
            lanes: ['foundation', 'cloud-surface'],
            env: {
                QINIU_API_KEY: 'sk-test',
            },
            createQiniuClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'pong' } }],
                    }),
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.lanes).toHaveLength(2);
        expect(result.checks.some((check) => check.message.includes('[foundation] foundation lane has no direct live API probe yet'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('[cloud-surface] Chat probe succeeded: pong'))).toBe(true);
    });

    it('upgrades warnings to a failing gate in strict mode', async () => {
        const result = await verifyLiveGate({
            lanes: ['foundation'],
            strict: true,
            env: {},
        });

        expect(result.exitCode).toBe(1);
        expect(result.status).toBe('fail');
        expect(result.checks.some((check) => check.message.includes('Strict live verification gate failed for lanes: foundation'))).toBe(true);
    });

    it('wires the verify gate CLI command through runCLI', async () => {
        await runCLI(
            ['verify', 'gate', '--lanes', 'foundation', '--strict'],
            { env: {} },
        );

        expect(process.exitCode).toBe(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Running live verification gate for lanes: foundation (strict)'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Strict live verification gate failed for lanes: foundation'));
    });
});
