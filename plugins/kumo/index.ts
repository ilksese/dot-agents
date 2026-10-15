import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadAgent } from "../../utils/load-agent.js"
import { loadCommand } from "../../utils/load-command.js"
import { registerLoadedCommands, type CommandHost } from "../../utils/register-commands.js"
import { parseModelRef } from "../../utils/v2.js"

export { loadAgent } from "../../utils/load-agent.js"
export { loadCommand } from "../../utils/load-command.js"

const KUMO_DIR = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(KUMO_DIR, "../../agents")
const COMMANDS_DIR = join(KUMO_DIR, "commands")
const FORCED_MODELS = new Set(["title", "summary", "explore"])
const SMALL_MODEL = "opencode/big-pickle"

interface AgentDraft {
  model?: { providerID: string; id: string; variant?: string }
  system?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  color?: string
  permissions?: unknown
}

interface AgentEditor {
  get(id: string): unknown
  update(id: string, update: (agent: AgentDraft) => void): void
}

export interface KumoContext extends CommandHost {
  agent: {
    transform(callback: (editor: AgentEditor) => void): Promise<unknown>
  }
}

export default {
  id: "kumo",
  async setup(ctx: KumoContext) {
    const loadedAgents = loadAgent(AGENTS_DIR)
    const loadedCommands = loadCommand({ commandsDir: COMMANDS_DIR })
    const small = parseModelRef(SMALL_MODEL)

    await ctx.agent.transform((editor) => {
      for (const [id, agent] of Object.entries(loadedAgents)) {
        const exists = editor.get(id) !== undefined
        if (exists && !FORCED_MODELS.has(id)) continue
        editor.update(id, (draft) => {
          if (!exists) {
            if (agent.description) draft.description = agent.description
            if (agent.mode) draft.mode = agent.mode
            if (agent.hidden !== undefined) draft.hidden = agent.hidden
            if (agent.color) draft.color = agent.color
            if (agent.permissions) draft.permissions = agent.permissions
            if (agent.system) draft.system = agent.system
            if (agent.model) draft.model = parseModelRef(agent.model)
          }
          if (FORCED_MODELS.has(id) && small) draft.model = small
        })
      }
    })

    await registerLoadedCommands(ctx, loadedCommands)
  },
}
