import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docs = [
  resolve(repoRoot, 'README.md'),
  resolve(repoRoot, 'README.zh-CN.md'),
  resolve(repoRoot, 'COOKBOOK.md'),
];
const exampleDocs = [
  resolve(repoRoot, 'examples', '01-basic-weather-agent.ts'),
  resolve(repoRoot, 'examples', '02-research-assistant.ts'),
  resolve(repoRoot, 'examples', '03-code-review-agent.ts'),
  resolve(repoRoot, 'examples', '04-content-crew.ts'),
  resolve(repoRoot, 'examples', 'usage.ts'),
  resolve(repoRoot, 'examples', 'verify.ts'),
  resolve(repoRoot, 'examples', 'verify-streaming.ts'),
  resolve(repoRoot, 'examples', 'verify-image-edit.ts'),
  resolve(repoRoot, 'examples', 'verify-video-frames.ts'),
  resolve(repoRoot, 'examples', 'TUTORIAL.md'),
];
const capabilityScorecardPath = resolve(repoRoot, 'docs', 'capability-scorecard.md');
const packageJsonPath = resolve(repoRoot, 'package.json');
const packageVersion = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;

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

function extractSection(source, heading) {
  const start = source.indexOf(heading);
  if (start === -1) {
    return '';
  }
  const remainder = source.slice(start);
  const nextHeading = remainder.slice(heading.length).search(/\n###\s+/);
  if (nextHeading === -1) {
    return remainder;
  }
  return remainder.slice(0, heading.length + nextHeading);
}

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

for (const filePath of exampleDocs) {
  const source = readFileSync(filePath, 'utf8');
  if (source.includes("from '../src'") || source.includes('from "../src"')) {
    errors.push(`${filePath}: examples should import from package entrypoints, not ../src`);
  }
}

const usageExample = readFileSync(resolve(repoRoot, 'examples', 'usage.ts'), 'utf8');
for (const pattern of ['QINIU_AI_API_KEY', 'client.sys.search', 'kling-v1']) {
  if (usageExample.includes(pattern)) {
    errors.push(`examples/usage.ts: stale pattern still present: ${pattern}`);
  }
}

const verifyExample = readFileSync(resolve(repoRoot, 'examples', 'verify.ts'), 'utf8');
for (const pattern of ['QINIU_AI_API_KEY', 'client.sys.search', 'image.create(', 'kling-v1']) {
  if (verifyExample.includes(pattern)) {
    errors.push(`examples/verify.ts: stale pattern still present: ${pattern}`);
  }
}

const tutorialExample = readFileSync(resolve(repoRoot, 'examples', 'TUTORIAL.md'), 'utf8');
for (const pattern of ['invokeResumable', '#20-mcp-client-integration', 'createCrew']) {
  if (tutorialExample.includes(pattern)) {
    errors.push(`examples/TUTORIAL.md: stale pattern still present: ${pattern}`);
  }
}

const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
const readmeMcpServerSection = extractSection(readme, '### MCP Server');
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
if (readme.includes('Built-in Qiniu MCP server for OCR/Censor/Vframe tools')) {
  errors.push('README.md: MCP server summary still claims Vframe support');
}
for (const token of ['createTextResult', 'followUpTextResult', 'deferred/provider-only']) {
  if (!readme.includes(token)) {
    errors.push(`README.md: missing ResponseAPI contract token "${token}"`);
  }
}
if (!readme.includes('qiniu_video_censor') || !readme.includes('qiniu_image_generate')) {
  errors.push('README.md: MCP server section should list the current built-in tool surface');
}
if (readmeMcpServerSection.includes('OCR/Censor/Vframe')) {
  errors.push('README.md: QiniuMCPServer should not be documented as exposing Vframe');
}
if (readmeMcpServerSection.includes('QINIU_ACCESS_KEY') || readmeMcpServerSection.includes('QINIU_SECRET_KEY')) {
  errors.push('README.md: MCP Server section should not require QINIU_ACCESS_KEY / QINIU_SECRET_KEY');
}


const readmeZh = readFileSync(resolve(repoRoot, 'README.zh-CN.md'), 'utf8');
const readmeZhMcpServerSection = extractSection(readmeZh, '### MCP Server');
if (!readmeZh.includes('### 能力元数据')) {
  errors.push('README.zh-CN.md: missing "能力元数据" section');
}
if (!readmeZh.includes('### Worktree 交付流')) {
  errors.push('README.zh-CN.md: missing "Worktree 交付流" section');
}
if (readmeZh.includes('内置七牛 MCP Server（OCR/审核/抽帧）')) {
  errors.push('README.zh-CN.md: MCP 服务端摘要仍然声称支持抽帧');
}
for (const token of ['createTextResult', 'followUpTextResult', 'deferred/provider-only']) {
  if (!readmeZh.includes(token)) {
    errors.push(`README.zh-CN.md: missing ResponseAPI contract token "${token}"`);
  }
}
if (!readmeZh.includes('qiniu_video_censor') || !readmeZh.includes('qiniu_image_generate')) {
  errors.push('README.zh-CN.md: MCP Server section should list the current built-in tool surface');
}
if (readmeZhMcpServerSection.includes('OCR/审核/抽帧')) {
  errors.push('README.zh-CN.md: QiniuMCPServer 不应继续声明抽帧能力');
}
if (readmeZhMcpServerSection.includes('QINIU_ACCESS_KEY') || readmeZhMcpServerSection.includes('QINIU_SECRET_KEY')) {
  errors.push('README.zh-CN.md: MCP Server 段落不应继续要求 QINIU_ACCESS_KEY / QINIU_SECRET_KEY');
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
if (cookbook.includes('Built-in Qiniu MCP server for OCR/Censor/Vframe tools')) {
  errors.push('COOKBOOK.md: MCP server wording still claims Vframe support');
}
if (!cookbook.includes('qiniu_video_censor') || !cookbook.includes('qiniu_image_generate')) {
  errors.push('COOKBOOK.md: NodeMCPHost section should call out the current qiniu-mcp-server tool surface');
}
if (!cookbook.includes('qiniu_vframe')) {
  errors.push('COOKBOOK.md: built-in cloud tools section should still distinguish qiniu_vframe from MCP server tools');
}
if (!tutorialExample.includes(`v${packageVersion}`)) {
  errors.push(`examples/TUTORIAL.md: footer version should match package.json (${packageVersion})`);
}
if (cookbook.includes('QiniuMCPServer') && cookbook.includes('built-in tool set is currently') && !cookbook.includes('stays available through `@bowenqt/qiniu-ai-sdk/ai-tools`')) {
  errors.push('COOKBOOK.md: QiniuMCPServer note should keep qiniu_vframe outside the built-in server surface');
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log('docs contract ok');
