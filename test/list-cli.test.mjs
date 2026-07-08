import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'scripts', 'index.ts');

function runCli(args) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    cwd: root,
    encoding: 'utf-8',
  });
}

test('list with no selectors prints every resource type as a tree', () => {
  const result = runCli(['list']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^dot-agents\n/);
  assert.match(result.stdout, /agents/);
  assert.match(result.stdout, /HY-Agent\.md/);
  assert.match(result.stdout, /commands/);
  assert.match(result.stdout, /create-pr\.md/);
  assert.match(result.stdout, /plugins/);
  assert.match(result.stdout, /seamaid/);
  assert.match(result.stdout, /skills/);
  assert.match(result.stdout, /explain-code/);
});

test('list selector without glob prints the whole selected type', () => {
  const result = runCli(['list', '--agent']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^agents\n/);
  assert.match(result.stdout, /HY-Agent\.md/);
  assert.doesNotMatch(result.stdout, /commands/);
  assert.doesNotMatch(result.stdout, /skills/);
});

test('list glob selectors are case-insensitive and can be combined', () => {
  const result = runCli(['list', '-a', 'hy*', '-s', '*CLEANUP*']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^dot-agents\n/);
  assert.match(result.stdout, /agents/);
  assert.match(result.stdout, /HY-Agent\.md/);
  assert.match(result.stdout, /skills/);
  assert.match(result.stdout, /auto-cleanup-commit/);
  assert.doesNotMatch(result.stdout, /explain-code/);
  assert.doesNotMatch(result.stdout, /commands/);
});

test('list missing glob selector prints an empty type tree', () => {
  const result = runCli(['list', '--agent', 'missing*']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'agents\n');
});
