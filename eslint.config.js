// @ts-check
import eslintJS from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import eslintTS from "typescript-eslint";

const allFiles = "**/*.?(c|m){js,ts}";
const jsFiles = "**/*.?(c|m)js";
const commonFiles = "**/*.c{js,ts}";

export default eslintTS.config(
  { ignores: [".yarn/", ".pnp.*", "**/dist/"] },
  {
    files: [allFiles],
    extends: [
      eslintJS.configs.recommended,
      ...eslintTS.configs.recommendedTypeChecked,
      ...eslintTS.configs.stylisticTypeChecked,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.nodeBuiltin,
      parser: eslintTS.parser,
      parserOptions: {
        allowAutomaticSingleRunInference: true,
        ecmaVersion: "latest",
        projectService: true,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  {
    files: [jsFiles],
    extends: [eslintTS.configs.disableTypeChecked],
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
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
);
