export default {
  "gpt-5.5": {
    limit: {
      context: 1_000_000,
      input: 872_000,
      output: 128_000,
    },
    cost: {
      input: 5,
      output: 30,
    },
    modalities: {
      input: ["text", "image"],
      output: ["text"],
    },
    variants: {
      none: {
        reasoningEffort: "none",
      },
      low: {
        reasoningEffort: "low",
      },
      medium: {
        reasoningEffort: "medium",
      },
      high: {
        reasoningEffort: "high",
      },
    },
  },
  "gpt-4.1-mini": {
    limit: {
      context: 1_047_576,
      input: 1_014_808,
      output: 32_768,
    },
    cost: {
      input: 0.4,
      output: 1.6,
      cache_read: 0.1,
    },
    modalities: {
      input: ["text", "image"],
      output: ["text"],
    },
    variants: {
      none: {
        reasoningEffort: "none",
      },
      low: {
        reasoningEffort: "low",
      },
      medium: {
        reasoningEffort: "medium",
      },
      high: {
        reasoningEffort: "high",
      },
    },
  },
  "gpt-4o-mini": {
    limit: {
      context: 128_000,
      input: 111_616,
      output: 16_384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.075,
    },
    modalities: {
      input: ["text", "image"],
      output: ["text"],
    },
    variants: {
      none: {
        reasoningEffort: "none",
      },
      low: {
        reasoningEffort: "low",
      },
      medium: {
        reasoningEffort: "medium",
      },
      high: {
        reasoningEffort: "high",
      },
    },
  },
  "deepseek-v4-pro": {
    limit: {
      context: 1_000_000,
      input: 616_000,
      output: 384_000,
    },
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.003625,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    variants: {
      none: {
        thinking: { type: "disabled" },
        extra_body: { thinking: { type: "disabled" } },
      },
      high: {
        reasoningEffort: "high",
        thinking: { type: "enabled" },
        extra_body: { thinking: { type: "enabled" } },
      },
      max: {
        reasoningEffort: "max",
        thinking: { type: "enabled" },
        extra_body: { thinking: { type: "enabled" } },
      },
    },
  },
  "deepseek-v4-flash": {
    limit: {
      context: 1_000_000,
      input: 616_000,
      output: 384_000,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    variants: {
      none: {
        thinking: { type: "disabled" },
        extra_body: { thinking: { type: "disabled" } },
      },
      high: {
        reasoningEffort: "high",
        thinking: { type: "enabled" },
        extra_body: { thinking: { type: "enabled" } },
      },
      max: {
        reasoningEffort: "max",
        thinking: { type: "enabled" },
        extra_body: { thinking: { type: "enabled" } },
      },
    },
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
} as const
