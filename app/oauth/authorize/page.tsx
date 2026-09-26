import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AuthBrand } from "@/components/auth-brand";
import { ConsentForm } from "@/components/oauth/consent-form";
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
import { listConnectedNetSuiteAccountIds } from "@/lib/netsuite/tokens";

export const dynamic = "force-dynamic";

/**
 * The consent screen.
 *
 * This is the one OAuth surface a person looks at, and the only one behind the
 * cookie gate: an unauthenticated visitor is bounced to login by the middleware
 * and returned here afterwards, which is why it is a page rather than a route
 * handler.
 *
 * What it asks for mirrors minting a key — a name, a NetSuite account, a
 * persona — because the two produce the same thing. An agent that signed in and
 * an agent that was handed a key appear in one list and are revoked the same
 * way.
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
        <CancelForm context={prepared.context} />
      </Shell>
    );
  }

  const [personas, settings, connectedAccountIds] = await Promise.all([
    listAgentPersonaOptions({
      id: session.user.id,
      orgId: session.user.orgId,
    }),
    getUserSettings({ userId: session.user.id }),
    listConnectedNetSuiteAccountIds(session.user.id),
  ]);

  const accounts = resolveNetSuiteAccounts(settings ?? {}).map((entry) => ({
    accountId: entry.accountId,
    label: entry.label,
    connected: connectedAccountIds.includes(entry.accountId),
  }));

  return (
    <Shell>
      <ConsentForm
        accounts={accounts}
        clientName={prepared.context.client.name}
        loopbackOnly={prepared.context.client.loopbackOnly}
        params={replayParams(raw)}
        personas={personas.map((persona) => ({
          id: persona.id,
          name: persona.name,
          primaryRole: persona.primaryRole,
          authoredBy: persona.authoredBy ?? "user",
        }))}
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
