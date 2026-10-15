import type { PermissionEffect, PermissionRule } from "@opencode/types"

const ACTION_RENAMES: Record<string, string> = {
  bash: "shell",
  task: "subagent",
  write: "edit",
  patch: "edit",
}

function renameAction(action: string) {
  return ACTION_RENAMES[action] ?? action
}

function isEffect(value: unknown): value is PermissionEffect {
  return value === "allow" || value === "deny" || value === "ask"
}

export function toPermissions(permission: unknown, tools?: unknown): PermissionRule[] | undefined {
  if (Array.isArray(permission)) return permission as PermissionRule[]

  const rules: PermissionRule[] = []
  if (tools && typeof tools === "object") {
    for (const [key, enabled] of Object.entries(tools)) {
      if (typeof enabled !== "boolean") continue
      rules.push({ action: renameAction(key), resource: "*", effect: enabled ? "allow" : "deny" })
    }
  }

  if (typeof permission === "string" && isEffect(permission)) {
    rules.push({ action: "*", resource: "*", effect: permission })
  } else if (permission && typeof permission === "object") {
    for (const [key, rule] of Object.entries(permission)) {
      const action = renameAction(key)
      if (isEffect(rule)) {
        rules.push({ action, resource: "*", effect: rule })
        continue
      }
      if (!rule || typeof rule !== "object") continue
      for (const [resource, effect] of Object.entries(rule)) {
        if (!isEffect(effect)) continue
        rules.push({ action, resource, effect })
      }
    }
  }

  return rules.length ? rules : undefined
}

export function joinModel(model: unknown, variant: unknown) {
  if (typeof model !== "string") return undefined
  if (typeof variant !== "string" || variant.length === 0 || model.includes("#")) return model
  return `${model}#${variant}`
}

export function parseModelRef(input: string) {
  const providerEnd = input.indexOf("/")
  if (providerEnd <= 0) return undefined
  const variantStart = input.indexOf("#", providerEnd + 1)
  const id = input.slice(providerEnd + 1, variantStart === -1 ? undefined : variantStart)
  if (!id) return undefined
  const variant = variantStart === -1 ? undefined : input.slice(variantStart + 1)
  return {
    providerID: input.slice(0, providerEnd),
    id,
    ...(variant ? { variant } : {}),
  }
}

export function renderCommandText(template: string, args: string) {
  if (template.includes("$ARGUMENTS")) return template.replaceAll("$ARGUMENTS", args)
  const value = args.trim()
  return value ? `${template}\n\n${value}` : template
}

export function fillEgoUrls(template: string, args: string) {
  const figma = args.match(/https?:\/\/[^\s]*figma[^\s]*/i)?.[0]
  const local = args.match(/https?:\/\/(?:localhost|127\.0\.0\.1)[^\s]*/i)?.[0]
  return template
    .replace(/<figma-url>\s*<\/figma-url>/, figma ? `<figma-url>\n${figma}\n</figma-url>` : "")
    .replace(/<browser-url>\s*<\/browser-url>/, local ? `<browser-url>\n${local}\n</browser-url>` : "")
}

export function aisdkPackage(npmPackage: string) {
  return npmPackage.startsWith("aisdk:") ? npmPackage : `aisdk:${npmPackage}`
}
