import type { CommandConfig } from "@opencode/types"
import { fillEgoUrls, parseModelRef, renderCommandText } from "./v2.js"

type Prompt = { text?: string; [key: string]: unknown }

export interface CommandInvocation {
  sessionID: string
  prompt: Prompt
  delivery?: string
}

export interface CommandEditor {
  add(definition: { name: string; description?: string; execute: (input: CommandInvocation) => Promise<void> }): void
}

export interface CommandHost {
  command: {
    list(): Promise<unknown>
    transform(callback: (editor: CommandEditor) => void): Promise<unknown>
  }
  session: {
    create(input: Record<string, unknown>): Promise<unknown>
    prompt(input: Record<string, unknown>): Promise<unknown>
    switchAgent(input: { sessionID: string; agent: string }): Promise<unknown>
    switchModel(input: {
      sessionID: string
      model: { providerID: string; id: string; variant?: string }
    }): Promise<unknown>
  }
}

function commandNames(value: unknown) {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "data" in value
      ? value.data
      : value
  if (!Array.isArray(items)) return new Set<string>()
  return new Set(
    items.flatMap((item) => (item && typeof item === "object" && typeof item.name === "string" ? [item.name] : [])),
  )
}

function sessionID(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  if (
    "data" in value &&
    value.data &&
    typeof value.data === "object" &&
    "id" in value.data &&
    typeof value.data.id === "string"
  ) {
    return value.data.id
  }
  if ("id" in value && typeof value.id === "string") return value.id
  return undefined
}

export async function registerLoadedCommands(
  ctx: CommandHost,
  commands: Record<string, CommandConfig>,
  existing?: Iterable<string>,
) {
  const present = new Set(existing ?? commandNames(await ctx.command.list()))
  await ctx.command.transform((editor) => {
    for (const [name, command] of Object.entries(commands)) {
      if (present.has(name)) continue
      editor.add({
        name,
        description: command.description,
        execute: (input) => runCommand(ctx, name, command, input),
      })
    }
  })
}

async function runCommand(ctx: CommandHost, name: string, command: CommandConfig, input: CommandInvocation) {
  const args = input.prompt.text ?? ""
  let text = renderCommandText(command.template, args)
  if (name === "seamaid:ego-test-ui") text = fillEgoUrls(text, args)
  const model = command.model ? parseModelRef(command.model) : undefined

  if (command.subagent) {
    try {
      const created = await ctx.session.create({
        parentID: input.sessionID,
        title: command.description ?? name,
        ...(command.agent ? { agent: command.agent } : {}),
        ...(model ? { model } : {}),
      })
      const childID = sessionID(created)
      if (childID) {
        await ctx.session.prompt({
          ...input.prompt,
          sessionID: childID,
          text: `You are a subagent spawned by another session.\n${text}`,
          delivery: input.delivery,
        })
        return
      }
    } catch {
      // Fall back to the current session when the host rejects child-session creation.
    }
  }

  if (command.agent) await ctx.session.switchAgent({ sessionID: input.sessionID, agent: command.agent })
  if (model) await ctx.session.switchModel({ sessionID: input.sessionID, model })
  await ctx.session.prompt({
    ...input.prompt,
    sessionID: input.sessionID,
    text,
    delivery: input.delivery,
  })
}
