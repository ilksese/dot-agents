/** Generated from https://opencode.ai/config.json. */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"
export type PermissionAction = "ask" | "allow" | "deny"
export type PermissionRule = PermissionAction | Record<string, PermissionAction>
export type PermissionConfig =
  | PermissionAction
  | ({
      read?: PermissionRule
      edit?: PermissionRule
      glob?: PermissionRule
      grep?: PermissionRule
      list?: PermissionRule
      bash?: PermissionRule
      task?: PermissionRule
      external_directory?: PermissionRule
      todowrite?: PermissionAction
      question?: PermissionAction
      webfetch?: PermissionAction
      websearch?: PermissionAction
      lsp?: PermissionRule
      doom_loop?: PermissionAction
      skill?: PermissionRule
    } & Record<string, PermissionRule | undefined>)

export type ReferenceConfig = string | GitReferenceConfig | LocalReferenceConfig

export interface GitReferenceConfig {
  repository: string
  branch?: string
  description?: string
  hidden?: boolean
}

export interface LocalReferenceConfig {
  path: string
  description?: string
  hidden?: boolean
}

export interface AgentConfig {
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  prompt?: string
  tools?: Record<string, boolean>
  disable?: boolean
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  options?: Record<string, unknown>
  color?: `#${string}` | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info"
  steps?: number
  maxSteps?: number
  permission?: PermissionConfig
}

export interface CommandConfig {
  template: string
  description?: string
  agent?: string
  model?: string
  variant?: string
  subtask?: boolean
}

export interface ProviderOptions {
  apiKey?: string
  baseURL?: string
  enterpriseUrl?: string
  setCacheKey?: boolean
  timeout?: number | false
  headerTimeout?: number | false
  chunkTimeout?: number
  [key: string]: unknown
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

export interface ProviderConfig {
  api?: string
  name?: string
  env?: string[]
  id?: string
  npm?: string
  whitelist?: string[]
  blacklist?: string[]
  options?: ProviderOptions
  models?: Record<string, ModelConfig>
}

export interface McpLocalConfig {
  type: "local"
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
  callbackPort?: number
  redirectUri?: string
}

export interface McpRemoteConfig {
  type: "remote"
  url: string
  enabled?: boolean
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | false
  timeout?: number
}

export type McpConfig = McpLocalConfig | McpRemoteConfig | { enabled: boolean }

export interface ServerConfig {
  port?: number
  hostname?: string
  mdns?: boolean
  mdnsDomain?: string
  cors?: string[]
}

export interface FormatterConfig {
  disabled?: boolean
  command?: string[]
  environment?: Record<string, string>
  extensions?: string[]
}

export type FormatterConfigValue = boolean | Record<string, FormatterConfig>
export type LspConfigValue =
  | boolean
  | {
      [name: string]:
        | { disabled: true }
        | {
            command: string[]
            extensions?: string[]
            disabled?: boolean
            env?: Record<string, string>
            initialization?: Record<string, unknown>
          }
    }

export interface ToolOutputConfig {
  max_lines?: number
  max_bytes?: number
}

export interface CompactionConfig {
  auto?: boolean
  prune?: boolean
  tail_turns?: number
  preserve_recent_tokens?: number
  reserved?: number
}

export interface ExperimentalPolicy {
  action: "provider.use"
  effect: "allow" | "deny"
  resource: string
}

export interface ExperimentalConfig {
  disable_paste_summary?: boolean
  batch_tool?: boolean
  openTelemetry?: boolean
  primary_tools?: string[]
  continue_loop_on_deny?: boolean
  mcp_timeout?: number
  policies?: ExperimentalPolicy[]
}

export interface AttachmentConfig {
  image?: {
    auto_resize?: boolean
    max_width?: number
    max_height?: number
    max_base64_bytes?: number
  }
}

export interface OpenCodeConfig {
  $schema?: string
  shell?: string
  logLevel?: LogLevel
  server?: ServerConfig
  command?: Record<string, CommandConfig>
  skills?: { paths?: string[]; urls?: string[] }
  references?: Record<string, ReferenceConfig>
  reference?: Record<string, ReferenceConfig>
  watcher?: { ignore?: string[] }
  snapshot?: boolean
  plugin?: Array<string | [string, Record<string, unknown>]>
  share?: "manual" | "auto" | "disabled"
  autoshare?: boolean
  autoupdate?: boolean | "notify"
  disabled_providers?: string[]
  enabled_providers?: string[]
  model?: string
  small_model?: string
  default_agent?: string
  subagent_depth?: number
  username?: string
  mode?: Record<string, AgentConfig>
  agent?: Record<string, AgentConfig>
  provider?: Record<string, ProviderConfig>
  mcp?: Record<string, McpConfig>
  formatter?: FormatterConfigValue
  lsp?: LspConfigValue
  instructions?: string[]
  layout?: "auto" | "stretch"
  permission?: PermissionConfig
  tools?: Record<string, boolean>
  attachment?: AttachmentConfig
  enterprise?: { url?: string }
  tool_output?: ToolOutputConfig
  compaction?: CompactionConfig
  experimental?: ExperimentalConfig
}
