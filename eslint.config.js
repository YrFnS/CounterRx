import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "*.config.*", "*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        console: "readonly",
        fetch: "readonly",
        Map: "readonly",
        Set: "readonly",
        Promise: "readonly",
        Date: "readonly",
        JSON: "readonly",
        Math: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        DataView: "readonly",
        Int32Array: "readonly",
        Uint8Array: "readonly",
        process: "readonly",
        import: "readonly",
        meta: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: "./tsconfig.json",
      },
    },
    settings: { react: { version: "18.2" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react/no-unused-prop-types": "off",
      "no-useless-escape": "warn",
      "preserve-caught-error": "warn",
    },
  }
);