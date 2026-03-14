import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const templates = ['chat', 'agent', 'node-agent'];
const nodeModulesRoot = findNodeModulesRoot(repoRoot);
const tscBin = join(nodeModulesRoot, '.bin', 'tsc');

function findNodeModulesRoot(startDir) {
  const { root } = parse(startDir);
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, 'node_modules');
    if (existsSync(join(candidate, '.bin', 'tsc'))) {
      return candidate;
    }
    if (currentDir === root) {
      break;
    }
    currentDir = dirname(currentDir);
  }

  throw new Error(`unable to locate node_modules/.bin/tsc from ${startDir}`);
}

function ensureSymlink(source, target) {
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, 'junction');
}

function linkTemplateDependencies(projectDir) {
  const projectNodeModules = join(projectDir, 'node_modules');
  mkdirSync(projectNodeModules, { recursive: true });

  ensureSymlink(repoRoot, join(projectNodeModules, '@bowenqt', 'qiniu-ai-sdk'));

  for (const dependency of ['zod', 'ws', 'ai']) {
    const source = join(nodeModulesRoot, dependency);
    if (existsSync(source)) {
      ensureSymlink(source, join(projectNodeModules, dependency));
    }
  }

  for (const scope of ['@types', '@ai-sdk', '@modelcontextprotocol']) {
    const source = join(nodeModulesRoot, scope);
    if (existsSync(source)) {
      ensureSymlink(source, join(projectNodeModules, scope));
    }
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'qiniu-ai-template-smoke-'));

try {
  for (const template of templates) {
    const projectDir = join(workspace, template);
    execFileSync(process.execPath, [join(repoRoot, 'bin', 'qiniu-ai.mjs'), 'init', '--template', template, '--dir', projectDir], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    const packageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
    if (packageJson.name !== template) {
      throw new Error(`expected generated package name to equal "${template}", got "${packageJson.name}"`);
    }

    linkTemplateDependencies(projectDir);

    execFileSync(tscBin, ['--noEmit', '-p', join(projectDir, 'tsconfig.json')], {
      cwd: projectDir,
      stdio: 'pipe',
    });
  }

  console.log('template smoke ok');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
