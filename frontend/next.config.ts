import path from "path";
import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  // PDF / link extraction can take 60-90s for long datasheets. The default
  // rewrite proxy timeout (30s) cut those requests off while the backend
  // kept working, so the UI showed an error even though the import succeeded.
  experimental: {
    proxyTimeout: 5 * 60 * 1000,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
      {
        source: "/files/:path*",
        destination: `${API_URL}/files/:path*`,
      },
    ];
  },
};

export default nextConfig;
