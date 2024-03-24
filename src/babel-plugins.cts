import babel = require("@babel/core");
import type { PluginObj } from "@babel/core";

export interface CollectImportsOptions {
  map: Map<string, string>;
}

export const CollectImportsPlugin = ({
  types: t,
}: typeof babel): PluginObj => ({
  name: "collect-imports",
  visitor: {
    ImportDeclaration({ node }, { opts }) {
      if (
        node.specifiers.length !== 1 ||
        !t.isImportDefaultSpecifier(node.specifiers[0])
      ) {
        throw Error("Expected only 1 default specifier for import");
      }
      (opts as CollectImportsOptions).map.set(
        node.source.value,
        node.specifiers[0].local.name,
      );
    },
  },
});
