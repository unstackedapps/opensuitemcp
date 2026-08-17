import {
  type IPeer,
  Peer,
  Port,
  type SecurityGroup,
} from "aws-cdk-lib/aws-ec2";
import { CLOUDFLARE_IPV4_CIDRS, CLOUDFLARE_IPV6_CIDRS } from "./cloudflare-ips";
import { envString } from "./env";

export const ORIGIN_INGRESS_MODES = ["public", "cloudflare", "cidrs"] as const;
export type OriginIngressMode = (typeof ORIGIN_INGRESS_MODES)[number];

type HttpsPeer = {
  peer: IPeer;
  cidr: string;
  description: string;
};

export function originIngressMode(
  raw = process.env.ORIGIN_INGRESS_MODE,
): OriginIngressMode {
  const value = (raw?.trim() || "public").toLowerCase();
  if (value === "public" || value === "cloudflare" || value === "cidrs") {
    return value;
  }
  throw new Error(
    `ORIGIN_INGRESS_MODE must be public, cloudflare, or cidrs (got ${raw})`,
  );
}

export function httpsIngressPeers(mode = originIngressMode()): HttpsPeer[] {
  if (mode === "public") {
    return [
      {
        peer: Peer.anyIpv4(),
        cidr: "0.0.0.0/0",
        description: "HTTPS",
      },
    ];
  }

  if (mode === "cloudflare") {
    return [
      ...CLOUDFLARE_IPV4_CIDRS.map((cidr) => ({
        peer: Peer.ipv4(cidr),
        cidr,
        description: `HTTPS from Cloudflare ${cidr}`,
      })),
      ...CLOUDFLARE_IPV6_CIDRS.map((cidr) => ({
        peer: Peer.ipv6(cidr),
        cidr,
        description: `HTTPS from Cloudflare ${cidr}`,
      })),
    ];
  }

  return parseAllowedHttpsCidrs().map((cidr) => ({
    peer: cidr.includes(":") ? Peer.ipv6(cidr) : Peer.ipv4(cidr),
    cidr,
    description: `HTTPS from ${cidr}`,
  }));
}

export function addOriginIngress(sg: SecurityGroup): OriginIngressMode {
  const mode = originIngressMode();
  sg.addIngressRule(Peer.anyIpv4(), Port.tcp(80), "HTTP for ACME");
  for (const rule of httpsIngressPeers(mode)) {
    sg.addIngressRule(rule.peer, Port.tcp(443), rule.description);
  }
  return mode;
}

function parseAllowedHttpsCidrs(): string[] {
  const raw = envString("ALLOWED_HTTPS_CIDRS", "");
  const cidrs = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (cidrs.length === 0) {
    throw new Error(
      "ORIGIN_INGRESS_MODE=cidrs requires ALLOWED_HTTPS_CIDRS (comma-separated CIDRs)",
    );
  }
  return cidrs;
}
