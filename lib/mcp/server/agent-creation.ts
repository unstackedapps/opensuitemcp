import "server-only";

import { isPersonaAvailableToUser } from "./agent-personas";
import { countActiveMcpApiKeys } from "./keys";
import { countActiveOAuthGrants } from "./oauth/grants";
import { resolveMcpPolicyForUser } from "./policy";

/**
 * Everything that must be true before an agent exists, whichever way it
 * connects.
 *
 * Both creation routes run this. They used to carry their own copies, which is
 * how the key dialog and the consent screen ended up disagreeing about which
 * fields an agent even had — the same check in two places is the same check
 * until somebody edits one of them.
 */

export type AgentCreationDenial = { status: number; error: string };

export type AgentCreationOutcome =
  | { ok: true }
  | { ok: false; denial: AgentCreationDenial };

export async function authorizeAgentCreation(params: {
  user: { id: string; orgId: string | null };
  personaId: string | null;
}): Promise<AgentCreationOutcome> {
  const { user } = params;
  const policy = await resolveMcpPolicyForUser(user.orgId, user.id);

  if (!policy.enabled) {
    return {
      ok: false,
      denial: {
        status: 403,
        error:
          "Agent access is disabled for this organization. Ask an administrator to enable it.",
      },
    };
  }
  if (!policy.memberAllowed) {
    return {
      ok: false,
      denial: {
        status: 403,
        error:
          "Agent access is limited to selected members of this organization. Ask an administrator to add you.",
      },
    };
  }

  // One budget for both kinds. An agent waiting for a client to sign in counts
  // the same as one already running: it is a slot its owner has spent.
  //
  // Known race: counting and then inserting means a person firing several
  // creates at once from one session can land a couple over the cap. It is a
  // soft quota on their own account rather than a boundary, and the obvious
  // fix is worse — serializing on a per-user advisory lock deadlocks as soon
  // as concurrent creates reach the connection-pool size, because each
  // transaction then holds a connection while waiting for one. Measured: fine
  // at 8 concurrent, wedged at 10 on a pool of 10. Left as it is, which is
  // also how key creation has always behaved.
  const [keyCount, grantCount] = await Promise.all([
    countActiveMcpApiKeys(user.id),
    countActiveOAuthGrants(user.id),
  ]);
  const activeCount = keyCount + grantCount;
  if (activeCount >= policy.maxKeysPerUser) {
    return {
      ok: false,
      denial: {
        status: 409,
        error: `You already have ${activeCount} active agents. Revoke one before creating another.`,
      },
    };
  }

  if (
    params.personaId &&
    !(await isPersonaAvailableToUser(
      { id: user.id, orgId: user.orgId },
      params.personaId,
    ))
  ) {
    return {
      ok: false,
      denial: { status: 400, error: "That persona is not available to you." },
    };
  }

  return { ok: true };
}
