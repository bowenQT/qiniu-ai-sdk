import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docs = [
  resolve(repoRoot, 'README.md'),
  resolve(repoRoot, 'README.zh-CN.md'),
  resolve(repoRoot, 'COOKBOOK.md'),
];
const capabilityScorecardPath = resolve(repoRoot, 'docs', 'capability-scorecard.md');

const forbiddenRootSymbols = new Set([
  'QiniuAI',
  'generateText',
  'generateTextWithGraph',
  'generateObject',
  'streamObject',
  'streamText',
  'createAgent',
  'AgentGraph',
  'MemoryCheckpointer',
  'RedisCheckpointer',
  'PostgresCheckpointer',
  'KodoCheckpointer',
  'createNodeQiniuAI',
  'NodeMCPHost',
  'MCPHttpTransport',
  'FileTokenStore',
  'QiniuMCPServer',
  'SkillLoader',
  'SkillRegistry',
  'RegistryProtocolStub',
  'ResponseAPI',
]);

const rootImportPattern = /import\s+\{([^}]*)\}\s+from\s+['"]@bowenqt\/qiniu-ai-sdk['"]/g;
const errors = [];

for (const filePath of docs) {
  const source = readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(rootImportPattern)) {
    const symbols = match[1]
      .split(',')
      .map((value) => value.replace(/\btype\b/g, '').trim())
      .filter(Boolean);
    const offenders = symbols.filter((symbol) => forbiddenRootSymbols.has(symbol));
    if (offenders.length > 0) {
      errors.push(`${filePath}: root import should use subpaths for ${offenders.join(', ')}`);
    }
  }
}

const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
if (!readme.includes('### Cloud API Quickstart')) {
  errors.push('README.md: missing "Cloud API Quickstart" section');
}
if (!readme.includes('### Agent Quickstart')) {
  errors.push('README.md: missing "Agent Quickstart" section');
}
if (!readme.includes('### Node Agent Quickstart')) {
  errors.push('README.md: missing "Node Agent Quickstart" section');
}
if (!readme.includes('### Capability Metadata')) {
  errors.push('README.md: missing "Capability Metadata" section');
}
if (!readme.includes('### Worktree Delivery')) {
  errors.push('README.md: missing "Worktree Delivery" section');
}


const readmeZh = readFileSync(resolve(repoRoot, 'README.zh-CN.md'), 'utf8');
if (!readmeZh.includes('### 能力元数据')) {
  errors.push('README.zh-CN.md: missing "能力元数据" section');
}
if (!readmeZh.includes('### Worktree 交付流')) {
  errors.push('README.zh-CN.md: missing "Worktree 交付流" section');
}


if (!existsSync(capabilityScorecardPath)) {
  errors.push('docs/capability-scorecard.md: missing generated scorecard');
} else {
  const scorecard = readFileSync(capabilityScorecardPath, 'utf8');
  for (const section of ['# Capability Scorecard', '## Validated Models', '## Module Maturity']) {
    if (!scorecard.includes(section)) {
      errors.push(`docs/capability-scorecard.md: missing section "${section}"`);
    }
  }
}

const cookbook = readFileSync(resolve(repoRoot, 'COOKBOOK.md'), 'utf8');
for (const section of ['## Start Here', '## Common Workflows', '## Advanced Integrations', '## Experimental']) {
  if (!cookbook.includes(section)) {
    errors.push(`COOKBOOK.md: missing section "${section}"`);
  }
}
if (cookbook.includes('MCP Client Integration')) {
  errors.push('COOKBOOK.md: legacy "MCP Client Integration" heading should be renamed to NodeMCPHost');
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log('docs contract ok');
