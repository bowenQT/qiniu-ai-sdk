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

    it('marks missing required probe results as unavailable for standard packages under the active policy profile', async () => {
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

        expect(result.exitCode).toBe(0);
        expect(result.status).toBe('ok');
        expect(result.promotionGateStatus).toBe('unavailable');
        expect(result.unavailableEvidence?.some((entry) => entry.includes('response-api'))).toBe(true);
        expect(result.promotionDecisionSummary?.status).toBe('unavailable');
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
                                promotionSensitiveRequiredProbes: ['mcp-connect', 'mcp-read-resource', 'mcp-get-prompt'],
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
        expect(result.lanes[0]?.policy?.promotionSensitiveRequiredProbes).toEqual(['mcp-connect', 'mcp-read-resource', 'mcp-get-prompt']);
        expect(result.checks.some((check) => check.message.includes('[node-integrations] Tracked decision files:'))).toBe(true);
    });

    it('marks missing promotion-sensitive probes as unavailable for standard packages without blocking the gate', async () => {
        const briefPath = path.join(tmpDir, 'standard-package.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/cloud-surface/responseapi-readiness-note',
            phase: 'phase2',
            ownerLane: 'cloud-surface',
            category: 'standard',
            topic: 'responseapi-readiness-note',
            goal: 'Track ResponseAPI evidence without promotion',
            successCriteria: ['Missing promotion evidence is unavailable, not blocking'],
            touchedSurfaces: ['src/cli/live-verify.ts'],
            requiredEvidence: ['focused-verification'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/cloud-surface/responseapi-readiness-note',
            branch: 'codex/phase2/cloud-surface/responseapi-readiness-note',
            worktreePath: tmpDir,
            createdAt: '2026-03-17T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');

        const result = await verifyLiveGate({
            lanes: ['cloud-surface'],
            packageBriefPath: briefPath,
            policy: {
                version: 1,
                profiles: {
                    pr: {
                        description: 'PR profile',
                        requiredProbes: {
                            'cloud-surface': ['chat'],
                        },
                        lanePolicies: {
                            'cloud-surface': {
                                promotionSensitiveRequiredProbes: ['chat', 'response-api'],
                                promotionModules: ['ResponseAPI'],
                            },
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

        expect(result.exitCode).toBe(0);
        expect(result.status).toBe('ok');
        expect(result.promotionGateStatus).toBe('unavailable');
        expect(result.unavailableEvidence?.some((entry) => entry.includes('response-api'))).toBe(true);
        expect(result.promotionDecisionSummary?.status).toBe('unavailable');
    });

    it('fails promotion-sensitive packages when required live evidence is missing', async () => {
        const briefPath = path.join(tmpDir, 'promotion-sensitive-package.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/cloud-surface/responseapi-promotion-readiness',
            phase: 'phase2',
            ownerLane: 'cloud-surface',
            category: 'promotion-sensitive',
            topic: 'responseapi-promotion-readiness',
            goal: 'Freeze ResponseAPI promotion boundary',
            successCriteria: ['Response API promotion gate uses live evidence'],
            touchedSurfaces: ['src/modules/response/index.ts'],
            requiredEvidence: ['focused-verification'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/cloud-surface/responseapi-promotion-readiness',
            branch: 'codex/phase2/cloud-surface/responseapi-promotion-readiness',
            worktreePath: tmpDir,
            createdAt: '2026-03-17T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');

        const result = await verifyLiveGate({
            lanes: ['cloud-surface'],
            packageBriefPath: briefPath,
            policy: {
                version: 1,
                profiles: {
                    pr: {
                        description: 'PR profile',
                        requiredProbes: {
                            'cloud-surface': ['chat'],
                        },
                        lanePolicies: {
                            'cloud-surface': {
                                promotionSensitiveRequiredProbes: ['chat', 'response-api'],
                                promotionModules: ['ResponseAPI'],
                                trackedDecisionPaths: ['.trellis/decisions/phase2/responseapi.json'],
                            },
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

        expect(result.exitCode).toBe(1);
        expect(result.status).toBe('fail');
        expect(result.promotionGateStatus).toBe('block');
        expect(result.packageId).toBe('phase2/cloud-surface/responseapi-promotion-readiness');
        expect(result.promotionDecisionSummary?.status).toBe('block');
    });

    it('keeps failed required probes in held status for standard packages when live evidence exists but is not promotable', async () => {
        const result = await verifyLiveGate({
            lanes: ['node-integrations'],
            policy: {
                version: 1,
                profiles: {
                    pr: {
                        description: 'PR profile',
                        lanePolicies: {
                            'node-integrations': {
                                requiredProbes: ['mcp-host-interop'],
                                optionalProbes: ['mcp-host-interop'],
                                promotionModules: ['NodeMCPHost'],
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
        expect(result.promotionGateStatus).toBe('held');
        expect(result.heldEvidence?.some((entry) => entry.includes('mcp-host-interop'))).toBe(true);
        expect(result.promotionDecisionSummary?.status).toBe('held');
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
            packageId: 'phase2/node-integrations/node-mcphost-promotion-readiness',
            packageCategory: 'promotion-sensitive',
            promotionSensitive: true,
            promotionGateStatus: 'held',
            promotionDecisionSummary: {
                status: 'held',
                promotionSensitive: true,
                blockingFailuresCount: 0,
                heldEvidenceCount: 1,
                unavailableEvidenceCount: 0,
                basisCount: 1,
            },
            checks: [],
            probes: [],
            heldEvidence: ['[node-integrations] Required probe mcp-host-interop was skipped'],
            promotionDecisionBasis: [
                {
                    lane: 'node-integrations',
                    promotionModules: ['NodeMCPHost'],
                    trackedDecisionPaths: ['.trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json'],
                    requiredProbes: ['mcp-connect'],
                    promotionSensitiveRequiredProbes: ['mcp-connect', 'mcp-host-interop'],
                    deferredRisks: ['notifications are still unit-only'],
                },
            ],
            lanes: [
                {
                    lane: 'node-integrations',
                    policy: {
                        description: 'PR keeps MCP host interop non-blocking.',
                        requiredProbes: ['mcp-connect'],
                        promotionSensitiveRequiredProbes: ['mcp-connect', 'mcp-host-interop'],
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
        expect(markdown).toContain('Package: phase2/node-integrations/node-mcphost-promotion-readiness');
        expect(markdown).toContain('Package category: promotion-sensitive');
        expect(markdown).toContain('Promotion gate status: held');
        expect(markdown).toContain('## Promotion Decision Summary');
        expect(markdown).toContain('Unavailable evidence items: 0');
        expect(markdown).toContain('Required probes: mcp-connect');
        expect(markdown).toContain('Promotion-sensitive required probes: mcp-connect, mcp-host-interop');
        expect(markdown).toContain('Optional probes: mcp-host-interop');
        expect(markdown).toContain('Promotion modules: NodeMCPHost');
        expect(markdown).toContain('Tracked decision files: .trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json');
        expect(markdown).toContain('Deferred risks: notifications are still unit-only');
    });

    it('uses the brief owner lane as the default gate lane', async () => {
        const briefPath = path.join(tmpDir, 'package-brief.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/node-integrations/node-mcphost-promotion-readiness',
            phase: 'phase2',
            ownerLane: 'node-integrations',
            category: 'promotion-sensitive',
            topic: 'node-mcphost-promotion-readiness',
            goal: 'Freeze NodeMCPHost promotion boundary',
            successCriteria: ['NodeMCPHost gating is explicit'],
            touchedSurfaces: ['src/node/mcp-host.ts'],
            requiredEvidence: ['focused-verification'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/node-integrations/node-mcphost-promotion-readiness',
            branch: 'codex/phase2/node-integrations/node-mcphost-promotion-readiness',
            worktreePath: tmpDir,
            createdAt: '2026-03-17T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');

        await runCLI(
            ['verify', 'gate', '--brief', briefPath, '--json'],
            { env: {} },
        );

        const stdoutPayload = consoleLogSpy.mock.calls
            .map((call) => String(call[0]))
            .find((line) => line.includes('"packageId"'));
        expect(stdoutPayload).toContain('"packageId": "phase2/node-integrations/node-mcphost-promotion-readiness"');
        expect(stdoutPayload).toContain('"promotionSensitive": true');
        expect(stdoutPayload).toContain('"lane": "node-integrations"');
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
