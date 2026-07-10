import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'scripts', 'index.ts');
const target = path.join(root, 'test', '.opencode');

function resetTarget() {
  fs.rmSync(target, { recursive: true, force: true });
}

function runCli(args) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    cwd: root,
    encoding: 'utf-8',
  });
}

test('sync copies selected resources and reports missing selectors to stderr', () => {
  resetTarget();

  const result = runCli([
    'sync',
    '-a',
    'missing-a',
    '-a',
    'seamaid-code',
    '-c',
    'missing-c',
    '--target',
    'test/.opencode',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Not found: agent missing-a/);
  assert.match(result.stderr, /Not found: command missing-c/);
  assert.ok(fs.existsSync(path.join(target, 'agents', 'seamaid-code.md')));
  assert.equal(fs.existsSync(path.join(target, 'commands', 'create-pr.md')), false);
});

test('sync with no selectors copies every resource type', () => {
  resetTarget();

  const result = runCli(['sync', '--target', 'test/.opencode']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(fs.existsSync(path.join(target, 'agents', 'seamaid-code.md')));
  assert.ok(fs.existsSync(path.join(target, 'commands', 'create-pr.md')));
  assert.equal(fs.existsSync(path.join(target, 'plugins', 'seamaid')), false);
  assert.ok(fs.existsSync(path.join(target, 'skills', 'explain-code')));

  const config = JSON.parse(fs.readFileSync(path.join(target, 'opencode.jsonc'), 'utf-8'));
  assert.deepEqual(config.plugin, [path.join(root, 'plugins', 'seamaid', 'index.ts')]);
});

test('sync supports all per resource type and dry-run avoids writes', () => {
  resetTarget();

  const result = runCli(['sync', '-p', 'all', '-s', 'missing-skill', '--dry-run', '--target', 'test/.opencode']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Config:/);
  assert.match(result.stdout, /plugins\/seamaid\/index\.ts/);
  assert.match(result.stderr, /Not found: skill missing-skill/);
  assert.equal(fs.existsSync(target), false);
});

test('sync plugin skips existing matching plugin path', () => {
  resetTarget();
  fs.mkdirSync(target, { recursive: true });

  const pluginPath = path.join(root, 'plugins', 'seamaid', 'index.ts');
  fs.writeFileSync(
    path.join(target, 'opencode.jsonc'),
    JSON.stringify({ $schema: 'https://opencode.ai/config.json', plugin: [pluginPath] }, null, 2) + '\n',
  );

  const result = runCli(['sync', '--plugin', 'seamaid', '--target', 'test/.opencode']);

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(target, 'opencode.jsonc'), 'utf-8'));
  assert.deepEqual(config.plugin, [pluginPath]);
  assert.equal(fs.existsSync(path.join(target, 'plugins', 'seamaid')), false);
});
