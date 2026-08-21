import type { LlmProvider, ProviderOptions } from "./types";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";

/**
 * Provider resolution order:
 *
 * 1. Explicit `provider` argument
 * 2. `LLM_PROVIDER` env var (e.g. "gemini", "openai")
 * 3. Inferred from `LLM_MODEL` env var:
 *    - starts with "gemini" → Gemini
 *    - starts with "gpt-" or "o1" or "o3" → OpenAI
 *    - starts with "claude-" → Anthropic (future)
 * 4. Inferred from available API key env vars:
 *    - GEMINI_API_KEY → Gemini
 *    - OPENAI_API_KEY → OpenAI
 *    - ANTHROPIC_API_KEY → Anthropic (future)
 *
 * The first match wins.
 */

export type ProviderName = "gemini" | "openai" | "anthropic";

export interface FactoryOptions extends ProviderOptions {
  provider?: ProviderName;
  baseUrl?: string;
}

/**
 * Create an LLM provider based on environment variables or explicit options.
 *
 * @example
 * ```ts
 * const provider = await createLlmProvider();
 * // or with explicit override:
 * const provider = await createLlmProvider({ provider: "openai", model: "gpt-4o" });
 * ```
 */
export function createLlmProvider(opts: FactoryOptions = {}): LlmProvider {
  const explicitProvider = opts.provider ?? process.env.LLM_PROVIDER;
  const modelEnv = process.env.LLM_MODEL ?? "";
  const apiKey = opts.apiKey;

  // 1. Explicit provider override
  if (explicitProvider) {
    return makeProvider(explicitProvider as ProviderName, opts);
  }

  // 2. Infer from model name
  if (modelEnv) {
    const inferred = inferFromModel(modelEnv);
    if (inferred) {
      return makeProvider(inferred, { ...opts, model: modelEnv });
    }
  }

  // 3. Infer from available API key env vars
  const availableApiKey = apiKey ?? getEnvApiKey();

  if (process.env.GEMINI_API_KEY || (availableApiKey && isGeminiKey(availableApiKey))) {
    return makeProvider("gemini", opts);
  }

  if (process.env.OPENAI_API_KEY || (availableApiKey && isOaiKey(availableApiKey))) {
    return makeProvider("openai", opts);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    // Placeholder — Anthropic provider not yet implemented
    return makeProvider("anthropic", opts);
  }

  // Default fallback
  return makeProvider("gemini", opts);
}

/** Map a provider name to its class and constructor options. */
function makeProvider(name: ProviderName, opts: FactoryOptions): LlmProvider {
  switch (name) {
    case "gemini":
      return new GeminiProvider(opts);
    case "openai":
      return new OpenAIProvider(opts);
    case "anthropic": {
      const fallback = (process.env.LLM_PROVIDER ?? "gemini") as ProviderName;
      console.warn(
        `Provider "anthropic" not yet implemented, falling back to ${fallback}.`,
      );
      return makeProvider(fallback, opts);
    }
    default: {
      const fallback = (process.env.LLM_PROVIDER ?? "gemini") as ProviderName;
      console.warn(
        `Unknown provider "${name}", falling back to ${fallback}.`,
      );
      return makeProvider(fallback, opts);
    }
  }
}

/** Infer provider from model name string. */
function inferFromModel(model: string): ProviderName | null {
  const m = model.toLowerCase();
  if (m.startsWith("gemini") || m.includes("gemini")) return "gemini";
  if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
    return "openai";
  }
  if (m.startsWith("claude")) {
    return "anthropic";
  }
  return null;
}

/** Check API key prefix to identify provider. */
function isGeminiKey(key: string): boolean {
  // Gemini API keys can start with "AI" or "AQ." (developer API format)
  return key.startsWith("AI") || key.startsWith("AQ.");
}

function isOaiKey(key: string): boolean {
  // OpenAI keys start with "sk-" (but not "sk-ant-" which is Anthropic)
  return key.startsWith("sk-") && !key.startsWith("sk-ant-");
}

/** Find the first available API key env var. */
function getEnvApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY
  );
}
