import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { AVA_PERSONA_ID, PERSONA_BUILDER_ID } from "@/lib/ai/personas/ids";

/** Filename stem → id (strip leading `NN-`). */
function idFromFilename(filename: string): string {
  const base = filename.replace(/\.md$/i, "");
  return base.replace(/^\d+-/, "");
}

function loadBuiltinPersonaRefsFromDisk(): string[] {
  const dir = path.join(process.cwd(), ".personas");
  if (!existsSync(dir)) {
    return [];
  }

  const refs: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) {
      continue;
    }

    const id = idFromFilename(file);
    if (!id || id === AVA_PERSONA_ID || id === PERSONA_BUILDER_ID) {
      continue;
    }

    refs.push(id);
  }

  return refs.sort((a, b) => a.localeCompare(b));
}

/** Builtin persona refs for org catalog seeding (CLI-safe, no server-only). */
export function listCatalogPersonaRefs(): string[] {
  return [AVA_PERSONA_ID, ...loadBuiltinPersonaRefsFromDisk()];
}
