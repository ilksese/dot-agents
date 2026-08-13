import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import type { CommandConfig } from "@opencode/types"
import { parseMarkdownFrontmatter } from "./load-markdown.js"

export type LoadedCommand = CommandConfig & Record<string, unknown>
export type LoadedCommands = Record<string, LoadedCommand>
export type CommandTemplateVariables = Record<string, string>
export type LoadCommandOptions = {
  commandsDir: string
  variables?: CommandTemplateVariables
  commandKeyFromFileName?: (fileName: string) => string
}

export function defaultCommandKeyFromFileName(fileName: string): string {
  const stem = basename(fileName, extname(fileName))
  const separatorIndex = stem.indexOf("-")
  if (separatorIndex === -1) return stem
  return `${stem.slice(0, separatorIndex)}:${stem.slice(separatorIndex + 1)}`
}

function renderCommandTemplate(template: string, variables: CommandTemplateVariables): string {
  return Object.entries(variables).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template)
}

/**
 * Load command definitions from Markdown files.
 *
 * By default, the file name `fix-danger.md` is mapped to `fix:danger`.
 * Frontmatter becomes the command config and the Markdown body becomes `template`.
 */
export function loadCommand({
  commandsDir,
  variables = {},
  commandKeyFromFileName = defaultCommandKeyFromFileName,
}: LoadCommandOptions): LoadedCommands {
  if (!existsSync(commandsDir) || !statSync(commandsDir).isDirectory()) return {}

  const commands: LoadedCommands = {}
  const files = readdirSync(commandsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    const filePath = join(commandsDir, file)
    const { attributes, body } = parseMarkdownFrontmatter(readFileSync(filePath, "utf-8"), filePath)
    const name = commandKeyFromFileName(file)
    commands[name] = {
      ...attributes,
      template: renderCommandTemplate(body, variables),
    }
  }

  return commands
}
