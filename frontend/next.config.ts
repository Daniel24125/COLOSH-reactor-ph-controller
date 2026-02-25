import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // sqlite3 uses native bindings — must be excluded from the server bundle
  serverExternalPackages: ["sqlite3"],
};

export default nextConfig;
