import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCLI } from '../../src/cli/skill-cli';
import {
    DEFAULT_LIVE_VERIFY_GATE_LANES,
    parseLiveVerifyGateLanes,
    renderLiveVerifyGateMarkdown,
    type LiveVerifyPolicy,
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

    it('uses the PR policy profile to ignore non-blocking warnings when required probes pass', async () => {
        const policy: LiveVerifyPolicy = {
            version: 1,
            profiles: {
                pr: {
                    description: 'PR blocking profile',
                    requiredProbes: {
                        'cloud-surface': ['chat'],
                    },
                },
            },
        };

        const result = await verifyLiveGate({
            lanes: ['cloud-surface'],
            policy,
            policyProfile: 'pr',
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

        expect(result.exitCode).toBe(0);
        expect(result.status).toBe('ok');
        expect(result.policyProfile).toBe('pr');
        expect(result.checks.some((check) => check.message.includes('Non-blocking live warnings remain for profile pr'))).toBe(true);
    });

    it('fails when the active policy profile is missing a required probe result', async () => {
        const policy: LiveVerifyPolicy = {
            version: 1,
            profiles: {
                nightly: {
                    description: 'Nightly blocking profile',
                    requiredProbes: {
                        'cloud-surface': ['chat', 'response-api'],
                    },
                },
            },
        };

        const result = await verifyLiveGate({
            lanes: ['cloud-surface'],
            policy,
            policyProfile: 'nightly',
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

        expect(result.exitCode).toBe(1);
        expect(result.status).toBe('fail');
        expect(result.blockingFailures).toContain('[cloud-surface] Required probe response-api was skipped: Response API live probe was skipped.');
    });

    it('surfaces lane policy metadata for MCP interop boundaries', async () => {
        const result = await verifyLiveGate({
            lanes: ['node-integrations'],
            policy: {
                version: 1,
                profiles: {
                    pr: {
                        description: 'PR blocking profile',
                        requiredProbes: {},
                        lanePolicies: {
                            'node-integrations': {
                                description: 'PR keeps MCP interop evidence non-blocking until promotion approves stricter gating.',
                                optionalProbes: ['mcp-connect', 'mcp-host-interop'],
                                promotionModules: ['NodeMCPHost'],
                                trackedDecisionPaths: ['.trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json'],
                                deferredRisks: ['notifications remain unit-only'],
                            },
                        },
                    },
                },
            },
            policyProfile: 'pr',
            env: {
                QINIU_API_KEY: 'sk-test',
            },
        });

        expect(result.lanes[0]?.policy?.promotionModules).toEqual(['NodeMCPHost']);
        expect(result.lanes[0]?.policy?.trackedDecisionPaths[0]).toContain('phase2-node-integrations-mcp-interop-evidence-policy.json');
        expect(result.checks.some((check) => check.message.includes('[node-integrations] Tracked decision files:'))).toBe(true);
    });

    it('keeps optional MCP host interop failures non-blocking under the PR policy', async () => {
        const result = await verifyLiveGate({
            lanes: ['node-integrations'],
            policy: {
                version: 1,
                profiles: {
                    pr: {
                        description: 'PR blocking profile',
                        requiredProbes: {},
                        lanePolicies: {
                            'node-integrations': {
                                optionalProbes: ['mcp-host-interop'],
                            },
                        },
                    },
                },
            },
            policyProfile: 'pr',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_LIVE_VERIFY_MCP_URL: 'https://example.com/mcp',
                QINIU_LIVE_VERIFY_MCP_HOST: '1',
            },
            createNodeClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'node' } }],
                    }),
                },
            }) as any,
            createMcpTransport: () => ({
                probe: async () => ({
                    connection: {
                        serverName: 'live-verify-mcp',
                        url: 'https://example.com/mcp',
                        protocolVersion: '2025-11-25',
                    },
                }),
            }) as any,
            createMcpHost: () => ({
                probeServerInterop: async () => {
                    throw new Error('host interop unavailable');
                },
            }) as any,
        });

        expect(result.exitCode).toBe(0);
        expect(result.status).toBe('ok');
        expect(result.lanes[0]?.result.exitCode).toBe(2);
        expect(result.lanes[0]?.result.probes.find((probe) => probe.id === 'mcp-host-interop')?.status).toBe('fail');
        expect(result.checks.some((check) => check.message.includes('non-blocking by active policy'))).toBe(true);
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

    it('renders policy metadata and probe summaries in markdown', async () => {
        const result = await verifyLiveGate({
            lanes: ['cloud-surface'],
            policy: {
                version: 1,
                profiles: {
                    pr: {
                        description: 'PR blocking profile',
                        requiredProbes: {
                            'cloud-surface': ['chat'],
                        },
                    },
                },
            },
            policyProfile: 'pr',
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

        const markdown = renderLiveVerifyGateMarkdown(result);
        expect(markdown).toContain('Policy profile: pr');
        expect(markdown).toContain('#### Probes');
        expect(markdown).toContain('[ok] chat: Chat probe succeeded: pong');
    });

    it('renders structured probe details in markdown when available', () => {
        const markdown = renderLiveVerifyGateMarkdown({
            generatedAt: '2026-03-16T09:00:00.000Z',
            status: 'ok',
            exitCode: 0,
            checks: [],
            probes: [],
            lanes: [
                {
                    lane: 'node-integrations',
                    result: {
                        status: 'ok',
                        exitCode: 0,
                        checks: [],
                        probes: [
                            {
                                id: 'mcp-host-interop',
                                lane: 'node-integrations',
                                status: 'ok',
                                message: 'MCP host interoperability probe succeeded: live-verify-mcp',
                                details: {
                                    hostToolCount: 1,
                                    deferredRisks: ['notifications are still unit-only'],
                                },
                            },
                        ],
                    },
                },
            ],
            blockingFailures: [],
        });

        expect(markdown).toContain('mcp-host-interop');
        expect(markdown).toContain('"hostToolCount":1');
        expect(markdown).toContain('"deferredRisks":["notifications are still unit-only"]');
    });

    it('renders lane policy metadata in markdown when available', () => {
        const markdown = renderLiveVerifyGateMarkdown({
            generatedAt: '2026-03-16T09:00:00.000Z',
            status: 'ok',
            exitCode: 0,
            checks: [],
            probes: [],
            lanes: [
                {
                    lane: 'node-integrations',
                    policy: {
                        description: 'PR keeps MCP host interop non-blocking.',
                        requiredProbes: ['mcp-connect'],
                        optionalProbes: ['mcp-host-interop'],
                        promotionModules: ['NodeMCPHost'],
                        trackedDecisionPaths: ['.trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json'],
                        deferredRisks: ['notifications are still unit-only'],
                    },
                    result: {
                        status: 'warn',
                        exitCode: 2,
                        checks: [],
                        probes: [],
                    },
                },
            ],
            blockingFailures: [],
        });

        expect(markdown).toContain('#### Policy');
        expect(markdown).toContain('Required probes: mcp-connect');
        expect(markdown).toContain('Optional probes: mcp-host-interop');
        expect(markdown).toContain('Promotion modules: NodeMCPHost');
        expect(markdown).toContain('Tracked decision files: .trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json');
        expect(markdown).toContain('Deferred risks: notifications are still unit-only');
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

    it('passes the policy profile through the CLI gate command', async () => {
        const policyPath = path.join(tmpDir, 'live-verify-policy.json');
        fs.writeFileSync(policyPath, JSON.stringify({
            version: 1,
            profiles: {
                pr: {
                    description: 'PR blocking profile',
                    requiredProbes: {},
                },
            },
        }, null, 2) + '\n', 'utf8');

        await runCLI(
            ['verify', 'gate', '--lanes', 'foundation', '--profile', 'pr', '--policy', policyPath, '--json'],
            { env: {} },
        );

        const stdoutPayload = consoleLogSpy.mock.calls
            .map((call) => String(call[0]))
            .find((line) => line.includes('"policyProfile"'));
        expect(stdoutPayload).toContain('"policyProfile": "pr"');
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
