import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native packages - excluded from the Next.js server bundle
  serverExternalPackages: ["sqlite3", "exceljs"],
};

export default nextConfig;
