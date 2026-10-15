import { describe, expect, test, afterEach } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import {
  fetchSeamaidModels,
  fetchSeamaidModelsCached,
  fetchModelContextCached,
  markSeamaidModels,
  modelsEndpoint,
  normalizeBaseURL,
  parseModels,
  buildSeamaidProviders,
  applyModelContext,
  getCacheTTL,
  readModelsCache,
  readModelContextCache,
  writeModelsCache,
  writeModelContextCache,
  type OpenAIModelsResponse,
} from "./index"
import { loadSeamaidCommands, mergeSeamaidCommands } from "./commands"
import { fillEgoUrls } from "../../utils/v2"
import { fetchModelContext, MODELS_DEV_CATALOG_URL, parseModelContext } from "./modal_context"

describe("seamaid plugin helpers", () => {
  test("loads builtin commands with v2 fields and the project name", () => {
    const commands = loadSeamaidCommands("dot-agents")

    expect(commands["seamaid:todo-defects"]).toMatchObject({
      description: "List defects in the current repository.",
      subagent: true,
    })
    expect(commands["seamaid:todo-defects"].template).toContain("project dot-agents")
    expect(commands["seamaid:ego-test-ui"].template).toContain("<figma-url>")
    expect(commands["seamaid:todo-defects"]).not.toHaveProperty("subtask")
  })

  test("does not overwrite a user command", () => {
    const commands = mergeSeamaidCommands(loadSeamaidCommands("dot-agents"), {
      "seamaid:todo-tasks": { template: "custom" },
    })

    expect(commands["seamaid:todo-tasks"]).toEqual({ template: "custom" })
  })

  test("fills ego test URLs from the command arguments", () => {
    const template = "<figma-url>\n</figma-url>\n<browser-url>\n</browser-url>"

    expect(fillEgoUrls(template, "https://www.figma.com/design/abc http://127.0.0.1:3000/page")).toBe(
      "<figma-url>\nhttps://www.figma.com/design/abc\n</figma-url>\n<browser-url>\nhttp://127.0.0.1:3000/page\n</browser-url>",
    )
  })

  test("normalizes trailing slashes from base URL", () => {
    expect(normalizeBaseURL("https://example.com/v1///")).toBe("https://example.com/v1")
  })

  test("builds OpenAI-compatible models endpoint", () => {
    expect(modelsEndpoint("https://example.com/v1/")).toBe("https://example.com/v1/models")
  })

  test("parses models.dev provider metadata and reasoning levels", () => {
    const context = parseModelContext({
      models: {
        "openai/gpt-5.4": {
          reasoning: true,
          limit: { context: 1_000_000, output: 128_000 },
          modalities: { input: ["text"], output: ["text"] },
        },
        "deepseek/deepseek-v4-pro": {
          reasoning: true,
          interleaved: { field: "reasoning_content" },
        },
      },
      providers: {
        openai: {
          models: {
            "gpt-5.4": {
              cost: { input: 2.5, output: 15 },
              reasoning_options: [{ type: "effort", values: ["none", "low", "medium", "high", "xhigh"] }],
            },
          },
        },
        deepseek: {
          models: {
            "deepseek-v4-pro": {
              reasoning_options: [{ type: "toggle" }, { type: "effort", values: ["high", "max"] }],
            },
          },
        },
      },
    })

    expect(context["openai/gpt-5.4"]).toMatchObject({
      reasoning: true,
      limit: { context: 1_000_000, output: 128_000 },
      cost: { input: 2.5, output: 15 },
      variants: {
        none: { reasoningEffort: "none" },
        xhigh: { reasoningEffort: "xhigh" },
      },
    })
    expect(context["deepseek/deepseek-v4-pro"]).toMatchObject({
      variants: {
        none: {
          thinking: { type: "disabled" },
          extra_body: { thinking: { type: "disabled" } },
        },
        high: {
          reasoningEffort: "high",
          thinking: { type: "enabled" },
        },
        max: { reasoningEffort: "max" },
      },
    })
  })

  test("fetches model context from models.dev", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      expect(url).toBe(MODELS_DEV_CATALOG_URL)
      return new Response(JSON.stringify({ models: { "openai/gpt-5": { reasoning: true } } }), { status: 200 })
    }) as unknown as typeof fetch

    await expect(fetchModelContext(fetchImpl)).resolves.toEqual({
      "openai/gpt-5": { reasoning: true },
    })
  })

  test("parses OpenAI-compatible model response", () => {
    expect(
      parseModels(
        {
          data: [
            { id: "gpt-4o", supported_endpoint_types: ["openai"] },
            { id: "claude-3-5-sonnet", supported_endpoint_types: ["anthropic"] },
            { id: "", supported_endpoint_types: ["openai"] },
            { id: 123, supported_endpoint_types: ["openai"] },
          ],
        },
        {},
      ),
    ).toEqual({
      "seamaid-openai": {
        "gpt-4o": { name: "gpt-4o", provider: { npm: "@ai-sdk/openai" } },
      },
      "seamaid-anthropic": {
        "claude-3-5-sonnet": { name: "claude-3-5-sonnet" },
      },
    })
  })

  test("SEAMAID_OPENAI_WIRE_API overrides the openai wire API", () => {
    const payload: OpenAIModelsResponse = {
      data: [
        { id: "gpt-4o", supported_endpoint_types: ["openai"] },
        { id: "zai/glm-5.3-flash", supported_endpoint_types: ["openai"] },
      ],
    }

    expect(parseModels(payload, { SEAMAID_OPENAI_WIRE_API: "responses" })).toEqual({
      "seamaid-openai": {
        "gpt-4o": { name: "gpt-4o", provider: { npm: "@ai-sdk/openai" } },
        "zai/glm-5.3-flash": { name: "zai/glm-5.3-flash", provider: { npm: "@ai-sdk/openai" } },
      },
    })

    expect(parseModels(payload, { SEAMAID_OPENAI_WIRE_API: "chat" })).toEqual({
      "seamaid-openai": {
        "gpt-4o": { name: "gpt-4o" },
        "zai/glm-5.3-flash": { name: "zai/glm-5.3-flash" },
      },
    })

    expect(parseModels(payload, { SEAMAID_OPENAI_WIRE_API: "default" })).toEqual({
      "seamaid-openai": {
        "gpt-4o": { name: "gpt-4o", provider: { npm: "@ai-sdk/openai" } },
        "zai/glm-5.3-flash": { name: "zai/glm-5.3-flash" },
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
      parseModels(
        {
          data: [{ id: "gpt-4o-mini", supported_endpoint_types: ["openai"] }],
        },
        {},
      ),
    ).toEqual({
      "seamaid-openai": {
        "gpt-4o-mini": { name: "gpt-4o-mini", provider: { npm: "@ai-sdk/openai" } },
      },
    })
  })

  test("maps every supported endpoint to its seamaid provider", () => {
    expect(
      parseModels(
        {
          data: [
            { id: "anthropic/claude-sonnet", supported_endpoint_types: ["anthropic"] },
            { id: "google/gemini-3-pro", supported_endpoint_types: ["google"] },
            { id: "multi/gpt-5.5", supported_endpoint_types: ["openai", "google", "anthropic"] },
          ],
        },
        {},
      ),
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
      const models = applyModelContext(
        {
          "seamaid-openai": {
            "openai/gpt-5.5": { name: "openai/gpt-5.5", provider: { npm: "@ai-sdk/openai" } },
          },
        },
        {
          "openai/gpt-5.5": {
            limit: { context: 1_000_000, input: 872_000, output: 128_000 },
            cost: { input: 5, output: 30 },
            modalities: { input: ["text", "image"], output: ["text"] },
          },
        },
      )

      expect(models["seamaid-openai"]["openai/gpt-5.5"]).toMatchObject({
        name: "openai/gpt-5.5",
        provider: { npm: "@ai-sdk/openai" },
        limit: { context: 1_000_000, input: 872_000, output: 128_000 },
        cost: { input: 5, output: 30 },
        modalities: { input: ["text", "image"], output: ["text"] },
      })
    })

    test("adds limit, cost, and modalities for deepseek-v4-pro", () => {
      const models = applyModelContext(
        {
          "seamaid-openai": { "deepseek/deepseek-v4-pro": { name: "deepseek/deepseek-v4-pro" } },
        },
        {
          "deepseek/deepseek-v4-pro": {
            limit: { context: 1_000_000, input: 616_000, output: 384_000 },
            cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
            modalities: { input: ["text"], output: ["text"] },
          },
        },
      )

      expect(models["seamaid-openai"]["deepseek/deepseek-v4-pro"]).toMatchObject({
        name: "deepseek/deepseek-v4-pro",
        limit: { context: 1_000_000, input: 616_000, output: 384_000 },
        cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
        modalities: { input: ["text"], output: ["text"] },
      })
    })

    test("adds limit, cost, and modalities for deepseek-v4-flash", () => {
      const models = applyModelContext(
        {
          "seamaid-openai": { "deepseek-v4-flash": { name: "deepseek-v4-flash" } },
        },
        {
          "deepseek-v4-flash": {
            limit: { context: 1_000_000, input: 616_000, output: 384_000 },
            cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
            modalities: { input: ["text"], output: ["text"] },
          },
        },
      )

      expect(models["seamaid-openai"]["deepseek-v4-flash"]).toMatchObject({
        name: "deepseek-v4-flash",
        limit: { context: 1_000_000, input: 616_000, output: 384_000 },
        cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
        modalities: { input: ["text"], output: ["text"] },
      })
    })

    test("adds limit, cost, and modalities for glm-5.3-flash", () => {
      const models = applyModelContext(
        {
          "seamaid-openai": { "glm-5.3-flash": { name: "glm-5.3-flash" } },
        },
        {
          "glm-5.3-flash": {
            limit: { context: 1_048_576, input: 1_048_576, output: 131_072 },
            cost: { input: 0.075, output: 0.25, cache_read: 0.015 },
            modalities: { input: ["text", "image", "video", "pdf"], output: ["text"] },
          },
        },
      )

      expect(models["seamaid-openai"]["glm-5.3-flash"]).toMatchObject({
        name: "glm-5.3-flash",
        limit: { context: 1_048_576, input: 1_048_576, output: 131_072 },
        cost: { input: 0.075, output: 0.25, cache_read: 0.015 },
        modalities: { input: ["text", "image", "video", "pdf"], output: ["text"] },
      })
    })

    test("does not modify models that do not match any context key", () => {
      const models = applyModelContext({
        "seamaid-openai": { "unknown-model": { name: "unknown-model" } },
      })

      expect(models["seamaid-openai"]["unknown-model"]).toEqual({ name: "unknown-model" })
    })

    test("matches by substring without prefix", () => {
      const models = applyModelContext(
        {
          "seamaid-openai": { "gpt-5.5": { name: "gpt-5.5" } },
        },
        { "openai/gpt-5.5": { limit: { context: 1_000_000 } } },
      )

      expect(models["seamaid-openai"]["gpt-5.5"]).toMatchObject({
        name: "gpt-5.5",
        limit: { context: 1_000_000 },
      })
    })

    test("returns empty object when given empty input", () => {
      expect(applyModelContext({})).toEqual({})
    })
  })

  test("builds v2 providers from fetched models", () => {
    const providers = buildSeamaidProviders(
      {},
      {
        "seamaid-openai": { "seamaid-model": { name: "seamaid-model" } },
      },
      {
        SEAMAID_API_KEY: "secret",
        SEAMAID_BASE_URL: "https://seamaid.example",
      },
    )

    expect(providers).toEqual([
      {
        id: "seamaid-openai",
        name: "Seamaid OpenAI",
        activation: "enabled",
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://seamaid.example/v1", apiKey: "secret" },
        models: [
          {
            id: "seamaid-model",
            modelID: "seamaid-model",
            providerID: "seamaid-openai",
            name: "seamaid-model",
            capabilities: { tools: true, input: ["text"], output: ["text"] },
            variants: [],
            cost: [],
            limit: { context: 200_000, output: 32_000 },
            compatibility: { supportsPromptCacheKey: true },
            status: "active",
            enabled: true,
            time: { released: 0 },
          },
        ],
      },
      {
        id: "seamaid-google",
        name: "Seamaid Google",
        activation: "enabled",
        package: "aisdk:@ai-sdk/google",
        settings: { baseURL: "https://seamaid.example/v1beta", apiKey: "secret" },
        models: [],
      },
      {
        id: "seamaid-anthropic",
        name: "Seamaid Anthropic",
        activation: "enabled",
        package: "aisdk:@ai-sdk/anthropic",
        settings: { baseURL: "https://seamaid.example/v1", apiKey: "secret" },
        models: [],
      },
    ])
  })

  test("fills required cache prices when models.dev omits cache_write", () => {
    const [provider] = buildSeamaidProviders(
      {},
      {
        "seamaid-openai": {
          partial: {
            name: "partial",
            cost: {
              input: 0.435,
              output: 0.87,
              cache_read: 0.003625,
              context_over_200k: { input: 1, output: 2, cache_read: 0.1 },
            },
          },
          priced: {
            name: "priced",
            cost: { input: 1, output: 2, cache_read: 0.1, cache_write: 0.2 },
          },
          bare: { name: "bare", cost: { input: 2.5, output: 15 } },
        },
      },
      {},
    )

    expect(provider.models.map((model) => model.cost)).toEqual([
      [
        { input: 0.435, output: 0.87, cache: { read: 0.003625, write: 0 } },
        {
          tier: { type: "context", size: 200_000 },
          input: 1,
          output: 2,
          cache: { read: 0.1, write: 0 },
        },
      ],
      [{ input: 1, output: 2, cache: { read: 0.1, write: 0.2 } }],
      [{ input: 2.5, output: 15, cache: { read: 0, write: 0 } }],
    ])
  })

  test("preserves existing provider fields and models when fetch returns no models", () => {
    const existingModel = {
      id: "existing",
      modelID: "existing",
      providerID: "seamaid-openai",
      name: "Existing",
      capabilities: { tools: true, input: ["text"], output: ["text"] },
      variants: [],
      cost: [],
      limit: { context: 1, output: 1 },
      compatibility: { supportsPromptCacheKey: true as const },
      status: "active" as const,
      enabled: true as const,
      time: { released: 0 },
    }
    const [provider] = buildSeamaidProviders(
      {
        "seamaid-openai": {
          name: "Custom Seamaid",
          settings: { baseURL: "https://custom.example/v1" },
          headers: { "X-Test": "1" },
          models: [existingModel],
        },
      },
      {},
      {},
    )

    expect(provider).toEqual({
      id: "seamaid-openai",
      package: "aisdk:@ai-sdk/openai-compatible",
      name: "Custom Seamaid",
      activation: "enabled",
      settings: {
        baseURL: "https://custom.example/v1",
        apiKey: "{env:SEAMAID_API_KEY}",
      },
      headers: { "X-Test": "1" },
      models: [existingModel],
    })
  })

  test("replaces env placeholders with runtime env values", () => {
    const [provider] = buildSeamaidProviders(
      {
        "seamaid-openai": {
          settings: {
            baseURL: "{env:SEAMAID_BASE_URL}",
            apiKey: "{env:SEAMAID_API_KEY}",
          },
        },
      },
      {
        "seamaid-openai": { live: { name: "live" } },
      },
      {
        SEAMAID_API_KEY: "secret",
        SEAMAID_BASE_URL: "https://seamaid.example",
      },
    )

    expect(provider.settings).toEqual({
      baseURL: "https://seamaid.example/v1",
      apiKey: "secret",
    })
    expect(provider.models[0]?.compatibility.supportsPromptCacheKey).toBe(true)
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
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    expect(readModelsCache({ SEAMAID_CACHE_DIR: dir })).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test("readModelsCache returns null when cache contains empty models", () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "seamaid-models.json"), JSON.stringify({ timestamp: Date.now(), data: {} }), "utf-8")

    expect(readModelsCache(env)).toBeNull()

    rmSync(dir, { recursive: true, force: true })
  })

  test("writeModelsCache does not write empty models", () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }

    writeModelsCache({}, env)
    expect(readModelsCache(env)).toBeNull()

    rmSync(dir, { recursive: true, force: true })
  })

  test("writeModelsCache removes a stale empty cache file", () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    const file = join(dir, "seamaid-models.json")
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify({ timestamp: Date.now(), data: {} }), "utf-8")

    writeModelsCache({}, env)
    expect(existsSync(file)).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })

  test("writeModelsCache and readModelsCache round-trip", () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    const data = { "seamaid-openai": { "test-model": { name: "test-model" } } }

    writeModelsCache(data, env)
    const result = readModelsCache(env)
    expect(result).toEqual(data)

    rmSync(dir, { recursive: true, force: true })
  })

  test("readModelsCache returns null when cache is expired", () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir, SEAMAID_CACHE_TTL: "1" }
    const data = { "seamaid-openai": { "test-model": { name: "test-model" } } }

    writeModelsCache(data, env)
    // writeModelsCache writes with current timestamp, 1s TTL should be valid
    const result = readModelsCache(env)
    expect(result).toEqual(data)

    rmSync(dir, { recursive: true, force: true })
  })

  test("fetchSeamaidModelsCached returns cached models on cache hit", async () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
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
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
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

  test("fetchSeamaidModelsCached does not cache an empty fetch result", async () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }

    const result = await fetchSeamaidModelsCached(env, fetch)
    expect(result).toEqual({})
    expect(readModelsCache(env)).toBeNull()

    rmSync(dir, { recursive: true, force: true })
  })

  test("readModelContextCache returns null when TTL is 0", () => {
    expect(readModelContextCache({ SEAMAID_CACHE_TTL: "0" })).toBeNull()
  })

  test("writeModelContextCache and readModelContextCache round-trip", () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    const data = { "openai/gpt-5": { reasoning: true } }

    writeModelContextCache(data, env)
    expect(readModelContextCache(env)).toEqual(data)

    rmSync(dir, { recursive: true, force: true })
  })

  test("fetchModelContextCached uses the shared cache settings", async () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir }
    const data = { "openai/gpt-5": { reasoning: true } }
    let fetchCalled = false
    const fetchImpl = (async () => {
      fetchCalled = true
      return new Response(JSON.stringify({ models: data }), { status: 200 })
    }) as unknown as typeof fetch

    expect(await fetchModelContextCached(env, fetchImpl)).toEqual(data)
    expect(fetchCalled).toBe(true)

    fetchCalled = false
    const cached = await fetchModelContextCached(env, fetchImpl)
    expect(cached).toEqual(data)
    expect(fetchCalled).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })

  test("fetchModelContextCached bypasses cache when TTL is 0", async () => {
    const dir = join(tmpdir(), `seamaid-test-${randomUUID()}`)
    const env = { SEAMAID_CACHE_DIR: dir, SEAMAID_CACHE_TTL: "0" }
    let fetchCount = 0
    const fetchImpl = (async () => {
      fetchCount += 1
      return new Response(JSON.stringify({ models: { "openai/gpt-5": { reasoning: true } } }), { status: 200 })
    }) as unknown as typeof fetch

    await fetchModelContextCached(env, fetchImpl)
    await fetchModelContextCached(env, fetchImpl)
    expect(fetchCount).toBe(2)
    expect(readModelContextCache(env)).toBeNull()

    rmSync(dir, { recursive: true, force: true })
  })
})
