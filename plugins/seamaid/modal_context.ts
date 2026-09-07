import type { ModelConfig, ModelVariantConfig } from "@opencode/types"

export const MODELS_DEV_CATALOG_URL = "https://models.dev/catalog.json"

type ModelsDevReasoningOption = {
  type?: unknown
  values?: unknown
}

export type ModelsDevModel = ModelConfig & {
  reasoning_options?: ModelsDevReasoningOption[]
}

export type ModelsDevCatalog = {
  models?: Record<string, ModelsDevModel>
  providers?: Record<string, { models?: Record<string, ModelsDevModel> }>
}

export type ModelContext = Record<string, ModelConfig>

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function reasoningEffortValues(model: ModelsDevModel): string[] {
  const options = Array.isArray(model.reasoning_options) ? model.reasoning_options : []
  const option = options.find((item: ModelsDevReasoningOption) => item.type === "effort")
  const values: unknown[] = Array.isArray(option?.values) ? option.values : []

  return [...new Set(values.filter((value: unknown): value is string => typeof value === "string"))]
}

function hasReasoningToggle(model: ModelsDevModel): boolean {
  const options = Array.isArray(model.reasoning_options) ? model.reasoning_options : []
  return options.some((item: ModelsDevReasoningOption) => item.type === "toggle")
}

function hasReasoningContentInterleaving(model: ModelsDevModel): boolean {
  return (
    typeof model.interleaved === "object" &&
    model.interleaved !== null &&
    !Array.isArray(model.interleaved) &&
    model.interleaved.field === "reasoning_content"
  )
}

function thinkingVariant(enabled: boolean): ModelVariantConfig {
  return {
    thinking: { type: enabled ? "enabled" : "disabled" },
    extra_body: { thinking: { type: enabled ? "enabled" : "disabled" } },
  }
}

function variantsFor(model: ModelsDevModel): Record<string, ModelVariantConfig> | undefined {
  const values = reasoningEffortValues(model)
  if (values.length === 0) return undefined

  const variants = Object.fromEntries(
    values.map((value) => [
      value,
      {
        reasoningEffort: value,
        ...(hasReasoningToggle(model) && hasReasoningContentInterleaving(model) ? thinkingVariant(true) : {}),
      },
    ]),
  ) as Record<string, ModelVariantConfig>

  if (hasReasoningToggle(model) && hasReasoningContentInterleaving(model)) {
    variants.none = thinkingVariant(false)
  }

  return variants
}

function mergeModels(base: ModelsDevModel, provider: ModelsDevModel | undefined): ModelsDevModel {
  if (!provider) return base

  const merged = {
    ...base,
    ...provider,
  }

  if (base.limit !== undefined || provider.limit !== undefined) {
    merged.limit = { ...base.limit, ...provider.limit }
  }
  if (base.cost !== undefined || provider.cost !== undefined) {
    merged.cost = { ...base.cost, ...provider.cost }
  }
  if (base.modalities !== undefined || provider.modalities !== undefined) {
    merged.modalities = { ...base.modalities, ...provider.modalities }
  }

  return merged
}

function contextForModel(model: ModelsDevModel): ModelConfig {
  const context: ModelConfig = {}

  if (model.reasoning !== undefined) context.reasoning = model.reasoning
  if (model.temperature !== undefined) context.temperature = model.temperature
  if (model.tool_call !== undefined) context.tool_call = model.tool_call
  if (model.interleaved !== undefined) context.interleaved = model.interleaved
  if (model.limit !== undefined) context.limit = model.limit
  if (model.cost !== undefined) context.cost = model.cost
  if (model.modalities !== undefined) context.modalities = model.modalities

  const variants = variantsFor(model)
  if (variants !== undefined) context.variants = variants

  return context
}

function providerModel(catalog: ModelsDevCatalog, modelKey: string): ModelsDevModel | undefined {
  const separator = modelKey.indexOf("/")
  if (separator < 1) return undefined

  const providerID = modelKey.slice(0, separator)
  const modelID = modelKey.slice(separator + 1)
  return catalog.providers?.[providerID]?.models?.[modelID]
}

export function parseModelContext(payload: unknown): ModelContext {
  const catalog = asRecord(payload) as ModelsDevCatalog
  const models = asRecord(catalog.models) as Record<string, ModelsDevModel>
  const context: ModelContext = {}

  for (const [modelKey, model] of Object.entries(models)) {
    if (!model || typeof model !== "object") continue
    context[modelKey] = contextForModel(mergeModels(model, providerModel(catalog, modelKey)))
  }

  return context
}

export async function fetchModelContext(fetchImpl: typeof fetch): Promise<ModelContext> {
  const response = await fetchImpl(MODELS_DEV_CATALOG_URL)
  if (!response.ok) {
    throw new Error(`Models.dev request failed: ${response.status} ${response.statusText}`)
  }

  return parseModelContext(await response.json())
}
