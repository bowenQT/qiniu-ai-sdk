import { describe, expect, it } from 'vitest';
import {
    DefaultSkillPromotionRunner,
    InMemorySkillBenchmarkStore,
    InMemorySkillPromotionStore,
} from '../../../src/node/skills/promotion';
import { InMemorySkillTrialStore } from '../../../src/node/skills/trial';
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

describe('skill promotion gate', () => {
    it('creates quarantine promotion records by default', async () => {
        const store = new InMemorySkillPromotionStore();
        const runner = new DefaultSkillPromotionRunner(store);
        const record = await runner.ensureRecord(createRegisteredSkill());

        expect(record.state).toBe('quarantine');
        expect(record.decision.decisionStatus).toBe('hold');
        expect(store.get('skill-a')).toEqual(record);
    });

    it('promotes only when trial validation and benchmark pass', async () => {
        const promotionStore = new InMemorySkillPromotionStore();
        const trialStore = new InMemorySkillTrialStore();
        const benchmarkStore = new InMemorySkillBenchmarkStore();
        const skill = createRegisteredSkill();

        await trialStore.put({
            skillName: skill.manifest.name,
            state: 'trial',
            validation: {
                status: 'passed',
                command: 'node validate.js',
                exitCode: 0,
                sandboxId: 'sb-1',
            },
        });
        await benchmarkStore.put({
            skillName: skill.manifest.name,
            benchmarkId: 'bench-1',
            status: 'pass',
            score: 0.95,
            artifactRefs: ['artifact:bench-1'],
        });

        const runner = new DefaultSkillPromotionRunner(promotionStore, {
            trialStore,
            benchmarkStore,
            policy: {
                minimumBenchmarkScore: 0.9,
                decisionSource: 'unit-test',
            },
        });

        const record = await runner.runPromotionGate(skill);

        expect(record.state).toBe('production');
        expect(record.decision.decisionStatus).toBe('promote');
        expect(record.decision.evidenceRefs).toEqual(expect.arrayContaining([
            'trial:skill-a',
            'sandbox:sb-1',
            'benchmark:bench-1',
            'artifact:bench-1',
        ]));
    });

    it('rejects promotion when the trial has not passed sandbox validation', async () => {
        const promotionStore = new InMemorySkillPromotionStore();
        const trialStore = new InMemorySkillTrialStore();
        const benchmarkStore = new InMemorySkillBenchmarkStore();
        const skill = createRegisteredSkill();

        await trialStore.put({
            skillName: skill.manifest.name,
            state: 'quarantine',
            validation: {
                status: 'failed',
                command: 'node validate.js',
                exitCode: 1,
                stderr: 'boom',
            },
        });
        await benchmarkStore.put({
            skillName: skill.manifest.name,
            benchmarkId: 'bench-1',
            status: 'pass',
        });

        const runner = new DefaultSkillPromotionRunner(promotionStore, {
            trialStore,
            benchmarkStore,
        });

        const record = await runner.runPromotionGate(skill);

        expect(record.state).toBe('rejected');
        expect(record.decision.decisionStatus).toBe('reject');
        expect(record.blockers).toEqual(expect.arrayContaining([
            'Sandbox validation failed with exit code 1.',
        ]));
    });

    it('records rollback metadata without touching manifest state', async () => {
        const store = new InMemorySkillPromotionStore();
        const runner = new DefaultSkillPromotionRunner(store);
        const skill = createRegisteredSkill();

        await runner.ensureRecord(skill);
        const rolledBack = await runner.recordRollback(skill.manifest.name, {
            reason: 'Regression detected',
            fromState: 'production',
            toState: 'quarantine',
            rolledBackAt: new Date().toISOString(),
            evidenceRefs: ['artifact:rollback'],
        });

        expect(rolledBack.state).toBe('quarantine');
        expect(rolledBack.rollback?.reason).toBe('Regression detected');
        expect(rolledBack.rollback?.evidenceRefs).toContain('artifact:rollback');
    });
});
