import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev overlay so it doesn't sit over the sidebar footer during demos.
  devIndicators: false,
};

export default nextConfig;
