import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Files under public/uploads that exist at boot are served by Next's static
  // handler and bypass src/app/uploads/[...path]/route.ts, so security
  // headers for user uploads must be set here to cover both paths.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
      {
        source: "/uploads/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
      {
        // SVG can embed scripts; this CSP stops them from running in the
        // app's origin when the file is opened directly. <img> rendering
        // is unaffected.
        source: "/uploads/:path(.*\\.svg)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; style-src 'unsafe-inline'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
