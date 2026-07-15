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
    input: readonly string[]
    output: readonly string[]
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

type ProviderModels = Record<string, Record<string, ModelConfig>>

const PROVIDERS = {
  "seamaid-openai": {
    name: "Seamaid OpenAI",
    npm: "@ai-sdk/openai-compatible",
    basePath: "v1",
  },
  "seamaid-google": {
    name: "Seamaid Google",
    npm: "@ai-sdk/google",
    basePath: "v1beta",
  },
  "seamaid-anthropic": {
    name: "Seamaid Anthropic",
    npm: "@ai-sdk/anthropic",
    basePath: "v1",
  },
} satisfies Record<string, { name: string; npm: string; basePath: string }>

const PROVIDER_ID_BY_ENDPOINT_TYPE: Record<string, keyof typeof PROVIDERS> = {
  anthropic: "seamaid-anthropic",
  google: "seamaid-google",
  gemini: "seamaid-google",
  openai: "seamaid-openai",
}

const OPENAI_NPM = "@ai-sdk/openai"

const CACHE_DIR = join(homedir(), ".opencode", "cache")
const CACHE_FILE = join(CACHE_DIR, "seamaid-models.json")
const DEFAULT_CACHE_TTL = 10 * 60 * 60 // 10 hours in seconds
type CacheEntry = {
  timestamp: number
  data: ProviderModels
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

export function readModelsCache(env: Env): ProviderModels | null {
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

export function writeModelsCache(data: ProviderModels, env: Env): void {
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

function baseURLRoot(baseURL: string): string {
  return normalizeBaseURL(baseURL).replace(/\/v1(?:beta)?$/, "")
}

function modelProvider(endpointType: string, modelID: string): ModelConfig["provider"] {
  const lowerModelID = modelID.toLowerCase()
  if (endpointType === "openai" && (lowerModelID.includes("codex") || lowerModelID.includes("gpt"))) {
    return { npm: OPENAI_NPM }
  }

  return undefined
}

export function parseModels(payload: OpenAIModelsResponse): ProviderModels {
  const providers: ProviderModels = {}

  for (const item of payload.data ?? []) {
    if (typeof item.id !== "string" || item.id.length === 0) continue
    if (!Array.isArray(item.supported_endpoint_types)) continue

    for (const endpointType of new Set(item.supported_endpoint_types)) {
      if (typeof endpointType !== "string") continue
      const providerID = PROVIDER_ID_BY_ENDPOINT_TYPE[endpointType]
      if (providerID === undefined) continue
      const provider = modelProvider(endpointType, item.id)

      providers[providerID] ??= {}
      providers[providerID][item.id] = {
        name: item.id,
        ...(provider ? { provider } : {}),
      }
    }
  }

  return providers
}

export function markSeamaidModels(models: ProviderModels): ProviderModels {
  return Object.fromEntries(
    Object.entries(models).map(([providerID, providerModels]) => [
      providerID,
      Object.fromEntries(
        Object.entries(providerModels).map(([id, model]) => [id, { ...model, name: `${model.name} (SEAMAID)` }]),
      ),
    ]),
  )
}

export function applyModelContext(models: ProviderModels): ProviderModels {
  const entries = Object.entries(modalContext).sort((a, b) => b[0].length - a[0].length)

  for (const [key, ctx] of entries) {
    for (const providerModels of Object.values(models)) {
      for (const modelId of Object.keys(providerModels)) {
        if (!modelId.includes(key)) continue

        providerModels[modelId] = {
          ...providerModels[modelId],
          ...(ctx.limit ? { limit: ctx.limit } : {}),
          ...(ctx.cost ? { cost: ctx.cost } : {}),
          ...(ctx.modalities ? { modalities: ctx.modalities } : {}),
          ...("variants" in ctx ? { variants: ctx.variants } : {}),
        }
      }
    }
  }

  return models
}

export async function fetchSeamaidModels(env: Env, fetchImpl: typeof fetch): Promise<ProviderModels> {
  const apiKey = env.SEAMAID_API_KEY
  const baseURL = env.SEAMAID_BASE_URL

  if (!apiKey || !baseURL) return {}

  const response = await fetchImpl(modelsEndpoint(`${baseURLRoot(baseURL)}/v1`), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Seamaid models request failed: ${response.status} ${response.statusText}`)
  }

  return markSeamaidModels(parseModels((await response.json()) as OpenAIModelsResponse))
}

function resolveOption(
  existingValue: unknown,
  envValue: string | undefined,
  placeholder: string,
  legacyPlaceholder?: string,
): unknown {
  if (existingValue === undefined || existingValue === placeholder || existingValue === legacyPlaceholder) {
    return envValue ?? placeholder
  }
  return existingValue
}

function providerBaseURL(env: Env, basePath: string): string | undefined {
  if (!env.SEAMAID_BASE_URL) return undefined
  return `${baseURLRoot(env.SEAMAID_BASE_URL)}/${basePath}`
}

export function patchSeamaidProvider(cfg: OpenCodeConfig, models: ProviderModels, env: Env = process.env): void {
  cfg.provider ??= {}

  for (const [providerID, provider] of Object.entries(PROVIDERS)) {
    const existing = cfg.provider[providerID] ?? {}
    const existingOptions = existing.options ?? {}
    const providerModels = models[providerID]

    cfg.provider[providerID] = {
      ...existing,
      npm: existing.npm ?? provider.npm,
      name: existing.name ?? provider.name,
      options: {
        ...existingOptions,
        baseURL: resolveOption(
          existingOptions.baseURL,
          providerBaseURL(env, provider.basePath),
          `{env:SEAMAID_BASE_URL}/${provider.basePath}`,
          "{env:SEAMAID_BASE_URL}",
        ),
        apiKey: resolveOption(existingOptions.apiKey, env.SEAMAID_API_KEY, "{env:SEAMAID_API_KEY}"),
        setCacheKey: true,
      },
      models: providerModels && Object.keys(providerModels).length > 0 ? providerModels : (existing.models ?? {}),
    }
  }
}

export async function fetchSeamaidModelsCached(env: Env, fetchImpl: typeof fetch): Promise<ProviderModels> {
  const cached = readModelsCache(env)
  if (cached !== null) return cached

  const models = await fetchSeamaidModels(env, fetchImpl)
  writeModelsCache(models, env)
  return models
}

export default async function seamaidPlugin() {
  let models: ProviderModels = {}

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
