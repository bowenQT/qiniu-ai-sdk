import type {
    ArtifactLabel,
    ArtifactRevision,
    ControlPlaneArtifactKind,
    RevisionRef,
    RevisionStore,
} from './contracts';
import { createRevisionRef, isControlPlaneArtifactKind, normalizeArtifactLabels } from './contracts';
import type { ControlPlaneRunMetadata } from './runtime';

export interface RevisionSelector {
    revisionId?: string;
    labels?: readonly ArtifactLabel[];
    createdAt?: string;
    metadata?: Record<string, unknown>;
}

interface NormalizedRevisionSelector extends Omit<RevisionSelector, 'labels'> {
    labels: ArtifactLabel[];
}

export interface LabelResolver {
    resolveRevisionRef: (
        kind: ControlPlaneArtifactKind,
        selector: RevisionSelector,
    ) => Promise<RevisionRef | null> | RevisionRef | null;
}

export interface ArtifactRegistry<TPayload = unknown>
    extends RevisionStore<TPayload>,
        LabelResolver {}

export interface ControlPlaneResolutionContext {
    revisionStore?: RevisionStore;
    labelResolver?: LabelResolver;
    artifactRegistry?: ArtifactRegistry;
}

export interface ResolvableControlPlaneRunMetadata
    extends Omit<
        ControlPlaneRunMetadata,
        'promptRevision' | 'routingPolicyRevision' | 'memoryPolicyRevision' | 'guardrailRevision' | 'skillRevisions'
    > {
    promptRevision?: RevisionRef | RevisionSelector;
    routingPolicyRevision?: RevisionRef | RevisionSelector;
    memoryPolicyRevision?: RevisionRef | RevisionSelector;
    guardrailRevision?: RevisionRef | RevisionSelector;
    skillRevisions?: Array<RevisionRef | RevisionSelector>;
}

function isRevisionRef(input: RevisionRef | RevisionSelector): input is RevisionRef {
    return isControlPlaneArtifactKind((input as RevisionRef).kind)
        && typeof (input as RevisionRef).revisionId === 'string';
}

function normalizeRevisionSelector(input: RevisionSelector): NormalizedRevisionSelector {
    return {
        revisionId: input.revisionId,
        labels: normalizeArtifactLabels(input.labels ?? []),
        createdAt: input.createdAt,
        metadata: input.metadata,
    };
}

function normalizeRevisionRef(ref: RevisionRef): RevisionRef {
    return createRevisionRef({
        kind: ref.kind,
        revisionId: ref.revisionId,
        labels: ref.labels,
        createdAt: ref.createdAt,
        metadata: ref.metadata,
    });
}

async function getStoredRevision(
    kind: ControlPlaneArtifactKind,
    revisionId: string,
    context: ControlPlaneResolutionContext,
): Promise<ArtifactRevision<unknown> | null> {
    const source = context.artifactRegistry ?? context.revisionStore;
    if (!source) {
        return null;
    }

    const stored = await source.getRevision(revisionId);
    if (!stored || stored.ref.kind !== kind) {
        return null;
    }

    return stored;
}

export async function resolveControlPlaneRevisionRef(
    kind: ControlPlaneArtifactKind,
    input: RevisionRef | RevisionSelector | undefined,
    context: ControlPlaneResolutionContext = {},
): Promise<RevisionRef | undefined> {
    if (!input) {
        return undefined;
    }

    if (isRevisionRef(input)) {
        if (input.kind !== kind) {
            throw new Error(`Revision kind mismatch: expected "${kind}", got "${input.kind}"`);
        }
        return normalizeRevisionRef(input);
    }

    const selector = normalizeRevisionSelector(input);

    if (selector.revisionId) {
        const stored = await getStoredRevision(kind, selector.revisionId, context);
        if (!stored) {
            throw new Error(`Revision "${selector.revisionId}" could not be resolved for kind "${kind}"`);
        }
        return normalizeRevisionRef(stored.ref);
    }

    if (selector.labels.length === 0) {
        return undefined;
    }

    const resolver = context.artifactRegistry ?? context.labelResolver;
    if (!resolver) {
        throw new Error(`No label resolver configured for kind "${kind}"`);
    }

    const resolved = await resolver.resolveRevisionRef(kind, selector);
    if (!resolved) {
        throw new Error(`No revision matched labels [${selector.labels.join(', ')}] for kind "${kind}"`);
    }

    if (resolved.kind !== kind) {
        throw new Error(`Revision kind mismatch: expected "${kind}", got "${resolved.kind}"`);
    }

    return normalizeRevisionRef(resolved);
}

export async function resolveControlPlaneRunMetadata(
    metadata: ResolvableControlPlaneRunMetadata | undefined,
    context: ControlPlaneResolutionContext = {},
): Promise<ControlPlaneRunMetadata | undefined> {
    if (!metadata) {
        return undefined;
    }

    const [
        promptRevision,
        routingPolicyRevision,
        memoryPolicyRevision,
        guardrailRevision,
        skillRevisions,
        candidateRevision,
    ] = await Promise.all([
        resolveControlPlaneRevisionRef('prompt', metadata.promptRevision, context),
        resolveControlPlaneRevisionRef('routing-policy', metadata.routingPolicyRevision, context),
        resolveControlPlaneRevisionRef('memory-policy', metadata.memoryPolicyRevision, context),
        resolveControlPlaneRevisionRef('guardrail-policy', metadata.guardrailRevision, context),
        Promise.all((metadata.skillRevisions ?? []).map((revision) => resolveControlPlaneRevisionRef('skill', revision, context)))
            .then((results) => results.filter((revision): revision is RevisionRef => Boolean(revision))),
        metadata.candidateRevision ? normalizeRevisionRef(metadata.candidateRevision) : undefined,
    ]);

    return {
        ...metadata,
        promptRevision,
        routingPolicyRevision,
        memoryPolicyRevision,
        guardrailRevision,
        skillRevisions,
        candidateRevision,
    };
}

