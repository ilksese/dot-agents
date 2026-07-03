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
const MODEL_PROVIDER_NPM_BY_ENDPOINT_TYPE: Record<string, string> = {
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  openai: "@ai-sdk/openai",
  deepseek: "@ai-sdk/deepseek",
}

export function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, "")
}

export function modelsEndpoint(baseURL: string): string {
  return `${normalizeBaseURL(baseURL)}/models`
}

function modelProvider(endpointTypes: unknown, modelID: string): ModelConfig["provider"] {
  if (!Array.isArray(endpointTypes)) return undefined

  const endpointType = endpointTypes[0]
  if (typeof endpointType !== "string") return undefined
  if (!modelID.includes(endpointType)) return undefined

  const npm = MODEL_PROVIDER_NPM_BY_ENDPOINT_TYPE[endpointType]
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

export async function fetchSeamaidModels(
  env: Env,
  fetchImpl: typeof fetch,
): Promise<Record<string, ModelConfig>> {
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

  return parseModels((await response.json()) as OpenAIModelsResponse)
}

function resolveOption(
  existingValue: unknown,
  envValue: string | undefined,
  placeholder: string,
): unknown {
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

export default async function seamaidPlugin() {
  let models: Record<string, ModelConfig> = {}

  try {
    models = await fetchSeamaidModels(process.env, fetch)
  } catch (error) {
    console.warn("[seamaid] Failed to fetch models:", error)
  }

  return {
    config(cfg: OpenCodeConfig) {
      patchSeamaidProvider(cfg, models, process.env)
    },
  }
}
