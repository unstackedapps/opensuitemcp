import type { Metadata } from "next";
import Link from "next/link";
import { NetSuiteIntegrationChecklist } from "@/components/netsuite-integration-checklist";
import { NETSUITE_DCR_CLIENT_NAME } from "@/lib/netsuite/accounts";
import { ORACLE_DOC_LINKS } from "@/lib/netsuite/integration-checklist";

export const metadata: Metadata = {
  title: "NetSuite integration",
  description:
    "Connect OpenSuiteMCP to NetSuite: AI Connector prerequisites, Integration checklist, OAuth, and SuiteApps.",
};

function resolveRedirectUri(): string {
  const base =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (base) {
    return `${base}/api/netsuite/callback`;
  }
  return "https://YOUR_HOST/api/netsuite/callback";
}

export default function NetSuiteIntegrationDocsPage() {
  const redirectUri = resolveRedirectUri();
  const usingPlaceholder = redirectUri.includes("YOUR_HOST");

  return (
    <main className="pb-16">
      <p className="mb-2 text-[#f3efe6]/45 text-xs uppercase tracking-[0.16em]">
        <Link className="hover:text-[#f3efe6]/70" href="/docs">
          Docs
        </Link>
        <span className="mx-2">/</span>
        Integration
      </p>
      <h1
        className="font-light text-3xl tracking-tight md:text-4xl"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        NetSuite integration
      </h1>
      <p className="mt-3 max-w-2xl text-[#f3efe6]/65 text-sm leading-relaxed md:text-base">
        Same steps as connecting an account in the app: prerequisites, add your
        account, admin Integration record, then OAuth connect.
      </p>

      <div className="prose-invert mt-10 space-y-10 text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            1. Prerequisites
          </h2>
          <p className="text-[#f3efe6]/65">
            In your NetSuite account, enable and install:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <a
                className="text-[#f3efe6] underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.aiConnector}
                rel="noopener noreferrer"
                target="_blank"
              >
                NetSuite AI Connector Service
              </a>
            </li>
            <li>
              <a
                className="text-[#f3efe6] underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.mcpStandardTools}
                rel="noopener noreferrer"
                target="_blank"
              >
                MCP Standard Tools SuiteApp
              </a>
            </li>
            <li>
              <a
                className="text-[#f3efe6]/80 underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.companion}
                rel="noopener noreferrer"
                target="_blank"
              >
                Companion SuiteApp
              </a>{" "}
              (optional — prompts library)
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            2. Add your account ID in OpenSuiteMCP
          </h2>
          <p className="text-[#f3efe6]/65">
            Sign in, open App Portal → NetSuite, and add your account ID (for
            example <code className="text-[#f3efe6]/85">1234567</code> or{" "}
            <code className="text-[#f3efe6]/85">1234567-sb1</code>). An optional
            label helps if you manage multiple accounts.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            3. Admin creates the Integration record
          </h2>
          <p className="text-[#f3efe6]/65">
            A NetSuite administrator creates this once per account. Values below
            match what the App Portal wizard shows (client name{" "}
            <code className="text-[#f3efe6]/85">
              {NETSUITE_DCR_CLIENT_NAME}
            </code>
            ).{" "}
            {usingPlaceholder
              ? "Set Redirect URI to your deployment callback (AUTH_URL + /api/netsuite/callback), for example:"
              : "Redirect URI for this deployment:"}
          </p>
          <code className="block break-all rounded-md border border-white/10 bg-[#0c1219] px-3 py-2 font-mono text-[#f3efe6]/85 text-xs">
            {redirectUri}
          </code>
          <div className="rounded-lg border border-white/10 bg-white/3 p-4 [&_.text-foreground]:text-[#f3efe6] [&_.text-muted-foreground]:text-[#f3efe6]/60 [&_code]:border-white/10 [&_code]:bg-[#0c1219] [&_code]:text-[#f3efe6]/80 [&_button]:border-white/15 [&_button]:bg-transparent [&_button]:text-[#f3efe6]/80">
            <NetSuiteIntegrationChecklist redirectUri={redirectUri} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            4. Check again and Connect
          </h2>
          <p className="text-[#f3efe6]/65">
            After saving the Integration in NetSuite, return to OpenSuiteMCP and
            choose{" "}
            <strong className="font-medium text-[#f3efe6]">Check again</strong>.
            When the probe reports ready, press{" "}
            <strong className="font-medium text-[#f3efe6]">Connect</strong> and
            complete the OAuth consent screen.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            5. Confirm status and SuiteApps
          </h2>
          <p className="text-[#f3efe6]/65">
            A green Connected chip means MCP tools can run against that account.
            Keep AI Connector and MCP Standard Tools installed for tool calls;
            Companion and Agent Skills improve prompts and skill packs but are
            not required for the OAuth handshake itself.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Oracle documentation
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <a
                className="text-[#f3efe6] underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.aiConnector}
                rel="noopener noreferrer"
                target="_blank"
              >
                AI Connector Service
              </a>
            </li>
            <li>
              <a
                className="text-[#f3efe6] underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.mcpStandardTools}
                rel="noopener noreferrer"
                target="_blank"
              >
                MCP Standard Tools
              </a>
            </li>
            <li>
              <a
                className="text-[#f3efe6] underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.companion}
                rel="noopener noreferrer"
                target="_blank"
              >
                Companion SuiteApp
              </a>
            </li>
            <li>
              <a
                className="text-[#f3efe6] underline-offset-4 hover:underline"
                href={ORACLE_DOC_LINKS.agentSkills}
                rel="noopener noreferrer"
                target="_blank"
              >
                SuiteCloud Agent Skills
              </a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
