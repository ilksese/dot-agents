import { homedir } from "os"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { basename, join } from "path"
import type { ModelConfig } from "@opencode/types"
import { loadSeamaidCommands } from "./commands.js"
import { fetchModelContext, type ModelContext } from "./modal_context.js"
import { registerLoadedCommands, type CommandHost } from "../../utils/register-commands.js"
import { aisdkPackage } from "../../utils/v2.js"

export type OpenAIModelsResponse = {
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
const MODEL_CONTEXT_CACHE_FILE = "models-dev-context.json"
const DEFAULT_CACHE_TTL = 10 * 60 * 60 // 10 hours in seconds
type CacheEntry = {
  timestamp: number
  data: ProviderModels
}
type ModelContextCacheEntry = {
  timestamp: number
  data: ModelContext
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

function modelContextCacheFile(env: Env): string {
  return join(cacheDir(env), MODEL_CONTEXT_CACHE_FILE)
}

function hasModels(models: ProviderModels): boolean {
  return Object.values(models).some((providerModels) => Object.keys(providerModels).length > 0)
}

export function readModelsCache(env: Env): ProviderModels | null {
  const ttl = getCacheTTL(env)
  if (ttl === 0) return null

  try {
    const file = cacheFile(env)
    if (!existsSync(file)) return null
    const raw = readFileSync(file, "utf-8")
    const entry: CacheEntry = JSON.parse(raw)
    if (!hasModels(entry.data)) return null
    const age = (Date.now() - entry.timestamp) / 1000
    if (age > ttl) return null
    return entry.data
  } catch {
    return null
  }
}

export function writeModelsCache(data: ProviderModels, env: Env): void {
  try {
    if (!hasModels(data)) {
      // Never persist an empty model list: a transient failure would otherwise
      // poison the cache and hide models until the TTL expires.
      rmSync(cacheFile(env), { force: true })
      return
    }
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

function hasModelContext(context: ModelContext): boolean {
  return Object.keys(context).length > 0
}

export function readModelContextCache(env: Env): ModelContext | null {
  const ttl = getCacheTTL(env)
  if (ttl === 0) return null

  try {
    const file = modelContextCacheFile(env)
    if (!existsSync(file)) return null
    const raw = readFileSync(file, "utf-8")
    const entry: ModelContextCacheEntry = JSON.parse(raw)
    if (!hasModelContext(entry.data)) return null
    const age = (Date.now() - entry.timestamp) / 1000
    if (age > ttl) return null
    return entry.data
  } catch {
    return null
  }
}

export function writeModelContextCache(data: ModelContext, env: Env): void {
  if (getCacheTTL(env) === 0) return

  try {
    if (!hasModelContext(data)) {
      rmSync(modelContextCacheFile(env), { force: true })
      return
    }
    const dir = cacheDir(env)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const entry: ModelContextCacheEntry = { timestamp: Date.now(), data }
    writeFileSync(modelContextCacheFile(env), JSON.stringify(entry), "utf-8")
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

function modelProvider(endpointType: string, modelID: string, env: Env = process.env): ModelConfig["provider"] {
  if (endpointType !== "openai") return undefined

  // SEAMAID_OPENAI_WIRE_API forces the wire API for all OpenAI-endpoint models:
  // "responses" -> @ai-sdk/openai, "chat" -> @ai-sdk/openai-compatible,
  // anything else keeps the default codex/gpt sniffing below.
  const wireAPI = env.SEAMAID_OPENAI_WIRE_API
  if (wireAPI === "responses") return { npm: OPENAI_NPM }
  if (wireAPI === "chat") return undefined

  const lowerModelID = modelID.toLowerCase()
  if (lowerModelID.includes("codex") || lowerModelID.includes("gpt")) {
    return { npm: OPENAI_NPM }
  }

  return undefined
}

export function parseModels(payload: OpenAIModelsResponse, env: Env = process.env): ProviderModels {
  const providers: ProviderModels = {}

  for (const item of payload.data ?? []) {
    if (typeof item.id !== "string" || item.id.length === 0) continue
    if (!Array.isArray(item.supported_endpoint_types)) continue

    for (const endpointType of new Set(item.supported_endpoint_types)) {
      if (typeof endpointType !== "string") continue
      const providerID = PROVIDER_ID_BY_ENDPOINT_TYPE[endpointType]
      if (providerID === undefined) continue
      const provider = modelProvider(endpointType, item.id, env)

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

function modelContextMatch(modelId: string, key: string): boolean {
  const lowerModelID = modelId.toLowerCase()
  const lowerKey = key.toLowerCase()
  const shortKey = lowerKey.slice(lowerKey.lastIndexOf("/") + 1)
  return lowerModelID.includes(lowerKey) || lowerModelID.includes(shortKey)
}

function modelContextMatchScore(modelId: string, key: string): number {
  const lowerModelID = modelId.toLowerCase()
  const lowerKey = key.toLowerCase()
  if (lowerModelID === lowerKey) return 3
  if (lowerModelID.includes(lowerKey)) return 2
  return 1
}

export function applyModelContext(models: ProviderModels, context: ModelContext = {}): ProviderModels {
  const entries = Object.entries(context)

  for (const providerModels of Object.values(models)) {
    for (const modelId of Object.keys(providerModels)) {
      const entry = entries
        .filter(([key]) => modelContextMatch(modelId, key))
        .sort(
          (a, b) =>
            modelContextMatchScore(modelId, b[0]) - modelContextMatchScore(modelId, a[0]) || b[0].length - a[0].length,
        )[0]
      if (!entry) continue

      const [, ctx] = entry
      providerModels[modelId] = {
        ...providerModels[modelId],
        ...(ctx.reasoning !== undefined ? { reasoning: ctx.reasoning } : {}),
        ...(ctx.temperature !== undefined ? { temperature: ctx.temperature } : {}),
        ...(ctx.tool_call !== undefined ? { tool_call: ctx.tool_call } : {}),
        ...(ctx.interleaved !== undefined ? { interleaved: ctx.interleaved } : {}),
        ...("limit" in ctx ? { limit: ctx.limit } : {}),
        ...("cost" in ctx ? { cost: ctx.cost } : {}),
        ...("modalities" in ctx ? { modalities: ctx.modalities } : {}),
        ...("variants" in ctx ? { variants: ctx.variants } : {}),
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

  return markSeamaidModels(parseModels((await response.json()) as OpenAIModelsResponse, env))
}

function resolveOption<T>(
  existingValue: T | undefined,
  envValue: T | undefined,
  placeholder: T,
  legacyPlaceholder?: T,
): T {
  if (existingValue === undefined || existingValue === placeholder || existingValue === legacyPlaceholder) {
    return envValue ?? placeholder
  }
  return existingValue
}

function providerBaseURL(env: Env, basePath: string): string | undefined {
  if (!env.SEAMAID_BASE_URL) return undefined
  return `${baseURLRoot(env.SEAMAID_BASE_URL)}/${basePath}`
}

export interface SeamaidModel {
  id: string
  modelID: string
  providerID: string
  name: string
  package?: string
  capabilities: { tools: boolean; input: string[]; output: string[] }
  variants: Array<{ id: string; settings: Record<string, unknown> }>
  cost: Array<{
    input: number
    output: number
    cache: { read: number; write: number }
    tier?: { type: "context"; size: number }
  }>
  limit: { context: number; input?: number; output: number }
  compatibility: { supportsPromptCacheKey: true }
  status: "active"
  enabled: true
  time: { released: 0 }
}

export interface SeamaidProvider {
  id: string
  name: string
  activation: "enabled"
  package: string
  settings: { baseURL: string; apiKey: string; [key: string]: unknown }
  headers?: Record<string, string>
  models: SeamaidModel[]
}

export interface ExistingSeamaidProvider {
  name?: string
  package?: string
  settings?: { baseURL?: string; apiKey?: string; [key: string]: unknown }
  headers?: Record<string, string>
  models?: SeamaidModel[]
}

function toSeamaidModel(providerID: string, modelID: string, model: ModelConfig): SeamaidModel {
  const modalities = model.modalities
  const limit = model.limit
  const cost = model.cost
  const variants = model.variants
    ? Object.entries(model.variants).map(([id, settings]) => ({ id, settings: { ...settings } }))
    : []
  return {
    id: modelID,
    modelID,
    providerID,
    name: model.name ?? modelID,
    ...(model.provider?.npm ? { package: aisdkPackage(model.provider.npm) } : {}),
    capabilities: {
      tools: model.tool_call ?? true,
      input: modalities?.input ?? ["text"],
      output: modalities?.output ?? ["text"],
    },
    variants,
    cost: toModelCost(cost),
    limit: {
      context: limit?.context ?? 200_000,
      ...(limit?.input !== undefined ? { input: limit.input } : {}),
      output: limit?.output ?? 32_000,
    },
    compatibility: { supportsPromptCacheKey: true },
    status: "active",
    enabled: true,
    time: { released: 0 },
  }
}

function finiteMoney(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

// OpenCode Model.Cost requires cache.read and cache.write. Missing prices are zero, not omitted.
function cachePrice(read: number | undefined, write: number | undefined) {
  return {
    read: finiteMoney(read) ?? 0,
    write: finiteMoney(write) ?? 0,
  }
}

function toModelCost(cost: ModelConfig["cost"]): SeamaidModel["cost"] {
  if (!cost) return []

  const tiers = [
    costTier(cost.input, cost.output, cost.cache_read, cost.cache_write),
    cost.context_over_200k
      ? costTier(
          cost.context_over_200k.input,
          cost.context_over_200k.output,
          cost.context_over_200k.cache_read,
          cost.context_over_200k.cache_write,
          { type: "context", size: 200_000 },
        )
      : undefined,
  ]

  return tiers.filter((tier) => tier !== undefined)
}

function costTier(
  input: number | undefined,
  output: number | undefined,
  read: number | undefined,
  write: number | undefined,
  tier?: { type: "context"; size: number },
) {
  const pricedInput = finiteMoney(input)
  const pricedOutput = finiteMoney(output)
  if (pricedInput === undefined || pricedOutput === undefined) return undefined
  return {
    ...(tier ? { tier } : {}),
    input: pricedInput,
    output: pricedOutput,
    cache: cachePrice(read, write),
  }
}

export function buildSeamaidProviders(
  existing: Record<string, ExistingSeamaidProvider> = {},
  models: ProviderModels = {},
  env: Env = process.env,
): SeamaidProvider[] {
  return Object.entries(PROVIDERS).map(([providerID, provider]) => {
    const current = existing[providerID] ?? {}
    const currentSettings = current.settings ?? {}
    const catalog = models[providerID]
    return {
      id: providerID,
      name: current.name ?? provider.name,
      activation: "enabled",
      package: current.package || aisdkPackage(provider.npm),
      settings: {
        ...currentSettings,
        baseURL: resolveOption(
          currentSettings.baseURL,
          providerBaseURL(env, provider.basePath),
          `{env:SEAMAID_BASE_URL}/${provider.basePath}`,
          "{env:SEAMAID_BASE_URL}",
        ),
        apiKey: resolveOption(currentSettings.apiKey, env.SEAMAID_API_KEY, "{env:SEAMAID_API_KEY}"),
      },
      ...(current.headers ? { headers: current.headers } : {}),
      models:
        catalog && Object.keys(catalog).length > 0
          ? Object.entries(catalog).map(([modelID, model]) => toSeamaidModel(providerID, modelID, model))
          : (current.models ?? []),
    }
  })
}

export async function fetchSeamaidModelsCached(env: Env, fetchImpl: typeof fetch): Promise<ProviderModels> {
  const cached = readModelsCache(env)
  if (cached !== null) return cached

  const models = await fetchSeamaidModels(env, fetchImpl)
  writeModelsCache(models, env)
  return models
}

export async function fetchModelContextCached(env: Env, fetchImpl: typeof fetch): Promise<ModelContext> {
  const cached = readModelContextCache(env)
  if (cached !== null) return cached

  const context = await fetchModelContext(fetchImpl)
  writeModelContextCache(context, env)
  return context
}

const SEAMAID_PROVIDER_IDS = new Set(Object.keys(PROVIDERS))

interface ProviderDraft {
  name: string
  package: string
  settings: Record<string, unknown>
  headers: Record<string, string>
}

interface ProviderEditor {
  get(providerID: string): { provider: ProviderDraft } | undefined
  add(input: { info: ProviderDraft & { id: string; activation: "enabled" }; models: SeamaidModel[] }): void
  update(providerID: string, update: (provider: ProviderDraft) => void): void
  models: { set(providerID: string, models: SeamaidModel[]): void }
}

interface ModelEditor {
  list(providerID?: string): Array<{ providerID: string; id: string; compatibility?: Record<string, unknown> }>
  update(
    providerID: string,
    modelID: string,
    update: (model: { compatibility?: Record<string, unknown> }) => void,
  ): void
}

export interface SeamaidContext extends CommandHost {
  location: { directory: string; project: { directory: string } }
  provider: { transform(callback: (editor: ProviderEditor) => void): Promise<unknown> }
  model: { transform(callback: (editor: ModelEditor) => void): Promise<unknown> }
}

export default {
  id: "seamaid",
  async setup(ctx: SeamaidContext) {
    let models: ProviderModels = {}

    try {
      models = await fetchSeamaidModelsCached(process.env, fetch)
    } catch (error) {
      console.warn("[seamaid] Failed to fetch models:", error)
    }

    if (hasModels(models)) {
      try {
        models = applyModelContext(models, await fetchModelContextCached(process.env, fetch))
      } catch (error) {
        console.warn("[seamaid] Failed to fetch model context:", error)
      }
    }

    const projectName = basename(ctx.location.project.directory || ctx.location.directory)
    await ctx.provider.transform((editor) => {
      const existing = Object.fromEntries(
        buildSeamaidProviders().map((provider) => {
          const current = editor.get(provider.id)?.provider
          return [
            provider.id,
            {
              name: current?.name,
              package: current?.package,
              settings: current?.settings,
              headers: current?.headers,
            },
          ]
        }),
      )
      for (const provider of buildSeamaidProviders(existing, models, process.env)) {
        const info = {
          id: provider.id,
          name: provider.name,
          activation: provider.activation,
          package: provider.package,
          settings: provider.settings,
          headers: provider.headers ?? {},
        }
        if (!editor.get(provider.id)) {
          editor.add({ info, models: provider.models })
          continue
        }
        editor.update(provider.id, (draft) => {
          draft.name = provider.name
          draft.package = provider.package
          draft.settings = provider.settings
          draft.headers = provider.headers ?? draft.headers
        })
        if (provider.models.length > 0) editor.models.set(provider.id, provider.models)
      }
    })
    await ctx.model.transform((editor) => {
      for (const providerID of SEAMAID_PROVIDER_IDS) {
        for (const model of editor.list(providerID)) {
          editor.update(model.providerID, model.id, (draft) => {
            draft.compatibility = { ...draft.compatibility, supportsPromptCacheKey: true }
          })
        }
      }
    })
    await registerLoadedCommands(ctx, loadSeamaidCommands(projectName))
  },
}
