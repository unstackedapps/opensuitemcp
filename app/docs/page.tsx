import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Guides for connecting NetSuite, SuiteCloud Agent Skills, BYOLLM, and self-hosting OpenSuiteMCP.",
};

const DOCS = [
  {
    href: "/docs/netsuite-integration",
    title: "NetSuite integration",
    description:
      "Prerequisites, Integration record checklist, OAuth connect, and Oracle SuiteApp notes.",
    ready: true,
  },
  {
    href: "#",
    title: "SuiteCloud Agent Skills",
    description: "How skills sync into chat — coming soon.",
    ready: false,
  },
  {
    href: "#",
    title: "BYOLLM providers",
    description:
      "Bring your own OpenAI, Anthropic, or Google key — coming soon.",
    ready: false,
  },
  {
    href: "/docs/self-host",
    title: "Org-hosted architecture",
    description:
      "Trust boundaries, deploy shape, licensing, and when to self-host vs use hosted — for architects and security.",
    ready: true,
  },
  {
    href: "/docs/upgrades",
    title: "Upgrades",
    description:
      "Post-go-live updates via GitHub release tags, skills sync, and migrations.",
    ready: true,
  },
] as const;

export default function DocsIndexPage() {
  return (
    <main>
      <p className="mb-2 text-[#f3efe6]/45 text-xs uppercase tracking-[0.16em]">
        Documentation
      </p>
      <h1
        className="font-light text-3xl tracking-tight md:text-4xl"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        OpenSuiteMCP docs
      </h1>
      <p className="mt-3 max-w-2xl text-[#f3efe6]/65 text-sm leading-relaxed md:text-base">
        Start with NetSuite setup. More guides will land here as we grow the
        hosted product.
      </p>

      <ul className="mt-10 space-y-3">
        {DOCS.map((doc) => (
          <li key={doc.title}>
            {doc.ready ? (
              <Link
                className="block rounded-lg border border-white/10 bg-white/3 px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/5"
                href={doc.href}
              >
                <p className="font-medium text-[#f3efe6]">{doc.title}</p>
                <p className="mt-1 text-[#f3efe6]/55 text-sm">
                  {doc.description}
                </p>
              </Link>
            ) : (
              <div className="rounded-lg border border-white/5 bg-white/2 px-4 py-4 opacity-70">
                <p className="font-medium text-[#f3efe6]/80">{doc.title}</p>
                <p className="mt-1 text-[#f3efe6]/45 text-sm">
                  {doc.description}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
