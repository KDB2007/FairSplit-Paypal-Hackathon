import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: the repo lives inside a parent folder with its
    // own lockfile, which otherwise triggers a "package-lock.json outside the
    // Git root" warning on every dev boot.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;