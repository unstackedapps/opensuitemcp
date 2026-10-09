import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Dockerfile sets this; `pnpm start` installs keep the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  devIndicators: false,
  experimental: {
    ppr: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
    ],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@ai-sdk\/provider-utils/,
        message:
          /Critical dependency: the request of a dependency is an expression/,
      },
    ];
    return config;
  },
};

export default nextConfig;
