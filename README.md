# Transform Async Modules Webpack Plugin

## What it solves

[Webpack](https://webpack.js.org) converts uses of top level `await` expressions into modules that are wrapped in an `async function`. Since transpilation usually happens when modules are loaded, the resulting chunks still contain these wrappers. Thus they are not compatible with legacy browsers or other environments that do not support ES2017 or later.

## How it works

The plugin works by transforming async modules using [`@babel/preset-env`](https://babeljs.io/docs/babel-preset-env) right before they are ready to be written to a chunk. It is expected that modules are already transpiled using [`babel-loader`](https://www.npmjs.com/package/babel-loader), so the primary transformations occurring are simply to the `async function`:

1. [`@babel/plugin-transform-async-to-generator`](https://babeljs.io/docs/babel-plugin-transform-async-to-generator) to convert to a generator function, and
2. [`@babel/plugin-transform-regenerator`](https://babeljs.io/docs/babel-plugin-transform-regenerator) to convert the ES2015 generator

Whether or not each transformation happens will depend on the target browsers passed to the plugin.

Any `devTool` (source maps) option used in Webpack is supported. This includes "eval" options as the transform occurs right before the modules are wrapped in `eval()`.

## Usage

Install the package from NPM and require or import it for your Webpack configuration:

```js
const TransformAsyncModulesPlugin = require("transform-async-modules-webpack-plugin");
```

or

```js
import TransformAsyncModulesPlugin from "transform-async-modules-webpack-plugin";
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

The options passed to the plugin are optional. Properties are a subset of [Babel options to specify targets](https://babeljs.io/docs/options#output-targets), and are passed directly to the transform function.

```ts
interface TransformAsyncModulesPluginOptions {
  targets?: Targets; // see Babel docs for details
  browserslistConfigFile?: boolean;
  browserslistEnv?: string;
}
```
