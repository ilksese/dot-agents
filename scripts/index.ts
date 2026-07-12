#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { parse as parseJsonc } from 'jsonc-parser';

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
const RESOURCE_TYPES = [
  { option: 'agent', short: 'a', dir: 'agents', shape: 'file' },
  { option: 'command', short: 'c', dir: 'commands', shape: 'file' },
  { option: 'plugin', short: 'p', dir: 'plugins', shape: 'directory' },
  { option: 'skill', short: 's', dir: 'skills', shape: 'directory' },
] as const;

type ResourceType = (typeof RESOURCE_TYPES)[number];
type ResourceOption = ResourceType['option'];
type SyncSelection = Partial<Record<ResourceOption, string[]>>;
type ListSelection = Partial<Record<ResourceOption, Array<string | true>>>;
type TreeGroup = { label: string; items: string[] };
type ListOptionValue = true | Array<string | true>;
type PluginConfigSync = { configPath: string; plugins: string[]; newPlugins: string[]; mergedPlugin: unknown[]; existingPaths: Set<string> };

function copyEntry(srcPath: string, destPath: string, dryRun: boolean): void {
  if (dryRun) {
    const stat = fs.statSync(srcPath);
    console.log(`  ${stat.isDirectory() ? '📁' : '📄'} ${srcPath}  →  ${destPath}`);
    return;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true, force: true, filter: src => !EXCLUDED_FILES.has(path.basename(src)) });
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
}

function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function collectOptionalOption(value: string | true, previous: Array<string | true>): Array<string | true> {
  previous.push(value);
  return previous;
}

function normalizeListOption(value: ListOptionValue): Array<string | true> {
  return value === true ? [true] : value;
}

function hasExplicitSelection(selection: SyncSelection): boolean {
  return RESOURCE_TYPES.some(type => (selection[type.option]?.length ?? 0) > 0);
}

