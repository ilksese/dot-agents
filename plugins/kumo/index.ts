import type { OpenCodeConfig } from "@opencode/types"
import { loadAgent } from "./load-agent.js"

export default async function kumoPlugin() {
  return {
    config(cfg: Pick<OpenCodeConfig, "agent" | "command">) {
      const loadedAgents = loadAgent()
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
    },
  }
}
