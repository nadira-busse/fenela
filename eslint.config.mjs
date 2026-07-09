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
  ]),
  {
    // These two screens deliberately read localStorage in a useEffect and
    // set state post-mount, to avoid a server/client hydration mismatch
    // (localStorage isn't available during SSR). react-hooks/set-state-in-effect
    // flags that pattern; it's intentional here, not an oversight.
    files: ["src/app/components/CoachingScreen.tsx", "src/app/components/IntakeScreen.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
