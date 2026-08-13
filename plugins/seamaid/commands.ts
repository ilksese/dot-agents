import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { OpenCodeConfig } from "@opencode/types"
import { loadCommand } from "../../utils/load-command.js"

const SEAMAID_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_COMMANDS_DIR = join(SEAMAID_DIR, "commands")

/**
 * Load seamaid command definitions from Markdown files.
 *
 * The file name `todo-defects.md` is mapped to `todo:defects`.
 * Frontmatter becomes the command config and the Markdown body becomes `template`.
 */
export function loadSeamaidCommands(projectName: string, commandsDir = DEFAULT_COMMANDS_DIR) {
  return loadCommand({ commandsDir, variables: { projectName } })
}

export const createSeamaidCommands = (config: Pick<OpenCodeConfig, "command">, projectName: string) => {
  config.command = {
    ...loadSeamaidCommands(projectName),
    ...(config.command ?? {}),
  }
}
