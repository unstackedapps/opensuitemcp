import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Upgrades",
  description:
    "How to update a self-hosted OpenSuiteMCP deployment using GitHub release tags, skills sync, and migrations.",
};

const RELEASES_URL = "https://github.com/unstackedapps/opensuitemcp/releases";
const CHANGELOG_URL =
  "https://github.com/unstackedapps/opensuitemcp/blob/main/CHANGELOG.md";
const SUPPORT_EMAIL = "support@unstackedapps.com";
const COMPANY_URL = "https://www.unstackedapps.com/";

export default function UpgradesDocsPage() {
  return (
    <main className="pb-16">
      <p className="mb-2 text-[#f3efe6]/45 text-xs uppercase tracking-[0.16em]">
        <Link className="hover:text-[#f3efe6]/70" href="/docs">
          Docs
        </Link>
        <span className="mx-2">/</span>
        Upgrades
      </p>
      <h1
        className="font-light text-3xl tracking-tight md:text-4xl"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        Keeping OpenSuiteMCP up to date
      </h1>
      <p className="mt-3 max-w-2xl text-[#f3efe6]/65 text-sm leading-relaxed md:text-base">
        After go-live on your infra, you choose when to take app updates. Prefer
        GitHub release tags over tracking{" "}
        <code className="text-[#f3efe6]/85">main</code>. This page is the
        forwardable runbook for IT.
      </p>

      <div className="prose-invert mt-10 space-y-10 text-sm leading-relaxed">
        <section className="space-y-4">
          <h2 className="font-medium text-[#f3efe6] text-lg">Flow</h2>
          <figure className="rounded-lg border border-white/10 bg-[#0c1219]/80 p-4 sm:p-5">
            <figcaption className="sr-only">
              Checkout a GitHub release tag, sync Oracle skills, migrate the
              database, then rebuild and restart the app.
            </figcaption>
            <ol className="flex flex-col gap-2 text-[#f3efe6]/80 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2">
              <li className="rounded-md border border-white/15 bg-white/4 px-3 py-2">
                GitHub release tag
              </li>
              <li aria-hidden className="hidden text-[#f3efe6]/35 sm:inline">
                →
              </li>
              <li className="rounded-md border border-white/15 bg-white/4 px-3 py-2">
                git fetch / checkout
              </li>
              <li aria-hidden className="hidden text-[#f3efe6]/35 sm:inline">
                →
              </li>
              <li className="rounded-md border border-[#4a81e8]/40 bg-[#4a81e8]/10 px-3 py-2 text-[#f3efe6]">
                pnpm skills:sync
              </li>
              <li aria-hidden className="hidden text-[#f3efe6]/35 sm:inline">
                →
              </li>
              <li className="rounded-md border border-white/15 bg-white/4 px-3 py-2">
                pnpm db:migrate
              </li>
              <li aria-hidden className="hidden text-[#f3efe6]/35 sm:inline">
                →
              </li>
              <li className="rounded-md border border-white/15 bg-white/4 px-3 py-2">
                rebuild · restart
              </li>
            </ol>
          </figure>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            Before you upgrade
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              Pick a tag from{" "}
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href={RELEASES_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub Releases
              </a>
              . Prefer tags over <code className="text-[#f3efe6]/85">main</code>
              .
            </li>
            <li>
              Read the{" "}
              <a
                className="text-[#f3efe6] underline underline-offset-4"
                href={CHANGELOG_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                CHANGELOG
              </a>{" "}
              and release notes for breaking changes.
            </li>
            <li>
              Backup Postgres and your env files (
              <code className="text-[#f3efe6]/85">.env.local</code>,{" "}
              <code className="text-[#f3efe6]/85">docker/.env</code>).
            </li>
            <li>
              Optional but recommended: promote the tag on a non-prod clone
              first, then production.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">Upgrade steps</h2>
          <p className="text-[#f3efe6]/65">
            From your app checkout (adjust the tag):
          </p>
          <pre className="overflow-x-auto rounded-md border border-white/10 bg-[#0c1219] px-3 py-3 font-mono text-[#f3efe6]/85 text-xs leading-relaxed">
            {`git fetch --tags origin
git checkout v4.0.0   # or the tag you chose
pnpm install
pnpm skills:sync
pnpm db:migrate
# rebuild / restart your process (pnpm build && pnpm start, or your Compose image)`}
          </pre>
          <p className="text-[#f3efe6]/65">
            If you deploy from a private branch, merge or rebase that tag into
            the branch your pipeline builds, then run the same install → sync →
            migrate → rebuild sequence in CI or on the host.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">Smoke check</h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>Sign in</li>
            <li>NetSuite status chip shows connected</li>
            <li>Run a simple SuiteQL (or other MCP tool) in chat</li>
            <li>Skills panel lists the Oracle pack after sync</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            What does not need an app release
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Oracle SuiteCloud Agent Skills
              </strong>{" "}
              — <code className="text-[#f3efe6]/85">pnpm skills:sync</code> (or
              weekly cron / production entrypoint)
            </li>
            <li>
              <strong className="font-medium text-[#f3efe6]/85">
                Companion prompts
              </strong>{" "}
              — load live from your NetSuite account
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">
            What stays yours
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>LLM API keys</li>
            <li>NetSuite Integration / DCR client and redirect URI</li>
            <li>Postgres data (chats, settings, encrypted keys)</li>
            <li>Auth and infrastructure secrets</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">Need help?</h2>
          <p className="text-[#f3efe6]/65">
            Hands-on upgrade or enterprise support for this product is available
            from{" "}
            <a
              className="text-[#f3efe6] underline underline-offset-4"
              href={COMPANY_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Unstacked Apps
            </a>{" "}
            (
            <a
              className="text-[#f3efe6] underline underline-offset-4"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
            ). Third parties may not charge to implement or commercially support
            this codebase — see{" "}
            <Link
              className="text-[#f3efe6] underline underline-offset-4"
              href="/docs/self-host"
            >
              Who may run this
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-[#f3efe6] text-lg">Related</h2>
          <ul className="list-disc space-y-2 pl-5 text-[#f3efe6]/65">
            <li>
              <Link
                className="text-[#f3efe6] underline underline-offset-4"
                href="/docs/self-host"
              >
                Org-hosted architecture
              </Link>
            </li>
            <li>
              <Link
                className="text-[#f3efe6] underline underline-offset-4"
                href="/docs/netsuite-integration"
              >
                NetSuite integration
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
