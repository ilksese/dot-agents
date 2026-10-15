import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import type { AgentConfig } from "@opencode/types"
import { parseMarkdownFrontmatter } from "./load-markdown.js"
import { joinModel, toPermissions } from "./v2.js"

export type LoadedAgent = AgentConfig
export type LoadedAgents = Record<string, LoadedAgent>

/**
 * Load Markdown agent definitions. The file name is the agent ID, frontmatter
 * is the V2 agent config, and the Markdown body is the system prompt.
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
    const model = joinModel(attributes.model, attributes.variant)
    const permissions = Array.isArray(attributes.permissions)
      ? attributes.permissions
      : toPermissions(attributes.permission, attributes.tools)
    const system =
      body ||
      (typeof attributes.system === "string" ? attributes.system : undefined) ||
      (typeof attributes.prompt === "string" ? attributes.prompt : undefined)

    agents[name] = {
      ...(typeof attributes.description === "string" ? { description: attributes.description } : {}),
      ...(attributes.mode === "subagent" || attributes.mode === "primary" || attributes.mode === "all"
        ? { mode: attributes.mode }
        : {}),
      ...(typeof attributes.hidden === "boolean" ? { hidden: attributes.hidden } : {}),
      ...(typeof attributes.color === "string" ? { color: attributes.color } : {}),
      ...(typeof attributes.steps === "number" ? { steps: attributes.steps } : {}),
      ...(typeof attributes.disabled === "boolean" ? { disabled: attributes.disabled } : {}),
      ...(typeof attributes.disable === "boolean" ? { disabled: attributes.disable } : {}),
      ...(model ? { model } : {}),
      ...(permissions ? { permissions } : {}),
      ...(system ? { system } : {}),
    }
  }

  return agents
}