export class InMemoryArtifactRegistry<TPayload = unknown> implements ArtifactRegistry<TPayload> {
    private readonly revisions = new Map<string, ArtifactRevision<TPayload>>();
    private readonly labelsByKind = new Map<ControlPlaneArtifactKind, Map<ArtifactLabel, string>>();
    private readonly labelsByRevision = new Map<string, Set<ArtifactLabel>>();

    getRevision(revisionId: string): ArtifactRevision<TPayload> | null {
        return this.revisions.get(revisionId) ?? null;
    }

    putRevision(revision: ArtifactRevision<TPayload>): void {
        const normalized = {
            ref: normalizeRevisionRef(revision.ref),
            payload: revision.payload,
        };

        const existing = this.revisions.get(normalized.ref.revisionId);
        if (existing) {
            this.clearRevisionLabels(existing.ref.revisionId, existing.ref.kind);
        }

        this.revisions.set(normalized.ref.revisionId, normalized);
        this.bindRevisionLabels(normalized.ref.kind, normalized.ref.revisionId, normalized.ref.labels);
    }

    assignLabels(revisionId: string, labels: ArtifactLabel[]): void {
        const stored = this.revisions.get(revisionId);
        if (!stored) {
            return;
        }

        this.clearRevisionLabels(revisionId, stored.ref.kind);
        stored.ref = createRevisionRef({
            kind: stored.ref.kind,
            revisionId: stored.ref.revisionId,
            labels,
            createdAt: stored.ref.createdAt,
            metadata: stored.ref.metadata,
        });
        this.bindRevisionLabels(stored.ref.kind, stored.ref.revisionId, stored.ref.labels);
    }

    async resolveRevisionRef(
        kind: ControlPlaneArtifactKind,
        selector: RevisionSelector,
    ): Promise<RevisionRef | null> {
        const normalized = normalizeRevisionSelector(selector);

        if (normalized.revisionId) {
            const stored = this.revisions.get(normalized.revisionId);
            if (!stored || stored.ref.kind !== kind) {
                return null;
            }
            return normalizeRevisionRef(stored.ref);
        }

        for (const label of normalized.labels) {
            const revisionId = this.labelsByKind.get(kind)?.get(label);
            if (!revisionId) {
                continue;
            }

            const stored = this.revisions.get(revisionId);
            if (stored && stored.ref.kind === kind) {
                return normalizeRevisionRef(stored.ref);
            }
        }

        return null;
    }

    private bindRevisionLabels(
        kind: ControlPlaneArtifactKind,
        revisionId: string,
        labels: readonly ArtifactLabel[],
    ): void {
        if (labels.length === 0) {
            return;
        }

        const labelsForRevision = this.labelsByRevision.get(revisionId) ?? new Set<ArtifactLabel>();
        this.labelsByRevision.set(revisionId, labelsForRevision);

        const labelsForKind = this.labelsByKind.get(kind) ?? new Map<ArtifactLabel, string>();
        this.labelsByKind.set(kind, labelsForKind);

        for (const label of labels) {
            const previousRevisionId = labelsForKind.get(label);
            if (previousRevisionId && previousRevisionId !== revisionId) {
                this.removeLabelFromRevision(kind, previousRevisionId, label);
            }

            labelsForKind.set(label, revisionId);
            labelsForRevision.add(label);
        }
    }

    private clearRevisionLabels(revisionId: string, kind: ControlPlaneArtifactKind): void {
        const labels = this.labelsByRevision.get(revisionId);
        if (!labels) {
            return;
        }

        const labelsForKind = this.labelsByKind.get(kind);
        if (labelsForKind) {
            for (const label of labels) {
                if (labelsForKind.get(label) === revisionId) {
                    labelsForKind.delete(label);
                }
            }
        }

        this.labelsByRevision.delete(revisionId);
    }

    private removeLabelFromRevision(
        kind: ControlPlaneArtifactKind,
        revisionId: string,
        label: ArtifactLabel,
    ): void {
        const labelsForKind = this.labelsByKind.get(kind);
        if (labelsForKind?.get(label) === revisionId) {
            labelsForKind.delete(label);
        }

        const revision = this.revisions.get(revisionId);
        if (!revision) {
            return;
        }

        const labels = this.labelsByRevision.get(revisionId);
        if (labels) {
            labels.delete(label);
        }

        revision.ref = createRevisionRef({
            kind: revision.ref.kind,
            revisionId: revision.ref.revisionId,
            labels: [...(labels ?? [])],
            createdAt: revision.ref.createdAt,
            metadata: revision.ref.metadata,
        });
    }
}
