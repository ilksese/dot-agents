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

function discoverPlugins(pluginsDir: string): string[] {
  if (!fs.existsSync(pluginsDir)) return []

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  const plugins: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (EXCLUDED_FILES.has(entry.name)) continue

    for (const ext of ['.js', '.ts']) {
      const indexPath = path.join(pluginsDir, entry.name, `index${ext}`)
      if (fs.existsSync(indexPath)) {
        plugins.push(path.resolve(indexPath))
        break
      }
    }
  }

  return plugins
}

function resolveConfigPath(configDir: string): string {
  const jsoncPath = path.join(configDir, 'opencode.jsonc')
  const jsonPath = path.join(configDir, 'opencode.json')
  if (fs.existsSync(jsoncPath)) return jsoncPath
  if (fs.existsSync(jsonPath)) return jsonPath
  return jsoncPath
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

program
  .command('setup')
  .description('Inject plugins/*/index.{js,ts} paths into opencode.json[c] plugin array')
  .option('-g, --global', 'Write to global config (~/.config/opencode/)')
  .option('-t, --target <path>', 'Custom target directory (for testing)')
  .option('-d, --dry-run', 'Preview changes without writing')
  .action((options) => {
    const dryRun = !!options.dryRun;
    const isGlobal = !!options.global;
    const targetDir = options.target
      ? path.resolve(options.target)
      : isGlobal
        ? path.join(process.env.HOME!, '.config', 'opencode')
        : path.resolve('.opencode');

    const pluginsDir = path.join(projectRoot, 'plugins');
    const plugins = discoverPlugins(pluginsDir);

    if (plugins.length === 0) {
      console.log('No plugins found in plugins/*/index.{js,ts}');
      return;
    }

    const configPath = resolveConfigPath(targetDir);
    const existingConfig: Record<string, unknown> = {};
    let existingPlugin: unknown[] = [];

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        parsed = JSON.parse(cleaned);
      }
      Object.assign(existingConfig, parsed);
      if (Array.isArray(existingConfig.plugin)) {
        existingPlugin = existingConfig.plugin;
      }
    }

    const existingPaths = new Set(
      existingPlugin.filter((p): p is string => typeof p === 'string'),
    );

    const newPlugins = plugins.filter(p => !existingPaths.has(p));
    const mergedPlugin = [...existingPlugin, ...newPlugins];

    const config: Record<string, unknown> = {
      ...existingConfig,
      plugin: mergedPlugin,
    };

    if (!config.$schema) {
      config.$schema = 'https://opencode.ai/config.json';
    }

    if (dryRun) {
      console.log(`Config: ${configPath}`);
      console.log('Discovered plugins:');
      for (const p of plugins) {
        console.log(`  ${existingPaths.has(p) ? '✓ (exists)' : '+ (new)'} ${p}`);
      }
      console.log(`\nWould write to: ${configPath}`);
      console.log('Resulting plugin array:', JSON.stringify(mergedPlugin, null, 2));
      return;
    }

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    console.log(`Wrote ${configPath}`);
    console.log(`Added ${newPlugins.length} plugin(s)`);
  });

program.parse(process.argv);