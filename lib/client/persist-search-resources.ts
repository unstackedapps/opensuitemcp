import type { SearchResourceEntry } from "@/lib/ai/search-resources";

export async function postSearchResources(
  next: SearchResourceEntry[],
): Promise<void> {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searchResources: next }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Failed to save search resources",
    );
  }
}
