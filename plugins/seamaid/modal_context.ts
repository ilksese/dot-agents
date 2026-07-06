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
} as const