import {
  transformSync as babelTransform,
  createConfigItem,
  loadPartialConfig,
  type TransformOptions as BabelOptions,
} from "@babel/core";
import type { Options as BabelRuntimeOptions } from "@babel/plugin-transform-runtime";
import type {
  Compiler,
  Module,
  WebpackPluginInstance,
  javascript,
} from "webpack";
import { peerDependencies } from "../package.json";
import {
  runtimeDependencyPlugin,
  type RuntimeDependencyOptions,
} from "./babel-plugin-runtime-dependency.cjs";
import { TransformAsyncDependency } from "./transform-async-dependency.cjs";

type SourceMap = NonNullable<BabelOptions["inputSourceMap"]>;

export type TransformAsyncModulesPluginOptions = Pick<
  BabelOptions,
  "browserslistConfigFile" | "browserslistEnv" | "targets"
> & {
  runtime?: Pick<BabelRuntimeOptions, "absoluteRuntime" | "version"> | boolean;
};

const PLUGIN_NAME = "TransformAsyncModulesPlugin";
const BABEL_DEFAULTS: Readonly<BabelOptions> = {
  caller: {
    name: PLUGIN_NAME,
    supportsStaticESM: true,
    supportsDynamicImport: true,
    supportsTopLevelAwait: true,
    supportsExportNamespaceFrom: true,
  },
  babelrc: false,
  configFile: false,
  compact: false,
  sourceMaps: true,
  presets: ["@babel/preset-env"],
  // A destructured assignment added by Webpack is also transpiled, which we can
  // safely assume is an array.  Otherwise, Babel will introduce an extra
  // unrecorded helper whenever an async module has multiple async dependencies.
  // https://github.com/webpack/webpack/blob/be1d35eb02bbedb05ca6ac846fec38a563dcd47f/lib/async-modules/AwaitDependenciesInitFragment.js#L64-L69
  assumptions: { iterableIsArray: true },
};

export class TransformAsyncModulesPlugin implements WebpackPluginInstance {
  #babelOptions: Readonly<BabelOptions>;
  #useRuntime: boolean;
  #parsedTLAModules = new WeakSet<Module>();
  #dependencies = new Map<string, string>();

  constructor({
    runtime,
    ...targetOptions
  }: TransformAsyncModulesPluginOptions = {}) {
    this.#useRuntime = Boolean(runtime);
    const config = loadPartialConfig({
      ...targetOptions,
      ...BABEL_DEFAULTS,
      plugins: this.#useRuntime
        ? [
            [
              "@babel/plugin-transform-runtime",
              {
                version: peerDependencies["@babel/runtime"],
                ...(typeof runtime === "object" ? runtime : {}),
              } satisfies BabelRuntimeOptions,
            ],
          ]
        : [],
    });
    this.#babelOptions = config!.options;
  }

