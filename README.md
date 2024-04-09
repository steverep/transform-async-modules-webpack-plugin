# Transform Async Modules Webpack Plugin

[![NPM Version](https://img.shields.io/npm/v/transform-async-modules-webpack-plugin)](https://www.npmjs.com/package/transform-async-modules-webpack-plugin)

## What it solves

[Webpack](https://webpack.js.org) converts uses of top level `await` expressions into modules that are wrapped in an `async function`. Since transpilation usually happens when modules are loaded, the resulting chunks still contain these wrappers. Thus they are not compatible with legacy browsers or other environments that do not support ES2017 or later.

## How it works

The plugin works by transforming async modules using [Babel](https://babeljs.io) right before they are ready to be written to a chunk. It is expected that modules are already transpiled (e.g. by using [`babel-loader`](https://www.npmjs.com/package/babel-loader)), so the primary transformations occurring are simply to the `async function`:

1. [`@babel/plugin-transform-async-to-generator`](https://babeljs.io/docs/babel-plugin-transform-async-to-generator) to convert to a generator function, and
2. [`@babel/plugin-transform-regenerator`](https://babeljs.io/docs/babel-plugin-transform-regenerator) to convert the ES2015 generator

Whether or not each transformation happens will depend on the target browsers passed to the plugin.

Any `devTool` (source maps) option used in Webpack is supported. This includes "eval" options as the transform occurs right before the modules are wrapped in `eval()`.

## Usage

Install the package from NPM and require or import it for your Webpack configuration:

```js
const {
  TransformAsyncModulesPlugin,
} = require("transform-async-modules-webpack-plugin");
```

or

```js
import { TransformAsyncModulesPlugin } from "transform-async-modules-webpack-plugin";
```

Then add an instance to the plugins array:

```js
export default {
  // ... other Webpack config
  plugins: [
    // ... other plugins
    new TransformAsyncModulesPlugin(options),
  ],
};
```

## Options

The plugin takes the following options, all of which are optional:

```ts
interface TransformAsyncModulesPluginOptions {
  targets?: Targets;
  browserslistConfigFile?: boolean;
  browserslistEnv?: string;
  runtime?: boolean | RuntimeOptions;
}
```

### targets, browserslistConfigFile, and browserslistEnv

Controls how the async modules will be transpiled. These properties are a subset of [Babel options to specify targets](https://babeljs.io/docs/options#output-targets), and are passed directly to Babel.

### runtime

Allows importing helpers and regenerator from `@babel/runtime` instead of repeating them for each async module. If it is falsey, the runtime will not be used. This option takes a subset of relevant [options for `@babel/plugin-transform-runtime`](https://babeljs.io/docs/babel-plugin-transform-runtime#options):

```ts
interface RuntimeOptions {
  absoluteRuntime?: boolean | string;
  version?: string;
}
```

The default for `version` is the minimum required version for the plugin, so it is recommended this property be specified as the version installed when using the runtime.
