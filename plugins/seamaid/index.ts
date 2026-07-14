import { homedir } from "os"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import modalContext from "./modal_context.js"

type OpenCodeConfig = {
  provider?: Record<string, ProviderConfig>
}

type ProviderConfig = {
  npm?: string
  name?: string
  options?: Record<string, unknown>
  models?: Record<string, ModelConfig>
}

type ModelConfig = {
  name: string
  provider?: {
    npm: string
  }
  limit?: {
    context: number
    input?: number
    output: number
  }
  cost?: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
  modalities?: {
    input: string[]
    output: string[]
  }
  variants?: Record<string, Record<string, unknown>>
}

type OpenAIModelsResponse = {
  data?: Array<{
    id?: unknown
    supported_endpoint_types?: unknown
  }>
}

type Env = Record<string, string | undefined>

const PROVIDER_ID = "seamaid"
const PROVIDER_NAME = "Seamaid"
const PROVIDER_NPM = "@ai-sdk/openai-compatible"

const CACHE_DIR = join(homedir(), ".opencode", "cache")
const CACHE_FILE = join(CACHE_DIR, "seamaid-models.json")
const DEFAULT_CACHE_TTL = 10 * 60 * 60 // 10 hours in seconds
const MODEL_PROVIDER_NPM_BY_ENDPOINT_TYPE: Record<string, string> = {
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  gemini: "@ai-sdk/google",
  openai: "@ai-sdk/openai",
  deepseek: "@ai-sdk/deepseek",
}

type CacheEntry = {
  timestamp: number
  data: Record<string, ModelConfig>
}

export function getCacheTTL(env: Env): number {
  const raw = env.SEAMAID_CACHE_TTL
  if (raw === undefined || raw === "") {
    return DEFAULT_CACHE_TTL
  }
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) || parsed < 0 ? DEFAULT_CACHE_TTL : parsed
}

function cacheDir(env: Env): string {
  return env.SEAMAID_CACHE_DIR ?? CACHE_DIR
}

function cacheFile(env: Env): string {
  return join(cacheDir(env), "seamaid-models.json")
}

export function readModelsCache(env: Env): Record<string, ModelConfig> | null {
  const ttl = getCacheTTL(env)
  if (ttl === 0) return null

  try {
    const file = cacheFile(env)
    if (!existsSync(file)) return null
    const raw = readFileSync(file, "utf-8")
    const entry: CacheEntry = JSON.parse(raw)
    const age = (Date.now() - entry.timestamp) / 1000
    if (age > ttl) return null
    return entry.data
  } catch {
    return null
  }
}

export function writeModelsCache(data: Record<string, ModelConfig>, env: Env): void {
  try {
    const dir = cacheDir(env)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const entry: CacheEntry = { timestamp: Date.now(), data }
    writeFileSync(cacheFile(env), JSON.stringify(entry), "utf-8")
  } catch {
    // cache write failure is non-fatal
  }
}

export function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, "")
}

export function modelsEndpoint(baseURL: string): string {
  return `${normalizeBaseURL(baseURL)}/models`
}

function modelProvider(endpointTypes: unknown, modelID: string): ModelConfig["provider"] {
  const lowerModelID = modelID.toLowerCase()
  let npm: string | undefined

  if (lowerModelID.includes("codex") || lowerModelID.includes("gpt")) {
    npm = "@ai-sdk/openai"
  } else if (lowerModelID.includes("gemini")) {
    npm = "@ai-sdk/google"
  } else if (lowerModelID.includes("claude")) {
    npm = "@ai-sdk/anthropic"
  } else if (lowerModelID.includes("deepseek")) {
    npm = "@ai-sdk/deepseek"
  }

  if (npm !== undefined) {
    return { npm }
  }

  if (!Array.isArray(endpointTypes)) return undefined

  const endpointType = endpointTypes[0]
  if (typeof endpointType !== "string") return undefined
  if (!modelID.includes(endpointType)) return undefined

  const npmFromEndpoint = MODEL_PROVIDER_NPM_BY_ENDPOINT_TYPE[endpointType]
  if (npmFromEndpoint) {
    return { npm: npmFromEndpoint }
  }

  return npm ? { npm } : undefined
}

