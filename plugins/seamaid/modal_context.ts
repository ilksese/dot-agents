type OpenCodeModality = "text" | "audio" | "image" | "video" | "pdf"
type OpenCodeStatus = "alpha" | "beta" | "deprecated" | "active"
type OpenCodeInterleaved = true | { field: "reasoning" | "reasoning_content" | "reasoning_details" }

type OpenCodeCost = {
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

type OpenCodeLimit = {
  context: number
  input?: number
  output: number
}

type OpenCodeModalities = {
  input?: readonly OpenCodeModality[]
  output?: readonly OpenCodeModality[]
}

type OpenCodeModelProvider = {
  npm?: string
  api?: string
}

type OpenCodeModelVariantConfig = {
  disabled?: boolean
  [key: string]: unknown
}

type OpenCodeModelConfig = {
  id?: string
  name?: string
  family?: string
  release_date?: string
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  interleaved?: OpenCodeInterleaved
  cost?: OpenCodeCost
  limit?: OpenCodeLimit
  modalities?: OpenCodeModalities
  experimental?: boolean
  status?: OpenCodeStatus
  provider?: OpenCodeModelProvider
  options?: object
  headers?: Record<string, string>
  variants?: Record<string, OpenCodeModelVariantConfig>
}

type OpenCodeReasoningEffortVariant = OpenCodeModelVariantConfig & {
  reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
}

const GPT_REASONING_VARIANTS = {
  high: {
    high: { reasoningEffort: "high" },
  },
  minimalLowMediumHigh: {
    minimal: { reasoningEffort: "minimal" },
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
  },
  noneLowMediumHigh: {
    none: { reasoningEffort: "none" },
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
  },
  noneLowMediumHighXhigh: {
    none: { reasoningEffort: "none" },
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
    xhigh: { reasoningEffort: "xhigh" },
  },
  lowMediumHighXhigh: {
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
    xhigh: { reasoningEffort: "xhigh" },
  },
  mediumHighXhigh: {
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
    xhigh: { reasoningEffort: "xhigh" },
  },
  noneLowMediumHighXhighMax: {
    none: { reasoningEffort: "none" },
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
    xhigh: { reasoningEffort: "xhigh" },
    max: { reasoningEffort: "max" },
  },
} as const satisfies Record<string, Record<string, OpenCodeReasoningEffortVariant>>

const DEEPSEEK_V4_LIMIT = {
  context: 1_000_000,
  input: 616_000,
  output: 384_000,
} as const satisfies OpenCodeLimit

const DEEPSEEK_V4_VARIANTS = {
  none: {
    thinking: { type: "disabled" },
    extra_body: { thinking: { type: "disabled" } },
  },
  low: {
    reasoningEffort: "low",
    thinking: { type: "enabled" },
    extra_body: { thinking: { type: "enabled" } },
  },
  medium: {
    reasoningEffort: "medium",
    thinking: { type: "enabled" },
    extra_body: { thinking: { type: "enabled" } },
  },
  high: {
    reasoningEffort: "high",
    thinking: { type: "enabled" },
    extra_body: { thinking: { type: "enabled" } },
  },
  xhigh: {
    reasoningEffort: "xhigh",
    thinking: { type: "enabled" },
    extra_body: { thinking: { type: "enabled" } },
  },
  max: {
    reasoningEffort: "max",
    thinking: { type: "enabled" },
    extra_body: { thinking: { type: "enabled" } },
  },
} as const satisfies Record<string, OpenCodeModelVariantConfig>

export default {
  "gpt-5.6-sol": {
    variants: GPT_REASONING_VARIANTS.noneLowMediumHighXhighMax,
  },
  "gpt-5.6-terra": {
    variants: GPT_REASONING_VARIANTS.noneLowMediumHighXhighMax,
  },
  "gpt-5.6-luna": {
    variants: GPT_REASONING_VARIANTS.noneLowMediumHighXhighMax,
  },
  "gpt-5.5": {
    limit: {
      context: 1_050_000,
      output: 128_000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    modalities: {
      input: ["text", "image"],
      output: ["text"],
    },
    variants: GPT_REASONING_VARIANTS.noneLowMediumHighXhigh,
  },
  "deepseek-v4-pro": {
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    limit: DEEPSEEK_V4_LIMIT,
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.003625,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    variants: DEEPSEEK_V4_VARIANTS,
  },
  "deepseek-v4-flash": {
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    limit: DEEPSEEK_V4_LIMIT,
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    variants: DEEPSEEK_V4_VARIANTS,
  },
  "qwen3.6-plus": {
    limit: {
      context: 1_000_000,
      input: 991_800,
      output: 65_536,
    },
    cost: {
      input: 0.5,
      output: 3.0,
      cache_read: 0.05,
    },
    modalities: {
      input: ["text", "image", "video"],
      output: ["text"],
    },
  },
  "qwen3.7-max": {
    limit: {
      context: 1_000_000,
      input: 991_800,
      output: 65_536,
    },
    cost: {
      input: 2.5,
      output: 7.5,
      cache_read: 0.25,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
  },
  "qwen3.7-plus": {
    limit: {
      context: 1_000_000,
      input: 991_800,
      output: 65_536,
    },
    cost: {
      input: 0.4,
      output: 1.6,
      cache_read: 0.04,
    },
    modalities: {
      input: ["text", "image", "video"],
      output: ["text"],
    },
  },
  "gemini-3.5-flash": {
    limit: {
      context: 1_048_576,
      input: 983_040,
      output: 65_536,
    },
    cost: {
      input: 1.5,
      output: 9.0,
      cache_read: 0.15,
    },
    modalities: {
      input: ["text", "image", "video", "audio", "pdf"],
      output: ["text"],
    },
  },
  "glm-5.1": {
    limit: {
      context: 200_000,
      input: 68_928,
      output: 131_072,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    modalities: {
      input: ["text", "image", "pdf"],
      output: ["text"],
    },
  },
  "glm-5.2": {
    limit: {
      context: 1_000_000,
      input: 872_000,
      output: 128_000,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
  },
  "kimi-k2.7-code": {
    limit: {
      context: 262_144,
      input: 229_376,
      output: 32_768,
    },
    cost: {
      input: 0.95,
      output: 4.0,
      cache_read: 0.19,
    },
    modalities: {
      input: ["text", "image"],
      output: ["text"],
    },
  },
} as const satisfies Record<string, OpenCodeModelConfig>
