// ESLint v9 flat config
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginImport from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parser: tseslint.parser,
      globals: {
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        Buffer: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
      },
    },
    plugins: {
      import: pluginImport,
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    rules: {
      "import/no-unresolved": "off",
      "no-useless-catch": "warn",
      "no-unreachable": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      // React hooks rules - disable exhaustive-deps for now to avoid plugin errors
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
      // Disable typed rules that require type information for now
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "no-useless-escape": "off",
    },
  },
  // JS files (do not apply TS-typed rules)
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        setObjectProperty: "readonly",
      },
    },
    plugins: {
      import: pluginImport,
    },
    rules: {
      "import/no-unresolved": "off",
      "no-useless-catch": "warn",
      "no-unreachable": "off",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/*.{ts,tsx,js}", "tests/**/*.{ts,tsx,js}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-import-assign": "off",
      "no-unreachable": "off",
      "no-unused-vars": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/prefer-as-const": "off",
    },
  },
  {
    files: ["test-memory.js"],
    rules: {
      "no-undef": "off",
    },
  },
  // Project-wide ignores (migrate from .eslintignore)
  {
    ignores: [
      "dist/",
      "build/",
      "admin/dist/",
      "node_modules/",
      "coverage/",
      "*.min.js",
      "vendor/",
      "public/",
      "opencode/",
    ],
  },
];
