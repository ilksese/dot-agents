# Seamaid Plugin

An opencode plugin that fetches models from a Seamaid OpenAI-compatible
`/models` endpoint and patches `config.provider.seamaid.models` during opencode
startup.

The plugin keeps the top-level `seamaid` provider OpenAI-compatible by default,
then selectively sets model-level provider overrides when the model id and
`supported_endpoint_types[0]` agree.

## Usage

Add the local plugin path to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugins/seamaid/index.ts"]
}
```

Set the required environment variables before starting opencode:

```sh
export SEAMAID_API_KEY="..."
export SEAMAID_BASE_URL="https://your-seamaid-endpoint/v1"
```

The plugin fetches `GET ${SEAMAID_BASE_URL}/models` with
`Authorization: Bearer ${SEAMAID_API_KEY}` and configures the `seamaid` provider
with `@ai-sdk/openai-compatible`.

## Behavior

Each fetched model is matched against a hardcoded context registry in
[`modal_context.ts`](modal_context.ts). When a model ID includes a registry key
(e.g., `"openai/gpt-5.5"` contains `"gpt-5.5"`), the plugin supplements the
model config with `limit`, `cost`, and `modalities`:

```json
{
  "openai/gpt-5.5": {
    "name": "openai/gpt-5.5",
    "provider": {
      "npm": "@ai-sdk/openai"
    },
    "limit": {
      "context": 1000000,
      "input": 872000,
      "output": 128000
    },
    "cost": {
      "input": 5,
      "output": 30
    },
    "modalities": {
      "input": ["text", "image"],
      "output": ["text"]
    }
  }
}
```

Models that do not match any registry key are added with `name` only, exactly
as returned by the endpoint.

### Supported models and official sources

| Registry key | Source |
|---|---|
| `gpt-5.5` | [OpenAI docs](https://developers.openai.com/api/docs/models) |
| `deepseek-v4-pro` | [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) |
| `deepseek-v4-flash` | [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) |

**Missing values:** If an official source does not publish a value (e.g., cached
input pricing for GPT-5.5), the field is omitted rather than guessed.

The top-level provider is configured as:

```json
{
  "provider": {
    "seamaid": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Seamaid",
      "options": {
        "baseURL": "<SEAMAID_BASE_URL>",
        "apiKey": "<SEAMAID_API_KEY>"
      },
      "models": {}
    }
  }
}
```

For each fetched model, the plugin checks `supported_endpoint_types[0]` and the
model id together. If both match, it sets a model-level provider override:

| Match condition | Model provider npm |
| --- | --- |
| id contains `anthropic` and endpoint type is `anthropic` | `@ai-sdk/anthropic` |
| id contains `google` and endpoint type is `google` | `@ai-sdk/google` |
| id contains `openai` and endpoint type is `openai` | `@ai-sdk/openai` |
| id contains `deepseek` and endpoint type is `deepseek` | `@ai-sdk/deepseek` |

Models that do not satisfy both checks keep using the top-level Seamaid provider.

## Verification

Verify models with:

```sh
opencode models seamaid
```

`opencode providers list` shows credential and environment auth sources; it does
not list every configured provider from `config.provider`.

Run a smoke test with a known model:

```sh
opencode run -m seamaid/gpt-4o-mini 'Reply with OK only.'
```

Run plugin tests:

```sh
bun test plugins/seamaid/index.test.ts
```

## Notes

Restart opencode after changing plugin or config files. opencode loads config
files once at startup.
