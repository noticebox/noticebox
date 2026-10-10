import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The hosted form page and the OAuth authorize page are never framed: a page of another site must not
  // overlay a "Send" or "Allow" click.
  headers: async () => [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }],
  // noticebox doesn't use next/image, so leave out sharp and its LGPL libvips binaries.
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**"],
  },
};

export default nextConfig;
