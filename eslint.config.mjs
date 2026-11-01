import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored registry code (shadcn/ui, Kokonut UI), added via `npx shadcn add`.
    // It is owned upstream; lint the app code that uses it, not its internals.
    "src/components/ui/**",
    "src/components/kokonutui/**",
    "src/hooks/use-mobile.ts",
  ]),
]);

export default eslintConfig;
