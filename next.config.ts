import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so file tracing ignores any
  // lockfiles in parent directories (e.g. the developer's home folder).
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  // Keep the Firebase Admin SDK out of the bundle; it's a Node-only server dep.
  serverExternalPackages: ["firebase-admin"],
  // Match Firebase App Hosting's server output so missing traced files
  // show up in local builds the same way they do in Cloud Build.
  output: "standalone",
  // next@16.3.1 + @swc/helpers@0.5.23: Node 22+/24 resolves the
  // module-sync ESM helpers, but standalone tracing copied only CJS.
  // App Hosting then dies at boot with MODULE_NOT_FOUND for
  // @swc/helpers/esm/_interop_require_default.js.
  // https://github.com/vercel/next.js/issues/97358
  // Remove once a future Next no longer needs this.
  outputFileTracingIncludes: {
    "*": [
      "./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**",
      "./node_modules/.pnpm/next@*/node_modules/@swc/helpers/esm/**",
    ],
  },
};

export default nextConfig;
