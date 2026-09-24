import "server-only";

import {
  listPersonasForClient,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import { getUserSettings } from "@/lib/db/queries";
import { buildOrgAwarePersonaList } from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";

/**
 * Personas this user may hand to an agent.
 *
 * The same list their own picker shows, org policy included: a key is the user
 * acting through an agent, so it cannot reach a persona they cannot. Shared by
 * every route that accepts a persona id, so minting and editing agree on what
 * is allowed.
 */
export async function listAgentPersonaOptions(user: {
  id: string;
  orgId: string | null;
}) {
  const settings = await getUserSettings({ userId: user.id });
  const customPersonas = settings?.customPersonas ?? [];
  return isOrgInstallMode() && user.orgId
    ? await buildOrgAwarePersonaList(
        user.orgId,
        user.id,
        normalizeCustomPersonas(customPersonas),
      )
    : listPersonasForClient(customPersonas);
}

export async function isPersonaAvailableToUser(
  user: { id: string; orgId: string | null },
  personaId: string,
): Promise<boolean> {
  const available = await listAgentPersonaOptions(user);
  return available.some((persona) => persona.id === personaId);
}
