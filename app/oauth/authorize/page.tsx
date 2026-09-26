import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AuthBrand } from "@/components/auth-brand";
import {
  type ConsentAgentOption,
  ConsentForm,
} from "@/components/oauth/consent-form";
import { Button } from "@/components/ui/button";
import { getUserSettings } from "@/lib/db/queries";
import { listAgentPersonaOptions } from "@/lib/mcp/server/agent-personas";
import {
  type AuthorizationContext,
  buildDenialRedirect,
  prepareAuthorization,
} from "@/lib/mcp/server/oauth/authorize-flow";
import type { RawAuthorizeParams } from "@/lib/mcp/server/oauth/authorize-request";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";

export const dynamic = "force-dynamic";

/**
 * The consent screen.
 *
 * This is the one OAuth surface a person looks at, and the only one behind the
 * cookie gate: an unauthenticated visitor is bounced to login by the middleware
 * and returned here afterwards, which is why it is a page rather than a route
 * handler.
 *
 * It asks for nothing. The agent was created in the portal — named, given a
 * persona, pinned to an account if wanted — and is sitting there waiting for a
 * client. All that is left is whether this client may be the one, so this page
 * shows what is about to happen and offers two buttons.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const raw = toRawParams(await searchParams);
  const request = new Request("https://placeholder.invalid", {
    headers: await headers(),
  });

  const prepared = await prepareAuthorization({
    raw,
    user: { id: session.user.id, orgId: session.user.orgId },
    request,
  });

  if (prepared.kind === "redirect") {
    redirect(prepared.url);
  }

  if (prepared.kind === "fatal") {
    return (
      <Shell>
        <Notice description={prepared.description} title={prepared.title} />
        <p className="text-center text-muted-foreground text-xs">
          Nothing was sent back to the agent. You can close this page.
        </p>
      </Shell>
    );
  }

  if (prepared.kind === "blocked") {
    return (
      <Shell>
        <Notice description={prepared.description} title={prepared.title} />
        {prepared.openAgentAccess ? (
          <Button asChild className="w-full">
            <Link href="/?portal=agent-access">Open Agent access</Link>
          </Button>
        ) : null}
        <CancelForm context={prepared.context} />
      </Shell>
    );
  }

  // Names, not ids: the screen describes what the person already set up, so the
  // persona and account are resolved here rather than shipped as identifiers.
  const [personas, settings] = await Promise.all([
    listAgentPersonaOptions({
      id: session.user.id,
      orgId: session.user.orgId,
    }),
    getUserSettings({ userId: session.user.id }),
  ]);

  const personaNames = new Map(personas.map((one) => [one.id, one.name]));
  const accountLabels = new Map(
    resolveNetSuiteAccounts(settings ?? {}).map((entry) => [
      entry.accountId,
      entry.label,
    ]),
  );

  const agents: ConsentAgentOption[] = prepared.pending.map((grant) => ({
    id: grant.id,
    name: grant.name,
    personaName: grant.personaId
      ? (personaNames.get(grant.personaId) ?? null)
      : null,
    accountLabel: grant.netsuiteAccountId
      ? (accountLabels.get(grant.netsuiteAccountId) ?? grant.netsuiteAccountId)
      : null,
  }));

  return (
    <Shell>
      <ConsentForm
        agents={agents}
        clientName={prepared.context.client.name}
        loopbackOnly={prepared.context.client.loopbackOnly}
        params={replayParams(raw)}
        redirectHost={prepared.context.client.redirectHost}
        userEmail={session.user.email ?? null}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 px-4 py-10 sm:px-0">
        <div className="flex justify-center">
          <AuthBrand size="lg" />
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="font-medium text-lg">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

/**
 * The way out of a blocked screen.
 *
 * Telling the agent `access_denied` is kinder than leaving it waiting on a
 * callback that never arrives, and it is what lets a connector say "cancelled"
 * rather than "timed out".
 */
function CancelForm({ context }: { context: AuthorizationContext }) {
  async function cancel() {
    "use server";
    redirect(buildDenialRedirect(context));
  }

  return (
    <form action={cancel}>
      <Button className="w-full" type="submit" variant="outline">
        Back to the agent
      </Button>
    </form>
  );
}

function toRawParams(
  searchParams: Record<string, string | string[] | undefined>,
): RawAuthorizeParams {
  const read = (key: string): string | undefined => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    client_id: read("client_id"),
    redirect_uri: read("redirect_uri"),
    response_type: read("response_type"),
    code_challenge: read("code_challenge"),
    code_challenge_method: read("code_challenge_method"),
    state: read("state"),
    scope: read("scope"),
    resource: read("resource"),
  };
}

/** Only the parameters the action re-validates travel through the form. */
function replayParams(raw: RawAuthorizeParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) {
      out[key] = value;
    }
  }
  return out;
}
