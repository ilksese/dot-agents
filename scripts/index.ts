#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  const parent = path.resolve(dir, '..');
  if (parent === dir) throw new Error('Could not find project root');
  return findProjectRoot(parent);
}

const projectRoot = findProjectRoot(__dirname);
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));

const EXCLUDED_FILES = new Set(['.DS_Store']);
const DIRS = ['agents', 'commands', 'plugins', 'skills'] as const;

function copyRecursive(src: string, dest: string, dryRun: boolean): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_FILES.has(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (dryRun) {
      console.log(`  ${entry.isDirectory() ? '📁' : '📄'} ${srcPath}  →  ${destPath}`);
      continue;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    if (entry.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true, force: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const program = new Command();

program
  .name('dot-agents')
  .version(pkg.version)
  .description('Sync agents, commands, plugins, and skills to OpenCode config directory');

program
  .command('init')
  .description('Sync all directories to the target OpenCode config directory')
  .option('-t, --target <path>', 'Custom target directory (default: ~/.config/opencode/)')
  .option('-d, --dry-run', 'Preview changes without copying')
  .action((options) => {
    const baseDir = options.target
      ? path.resolve(options.target)
      : path.join(process.env.HOME!, '.config', 'opencode');

    const dryRun = !!options.dryRun;

    console.log(`Target: ${baseDir}${dryRun ? ' (dry-run)' : ''}\n`);

    for (const dir of DIRS) {
      const srcDir = path.join(projectRoot, dir);
      const destDir = path.join(baseDir, dir);

      if (!fs.existsSync(srcDir)) {
        console.log(`⚠ Source not found: ${dir}/`);
        continue;
      }

      fs.mkdirSync(destDir, { recursive: true });
      const entryCount = fs.readdirSync(srcDir).filter(f => !EXCLUDED_FILES.has(f)).length;
      if (entryCount === 0) {
        console.log(`  ${dir}/  (empty)`);
        continue;
      }

      console.log(`  ${dir}/`);
      copyRecursive(srcDir, destDir, dryRun);
    }

    if (dryRun) {
      console.log('\nDry run complete.');
    } else {
      console.log('\nDone.');
    }
  });

program.parse(process.argv);