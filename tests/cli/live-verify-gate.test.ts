import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCLI } from '../../src/cli/skill-cli';
import {
    DEFAULT_LIVE_VERIFY_GATE_LANES,
    parseLiveVerifyGateLanes,
    renderLiveVerifyGateMarkdown,
    verifyLiveGate,
} from '../../src/cli/live-verify';

describe('CLI live verification gate', () => {
    let originalExitCode: number | undefined;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let tmpDir: string;

    beforeEach(() => {
        originalExitCode = process.exitCode;
        process.exitCode = undefined;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiniu-live-verify-'));
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        fs.rmSync(tmpDir, { recursive: true, force: true });
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

    it('renders a markdown summary for gate artifacts', async () => {
        const result = await verifyLiveGate({
            lanes: ['foundation'],
            env: {},
        });

        const markdown = renderLiveVerifyGateMarkdown(result);
        expect(markdown).toContain('# Live Verification Gate');
        expect(markdown).toContain('### foundation');
        expect(markdown).toContain('Overall status: WARN (exit 2)');
        expect(markdown).toContain('[warn] foundation lane has no direct live API probe yet');
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

    it('can emit machine-readable gate output to stdout and a file', async () => {
        const outputPath = path.join(tmpDir, 'live-verify-gate.json');

        await runCLI(
            ['verify', 'gate', '--lanes', 'foundation', '--json', '--out', outputPath],
            { env: {} },
        );

        const stdoutPayload = consoleLogSpy.mock.calls
            .map((call) => String(call[0]))
            .find((line) => line.includes('"lanes"'));
        expect(stdoutPayload).toBeTruthy();

        const written = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
            exitCode: number;
            lanes: Array<{ lane: string }>;
        };
        expect(written.exitCode).toBe(2);
        expect(written.lanes[0]?.lane).toBe('foundation');
    });
});
