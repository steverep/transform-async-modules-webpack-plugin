import { transformSync, type TransformOptions } from "@babel/core";
import type { Options as TransformRuntimeOptions } from "@babel/plugin-transform-runtime";
import type {
  Compiler,
  Module,
  WebpackPluginInstance,
  javascript,
} from "webpack";
import { peerDependencies } from "../package.json";
import {
  CollectImportsPlugin,
  type CollectImportsOptions,
} from "./babel-plugins.cjs";
import { TransformAsyncDependency } from "./transform-async-dependency.cjs";

type SourceMap = NonNullable<TransformOptions["inputSourceMap"]>;

export type TransformAsyncModulesPluginOptions = Pick<
  TransformOptions,
  "browserslistConfigFile" | "browserslistEnv" | "targets"
> & {
  useRuntime?:
    | Pick<TransformRuntimeOptions, "absoluteRuntime" | "version">
    | boolean;
};

const PLUGIN_NAME = "TransformAsyncModulesPlugin";
const BABEL_DEFAULTS: TransformOptions = {
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
};

export class TransformAsyncModulesPlugin implements WebpackPluginInstance {
  #babelOptions: Readonly<TransformOptions>;
  #useRuntime: boolean;
  #parsedTLAModules = new WeakSet<Module>();
  #dependencies: CollectImportsOptions["map"] = new Map();

  constructor({
    useRuntime,
    ...targetOptions
  }: TransformAsyncModulesPluginOptions = {}) {
    this.#useRuntime = Boolean(useRuntime);
    this.#babelOptions = {
      ...targetOptions,
      ...BABEL_DEFAULTS,
      plugins: this.#useRuntime
        ? [
            [
              "@babel/plugin-transform-runtime",
              {
                version: peerDependencies["@babel/runtime"],
                ...(typeof useRuntime === "object" ? useRuntime : {}),
              } satisfies TransformRuntimeOptions,
            ],
          ]
        : [],
    };
  }

  apply(compiler: Compiler) {
    // Ignore the warning that environment won't support async
    (compiler.options.ignoreWarnings ??= []).push(
      (warning) => warning.name === "EnvironmentNotSupportAsyncWarning",
    );

    // If using Babel runtime, apply the hooks to create the necessary
    // dependencies.  These must be applied after internal plugins so that
    // async modules are flagged and top level await support is checked first.
    // The required dependencies are found by transpiling a simple test with
    // the provided targets and collecting the injected imports.
    if (this.#useRuntime) {
      this.#getDependencies();
      const logger = compiler.getInfrastructureLogger(PLUGIN_NAME);
      logger.debug("Found the following dependencies:", this.#dependencies);
      compiler.hooks.afterPlugins.tap(PLUGIN_NAME, this.#applyDependencyHooks);
    }

    // Apply the hook to transform async modules with Babel.  This must be done
    // before internal plugins in order to support "eval" dev tool options.
    this.#applyTransformHooks(compiler);
  }

  #getDependencies() {
    transformSync("async function foo() {};", {
      ...this.#babelOptions,
      plugins: [
        ...this.#babelOptions.plugins!,
        [
          CollectImportsPlugin,
          { map: this.#dependencies } satisfies CollectImportsOptions,
        ],
      ],
    });
  }

  #applyDependencyHooks = (compiler: Compiler) => {
    const { requestShortener } = compiler;
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
                  parser.state.module.readableIdentifier(requestShortener),
                );
                this.#parsedTLAModules.add(parser.state.module);
                this.#addDependenciesToModule(parser.state.module);
              });
            });
        }

        // Async modules are flagged internally after all are built, so we get
        // the list, add the dependencies to each, and rebuild them (excluding
        // those already handled in the parser).
        compilation.hooks.finishModules.tapPromise(
          PLUGIN_NAME,
          async (modules) => {
            const remainingAsyncModules = Array.from(modules).filter(
              (m) =>
                compilation.moduleGraph.isAsync(m) &&
                !this.#parsedTLAModules.has(m),
            );
            logger.debug(
              "Adding dependencies and rebuild for",
              `${remainingAsyncModules.length} remaining async modules\n`,
              remainingAsyncModules
                .map((m) => m.readableIdentifier(requestShortener))
                .join("\n"),
            );
            remainingAsyncModules.forEach(this.#addDependenciesToModule);
            await Promise.all(
              remainingAsyncModules.map(
                (m) =>
                  new Promise((resolve, reject) =>
                    compilation.rebuildModule(m, (err, result) =>
                      err ? reject(err) : resolve(result),
                    ),
                  ),
              ),
            );
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
          const { code, map } = transformSync(origCode as string, {
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
