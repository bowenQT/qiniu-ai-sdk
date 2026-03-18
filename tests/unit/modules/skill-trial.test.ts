import { describe, expect, it, vi } from 'vitest';
import {
    DefaultSkillTrialRunner,
    InMemorySkillTrialStore,
    resolveSkillTrialCommand,
    shouldSandboxTrial,
    type SkillTrialValidator,
} from '../../../src/node/skills/trial';
import type { RegisteredSkill } from '../../../src/node/skills/registry';

function createRegisteredSkill(overrides: Partial<RegisteredSkill> = {}): RegisteredSkill {
    return {
        manifest: {
            name: 'skill-a',
            version: '1.0.0',
            description: 'test',
            entry: 'SKILL.md',
            entryType: 'markdown',
            runtime: {
                engine: 'sandbox',
                entryCommand: 'node validate.js',
            },
            permissions: ['command:execute'],
        },
        source: 'remote',
        ...overrides,
    };
}

describe('skill trial scaffold', () => {
    it('creates quarantine records by default', async () => {
        const store = new InMemorySkillTrialStore();
        const runner = new DefaultSkillTrialRunner(store);
        const record = await runner.ensureRecord(createRegisteredSkill());

        expect(record.state).toBe('quarantine');
        expect(store.get('skill-a')).toEqual(record);
    });

    it('detects whether a skill requires sandbox validation', () => {
        expect(shouldSandboxTrial(createRegisteredSkill())).toBe(true);
        expect(resolveSkillTrialCommand(createRegisteredSkill())).toBe('node validate.js');
    });

    it('moves skills into rejected state when sandbox validation fails', async () => {
        const store = new InMemorySkillTrialStore();
        const validator: SkillTrialValidator = {
            validate: vi.fn(async () => ({
                status: 'failed',
                command: 'node validate.js',
                exitCode: 1,
                stderr: 'boom',
            })),
        };
        const runner = new DefaultSkillTrialRunner(store, validator);
        const record = await runner.runSandboxValidation(createRegisteredSkill());

        expect(record.state).toBe('rejected');
        expect(record.validation?.status).toBe('failed');
    });
});
