import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(repoRoot, 'docs', 'capability-scorecard.md');
const evidenceSnapshotPath = resolve(repoRoot, '.trellis', 'spec', 'sdk', 'capability-evidence.json');
const checkMode = process.argv.includes('--check');

const maturityRank = {
  ga: 0,
  beta: 1,
  experimental: 2,
};

function requireDistModule() {
  const distEntry = resolve(repoRoot, 'dist', 'qiniu', 'index.mjs');
  if (!existsSync(distEntry)) {
    throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering the capability scorecard.`);
  }
  return import(pathToFileURL(distEntry).href);
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function formatValue(value) {
  if (value == null || value === '') return 'n/a';
  return String(value);
}

function renderTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n');
  return [headerLine, separatorLine, body].filter(Boolean).join('\n');
}

function renderScorecard(models, modules, evidenceSnapshot) {
  const validatedModels = models
    .filter((model) => model.validatedAt)
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  const moduleRows = modules
    .slice()
    .sort((a, b) => maturityRank[a.maturity] - maturityRank[b.maturity] || a.name.localeCompare(b.name));
  const publicSurfaceRows = Array.isArray(evidenceSnapshot?.publicSurfaces)
    ? evidenceSnapshot.publicSurfaces.slice().sort((a, b) => String(a.kind ?? '').localeCompare(String(b.kind ?? '')) || String(a.name ?? '').localeCompare(String(b.name ?? '')))
    : [];
  const surfaceExclusionRows = Array.isArray(evidenceSnapshot?.surfaceExclusions)
    ? evidenceSnapshot.surfaceExclusions.slice().sort((a, b) => String(a.reasonCode ?? '').localeCompare(String(b.reasonCode ?? '')) || String(a.surface ?? '').localeCompare(String(b.surface ?? '')))
    : [];

  const validatedCounts = validatedModels.reduce((acc, model) => {
    acc[model.type] = (acc[model.type] ?? 0) + 1;
    return acc;
  }, {});

  const maturityCounts = moduleRows.reduce((acc, entry) => {
    acc[entry.maturity] = (acc[entry.maturity] ?? 0) + 1;
    return acc;
  }, {});

  const syncedAt = evidenceSnapshot?.generatedAt ?? moduleRows[0]?.sourceUpdatedAt ?? 'unknown';
  const evidenceGeneratedAt = evidenceSnapshot?.generatedAt ?? 'unknown';
  const trackedDecisionCount = evidenceSnapshot?.promotionDecisions?.length ?? 0;
  const latestGate = evidenceSnapshot?.latestLiveVerifyGate;
  const latestGateReason = latestGate?.reason ?? latestGate?.reasonCode ?? 'n/a';
  const surfacePolicy = evidenceSnapshot?.surfaceTruthPolicy ?? {};
  const firstClassSurfaceDefinition = Array.isArray(surfacePolicy.firstClassSurfaceDefinition)
    ? surfacePolicy.firstClassSurfaceDefinition
    : [];
  const exclusionReasonSemantics = surfacePolicy.exclusionReasonSemantics && typeof surfacePolicy.exclusionReasonSemantics === 'object'
    ? surfacePolicy.exclusionReasonSemantics
    : {};
  const gateBlankReasonSemantics = surfacePolicy.gateBlankReasonSemantics && typeof surfacePolicy.gateBlankReasonSemantics === 'object'
    ? surfacePolicy.gateBlankReasonSemantics
    : {};
  const surfacePolicyRows = [
    ['Surface inclusion', 'first-class', firstClassSurfaceDefinition.join(' ') || 'User-visible package entrypoints and direct runtime APIs are tracked as first-class surfaces.'],
    ...Object.entries(exclusionReasonSemantics).map(([code, meaning]) => ['Surface exclusion', code, meaning]),
    ...Object.entries(gateBlankReasonSemantics).map(([code, meaning]) => ['Gate blank reason', code, meaning]),
  ];

  return [
    '# Capability Scorecard',
    '',
    `Last synced: ${syncedAt}`,
    '',
    'This document is generated from the SDK capability registry and is intended to make product maturity auditable.',
    '',
    '## Summary',
    '',
    `- Validated models: ${validatedModels.length}`,
    `- Validated chat/image/video split: chat=${validatedCounts.chat ?? 0}, image=${validatedCounts.image ?? 0}, video=${validatedCounts.video ?? 0}`,
    `- Public surfaces tracked: ${publicSurfaceRows.length}`,
    `- Surface exclusions tracked: ${surfaceExclusionRows.length}`,
    `- Module maturity split: ga=${maturityCounts.ga ?? 0}, beta=${maturityCounts.beta ?? 0}, experimental=${maturityCounts.experimental ?? 0}`,
    `- Evidence snapshot generated at: ${evidenceGeneratedAt}`,
    `- Tracked promotion decisions: ${trackedDecisionCount}`,
    '',
    '## Coverage Semantics',
    '',
    renderTable(
      ['Kind', 'Code', 'Meaning'],
      surfacePolicyRows,
    ),
    '',
    '## Validated Models',
    '',
    renderTable(
      ['Model', 'Provider', 'Type', 'Stability', 'Validation', 'Validated At', 'Docs'],
      validatedModels.map((model) => [
        model.id,
        model.provider,
        model.type,
        model.stability,
        model.validationLevel,
        model.validatedAt ?? '',
        model.docsUrl,
      ]),
    ),
    '',
    '## Public Surfaces',
    '',
    renderTable(
      ['Surface', 'Kind', 'Maturity', 'Validation', 'Validated At', 'Evidence', 'Docs'],
      publicSurfaceRows.map((entry) => [
        entry.name,
        entry.kind ?? 'n/a',
        entry.maturity ?? 'n/a',
        entry.validationLevel ?? 'n/a',
        formatValue(entry.validatedAt),
        Array.isArray(entry.evidenceBasis) && entry.evidenceBasis.length > 0
          ? entry.evidenceBasis.join('; ')
          : formatValue(entry.notes),
        entry.docsUrl ?? 'n/a',
      ]),
    ),
    '',
    '## Surface Exclusions',
    '',
    renderTable(
      ['Surface', 'Code', 'Reason', 'Notes'],
      surfaceExclusionRows.map((entry) => [
        entry.surface ?? 'n/a',
        entry.reasonCode ?? 'n/a',
        entry.reason ?? 'n/a',
        entry.notes ?? 'n/a',
      ]),
    ),
    '',
    '## Module Maturity',
    '',
    renderTable(
      ['Module', 'Maturity', 'Decision', 'Validation', 'Validated At', 'Notes', 'Docs'],
      moduleRows.map((entry) => [
        entry.name,
        entry.maturity,
        entry.trackedDecision
          ? entry.trackedDecision.oldMaturity === entry.trackedDecision.newMaturity
            ? `${entry.trackedDecision.newMaturity} (held)`
            : `${entry.trackedDecision.oldMaturity} -> ${entry.trackedDecision.newMaturity}`
          : '',
        entry.validationLevel,
        entry.validatedAt ?? '',
        entry.notes ?? '',
        entry.docsUrl,
      ]),
    ),
    '',
    '## Tracked Evidence Snapshot',
    '',
    renderTable(
      ['Field', 'Value'],
      [
        ['Generated At', evidenceGeneratedAt],
        ['Tracked Decision Files', String(evidenceSnapshot?.decisionFiles?.length ?? 0)],
        ['Public Surfaces', String(publicSurfaceRows.length)],
        ['Surface Exclusions', String(surfaceExclusionRows.length)],
        ['Tracked Promotion Decisions', String(trackedDecisionCount)],
        ['Latest Gate Artifact', formatValue(latestGate?.path)],
        ['Latest Gate Status', formatValue(latestGate?.status)],
        ['Latest Promotion Gate', formatValue(latestGate?.promotionGateStatus)],
        ['Latest Gate Package', formatValue(latestGate?.packageId)],
        ['Latest Gate Reason', latestGateReason],
      ],
    ),
    '',
  ].join('\n');
}

const evidenceSnapshot = JSON.parse(readFileSync(evidenceSnapshotPath, 'utf8'));
const { listModels, listModuleMaturities } = await requireDistModule();
const rendered = renderScorecard(listModels(), listModuleMaturities(), evidenceSnapshot);

if (checkMode) {
  const existing = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
  if (existing !== rendered) {
    console.error(`Capability scorecard is stale: ${outputPath}`);
    process.exit(1);
  }
  console.log('capability scorecard ok');
} else {
  mkdirSync(resolve(repoRoot, 'docs'), { recursive: true });
  writeFileSync(outputPath, rendered, 'utf8');
  console.log(`Wrote ${outputPath}`);
}
