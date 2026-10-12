import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served at zinanyarko.com/speakup (the main site proxies this path here).
  basePath: "/speakup",
  // The bare netlify.app address has no page of its own; send it to the app.
  async redirects() {
    return [{ source: "/", destination: "/speakup", basePath: false, permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
