import { describe, expect, test } from "bun:test"
import {
  fetchSeamaidModels,
  modelsEndpoint,
  normalizeBaseURL,
  parseModels,
  patchSeamaidProvider,
  applyModelContext,
} from "./index"

describe("seamaid plugin helpers", () => {
  test("normalizes trailing slashes from base URL", () => {
    expect(normalizeBaseURL("https://example.com/v1///")).toBe("https://example.com/v1")
  })

  test("builds OpenAI-compatible models endpoint", () => {
    expect(modelsEndpoint("https://example.com/v1/")).toBe("https://example.com/v1/models")
  })

  test("parses OpenAI-compatible model response", () => {
    expect(
      parseModels({
        data: [{ id: "gpt-4o" }, { id: "claude-3-5-sonnet" }, { id: "" }, { id: 123 }],
      }),
    ).toEqual({
      "gpt-4o": { name: "gpt-4o" },
      "claude-3-5-sonnet": { name: "claude-3-5-sonnet" },
    })
  })

  test("returns empty model map when env vars are missing", async () => {
    const fetchImpl = (() => {
      throw new Error("fetch should not be called")
    }) as unknown as typeof fetch

    await expect(fetchSeamaidModels({}, fetchImpl)).resolves.toEqual({})
  })

  test("fetches models with bearer token", async () => {
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("https://seamaid.example/v1/models")
      expect(init?.headers).toEqual({
        Authorization: "Bearer secret",
      })

      return new Response(
        JSON.stringify({
          data: [{ id: "seamaid-model" }],
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    await expect(
      fetchSeamaidModels(
        {
          SEAMAID_API_KEY: "secret",
          SEAMAID_BASE_URL: "https://seamaid.example/v1/",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      "seamaid-model": { name: "seamaid-model" },
    })
  })

  test("parseModels does not apply model context", () => {
    expect(
      parseModels({
        data: [{ id: "gpt-4o-mini" }],
      }),
    ).toEqual({
      "gpt-4o-mini": { name: "gpt-4o-mini" },
    })
  })

  test("sets model provider npm when endpoint type and id both match", () => {
    expect(
      parseModels({
        data: [
          { id: "anthropic/claude-sonnet", supported_endpoint_types: ["anthropic"] },
          { id: "google/gemini-3-pro", supported_endpoint_types: ["google"] },
          { id: "openai/gpt-5.5", supported_endpoint_types: ["openai"] },
          { id: "deepseek/deepseek-v4", supported_endpoint_types: ["deepseek"] },
        ],
      }),
    ).toEqual({
      "anthropic/claude-sonnet": {
        name: "anthropic/claude-sonnet",
        provider: { npm: "@ai-sdk/anthropic" },
      },
      "google/gemini-3-pro": {
        name: "google/gemini-3-pro",
        provider: { npm: "@ai-sdk/google" },
      },
      "openai/gpt-5.5": {
        name: "openai/gpt-5.5",
        provider: { npm: "@ai-sdk/openai" },
      },
      "deepseek/deepseek-v4": {
        name: "deepseek/deepseek-v4",
        provider: { npm: "@ai-sdk/deepseek" },
      },
    })
  })

  test("keeps top-level provider when endpoint type does not match model id", () => {
    expect(
      parseModels({
        data: [
          { id: "gemini-3-pro", supported_endpoint_types: ["google"] },
          { id: "google/gemini-3-pro", supported_endpoint_types: ["openai"] },
          { id: "openai/gpt-5.5", supported_endpoint_types: ["unknown"] },
          { id: "deepseek-v4" },
        ],
      }),
    ).toEqual({
      "gemini-3-pro": { name: "gemini-3-pro" },
      "google/gemini-3-pro": { name: "google/gemini-3-pro" },
      "openai/gpt-5.5": { name: "openai/gpt-5.5" },
      "deepseek-v4": { name: "deepseek-v4" },
    })
  })

  describe("applyModelContext", () => {
  test("adds limit, cost, and modalities for gpt-5.5", () => {
    const models = applyModelContext({
      "openai/gpt-5.5": { name: "openai/gpt-5.5", provider: { npm: "@ai-sdk/openai" } },
    })

    expect(models["openai/gpt-5.5"]).toMatchObject({
      name: "openai/gpt-5.5",
      provider: { npm: "@ai-sdk/openai" },
      limit: { context: 1_000_000, input: 872_000, output: 128_000 },
      cost: { input: 5, output: 30 },
      modalities: { input: ["text", "image"], output: ["text"] },
    })
  })

  test("adds limit, cost, and modalities for deepseek-v4-pro", () => {
    const models = applyModelContext({
      "deepseek/deepseek-v4-pro": { name: "deepseek/deepseek-v4-pro" },
    })

    expect(models["deepseek/deepseek-v4-pro"]).toMatchObject({
      name: "deepseek/deepseek-v4-pro",
      limit: { context: 1_000_000, input: 616_000, output: 384_000 },
      cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
      modalities: { input: ["text"], output: ["text"] },
    })
  })

  test("adds limit, cost, and modalities for deepseek-v4-flash", () => {
    const models = applyModelContext({
      "deepseek-v4-flash": { name: "deepseek-v4-flash" },
    })

    expect(models["deepseek-v4-flash"]).toMatchObject({
      name: "deepseek-v4-flash",
      limit: { context: 1_000_000, input: 616_000, output: 384_000 },
      cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
      modalities: { input: ["text"], output: ["text"] },
    })
  })

  test("does not modify models that do not match any context key", () => {
    const models = applyModelContext({
      "unknown-model": { name: "unknown-model" },
    })

    expect(models["unknown-model"]).toEqual({ name: "unknown-model" })
  })

  test("matches by substring without prefix", () => {
    const models = applyModelContext({
      "gpt-5.5": { name: "gpt-5.5" },
    })

    expect(models["gpt-5.5"]).toMatchObject({
      name: "gpt-5.5",
      limit: { context: 1_000_000 },
    })
  })

  test("returns empty object when given empty input", () => {
    expect(applyModelContext({})).toEqual({})
  })
})

test("patches provider config with fetched models", () => {
    const cfg = {}

    patchSeamaidProvider(
      cfg,
      {
        "seamaid-model": { name: "seamaid-model" },
      },
      {
        SEAMAID_API_KEY: "secret",
        SEAMAID_BASE_URL: "https://seamaid.example/v1",
      },
    )

    expect(cfg).toEqual({
      provider: {
        seamaid: {
          npm: "@ai-sdk/openai-compatible",
          name: "Seamaid",
          options: {
            baseURL: "https://seamaid.example/v1",
            apiKey: "secret",
          },
          models: {
            "seamaid-model": { name: "seamaid-model" },
          },
        },
      },
    })
  })

  test("preserves existing provider fields and models when fetch returns no models", () => {
    const cfg = {
      provider: {
        seamaid: {
          name: "Custom Seamaid",
          options: {
            baseURL: "https://custom.example/v1",
            headers: {
              "X-Test": "1",
            },
          },
          models: {
            existing: { name: "Existing" },
          },
        },
      },
    }

    patchSeamaidProvider(cfg, {}, {})

    expect(cfg.provider.seamaid).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "Custom Seamaid",
      options: {
        baseURL: "https://custom.example/v1",
        headers: {
          "X-Test": "1",
        },
        apiKey: "{env:SEAMAID_API_KEY}",
      },
      models: {
        existing: { name: "Existing" },
      },
    })
  })

  test("replaces env placeholders with runtime env values", () => {
    const cfg = {
      provider: {
        seamaid: {
          options: {
            baseURL: "{env:SEAMAID_BASE_URL}",
            apiKey: "{env:SEAMAID_API_KEY}",
          },
        },
      },
    }

    patchSeamaidProvider(
      cfg,
      {
        live: { name: "live" },
      },
      {
        SEAMAID_API_KEY: "secret",
        SEAMAID_BASE_URL: "https://seamaid.example/v1",
      },
    )

    expect(cfg.provider.seamaid.options).toEqual({
      baseURL: "https://seamaid.example/v1",
      apiKey: "secret",
    })
  })
})
