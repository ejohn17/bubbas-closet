import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so file tracing ignores any
  // lockfiles in parent directories (e.g. the developer's home folder).
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
