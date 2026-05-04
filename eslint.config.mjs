import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "dist/**",
      "out/**",
      "coverage/**",
      "node_modules/**",
      ".vscode-test/**",
      "markdown-to-pdf/**",
      "publish/**",
      "reports/**",
      ".venv/**",
      "esbuild.js",
      "vitest.config.ts",
      "vitest.behavioral.config.ts",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict rules with type checking
  ...tseslint.configs.recommended,

  // Source files config
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow unused vars prefixed with _ (common pattern in VS Code extensions)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // VS Code API often requires any for flexibility
      "@typescript-eslint/no-explicit-any": "warn",

      // Allow empty functions (common in stubs/defaults)
      "@typescript-eslint/no-empty-function": "off",
    },
  },

  // Test files config — more relaxed
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Prettier must be last to override formatting rules
  eslintConfigPrettier
);
