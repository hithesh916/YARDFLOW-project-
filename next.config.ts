import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev overlay so it doesn't sit over the sidebar footer during demos.
  devIndicators: false,
  // Baseline security headers on every response. (These are broadly safe; a strict
  // Content-Security-Policy is intentionally omitted because the thermal-print flow
  // relies on inline styles/scripts written into a same-origin iframe.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
