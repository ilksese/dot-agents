# dot-agents

Single-user opencode workflow package. Syncs `agents/`, `commands/`, `plugins/`, `skills/` to `~/.config/opencode/`.

## Key commands

- `npm run build` — `tsc`, compiles `scripts/` → `dist/`
- `node dist/scripts/index.js init` — sync to `~/.config/opencode/`
- `node dist/scripts/index.js init --dry-run --target test/.opencode` — preview without touching real config

## Testing constraints

All script testing must stay within the project path. Always use `--target test/.opencode` to test. Never let the `init` script touch the real `~/.config/opencode/` during development.

## Architecture

- `scripts/index.ts` — `init` command, copies 4 dirs to target, excludes `.DS_Store`, overwrites existing files
- `agents/` — agent definitions (HY-Agent.md)
- `commands/` — command definitions (create-pr.md)
- `plugins/` — opencode plugins (seamaid/)
- `skills/` — skill definitions (auto-cleanup-commit/, explain-code/, use-proxy/)

## Files to never commit

No `.gitignore` exists. `dist/`, `node_modules/`, `package-lock.json` are not tracked.

## No linter, no formatter, no test runner

Build verification: `npm run build && node dist/scripts/index.js --dry-run --target test/.opencode`