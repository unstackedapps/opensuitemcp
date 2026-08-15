import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Org-hosted architecture",
  description:
    "High-level architecture for running OpenSuiteMCP in your VPC: trust boundaries, secrets, and when to self-host vs use hosted.",
};

const OSS_GITHUB_URL = "https://github.com/unstackedapps/opensuitemcp";
const AI_CONNECTOR_DOCS =
  "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7200233106.html";

export default function SelfHostDocsPage() {
  return (
    <main className="pb-16">
      <p className="mb-2 text-[#f3efe6]/45 text-xs uppercase tracking-[0.16em]">
        <Link className="hover:text-[#f3efe6]/70" href="/docs">
          Docs
        </Link>
        <span className="mx-2">/</span>
        Self-host
      </p>
      <h1
        className="font-light text-3xl tracking-tight md:text-4xl"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        Org-hosted architecture
      </h1>
      <p className="mt-3 max-w-2xl text-[#f3efe6]/65 text-sm leading-relaxed md:text-base">
        Forwardable overview for architects and security: where the app runs,
        what leaves your boundary, and how NetSuite + your LLM fit together.
        Step-by-step install stays in the{" "}
        <a
          className="text-[#f3efe6] underline underline-offset-4"
          href={OSS_GITHUB_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          GitHub README
        </a>
        .
      </p>

      <div className="prose-invert mt-10 space-y-10 text-sm leading-relaxed">
        <section className="space-y-4">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Trust boundaries
          </h2>
          <p className="text-[#f3efe6]/65">
            OpenSuiteMCP is a NetSuite MCP <em>client</em>. In an org deploy,
            you run the chat UI, auth, and data stores yourself. Tool calls go
            to NetSuite’s AI Connector; model calls go to the LLM provider you
            configure (BYOLLM).
          </p>
          <figure className="rounded-lg border border-white/10 bg-[#0c1219]/80 p-4 sm:p-5">
            <figcaption className="sr-only">
              Org users talk to OpenSuiteMCP in your VPC. The app talks to your
              chosen LLM, NetSuite AI Connector, and Postgres/Redis.
            </figcaption>
            <div className="flex flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <div className="rounded-md border border-white/15 bg-white/4 px-3 py-2.5 text-[#f3efe6]/85 text-xs sm:min-w-22">
                Org users
              </div>
              <span
                aria-hidden
                className="text-[#f3efe6]/35 text-xs sm:rotate-0"
              >
                →
              </span>
              <div className="rounded-md border border-[#4a81e8]/40 bg-[#4a81e8]/10 px-3 py-2.5 text-[#f3efe6] text-xs sm:min-w-32">
                OpenSuiteMCP
                <span className="mt-0.5 block text-[#f3efe6]/50">
                  in your VPC
                </span>
              </div>
              <span aria-hidden className="text-[#f3efe6]/35 text-xs">
                →
              </span>
              <div className="grid flex-1 gap-2 sm:max-w-xs">
                <div className="rounded-md border border-white/10 bg-white/3 px-3 py-2 text-[#f3efe6]/80 text-xs">
                  Org-chosen LLM
                </div>
                <div className="rounded-md border border-white/10 bg-white/3 px-3 py-2 text-[#f3efe6]/80 text-xs">
                  NetSuite AI Connector
                </div>
                <div className="rounded-md border border-white/10 bg-white/3 px-3 py-2 text-[#f3efe6]/80 text-xs">
                  Postgres · Redis
                </div>
              </div>
            </div>
          </figure>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Stays in-org:
              </strong>{" "}
              app process, session/auth config, Postgres (chats, settings),
              Redis, encrypted LLM API keys, encrypted NetSuite OAuth tokens,
              your OAuth client secrets for NetSuite DCR.
            </li>
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Goes to NetSuite:
              </strong>{" "}
              OAuth to AI Connector and MCP tool calls (SuiteQL, records, etc.)
              against accounts you connect — same path Oracle documents for the
              connector.
            </li>
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Goes to your LLM:
              </strong>{" "}
              chat messages, tool results returned into the session, and
              system/skill context. BYOLLM means <em>your</em> key or private
              endpoint — not a shared multi-tenant model account inside
              OpenSuiteMCP. It does not keep ERP data on-device.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Typical deploy shape
          </h2>
          <p className="text-[#f3efe6]/65">
            Most teams run the source-available app behind their reverse proxy
            with Docker Compose for Postgres, Redis, and optional SearXNG (web
            search). Production images follow the same app; hosted
            opensuitemcp.com is that product plus Google / email auth for
            evaluation — not a different NetSuite data path.
          </p>
          <p className="text-[#f3efe6]/65">
            Clone, <code className="text-[#f3efe6]/85">pnpm setup:backend</code>
            , migrate, sync skills, run. Full commands:{" "}
            <a
              className="text-[#f3efe6] underline underline-offset-4"
              href={OSS_GITHUB_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              unstackedapps/opensuitemcp
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Secrets to plan for
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>LLM provider API keys (stored encrypted in your DB)</li>
            <li>
              NetSuite OAuth access and refresh tokens (AES-256-GCM at rest,
              same <code className="text-[#f3efe6]/85">ENCRYPTION_KEY</code>)
            </li>
            <li>Postgres and Redis credentials</li>
            <li>Auth secrets (NextAuth / session)</li>
            <li>
              NetSuite Integration / DCR client material and redirect URI
              pointing at <em>your</em> callback URL
            </li>
            <li>
              Optional <code className="text-[#f3efe6]/85">GITHUB_TOKEN</code>{" "}
              for higher limits when syncing Oracle Agent Skills
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">Auth</h2>
          <p className="text-[#f3efe6]/65">
            The source-available repo uses email/password (and guest)
            credentials for sign-in. Hosted OpenSuiteMCP adds Google OAuth for
            quick trials. Put the app on your corporate IdP / SSO at the
            reverse-proxy or identity layer if that is your standard — the
            product itself does not invent a separate enterprise SSO product
            surface beyond what you deploy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Hosted vs self-host
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <strong className="font-medium text-[#f3efe6]/85">Hosted</strong>{" "}
              — poke at UX, BYOLLM, and NetSuite connect before committing
              infra. NetSuite still authenticates through AI Connector; we don’t
              warehouse ERP passwords in a black box.
            </li>
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Self-host
              </strong>{" "}
              — when policy, residency, or control requires the app stack (UI,
              DB, keys, logs) under your org. Prefer this for production
              NetSuite AI workflows with privacy or compliance review.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Who may run this
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <strong className="font-medium text-[#f3efe6]/85">Free</strong> —
              your organization self-hosts OpenSuiteMCP for <em>its own</em>{" "}
              internal NetSuite AI use (Sustainable Use License).
            </li>
            <li>
              <strong className="font-medium text-[#f3efe6]/85">Paid</strong> —
              commercial delivery, paid implementation, or paid ongoing support
              of this product — only through{" "}
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href="https://www.unstackedapps.com/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Unstacked Apps
              </a>{" "}
              (
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href="mailto:support@unstackedapps.com"
              >
                support@unstackedapps.com
              </a>
              ).
            </li>
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Not allowed
              </strong>{" "}
              — third parties charging to implement, host, white-label, or
              commercially support this codebase for someone else. See{" "}
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href={`${OSS_GITHUB_URL}/blob/main/LICENSE`}
                rel="noopener noreferrer"
                target="_blank"
              >
                LICENSE
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">Next steps</h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <Link
                className="text-[#f3efe6] underline underline-offset-4"
                href="/docs/upgrades"
              >
                Keeping up to date
              </Link>{" "}
              — post-go-live upgrades via GitHub release tags
            </li>
            <li>
              <Link
                className="text-[#f3efe6] underline underline-offset-4"
                href="/docs/netsuite-integration"
              >
                NetSuite integration
              </Link>{" "}
              — Integration record and OAuth connect
            </li>
            <li>
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href={AI_CONNECTOR_DOCS}
                rel="noopener noreferrer"
                target="_blank"
              >
                Oracle AI Connector docs
              </a>
            </li>
            <li>
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href={OSS_GITHUB_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub — install and run
              </a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
