import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const featureModules = [
  "auth",
  "groups",
  "checkins",
  "gamification",
  "social",
  "notifications",
  "recovery",
  "profile",
  "admin",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Full jsx-a11y recommended set (eslint-config-next enables only a few rules).
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": "error",
      // Module boundaries (CLAUDE.md §5): use another module only through its index.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: featureModules.flatMap((m) => [`@/features/${m}/*`, `!@/features/${m}/ui`]),
              message:
                "Import a feature module through its public entry points: '@/features/<module>' (server API) or '@/features/<module>/ui' (components).",
            },
          ],
        },
      ],
    },
  },
  {
    // Every user-facing string lives in messages/*.json (CLAUDE.md §15).
    files: ["src/**/*.tsx"],
    ignores: ["src/**/*.test.tsx", "src/test/**"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ["·", "|", "/", ":"] }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    ".lighthouseci/**",
    "coverage/**",
    "data/**",
  ]),
]);