export function parseModels(payload: OpenAIModelsResponse): Record<string, ModelConfig> {
  const models: Record<string, ModelConfig> = {}

  for (const item of payload.data ?? []) {
    if (typeof item.id !== "string" || item.id.length === 0) continue
    const provider = modelProvider(item.supported_endpoint_types, item.id)

    models[item.id] = {
      name: item.id,
      ...(provider ? { provider } : {}),
    }
  }

  return models
}

export function markSeamaidModels(models: Record<string, ModelConfig>): Record<string, ModelConfig> {
  return Object.fromEntries(
    Object.entries(models).map(([id, model]) => [id, { ...model, name: `${model.name} (SEAMAID)` }]),
  )
}

export function applyModelContext(models: Record<string, ModelConfig>): Record<string, ModelConfig> {
  const entries = Object.entries(modalContext).sort((a, b) => b[0].length - a[0].length)

  for (const [key, ctx] of entries) {
    for (const modelId of Object.keys(models)) {
      if (!modelId.includes(key)) continue

      models[modelId] = {
        ...models[modelId],
        ...(ctx.limit ? { limit: ctx.limit } : {}),
        ...(ctx.cost ? { cost: ctx.cost } : {}),
        ...(ctx.modalities ? { modalities: ctx.modalities } : {}),
        ...(ctx.variants ? { variants: ctx.variants } : {}),
      }
    }
  }

  return models
}

export async function fetchSeamaidModels(env: Env, fetchImpl: typeof fetch): Promise<Record<string, ModelConfig>> {
  const apiKey = env.SEAMAID_API_KEY
  const baseURL = env.SEAMAID_BASE_URL

  if (!apiKey || !baseURL) return {}

  const response = await fetchImpl(modelsEndpoint(baseURL), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Seamaid models request failed: ${response.status} ${response.statusText}`)
  }

  return markSeamaidModels(parseModels((await response.json()) as OpenAIModelsResponse))
}

function resolveOption(existingValue: unknown, envValue: string | undefined, placeholder: string): unknown {
  if (existingValue === undefined || existingValue === placeholder) return envValue ?? placeholder
  return existingValue
}

export function patchSeamaidProvider(
  cfg: OpenCodeConfig,
  models: Record<string, ModelConfig>,
  env: Env = process.env,
): void {
  cfg.provider ??= {}

  const existing = cfg.provider[PROVIDER_ID] ?? {}
  const existingOptions = existing.options ?? {}

  cfg.provider[PROVIDER_ID] = {
    ...existing,
    npm: existing.npm ?? PROVIDER_NPM,
    name: existing.name ?? PROVIDER_NAME,
    options: {
      ...existingOptions,
      baseURL: resolveOption(existingOptions.baseURL, env.SEAMAID_BASE_URL, "{env:SEAMAID_BASE_URL}"),
      apiKey: resolveOption(existingOptions.apiKey, env.SEAMAID_API_KEY, "{env:SEAMAID_API_KEY}"),
    },
    models: Object.keys(models).length > 0 ? models : existing.models,
  }
}

export async function fetchSeamaidModelsCached(
  env: Env,
  fetchImpl: typeof fetch,
): Promise<Record<string, ModelConfig>> {
  const cached = readModelsCache(env)
  if (cached !== null) return cached

  const models = await fetchSeamaidModels(env, fetchImpl)
  writeModelsCache(models, env)
  return models
}

export default async function seamaidPlugin() {
  let models: Record<string, ModelConfig> = {}

  try {
    models = applyModelContext(await fetchSeamaidModelsCached(process.env, fetch))
  } catch (error) {
    console.warn("[seamaid] Failed to fetch models:", error)
  }

  return {
    config(cfg: OpenCodeConfig) {
      patchSeamaidProvider(cfg, models, process.env)
    },
  }
}
