import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..');
const examplesRoot = resolve(repoRoot, 'examples');

function readExample(fileName: string): string {
    return readFileSync(resolve(examplesRoot, fileName), 'utf8');
}

describe('examples smoke', () => {
    it('keeps examples on public package entrypoints instead of ../src imports', () => {
        const exampleFiles = readdirSync(examplesRoot).filter((entry) => entry.endsWith('.ts') || entry.endsWith('.md'));

        for (const fileName of exampleFiles) {
            const source = readExample(fileName);
            expect(source).not.toContain("from '../src'");
            expect(source).not.toContain('from "../src"');
        }
    });

    it('keeps the tracked example set free of known stale API markers', () => {
        const usageExample = readExample('usage.ts');
        const verifyExample = readExample('verify.ts');
        const tutorialExample = readExample('TUTORIAL.md');

        for (const source of [usageExample, verifyExample, tutorialExample]) {
            expect(source).not.toContain('QINIU_AI_API_KEY');
            expect(source).not.toContain('kling-v1');
        }

        expect(tutorialExample).not.toContain('invokeResumable');
        expect(tutorialExample).not.toContain('#20-mcp-client-integration');
        expect(tutorialExample).not.toContain('createCrew');
    });

    it('keeps tutorial version and supported package entrypoints aligned', () => {
        const packageVersion = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')).version;
        const tutorialExample = readExample('TUTORIAL.md');
        const supportedImports = [
            "@bowenqt/qiniu-ai-sdk'",
            "@bowenqt/qiniu-ai-sdk/qiniu'",
            "@bowenqt/qiniu-ai-sdk/adapter'",
            "@bowenqt/qiniu-ai-sdk/ai-tools'",
        ];

        expect(tutorialExample).toContain(`v${packageVersion}`);

        for (const fileName of ['01-basic-weather-agent.ts', 'native-generate-text.ts', 'usage.ts', 'vercel-ai-sdk.ts', 'zod-tools.ts']) {
            const source = readExample(fileName);
            expect(supportedImports.some((entry) => source.includes(entry))).toBe(true);
        }
    });
});
