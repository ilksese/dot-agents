import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { AgentConfig } from "@opencode/types"

type LoadedAgent = AgentConfig & Record<string, unknown>
type LoadedAgents = Record<string, LoadedAgent>
type Quote = "'" | '"' | null
type SourceLine = { indent: number; text: string }
type ParsedBlock = { value: unknown; nextIndex: number }

const KUMO_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_AGENTS_DIR = join(KUMO_DIR, "../../agents")

function toggleQuote(quote: Quote, character: string): Quote {
  if (character !== "'" && character !== '"') return quote
  return quote === character ? null : character === "'" ? "'" : '"'
}

function stripYamlComment(value: string): string {
  let quote: Quote = null

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (value[index - 1] !== "\\") {
      quote = toggleQuote(quote, character)
    }
    if (character === "#" && quote === null && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd()
    }
  }

  return value
}

function trySplitYamlKey(line: string): [string, string] | null {
  let quote: Quote = null

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (valueIsEscaped(line, index) === false) {
      quote = toggleQuote(quote, character)
    }
    if (character === ":" && quote === null && (index + 1 === line.length || /\s/.test(line[index + 1]))) {
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    }
  }

  return null
}

function splitYamlKey(line: string): [string, string] {
  const result = trySplitYamlKey(line)
  if (result) return result
  throw new Error(`Invalid YAML mapping entry: ${line}`)
}

function valueIsEscaped(value: string, index: number): boolean {
  return value[index - 1] === "\\"
}

function parseYamlString(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string
    } catch {
      return value.slice(1, -1)
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }

  return value
}

function splitInlineYaml(value: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote: Quote = null

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (!valueIsEscaped(value, index)) {
      quote = toggleQuote(quote, character)
    }
    if (quote !== null) continue
    if (character === "[" || character === "{") depth += 1
    if (character === "]" || character === "}") depth -= 1
    if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }

  parts.push(value.slice(start).trim())
  return parts.filter((part) => part.length > 0)
}

function parseYamlValue(value: string): unknown {
  const normalized = stripYamlComment(value).trim()
  if (normalized === "") return ""
  if (normalized === "true") return true
  if (normalized === "false") return false
  if (normalized === "null" || normalized === "~") return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return Number(normalized)

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return splitInlineYaml(normalized.slice(1, -1)).map(parseYamlValue)
  }

  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    const object: Record<string, unknown> = {}
    for (const entry of splitInlineYaml(normalized.slice(1, -1))) {
      const [key, rawValue] = splitYamlKey(entry)
      object[parseYamlString(key)] = parseYamlValue(rawValue)
    }
    return object
  }

  return parseYamlString(normalized)
}

function parseYamlBlock(lines: SourceLine[], startIndex: number, indent: number): ParsedBlock {
  const firstLine = lines[startIndex]
  if (firstLine.text === "-" || firstLine.text.startsWith("- ")) {
    return parseYamlArray(lines, startIndex, indent)
  }

  return parseYamlObject(lines, startIndex, indent)
}

function parseYamlArray(lines: SourceLine[], startIndex: number, indent: number): ParsedBlock {
  const result: unknown[] = []
  let index = startIndex

  while (index < lines.length && lines[index].indent === indent) {
    const line = lines[index].text
    if (!(line === "-" || line.startsWith("- "))) break

    const itemText = line === "-" ? "" : line.slice(2).trim()
    if (itemText === "") {
      const next = lines[index + 1]
      if (next && next.indent > indent) {
        const nested = parseYamlBlock(lines, index + 1, next.indent)
        result.push(nested.value)
        index = nested.nextIndex
      } else {
        result.push(null)
        index += 1
      }
      continue
    }

    const itemKeyValue = trySplitYamlKey(itemText)
    if (!itemKeyValue) {
      result.push(parseYamlValue(itemText))
      index += 1
      continue
    }

    const item: Record<string, unknown> = {}
    const [key, rawValue] = itemKeyValue
    if (rawValue === "") {
      const next = lines[index + 1]
      if (next && next.indent > indent) {
        const nested = parseYamlBlock(lines, index + 1, next.indent)
        item[parseYamlString(key)] = nested.value
        index = nested.nextIndex
      } else {
        item[parseYamlString(key)] = null
        index += 1
      }
    } else {
      item[parseYamlString(key)] = parseYamlValue(rawValue)
      index += 1
    }

    while (index < lines.length && lines[index].indent > indent) {
      const nested = parseYamlBlock(lines, index, lines[index].indent)
      if (typeof nested.value === "object" && nested.value !== null && !Array.isArray(nested.value)) {
        Object.assign(item, nested.value)
      }
      index = nested.nextIndex
    }

    result.push(item)
  }

  return { value: result, nextIndex: index }
}

function parseYamlObject(lines: SourceLine[], startIndex: number, indent: number): ParsedBlock {
  const result: Record<string, unknown> = {}
  let index = startIndex

  while (index < lines.length && lines[index].indent === indent) {
    const [key, rawValue] = splitYamlKey(lines[index].text)
    const normalizedKey = parseYamlString(key)

    if (rawValue === "|" || rawValue === ">") {
      const content: string[] = []
      index += 1
      while (index < lines.length && lines[index].indent > indent) {
        content.push(lines[index].text)
        index += 1
      }
      result[normalizedKey] = rawValue === "|" ? content.join("\n") : content.join(" ")
      continue
    }

    if (rawValue === "") {
      const next = lines[index + 1]
      if (next && next.indent > indent) {
        const nested = parseYamlBlock(lines, index + 1, next.indent)
        result[normalizedKey] = nested.value
        index = nested.nextIndex
      } else {
        result[normalizedKey] = null
        index += 1
      }
      continue
    }

    result[normalizedKey] = parseYamlValue(rawValue)
    index += 1
  }

  return { value: result, nextIndex: index }
}

function parseFrontmatter(source: string, filePath: string): { attributes: Record<string, unknown>; prompt: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (!match) {
    throw new Error(`Agent file must start with YAML frontmatter: ${filePath}`)
  }

  const lines = match[1]
    .split(/\r?\n/)
    .map((line) => ({
      indent: line.match(/^ */)?.[0].length ?? 0,
      text: line.trim(),
    }))
    .filter((line) => line.text !== "" && !line.text.startsWith("#"))

  if (lines.length === 0) return { attributes: {}, prompt: match[2].trim() }

  const parsed = parseYamlBlock(lines, 0, lines[0].indent).value
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Agent frontmatter must be a YAML object: ${filePath}`)
  }

  return { attributes: parsed as Record<string, unknown>, prompt: match[2].trim() }
}

/**
 * Load all Markdown agent definitions from `agentsDir`.
 *
 * The file name (without `.md`) becomes the OpenCode agent name, YAML
 * frontmatter becomes the agent config, and the Markdown body becomes `prompt`.
 */
export function loadAgent(agentsDir = DEFAULT_AGENTS_DIR): LoadedAgents {
  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) return {}

  const agents: LoadedAgents = {}
  const files = readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    const filePath = join(agentsDir, file)
    const { attributes, prompt } = parseFrontmatter(readFileSync(filePath, "utf-8"), filePath)
    const name = basename(file, extname(file))
    agents[name] = {
      ...attributes,
      ...(prompt ? { prompt } : {}),
    }
  }

  return agents
}
