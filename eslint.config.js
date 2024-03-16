import { FlatCompat } from "@eslint/eslintrc";
import eslintJS from "@eslint/js";
import typescriptParser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import { dirname } from "path";
import { fileURLToPath } from "url";

const allFiles = "**/*.?(c|m){js,ts}";
const jsFiles = "**/*.?(c|m)js";
const commonFiles = "**/*.c{js,ts}";

const rootDir = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: rootDir });

export default [
  { ignores: [".yarn/", ".pnp.*", "dist/"] },
  { files: [allFiles], ...eslintJS.configs.recommended },
  ...compat
    .extends(
      "plugin:@typescript-eslint/recommended-type-checked",
      "plugin:@typescript-eslint/stylistic-type-checked",
    )
    .map((config) => ({ files: [allFiles], ...config })),
  ...compat
    .extends("plugin:@typescript-eslint/disable-type-checked")
    .map((config) => ({ files: [jsFiles], ...config })),
  { files: [allFiles], ...eslintConfigPrettier },
  {
    files: [allFiles],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.nodeBuiltin,
      // Options specific to @typescript-eslint/parser
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        project: "tsconfig.json",
        tsconfigRootDir: rootDir,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  {
    files: [commonFiles],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.commonjs,
    },
  },
  {
    files: ["test/**/*.spec.?(c|m)ts"],
    languageOptions: { globals: globals.mocha },
  },
];
