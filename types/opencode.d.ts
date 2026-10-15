/** OpenCode V2 config types. Catalog model fields below describe models.dev, not the V1 config object. */

export type PermissionEffect = "ask" | "allow" | "deny"

export interface PermissionRule {
  action: string
  resource: string
  effect: PermissionEffect
}

export interface AgentConfig {
  model?: string
  system?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  color?: string
  steps?: number
  disabled?: boolean
  permissions?: PermissionRule[]
}

export interface CommandConfig {
  template: string
  description?: string
  agent?: string
  model?: string
  subagent?: boolean
}

export type PluginConfig = string | { package: string; options?: Record<string, unknown> }

export interface OpenCodeConfig {
  $schema?: string
  shell?: string
  model?: string
  default_agent?: string
  update?: "disable" | "notify" | "auto"
  share?: "manual" | "auto" | "disabled"
  username?: string
  permissions?: PermissionRule[]
  agents?: Record<string, AgentConfig>
  snapshots?: boolean
  watcher?: { ignore?: string[] }
  lsp?: boolean | Record<string, unknown>
  formatter?: boolean | Record<string, unknown>
  mcp?: { timeout?: Record<string, number>; servers?: Record<string, unknown> }
  compaction?: { auto?: boolean; keep?: { tokens?: number }; buffer?: number }
  skills?: string[]
  commands?: Record<string, CommandConfig>
  instructions?: string[]
  references?: Record<string, unknown>
  plugins?: PluginConfig[]
  providers?: Record<string, unknown>
  experimental?: {
    portable_shell_scanner?: boolean
    subagent_depth?: number
    policies?: Array<{
      action: "provider.use" | "tool.use" | "integration.use"
      resource: string
      effect: "allow" | "deny"
    }>
  }
}

export type Modality = "text" | "audio" | "image" | "video" | "pdf"
export type ModelStatus = "alpha" | "beta" | "deprecated" | "active"
export type Interleaved = boolean | string | { field: string }

export interface ModelCost {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
  context_over_200k?: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
}

export interface ModelLimit {
  context: number
  input?: number
  output: number
}

export interface ModelModalities {
  input?: Modality[]
  output?: Modality[]
}

export interface ModelProvider {
  npm?: string
  api?: string
}

export interface ModelVariantConfig {
  disabled?: boolean
  [key: string]: unknown
}

export interface ModelConfig {
  id?: string
  name?: string
  family?: string
  release_date?: string
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  interleaved?: Interleaved
  cost?: ModelCost
  limit?: ModelLimit
  modalities?: ModelModalities
  experimental?: boolean
  status?: ModelStatus
  provider?: ModelProvider
  options?: Record<string, unknown>
  headers?: Record<string, string>
  variants?: Record<string, ModelVariantConfig>
}
