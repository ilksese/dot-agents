import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import type { AgentConfig } from "@opencode/types"
import { parseMarkdownFrontmatter } from "./load-markdown.js"

export type LoadedAgent = AgentConfig & Record<string, unknown>
export type LoadedAgents = Record<string, LoadedAgent>

/**
 * Load all Markdown agent definitions from `agentsDir`.
 *
 * The file name (without `.md`) becomes the OpenCode agent name, YAML
 * frontmatter becomes the agent config, and the Markdown body becomes `prompt`.
 */
export function loadAgent(agentsDir: string): LoadedAgents {
  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) return {}

  const agents: LoadedAgents = {}
  const files = readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    const filePath = join(agentsDir, file)
    const { attributes, body } = parseMarkdownFrontmatter(readFileSync(filePath, "utf-8"), filePath)
    const name = basename(file, extname(file))
    agents[name] = {
      ...attributes,
      ...(body ? { prompt: body } : {}),
    }
  }

  return agents
}