  apply(compiler: Compiler) {
    // Ignore the warning that environment won't support async
    (compiler.options.ignoreWarnings ??= []).push(
      (warning) => warning.name === "EnvironmentNotSupportAsyncWarning",
    );

    // Apply the hook to transform async modules with Babel.  This must be done
    // before internal plugins in order to support "eval" dev tool options.
    this.#applyTransformHooks(compiler);

    // If using Babel runtime, apply the hooks to create the necessary
    // dependencies.  These must be applied after internal plugins so that
    // async modules are flagged and top level await support is checked first.
    // The required dependencies are found by transpiling a simple test with
    // the provided targets and collecting the injected imports.
    if (!this.#useRuntime) return;
    const logger = compiler.getInfrastructureLogger(PLUGIN_NAME);
    this.#getDependencies();
    logger.debug("Found the following dependencies:\n", this.#dependencies);
    if (this.#dependencies.size === 0) return;
    this.#babelOptions.plugins!.push(
      createConfigItem([
        runtimeDependencyPlugin,
        { map: this.#dependencies } satisfies RuntimeDependencyOptions,
      ]),
    );
    compiler.hooks.afterPlugins.tap(PLUGIN_NAME, this.#applyDependencyHooks);
  }

  #getDependencies() {
    babelTransform("async function foo() {};", {
      ...this.#babelOptions,
      plugins: this.#babelOptions.plugins!.concat(
        createConfigItem([
          runtimeDependencyPlugin,
          {
            map: this.#dependencies,
            record: true,
          } satisfies RuntimeDependencyOptions,
        ]),
      ),
    });
  }

  #applyDependencyHooks = (compiler: Compiler) => {
    const { requestShortener: shortener } = compiler;
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        // Register the dependency to create modules and apply the template
        compilation.dependencyFactories.set(
          TransformAsyncDependency,
          normalModuleFactory,
        );
        compilation.dependencyTemplates.set(
          TransformAsyncDependency,
          new TransformAsyncDependency.Template(),
        );

        // Add dependencies for modules with top level await.  This can be done
        // during parsing to avoid rebuilding.
        const logger = compilation.getLogger(PLUGIN_NAME);
        for (const key of ["javascript/auto", "javascript/esm"]) {
          normalModuleFactory.hooks.parser
            .for(key)
            .tap(PLUGIN_NAME, (parser: javascript.JavascriptParser) => {
              parser.hooks.topLevelAwait.tap(PLUGIN_NAME, () => {
                if (this.#parsedTLAModules.has(parser.state.module)) {
                  // Ignore multiple TLA occurrences in a module.
                  return;
                }
                logger.debug(
                  "Adding dependencies for top level await parsed in",
                  parser.state.module.readableIdentifier(shortener),
                );
                this.#parsedTLAModules.add(parser.state.module);
                this.#addDependenciesToModule(parser.state.module);
              });
            });
        }

        // Async modules are flagged internally after all modules are built,
        // and thus their dependencies have already been processed.  This means
        // that for each async module, excluding those already handled while
        // parsing, we need to add the dependencies and then invalidate and
        // reprocess all of its dependencies.
        compilation.hooks.finishModules.tapPromise(
          PLUGIN_NAME,
          async (modules) => {
            const identifiers = [];
            const processes = [];
            for (const m of modules) {
              if (
                compilation.moduleGraph.isAsync(m) &&
                !this.#parsedTLAModules.has(m)
              ) {
                identifiers.push(m.readableIdentifier(shortener));
                processes.push(
                  new Promise((resolve, reject) => {
                    this.#addDependenciesToModule(m);
                    compilation.processDependenciesQueue.invalidate(m);
                    compilation.processModuleDependencies(m, (err, result) =>
                      err ? reject(err) : resolve(result),
                    );
                  }),
                );
              }
            }
            logger.debug(
              `Adding dependencies for ${identifiers.length} more modules:\n` +
                identifiers.sort().join("\n"),
            );
            await Promise.all(processes);
          },
        );
      },
    );
  };

  #addDependenciesToModule = (module: Module) => {
    for (const [request, identifier] of this.#dependencies.entries()) {
      module.addDependency(
        new TransformAsyncDependency(request, identifier, ["default"]),
      );
    }
  };

  #applyTransformHooks = (compiler: Compiler) => {
    const { SourceMapSource } = compiler.webpack.sources;
    const { JavascriptModulesPlugin } = compiler.webpack.javascript;
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      // Tap the module rendering to apply the Babel transforms
      const logger = compilation.getLogger(PLUGIN_NAME);
      const hooks = JavascriptModulesPlugin.getCompilationHooks(compilation);
      hooks.renderModuleContent.tap(
        PLUGIN_NAME,
        (source, module, { chunk, moduleGraph }) => {
          if (!moduleGraph.isAsync(module)) {
            return source;
          }
          const filename = module.readableIdentifier(compiler.requestShortener);
          const chunkID = chunk.name ?? chunk.id;
          logger.debug(`Transforming module ${filename} for chunk ${chunkID}`);
          const { source: origCode, map: origMap } = source.sourceAndMap();
          const { code, map } = babelTransform(origCode as string, {
            ...this.#babelOptions,
            filename,
            inputSourceMap: (origMap as SourceMap | null) ?? undefined,
          })!;
          // @ts-expect-error _name is incorrectly missing from type
          return new SourceMapSource(code!, source._name as string, map!);
        },
      );
    });
  };
}
