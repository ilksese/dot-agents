import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { CommandConfig } from "@opencode/types"
import { loadCommand } from "../../utils/load-command.js"

const SEAMAID_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_COMMANDS_DIR = join(SEAMAID_DIR, "commands")

/**
 * Load seamaid command definitions from Markdown files.
 *
 * The file name `todo-defects.md` is mapped to `seamaid:todo-defects`.
 */
export function loadSeamaidCommands(projectName: string, commandsDir = DEFAULT_COMMANDS_DIR) {
  return loadCommand({
    commandsDir,
    variables: { projectName },
    commandKeyFromFileName: (fileName) => `seamaid:${basename(fileName, extname(fileName))}`,
  })
}

export function mergeSeamaidCommands(
  commands: Record<string, CommandConfig>,
  user: Record<string, CommandConfig> = {},
) {
  return { ...commands, ...user }
}
