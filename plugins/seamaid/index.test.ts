import { describe, expect, test, afterEach } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  fetchSeamaidModels,
  fetchSeamaidModelsCached,
  markSeamaidModels,
  modelsEndpoint,
  normalizeBaseURL,
  parseModels,
  patchSeamaidProvider,
  applyModelContext,
  getCacheTTL,
  readModelsCache,
  writeModelsCache,
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
        data: [
          { id: "gpt-4o", supported_endpoint_types: ["openai"] },
          { id: "claude-3-5-sonnet", supported_endpoint_types: ["anthropic"] },
          { id: "", supported_endpoint_types: ["openai"] },
          { id: 123, supported_endpoint_types: ["openai"] },
        ],
      }),
    ).toEqual({
      "seamaid-openai": {
        "gpt-4o": { name: "gpt-4o", provider: { npm: "@ai-sdk/openai" } },
      },
      "seamaid-anthropic": {
        "claude-3-5-sonnet": { name: "claude-3-5-sonnet" },
      },
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
          data: [{ id: "seamaid-model", supported_endpoint_types: ["openai"] }],
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
      "seamaid-openai": {
        "seamaid-model": { name: "seamaid-model (SEAMAID)" },
      },
    })
  })

  test("marks fetched model names as seamaid", () => {
    expect(markSeamaidModels({ "seamaid-openai": { "gpt-5.5": { name: "gpt-5.5" } } })).toEqual({
      "seamaid-openai": { "gpt-5.5": { name: "gpt-5.5 (SEAMAID)" } },
    })
  })

  test("parseModels does not apply model context", () => {
    expect(
      parseModels({
        data: [{ id: "gpt-4o-mini", supported_endpoint_types: ["openai"] }],
      }),
    ).toEqual({
      "seamaid-openai": {
        "gpt-4o-mini": { name: "gpt-4o-mini", provider: { npm: "@ai-sdk/openai" } },
      },
    })
  })

  test("maps every supported endpoint to its seamaid provider", () => {
    expect(
      parseModels({
        data: [
          { id: "anthropic/claude-sonnet", supported_endpoint_types: ["anthropic"] },
          { id: "google/gemini-3-pro", supported_endpoint_types: ["google"] },
          { id: "multi/gpt-5.5", supported_endpoint_types: ["openai", "google", "anthropic"] },
        ],
      }),
    ).toEqual({
      "seamaid-anthropic": {
        "anthropic/claude-sonnet": { name: "anthropic/claude-sonnet" },
        "multi/gpt-5.5": { name: "multi/gpt-5.5" },
      },
      "seamaid-google": {
        "google/gemini-3-pro": { name: "google/gemini-3-pro" },
        "multi/gpt-5.5": { name: "multi/gpt-5.5" },
      },
      "seamaid-openai": {
        "multi/gpt-5.5": { name: "multi/gpt-5.5", provider: { npm: "@ai-sdk/openai" } },
      },
    })
  })

  test("ignores models without supported endpoint types", () => {
    expect(
      parseModels({
        data: [{ id: "unknown-model" }, { id: "unsupported", supported_endpoint_types: ["deepseek"] }],
      }),
    ).toEqual({})
  })

  describe("applyModelContext", () => {
    test("adds limit, cost, and modalities for gpt-5.5", () => {
      const models = applyModelContext({
        "seamaid-openai": {
          "openai/gpt-5.5": { name: "openai/gpt-5.5", provider: { npm: "@ai-sdk/openai" } },
        },
      })

      expect(models["seamaid-openai"]["openai/gpt-5.5"]).toMatchObject({
        name: "openai/gpt-5.5",
        provider: { npm: "@ai-sdk/openai" },
        limit: { context: 1_000_000, input: 872_000, output: 128_000 },
        cost: { input: 5, output: 30 },
        modalities: { input: ["text", "image"], output: ["text"] },
      })
    })

    test("adds limit, cost, and modalities for deepseek-v4-pro", () => {
      const models = applyModelContext({
        "seamaid-openai": { "deepseek/deepseek-v4-pro": { name: "deepseek/deepseek-v4-pro" } },
      })

      expect(models["seamaid-openai"]["deepseek/deepseek-v4-pro"]).toMatchObject({
        name: "deepseek/deepseek-v4-pro",
        limit: { context: 1_000_000, input: 616_000, output: 384_000 },
        cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
        modalities: { input: ["text"], output: ["text"] },
      })
    })

    test("adds limit, cost, and modalities for deepseek-v4-flash", () => {
      const models = applyModelContext({
        "seamaid-openai": { "deepseek-v4-flash": { name: "deepseek-v4-flash" } },
      })

      expect(models["seamaid-openai"]["deepseek-v4-flash"]).toMatchObject({
        name: "deepseek-v4-flash",
        limit: { context: 1_000_000, input: 616_000, output: 384_000 },
        cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
        modalities: { input: ["text"], output: ["text"] },
      })
    })

    test("does not modify models that do not match any context key", () => {
      const models = applyModelContext({
        "seamaid-openai": { "unknown-model": { name: "unknown-model" } },
      })

      expect(models["seamaid-openai"]["unknown-model"]).toEqual({ name: "unknown-model" })
    })

    test("matches by substring without prefix", () => {
      const models = applyModelContext({
        "seamaid-openai": { "gpt-5.5": { name: "gpt-5.5" } },
      })

      expect(models["seamaid-openai"]["gpt-5.5"]).toMatchObject({
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
        "seamaid-openai": { "seamaid-model": { name: "seamaid-model" } },
      },
      {
        SEAMAID_API_KEY: "secret",
        SEAMAID_BASE_URL: "https://seamaid.example",
      },
    )

    expect(cfg).toEqual({
      provider: {
        "seamaid-openai": {
          npm: "@ai-sdk/openai-compatible",
          name: "Seamaid OpenAI",
          options: {
            baseURL: "https://seamaid.example/v1",
            apiKey: "secret",
            setCacheKey: true,
          },
          models: {
            "seamaid-model": { name: "seamaid-model" },
          },
        },
        "seamaid-google": {
          npm: "@ai-sdk/google",
          name: "Seamaid Google",
          options: { baseURL: "https://seamaid.example/v1beta", apiKey: "secret", setCacheKey: true },
          models: {},
        },
        "seamaid-anthropic": {
          npm: "@ai-sdk/anthropic",
          name: "Seamaid Anthropic",
          options: { baseURL: "https://seamaid.example/v1", apiKey: "secret", setCacheKey: true },
          models: {},
        },
      },
    })
  })

  test("preserves existing provider fields and models when fetch returns no models", () => {
    const cfg = {
      provider: {
        "seamaid-openai": {
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

    expect(cfg.provider["seamaid-openai"]).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "Custom Seamaid",
      options: {
        baseURL: "https://custom.example/v1",
        headers: {
          "X-Test": "1",
        },
        apiKey: "{env:SEAMAID_API_KEY}",
        setCacheKey: true,
      },
      models: {
        existing: { name: "Existing" },
      },
    })
  })

  test("replaces env placeholders with runtime env values", () => {
    const cfg = {
      provider: {
        "seamaid-openai": {
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
        "seamaid-openai": { live: { name: "live" } },
      },
      {
        SEAMAID_API_KEY: "secret",
        SEAMAID_BASE_URL: "https://seamaid.example",
      },
    )

    expect(cfg.provider["seamaid-openai"].options).toEqual({
      baseURL: "https://seamaid.example/v1",
      apiKey: "secret",
      setCacheKey: true,
    })
  })
})

describe("cache helpers", () => {
  test("getCacheTTL returns default when env is missing", () => {
    expect(getCacheTTL({})).toBe(10 * 60 * 60)
  })

  test("getCacheTTL returns default when env is empty", () => {
    expect(getCacheTTL({ SEAMAID_CACHE_TTL: "" })).toBe(10 * 60 * 60)
  })

  test("getCacheTTL parses valid number", () => {
    expect(getCacheTTL({ SEAMAID_CACHE_TTL: "3600" })).toBe(3600)
  })

  test("getCacheTTL returns 0 when set to 0", () => {
    expect(getCacheTTL({ SEAMAID_CACHE_TTL: "0" })).toBe(0)
  })

  test("getCacheTTL returns default for negative value", () => {
    expect(getCacheTTL({ SEAMAID_CACHE_TTL: "-1" })).toBe(10 * 60 * 60)
  })

  test("getCacheTTL returns default for NaN", () => {
    expect(getCacheTTL({ SEAMAID_CACHE_TTL: "abc" })).toBe(10 * 60 * 60)
  })

  test("readModelsCache returns null when TTL is 0", () => {
    expect(readModelsCache({ SEAMAID_CACHE_TTL: "0" })).toBeNull()
  })

  test("readModelsCache returns null when cache file does not exist", () => {
    const dir = join(tmpdir(), `seamaid-test-${Date.now()}`)
    expect(readModelsCache({ SEAMAID_CACHE_DIR: dir })).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test("writeModelsCache and readModelsCache round-trip", () => {
    const dir = join(tmpdir(), `seamaid-test-${Date.now()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    const data = { "seamaid-openai": { "test-model": { name: "test-model" } } }

    writeModelsCache(data, env)
    const result = readModelsCache(env)
    expect(result).toEqual(data)

    rmSync(dir, { recursive: true, force: true })
  })

  test("readModelsCache returns null when cache is expired", () => {
    const dir = join(tmpdir(), `seamaid-test-${Date.now()}`)
    const env = { SEAMAID_CACHE_DIR: dir, SEAMAID_CACHE_TTL: "1" }
    const data = { "seamaid-openai": { "test-model": { name: "test-model" } } }

    writeModelsCache(data, env)
    // writeModelsCache writes with current timestamp, 1s TTL should be valid
    const result = readModelsCache(env)
    expect(result).toEqual(data)

    rmSync(dir, { recursive: true, force: true })
  })

  test("fetchSeamaidModelsCached returns cached models on cache hit", async () => {
    const dir = join(tmpdir(), `seamaid-test-${Date.now()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    const data = { "seamaid-openai": { "cached-model": { name: "cached-model" } } }

    writeModelsCache(data, env)

    const fetchImpl = (() => {
      throw new Error("fetch should not be called")
    }) as unknown as typeof fetch

    const result = await fetchSeamaidModelsCached(env, fetchImpl)
    expect(result).toEqual(data)

    rmSync(dir, { recursive: true, force: true })
  })

  test("fetchSeamaidModelsCached fetches and caches on cache miss", async () => {
    const dir = join(tmpdir(), `seamaid-test-${Date.now()}`)
    const env = { SEAMAID_CACHE_DIR: dir, SEAMAID_BASE_URL: "https://seamaid.example/v1", SEAMAID_API_KEY: "secret" }
    let fetchCalled = false

    const fetchImpl = (async () => {
      fetchCalled = true
      return new Response(JSON.stringify({ data: [{ id: "fresh-model", supported_endpoint_types: ["openai"] }] }), {
        status: 200,
      })
    }) as unknown as typeof fetch

    const result = await fetchSeamaidModelsCached(env, fetchImpl)
    expect(fetchCalled).toBe(true)
    expect(result).toEqual({ "seamaid-openai": { "fresh-model": { name: "fresh-model (SEAMAID)" } } })

    // Verify cache was written
    const cached = readModelsCache(env)
    expect(cached).toEqual(result)

    rmSync(dir, { recursive: true, force: true })
  })
})