function listResources(type: ResourceType): string[] {
  const srcDir = path.join(projectRoot, type.dir);
  if (!fs.existsSync(srcDir)) return [];

  return fs.readdirSync(srcDir, { withFileTypes: true })
    .filter(entry => !EXCLUDED_FILES.has(entry.name))
    .filter(entry => type.shape === 'file' ? entry.isFile() : entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function findResourceName(type: ResourceType, requested: string): string | undefined {
  const resources = listResources(type);
  if (resources.includes(requested)) return requested;
  if (type.shape === 'file' && !path.extname(requested)) {
    const withMarkdownExtension = `${requested}.md`;
    if (resources.includes(withMarkdownExtension)) return withMarkdownExtension;
  }
  return undefined;
}

function selectedNames(type: ResourceType, requested: string[] | undefined): { matched: string[]; missing: string[] } {
  if (!requested || requested.length === 0 || requested.includes('all')) {
    return { matched: listResources(type), missing: [] };
  }

  const matched = new Set<string>();
  const missing: string[] = [];

  for (const name of requested) {
    const resourceName = findResourceName(type, name);
    if (resourceName) {
      matched.add(resourceName);
    } else {
      missing.push(name);
    }
  }

  return { matched: [...matched], missing };
}

function reportMissing(type: ResourceType, missing: string[]): void {
  if (missing.length === 0) return;
  console.error(`Not found: ${type.option} ${missing.join(', ')}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .split('')
    .map(char => {
      if (char === '*') return '.*';
      if (char === '?') return '.';
      return escapeRegExp(char);
    })
    .join('');
  return new RegExp(`^${pattern}$`, 'i');
}

function matchesGlob(type: ResourceType, resourceName: string, glob: string): boolean {
  const regex = globToRegExp(glob);
  if (regex.test(resourceName)) return true;
  if (type.shape === 'file' && path.extname(resourceName) === '.md') {
    return regex.test(resourceName.slice(0, -3));
  }
  return false;
}

function selectedListNames(type: ResourceType, globs: Array<string | true> | undefined): string[] {
  const resources = listResources(type);
  if (!globs || globs.length === 0) return resources;

  const patterns = globs.map(glob => glob === true ? '*' : glob);
  return resources.filter(resource => patterns.some(glob => matchesGlob(type, resource, glob)));
}

function renderTree(rootLabel: string, groups: TreeGroup[]): string {
  const lines = [rootLabel];

  if (groups.length === 1 && groups[0]?.label === rootLabel) {
    for (let index = 0; index < groups[0].items.length; index += 1) {
      const itemPrefix = index === groups[0].items.length - 1 ? '└──' : '├──';
      lines.push(`${itemPrefix} ${groups[0].items[index]}`);
    }
    return `${lines.join('\n')}\n`;
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const isLastGroup = groupIndex === groups.length - 1;
    lines.push(`${isLastGroup ? '└──' : '├──'} ${group.label}`);

    const childPrefix = isLastGroup ? '    ' : '│   ';
    for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
      const isLastItem = itemIndex === group.items.length - 1;
      lines.push(`${childPrefix}${isLastItem ? '└──' : '├──'} ${group.items[itemIndex]}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function listSelectedResources(selection: ListSelection = {}): void {
  const listAll = !RESOURCE_TYPES.some(type => (selection[type.option]?.length ?? 0) > 0);
  const groups = RESOURCE_TYPES
    .filter(type => listAll || (selection[type.option]?.length ?? 0) > 0)
    .map(type => ({
      label: type.dir,
      items: selectedListNames(type, listAll ? undefined : selection[type.option]),
    }));

  const rootLabel = groups.length === 1 ? groups[0].label : 'dot-agents';
  process.stdout.write(renderTree(rootLabel, groups));
}

function syncSelectedResources(baseDir: string, dryRun: boolean, selection: SyncSelection = {}): void {
  const syncAll = !hasExplicitSelection(selection);
  console.log(`Target: ${baseDir}${dryRun ? ' (dry-run)' : ''}\n`);

  for (const type of RESOURCE_TYPES) {
    const requested = syncAll ? undefined : selection[type.option];
    if (!syncAll && (!requested || requested.length === 0)) continue;

    if (type.option === 'plugin') {
      syncPluginConfig(baseDir, dryRun, requested);
      continue;
    }

    const srcDir = path.join(projectRoot, type.dir);
    const destDir = path.join(baseDir, type.dir);

    if (!fs.existsSync(srcDir)) {
      console.error(`Not found: ${type.option} source directory ${type.dir}/`);
      continue;
    }

    const { matched, missing } = selectedNames(type, requested);
    reportMissing(type, missing);

    if (matched.length === 0) continue;

    console.log(`  ${type.dir}/`);
    if (!dryRun) fs.mkdirSync(destDir, { recursive: true });

    for (const name of matched) {
      copyEntry(path.join(srcDir, name), path.join(destDir, name), dryRun);
    }
  }

  if (dryRun) {
    console.log('\nDry run complete.');
  } else {
    console.log('\nDone.');
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

function discoverSelectedPlugins(requested: string[] | undefined): { matched: string[]; missing: string[] } {
  const pluginsDir = path.join(projectRoot, 'plugins');
  const { matched, missing } = selectedNames(RESOURCE_TYPES[2], requested);
  const plugins = matched
    .map(name => {
      for (const ext of ['.js', '.ts']) {
        const indexPath = path.join(pluginsDir, name, `index${ext}`);
        if (fs.existsSync(indexPath)) return path.resolve(indexPath);
      }
      return undefined;
    })
    .filter((plugin): plugin is string => typeof plugin === 'string');

  const pluginsWithoutIndex = matched.filter(name => !plugins.some(plugin => path.dirname(plugin) === path.resolve(pluginsDir, name)));
  return { matched: plugins, missing: [...missing, ...pluginsWithoutIndex] };
}

function resolveConfigPath(configDir: string): string {
  const jsoncPath = path.join(configDir, 'opencode.jsonc')
  const jsonPath = path.join(configDir, 'opencode.json')
  if (fs.existsSync(jsoncPath)) return jsoncPath
  if (fs.existsSync(jsonPath)) return jsonPath
  return jsoncPath
}

function readConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, 'utf-8');
  return parseJsonc(raw) as Record<string, unknown>;
}

function mergePluginConfig(targetDir: string, plugins: string[]): PluginConfigSync {
  const configPath = resolveConfigPath(targetDir);
  const existingConfig = readConfig(configPath);
  const existingPlugin = Array.isArray(existingConfig.plugin) ? existingConfig.plugin : [];
  const existingPaths = new Set(existingPlugin.filter((plugin): plugin is string => typeof plugin === 'string'));
  const newPlugins = plugins.filter(plugin => !existingPaths.has(plugin));

  return {
    configPath,
    plugins,
    newPlugins,
    mergedPlugin: [...existingPlugin, ...newPlugins],
    existingPaths,
  };
}

function writePluginConfig(sync: PluginConfigSync): void {
  const existingConfig = readConfig(sync.configPath);
  const config: Record<string, unknown> = {
    ...existingConfig,
    plugin: sync.mergedPlugin,
  };

  if (!config.$schema) {
    config.$schema = 'https://opencode.ai/config.json';
  }

  fs.mkdirSync(path.dirname(sync.configPath), { recursive: true });
  fs.writeFileSync(sync.configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function printPluginConfigSync(sync: PluginConfigSync, dryRun: boolean): void {
  console.log(`  Config: ${sync.configPath}`);
  console.log('  Discovered plugins:');
  for (const plugin of sync.plugins) {
    console.log(`    ${sync.existingPaths.has(plugin) ? '✓ (exists)' : '+ (new)'} ${plugin}`);
  }

  if (dryRun) {
    console.log(`\nWould write to: ${sync.configPath}`);
    console.log('Resulting plugin array:', JSON.stringify(sync.mergedPlugin, null, 2));
  }
}

function syncPluginConfig(baseDir: string, dryRun: boolean, requested: string[] | undefined): void {
  const { matched, missing } = discoverSelectedPlugins(requested);
  reportMissing(RESOURCE_TYPES[2], missing);

  if (matched.length === 0) return;

  const sync = mergePluginConfig(baseDir, matched);
  printPluginConfigSync(sync, dryRun);

  if (!dryRun) {
    writePluginConfig(sync);
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
      : path.join(os.homedir(), '.config', 'opencode');

    const dryRun = !!options.dryRun;

    syncSelectedResources(baseDir, dryRun);
  });

program
  .command('sync')
  .description('Sync all resources or selected agents, commands, plugins, and skills')
  .option('-t, --target <path>', 'Custom target directory (default: ~/.config/opencode/)')
  .option('-d, --dry-run', 'Preview changes without copying')
  .option('-p, --plugin <name>', 'Plugin name to sync; repeatable; use all for every plugin', collectOption, [])
  .option('-s, --skill <name>', 'Skill name to sync; repeatable; use all for every skill', collectOption, [])
  .option('-a, --agent <name>', 'Agent name to sync; repeatable; use all for every agent', collectOption, [])
  .option('-c, --command <name>', 'Command name to sync; repeatable; use all for every command', collectOption, [])
  .action((options) => {
    const baseDir = options.target
      ? path.resolve(options.target)
      : path.join(os.homedir(), '.config', 'opencode');

    const selection: SyncSelection = {
      plugin: options.plugin,
      skill: options.skill,
      agent: options.agent,
      command: options.command,
    };

    syncSelectedResources(baseDir, !!options.dryRun, selection);
  });

program
  .command('list')
  .description('List agents, commands, plugins, and skills as a tree')
  .option('-p, --plugin [glob]', 'Plugin glob to list; repeatable; omit glob for every plugin', collectOptionalOption, [])
  .option('-s, --skill [glob]', 'Skill glob to list; repeatable; omit glob for every skill', collectOptionalOption, [])
  .option('-a, --agent [glob]', 'Agent glob to list; repeatable; omit glob for every agent', collectOptionalOption, [])
  .option('-c, --command [glob]', 'Command glob to list; repeatable; omit glob for every command', collectOptionalOption, [])
  .action((options) => {
    const selection: ListSelection = {
      plugin: normalizeListOption(options.plugin),
      skill: normalizeListOption(options.skill),
      agent: normalizeListOption(options.agent),
      command: normalizeListOption(options.command),
    };

    listSelectedResources(selection);
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
        ? path.join(os.homedir(), '.config', 'opencode')
        : path.resolve('.opencode');

    const pluginsDir = path.join(projectRoot, 'plugins');
    const plugins = discoverPlugins(pluginsDir);

    if (plugins.length === 0) {
      console.log('No plugins found in plugins/*/index.{js,ts}');
      return;
    }

    const sync = mergePluginConfig(targetDir, plugins);

    if (dryRun) {
      printPluginConfigSync(sync, dryRun);
      return;
    }

    writePluginConfig(sync);

    console.log(`Wrote ${sync.configPath}`);
    console.log(`Added ${sync.newPlugins.length} plugin(s)`);
  });

program.parse(process.argv);
