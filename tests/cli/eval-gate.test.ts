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

    it('writes a CI-consumable eval gate artifact', async () => {
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
            cases: [{ caseId: 'case-1', graders: [{ graderId: 'tool', status: 'pass' }], metrics: { score: 0.9 } }],
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

        const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as { status: string; metrics: Array<{ metric: string; delta: number }> };
        expect(payload.status).toBe('pass');
        expect(payload.metrics[0]).toEqual({ metric: 'score', baseline: 0.7, candidate: 0.9, delta: 0.2 });
        expect(consoleLogSpy).toHaveBeenCalledWith(`Wrote verification artifact: ${outputPath}`);
    });
});
