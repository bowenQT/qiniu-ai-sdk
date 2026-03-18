import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCLI } from '../../src/cli/skill-cli';

describe('CLI eval gate', () => {
    let tmpDir: string;
    let originalExitCode: number | undefined;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiniu-eval-gate-'));
        originalExitCode = process.exitCode;
        process.exitCode = undefined;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        fs.rmSync(tmpDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('writes a CI-consumable eval candidate report artifact', async () => {
        const baselinePath = path.join(tmpDir, 'baseline.json');
        const candidatePath = path.join(tmpDir, 'candidate.json');
        const outputPath = path.join(tmpDir, 'eval-gate.json');

        fs.writeFileSync(baselinePath, JSON.stringify({
            reportId: 'baseline-1',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [{ caseId: 'case-1', graders: [{ graderId: 'tool', status: 'pass' }], metrics: { score: 0.7 } }],
        }, null, 2));
        fs.writeFileSync(candidatePath, JSON.stringify({
            reportId: 'candidate-1',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [{
                caseId: 'case-1',
                graders: [{ graderId: 'tool', status: 'pass' }],
                artifact: { traceId: 'trace-candidate', artifactPath: 'artifacts/candidate.json' },
                metrics: { score: 0.9 },
            }],
        }, null, 2));

        await runCLI([
            'verify',
            'eval',
            '--baseline',
            baselinePath,
            '--candidate',
            candidatePath,
            '--json',
            '--out',
            outputPath,
        ], { cwd: tmpDir });

        const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
            decision: string;
            gate: { status: string; metrics: Array<{ metric: string; delta: number }> };
            artifactRefs: string[];
        };
        expect(payload.decision).toBe('pass');
        expect(payload.gate.status).toBe('pass');
        expect(payload.gate.metrics[0]).toEqual({ metric: 'score', baseline: 0.7, candidate: 0.9, delta: 0.2 });
        expect(payload.artifactRefs).toEqual([
            'artifact:artifacts/candidate.json',
            'trace:trace-candidate',
        ]);
        expect(consoleLogSpy).toHaveBeenCalledWith(`Wrote verification artifact: ${outputPath}`);
    });

    it('renders a human-readable candidate summary when no json output is requested', async () => {
        const baselinePath = path.join(tmpDir, 'baseline.json');
        const candidatePath = path.join(tmpDir, 'candidate.json');

        fs.writeFileSync(baselinePath, JSON.stringify({
            reportId: 'baseline-2',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [{ caseId: 'case-1', graders: [{ graderId: 'tool', status: 'pass', message: 'baseline ok' }], artifact: { traceId: 'trace-baseline' }, metrics: { score: 0.6 } }],
        }, null, 2));
        fs.writeFileSync(candidatePath, JSON.stringify({
            reportId: 'candidate-2',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [{ caseId: 'case-1', graders: [{ graderId: 'tool', status: 'pass', message: 'candidate ok' }], artifact: { artifactPath: 'artifacts/candidate.json' }, metrics: { score: 0.8 } }],
        }, null, 2));

        await runCLI([
            'verify',
            'eval',
            '--baseline',
            baselinePath,
            '--candidate',
            candidatePath,
        ], { cwd: tmpDir });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('# Eval Candidate Report'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Decision: pass'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Metrics'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Artifacts'));
    });
});
