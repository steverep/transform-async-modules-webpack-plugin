import { transformSync, type TransformOptions } from "@babel/core";
import type { Compiler, NormalModule } from "webpack";

type SourceMap = NonNullable<TransformOptions["inputSourceMap"]>;

export type TransformAsyncModulesPluginOptions = Pick<
  TransformOptions,
  "browserslistConfigFile" | "browserslistEnv" | "targets"
>;

const PLUGIN_NAME = "TransformAsyncModulesPlugin " as const;

export class TransformAsyncModulesPlugin {
  babelOptions: TransformOptions = {};

  constructor(options: TransformAsyncModulesPluginOptions = {}) {
    this.babelOptions = {
      ...options,
      babelrc: false,
      configFile: false,
      compact: false,
      presets: ["@babel/preset-env"],
      plugins: undefined,
      sourceMaps: true,
    };
  }

  apply(compiler: Compiler) {
    // Ignore the warning that environment won't support async
    (compiler.options.ignoreWarnings ??= []).push(
      (warning) => warning.name === "EnvironmentNotSupportAsyncWarning",
    );

    // Pull some classes from the compiler's Webpack instance
    const { SourceMapSource } = compiler.webpack.sources;
    const { JavascriptModulesPlugin } = compiler.webpack.javascript;

    // Tap the module rendering to apply the Babel transforms
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      const hooks = JavascriptModulesPlugin.getCompilationHooks(compilation);
      hooks.renderModuleContent.tap(
        PLUGIN_NAME,
        (source, module, { moduleGraph }) => {
          if (!moduleGraph.isAsync(module)) {
            return source;
          }
          const { source: origCode, map: origMap } = source.sourceAndMap();
          const { code, map } = transformSync(origCode as string, {
            ...this.babelOptions,
            filename: (module as NormalModule).userRequest,
            inputSourceMap: (origMap as SourceMap | null) ?? undefined,
          })!;
          // @ts-expect-error _name is incorrectly missing from type
          return new SourceMapSource(code!, source._name as string, map!);
        },
      );
    });
  }
}
