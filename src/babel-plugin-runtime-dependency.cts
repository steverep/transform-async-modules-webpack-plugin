import { types as t, type PluginObj, type PluginPass } from "@babel/core";

export interface RuntimeDependencyOptions {
  map: Map<string, string>;
  record?: boolean;
}

interface ThisPluginPass extends PluginPass {
  opts: RuntimeDependencyOptions;
  counter: number;
}

const ID_PREFIX = "__TAMP";

// This plugin is designed to run after transform-runtime, and operates in one
// of two modes:
// - In record mode, it just records the source request and a mangled
//   identifier for Webpack to inject in the provided map.
// - Not in record mode, it expects that Webpack has injected the recorded
//   identifiers as variable bindings, and essentially swaps the Babel import
//   for a renamed Webpack variable.
export const runtimeDependencyPlugin = (): PluginObj<ThisPluginPass> => ({
  name: "runtime-dependency",
  pre() {
    this.counter = 0;
  },
  visitor: {
    ImportDeclaration(path) {
      // Make sure we only have a single default specifier.
      if (
        path.node.specifiers.length !== 1 ||
        !t.isImportDefaultSpecifier(path.node.specifiers[0])
      ) {
        throw Error(
          `Expected only a default import specifier:\n${path.getSource()}`,
        );
      }
      const localID = path.node.specifiers[0].local.name;
      const source = path.node.source.value;
      // In record mode, just save the request and exit.
      if (this.opts.record) {
        this.opts.map.set(source, ID_PREFIX + localID);
        return;
      }
      // Find the identifier that Webpack injected for this source.
      const dependencyID = this.opts.map.get(source);
      if (!dependencyID) {
        throw Error(
          `Encountered a dependency that was not recorded: ${source}`,
        );
      }
      // Check that the dependency was declared at the top scope, rename it,
      // and delete the import.
      if (!path.scope.hasOwnBinding(dependencyID)) {
        throw Error(`Identifier ${dependencyID} was not injected by Webpack`);
      }
      path.scope.rename(dependencyID, localID);
      path.remove();
      this.counter++;
    },
  },
  post() {
    // Check that each recorded/declared dependency was renamed.
    const nDeps = this.opts.map.size;
    if (!this.opts.record && this.counter !== nDeps) {
      throw Error(
        `Injected ${nDeps} dependencies but only swapped ${this.counter} imports`,
      );
    }
  },
});
