import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { OpenCodeConfig } from "@opencode/types"
import { loadAgent } from "../../utils/load-agent.js"
import { loadCommand } from "../../utils/load-command.js"

export { loadAgent } from "../../utils/load-agent.js"
export { loadCommand } from "../../utils/load-command.js"

const KUMO_DIR = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(KUMO_DIR, "../../agents")
const COMMANDS_DIR = join(KUMO_DIR, "commands")

export default async function kumoPlugin() {
  return {
    config(cfg: Pick<OpenCodeConfig, "agent" | "command">) {
      const loadedAgents = loadAgent(AGENTS_DIR)
      const loadedCommands = loadCommand({ commandsDir: COMMANDS_DIR })

      cfg.agent = {
        ...loadedAgents,
        ...cfg.agent,
        title: {
          ...cfg.agent?.title,
          model: "opencode/big-pickle",
        },
        summary: {
          ...cfg.agent?.summary,
          model: "opencode/big-pickle",
        },
        explore: {
          ...cfg.agent?.explore,
          model: "opencode/big-pickle",
        },
      }
      cfg.command = {
        ...loadedCommands,
        ...(cfg.command ?? {}),
      }
    },
  }
}
