import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(repoRoot, 'docs', 'capability-scorecard.md');
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

function renderTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n');
  return [headerLine, separatorLine, body].filter(Boolean).join('\n');
}

function renderScorecard(models, modules) {
  const validatedModels = models
    .filter((model) => model.validatedAt)
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  const moduleRows = modules
    .slice()
    .sort((a, b) => maturityRank[a.maturity] - maturityRank[b.maturity] || a.name.localeCompare(b.name));

  const validatedCounts = validatedModels.reduce((acc, model) => {
    acc[model.type] = (acc[model.type] ?? 0) + 1;
    return acc;
  }, {});

  const maturityCounts = moduleRows.reduce((acc, entry) => {
    acc[entry.maturity] = (acc[entry.maturity] ?? 0) + 1;
    return acc;
  }, {});

  const syncedAt = moduleRows[0]?.sourceUpdatedAt ?? 'unknown';

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
    `- Module maturity split: ga=${maturityCounts.ga ?? 0}, beta=${maturityCounts.beta ?? 0}, experimental=${maturityCounts.experimental ?? 0}`,
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
    '## Module Maturity',
    '',
    renderTable(
      ['Module', 'Maturity', 'Validation', 'Validated At', 'Notes', 'Docs'],
      moduleRows.map((entry) => [
        entry.name,
        entry.maturity,
        entry.validationLevel,
        entry.validatedAt ?? '',
        entry.notes ?? '',
        entry.docsUrl,
      ]),
    ),
    '',
  ].join('\n');
}

const { listModels, listModuleMaturities } = await requireDistModule();
const rendered = renderScorecard(listModels(), listModuleMaturities());

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
