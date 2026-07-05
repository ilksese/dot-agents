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
} as const