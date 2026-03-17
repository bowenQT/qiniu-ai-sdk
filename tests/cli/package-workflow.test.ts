import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCLI } from '../../src/cli/skill-cli';
import type {
    ChangePackage,
    EvidenceBundle,
    PromotionDecisionSet,
    ReviewPacket,
} from '../../src/cli/package-workflow';

function writePhasePolicy(tmpDir: string, allowNewPackages: boolean, status: 'active' | 'frozen' | 'closed' = 'active'): void {
    const policyPath = path.join(tmpDir, '.trellis', 'spec', 'sdk', 'phase-policy.json');
    fs.mkdirSync(path.dirname(policyPath), { recursive: true });
    fs.writeFileSync(policyPath, JSON.stringify({
        version: 1,
        phases: {
            phase2: {
                status,
                allowNewPackages,
                entryCriteria: ['Phase 2 is active.'],
                exitCriteria: ['Package-first delivery is the default.'],
                freezeTriggers: ['Release freeze.'],
                promotionTriggers: ['Promotion artifact recorded.'],
                deferredToNextPhaseRules: ['Large cross-lane work gets deferred.'],
            },
        },
    }, null, 2) + '\n', 'utf8');
}

describe('CLI package workflow', () => {
    let tmpDir: string;
    let originalExitCode: number | undefined;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiniu-package-workflow-'));
        originalExitCode = process.exitCode;
        process.exitCode = undefined;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        writePhasePolicy(tmpDir, true);
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        fs.rmSync(tmpDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('initializes a change package with the tracked default path and expected branch', async () => {
        await runCLI(
            [
                'package',
                'init',
                '--lane',
                'runtime',
                '--topic',
                'resumable checkpoints',
                '--goal',
                'Tighten resumable persistence',
                '--success',
                'Streamed threads persist the final assistant message',
                '--success',
                'Replay can restore persisted messages',
                '--surface',
                'src/core',
                '--out-of-scope',
                'No new cloud APIs',
            ],
            { cwd: tmpDir },
        );

        const outputPath = path.join(tmpDir, '.trellis', 'packages', 'phase2', 'runtime-resumable-checkpoints.json');
        const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as ChangePackage;

        expect(payload.packageId).toBe('phase2/runtime/resumable-checkpoints');
        expect(payload.expectedBranch).toBe('codex/phase2/runtime/resumable-checkpoints');
        expect(payload.branch).toBe('unknown');
        expect(payload.requiredEvidence).toContain('focused-verification');
        expect(payload.touchedSurfaces).toEqual(['src/core']);
        expect(consoleLogSpy).toHaveBeenCalledWith(`Wrote change package: ${outputPath}`);
    });

    it('accepts package lanes that are narrower than worktree lanes', async () => {
        await runCLI(
            [
                'package',
                'init',
                '--lane',
                'runtime-hardening',
                '--topic',
                'audit p1 p2 fixes',
                '--goal',
                'Harden runtime findings from tracked audits',
                '--success',
                'P1 and P2 runtime fixes stay bounded',
            ],
            { cwd: tmpDir },
        );

        const outputPath = path.join(tmpDir, '.trellis', 'packages', 'phase2', 'runtime-hardening-audit-p1-p2-fixes.json');
        const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as ChangePackage;

        expect(payload.packageId).toBe('phase2/runtime-hardening/audit-p1-p2-fixes');
        expect(payload.expectedBranch).toBe('codex/phase2/runtime-hardening/audit-p1-p2-fixes');
        expect(payload.ownerLane).toBe('runtime-hardening');
    });

    it('records promotion-sensitive package categories in tracked briefs', async () => {
        await runCLI(
            [
                'package',
                'init',
                '--lane',
                'node-integrations',
                '--category',
                'promotion-sensitive',
                '--topic',
                'mcp host promotion readiness',
                '--goal',
                'Freeze MCP host promotion gating',
                '--success',
                'Promotion-sensitive evidence is explicit',
            ],
            { cwd: tmpDir },
        );

        const outputPath = path.join(tmpDir, '.trellis', 'packages', 'phase2', 'node-integrations-mcp-host-promotion-readiness.json');
        const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as ChangePackage;

        expect(payload.category).toBe('promotion-sensitive');
    });

    it('rejects creating a new package when phase policy is frozen', async () => {
        writePhasePolicy(tmpDir, false, 'frozen');

        await expect(runCLI(
            [
                'package',
                'init',
                '--lane',
                'foundation',
                '--topic',
                'frozen change',
                '--goal',
                'Should not open',
                '--success',
                'No-op',
            ],
            { cwd: tmpDir },
        )).rejects.toThrow('does not allow new change packages');
    });

    it('writes an evidence bundle and inherits surfaces from the package brief', async () => {
        const briefPath = path.join(tmpDir, 'brief.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/cloud-surface/response-gate',
            phase: 'phase2',
            ownerLane: 'cloud-surface',
            topic: 'response-gate',
            goal: 'Wire response artifacts',
            successCriteria: ['Artifacts stay aligned'],
            touchedSurfaces: ['src/modules/response', 'src/cli'],
            requiredEvidence: ['focused-verification'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/cloud-surface/response-gate',
            branch: 'codex/phase2/cloud-surface/response-gate',
            worktreePath: tmpDir,
            createdAt: '2026-03-16T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');

        await runCLI(
            [
                'package',
                'evidence',
                '--brief',
                briefPath,
                '--file',
                'src/modules/response/index.ts',
                '--focused',
                'npm test -- tests/unit/modules/response.test.ts',
                '--gate',
                'npm run prepublishOnly',
                '--live',
                'Response API live probe unchanged',
                '--risk',
                'Batch surface still deferred',
                '--artifact',
                'artifacts/live-verify-gate.md',
            ],
            { cwd: tmpDir },
        );

        const outputPath = path.join(tmpDir, 'artifacts', 'phase2-cloud-surface-response-gate-evidence.json');
        const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as EvidenceBundle;

        expect(payload.changedSurfaces).toEqual(['src/modules/response', 'src/cli']);
        expect(payload.changedFiles).toEqual(['src/modules/response/index.ts']);
        expect(payload.deferredRisks).toEqual(['Batch surface still deferred']);
    });

    it('renders review packets as markdown by default and JSON on request', async () => {
        const briefPath = path.join(tmpDir, 'brief.json');
        const evidencePath = path.join(tmpDir, 'evidence.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/node-integrations/mcp-reporting',
            phase: 'phase2',
            ownerLane: 'node-integrations',
            topic: 'mcp-reporting',
            goal: 'Add structured MCP reporting',
            successCriteria: ['Review packet links to artifacts'],
            touchedSurfaces: ['src/node'],
            requiredEvidence: ['focused-verification'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/node-integrations/mcp-reporting',
            branch: 'codex/phase2/node-integrations/mcp-reporting',
            worktreePath: tmpDir,
            createdAt: '2026-03-16T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');
        fs.writeFileSync(evidencePath, JSON.stringify({
            version: 1,
            packageId: 'phase2/node-integrations/mcp-reporting',
            ownerLane: 'node-integrations',
            generatedAt: '2026-03-16T01:00:00.000Z',
            changedFiles: ['src/node/mcp/http-transport.ts'],
            changedSurfaces: ['src/node'],
            focusedVerification: ['npm test -- tests/node/mcp-http-transport.test.ts'],
            fullGateStatus: ['npm run build'],
            liveVerifyDelta: ['MCP probe now includes prompt messages'],
            deferredRisks: ['Live interop still env-gated'],
            artifactLinks: ['artifacts/live-verify-gate.md'],
        }, null, 2) + '\n', 'utf8');

        await runCLI(
            ['package', 'review', '--brief', briefPath, '--evidence', evidencePath],
            { cwd: tmpDir },
        );

        const markdownPath = path.join(tmpDir, 'artifacts', 'phase2-node-integrations-mcp-reporting-review-packet.md');
        const markdown = fs.readFileSync(markdownPath, 'utf8');
        expect(markdown).toContain('# Review Packet');
        expect(markdown).toContain('Expected branch: codex/phase2/node-integrations/mcp-reporting');
        expect(markdown).toContain('Live interop still env-gated');

        const jsonPath = path.join(tmpDir, 'review-packet.json');
        await runCLI(
            ['package', 'review', '--brief', briefPath, '--evidence', evidencePath, '--json', '--out', jsonPath],
            { cwd: tmpDir },
        );
        const jsonPayload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as ReviewPacket;
        expect(jsonPayload.changedFiles).toEqual(['src/node/mcp/http-transport.ts']);
        expect(jsonPayload.liveVerifyDelta[0]).toContain('prompt messages');
    });

    it('writes promotion decisions and a markdown summary', async () => {
        const briefPath = path.join(tmpDir, 'brief.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/foundation/promotion-flow',
            phase: 'phase2',
            ownerLane: 'foundation',
            topic: 'promotion-flow',
            goal: 'Promote validated modules with explicit evidence',
            successCriteria: ['Promotion artifacts are machine-readable'],
            touchedSurfaces: ['src/lib/capability-registry.ts'],
            requiredEvidence: ['verification-report'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/foundation/promotion-flow',
            branch: 'codex/phase2/foundation/promotion-flow',
            worktreePath: tmpDir,
            createdAt: '2026-03-16T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');

        const jsonPath = path.join(tmpDir, 'artifacts', 'promotion-decisions.json');
        await runCLI(
            [
                'package',
                'decision',
                '--brief',
                briefPath,
                '--module',
                'response',
                '--from',
                'experimental',
                '--to',
                'beta',
                '--basis',
                'artifacts/verification-report.md',
                '--basis',
                'artifacts/live-verify-gate.md',
                '--source',
                'antigravity',
                '--out',
                jsonPath,
            ],
            { cwd: tmpDir },
        );

        const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as PromotionDecisionSet;
        expect(payload.decisions).toHaveLength(1);
        expect(payload.decisions[0]?.module).toBe('response');
        expect(payload.decisions[0]?.newMaturity).toBe('beta');

        const trackedJsonPath = path.join(
            tmpDir,
            '.trellis',
            'decisions',
            'phase2',
            'phase2-foundation-promotion-flow.json',
        );
        const trackedPayload = JSON.parse(fs.readFileSync(trackedJsonPath, 'utf8')) as PromotionDecisionSet;
        expect(trackedPayload.decisions[0]?.module).toBe('response');

        const markdownPath = path.join(tmpDir, 'artifacts', 'phase2-foundation-promotion-flow-promotion-decisions.md');
        const markdown = fs.readFileSync(markdownPath, 'utf8');
        expect(markdown).toContain('# Promotion Decisions');
        expect(markdown).toContain('response');
        expect(markdown).toContain('experimental -> beta');
    });

    it('renders held promotion decisions clearly when maturity stays unchanged', async () => {
        const briefPath = path.join(tmpDir, 'brief.json');
        fs.writeFileSync(briefPath, JSON.stringify({
            version: 1,
            packageId: 'phase2/node-integrations/mcp-policy',
            phase: 'phase2',
            ownerLane: 'node-integrations',
            topic: 'mcp-policy',
            goal: 'Record a hold decision for MCP interop policy',
            successCriteria: ['Tracked policy decisions stay machine-readable'],
            touchedSurfaces: ['src/cli/live-verify.ts'],
            requiredEvidence: ['verification-report'],
            explicitlyOutOfScope: [],
            expectedMergeTarget: 'main',
            expectedBranch: 'codex/phase2/node-integrations/mcp-policy',
            branch: 'codex/phase2/node-integrations/mcp-policy',
            worktreePath: tmpDir,
            createdAt: '2026-03-16T00:00:00.000Z',
        }, null, 2) + '\n', 'utf8');

        await runCLI(
            [
                'package',
                'decision',
                '--brief',
                briefPath,
                '--module',
                'NodeMCPHost',
                '--from',
                'beta',
                '--to',
                'beta',
                '--basis',
                '.trellis/spec/sdk/live-verify-policy.json',
                '--source',
                'antigravity',
            ],
            { cwd: tmpDir },
        );

        const markdownPath = path.join(tmpDir, 'artifacts', 'phase2-node-integrations-mcp-policy-promotion-decisions.md');
        const markdown = fs.readFileSync(markdownPath, 'utf8');
        expect(markdown).toContain('NodeMCPHost');
        expect(markdown).toContain('beta (held)');
    });
});
