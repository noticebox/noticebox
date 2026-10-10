import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The frontend/backend boundary, as in notefeed: the frontend imports the backend only through @/backend, and
// backend/ is framework-free.
const FRONTEND_IMPORTS = {
  patterns: [{ group: ["@/backend/*", "**/backend/*"], message: "The frontend imports the backend only through @/backend (backend/index.ts)." }],
};
const BACKEND_IMPORTS = {
  paths: ["next", "react", "react-dom"].map((name) => ({ name, message: "backend/ is framework-free." })),
  patterns: [
    { group: ["next/*", "react/*", "react-dom/*"], message: "backend/ is framework-free." },
    { group: ["@/app/*", "@/proxy", "**/app/*"], message: "backend/ never imports the frontend." },
    { group: ["@/backend", "@/backend/*"], message: "Inside backend/, use relative imports." },
  ],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["app/**", "proxy.ts"], ignores: ["**/*.test.ts"], rules: { "no-restricted-imports": ["error", FRONTEND_IMPORTS] } },
  { files: ["backend/**"], rules: { "no-restricted-imports": ["error", BACKEND_IMPORTS] } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", ".venv-docs/**", "site/**", ".e2e/**"]),
]);
