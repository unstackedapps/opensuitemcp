import { fetchOpenAiCompatibleModels } from "./custom-provider-url";
import type { AiProviderType, CustomModelOption } from "./provider-entries";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_MODELS_BODY_BYTES = 1_048_576;

export async function fetchProviderModels(params: {
  type: AiProviderType;
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<CustomModelOption[]> {
  switch (params.type) {
    case "custom": {
      if (!params.baseUrl?.trim()) {
        throw new Error("Enter a base URL.");
      }
      return fetchOpenAiCompatibleModels({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      });
    }
    case "openai":
      return fetchOpenAiModels(requireApiKey(params.apiKey, "OpenAI"));
    case "anthropic":
      return fetchAnthropicModels(requireApiKey(params.apiKey, "Anthropic"));
    case "google":
      return fetchGoogleModels(requireApiKey(params.apiKey, "Google"));
    default: {
      const exhaustive: never = params.type;
      throw new Error(`Unsupported provider type: ${exhaustive}`);
    }
  }
}

function requireApiKey(
  apiKey: string | null | undefined,
  label: string,
): string {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    throw new Error(`Enter a ${label} API key first.`);
  }
  return trimmed;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Could not list models (${response.status})${
          detail.trim() ? `: ${detail.trim().slice(0, 200)}` : ""
        }. Check the API key.`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_MODELS_BODY_BYTES) {
      throw new Error("Model list response was too large.");
    }
    return JSON.parse(buffer.toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out listing models.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenAiModels(apiKey: string): Promise<CustomModelOption[]> {
  const payload = (await fetchJson("https://api.openai.com/v1/models", {
    Authorization: `Bearer ${apiKey}`,
  })) as { data?: Array<{ id?: unknown }>; error?: { message?: string } };

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  const models = Array.isArray(payload.data)
    ? payload.data.flatMap((item) => {
        if (typeof item?.id !== "string" || !item.id.trim()) {
          return [];
        }
        return [{ id: item.id.trim() }];
      })
    : [];

  if (models.length === 0) {
    throw new Error("OpenAI returned no models for this API key.");
  }

  return models.sort((left, right) => left.id.localeCompare(right.id));
}

async function fetchAnthropicModels(
  apiKey: string,
): Promise<CustomModelOption[]> {
  const payload = (await fetchJson("https://api.anthropic.com/v1/models", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  })) as {
    data?: Array<{ id?: unknown; display_name?: unknown }>;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  const models = Array.isArray(payload.data)
    ? payload.data.flatMap((item) => {
        if (typeof item?.id !== "string" || !item.id.trim()) {
          return [];
        }
        return [
          {
            id: item.id.trim(),
            name:
              typeof item.display_name === "string" && item.display_name.trim()
                ? item.display_name.trim()
                : undefined,
          },
        ];
      })
    : [];

  if (models.length === 0) {
    throw new Error("Anthropic returned no models for this API key.");
  }

  return models.sort((left, right) => left.id.localeCompare(right.id));
}

async function fetchGoogleModels(apiKey: string): Promise<CustomModelOption[]> {
  const payload = (await fetchJson(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
    { "x-goog-api-key": apiKey },
  )) as {
    models?: Array<{ name?: unknown; displayName?: unknown }>;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  const models = Array.isArray(payload.models)
    ? payload.models.flatMap((item) => {
        if (typeof item?.name !== "string" || !item.name.trim()) {
          return [];
        }
        const rawName = item.name.trim();
        const id = rawName.startsWith("models/")
          ? rawName.slice("models/".length)
          : rawName;
        if (!id) {
          return [];
        }
        return [
          {
            id,
            name:
              typeof item.displayName === "string" && item.displayName.trim()
                ? item.displayName.trim()
                : undefined,
          },
        ];
      })
    : [];

  if (models.length === 0) {
    throw new Error("Google returned no models for this API key.");
  }

  return models.sort((left, right) => left.id.localeCompare(right.id));
}
