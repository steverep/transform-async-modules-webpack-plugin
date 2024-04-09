import { expect } from "chai";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TransformAsyncModulesPlugin } from "transform-async-modules-webpack-plugin";
import webpack from "webpack";

type GoodbyeEntry = typeof import("./src/simple.js");

const require = createRequire(import.meta.url);
const { devDependencies } =
  require("../package.json") as typeof import("../package.json");
const context = fileURLToPath(new URL(".", import.meta.url));
const ENTRY_NAMES = ["simple", "chained"] as const;
const CHUNK_CHECKS = { goodbye: 1, parent: 2 } as const;

const numMatchesTest = (file: string, pattern: RegExp, nMatches: number) =>
  async function () {
    const code = await readFile(file, "utf-8");
    expect(code.match(new RegExp(pattern, "g"))?.length).to.equal(nMatches);
  };

for (const runtime of [false, { version: devDependencies["@babel/runtime"] }]) {
  const dashRuntime = runtime ? "-runtime" : "";
  for (const nodeVersion of [8, 6, 0.12]) {
    describe(`Goodbye delay with node ${nodeVersion} target${runtime ? " using runtime" : ""}`, function () {
      const outDir = join(context, "dist", `v${nodeVersion}${dashRuntime}`);
      const configName = `goodbye-v${nodeVersion}${dashRuntime}`;
      let log: string | undefined;

      before("Run Webpack", function (done) {
        this.timeout("5s");
        webpack(
          {
            name: configName,
            context,
            entry: Object.fromEntries(
              ENTRY_NAMES.map((name) => [name, `./src/${name}.js`]),
            ),
            output: {
              clean: true,
              path: outDir,
              filename: "[name].cjs",
              library: { type: "commonjs-static" },
            },
            target: `async-node${nodeVersion}`,
            plugins: [
              new TransformAsyncModulesPlugin({
                browserslistConfigFile: false,
                targets: `node ${nodeVersion}`,
                runtime,
              }),
            ],
            devtool: "source-map",
            mode: "development",
            node: false,
            // infrastructureLogging: { debug: /TransformAsyncModulesPlugin/ },
          },
          (err, stats) => {
            log = stats?.toString({
              preset: "errors-warnings",
              loggingDebug: [/TransformAsyncModulesPlugin/],
              errorDetails: true,
            });
            done(err);
          },
        );
      });

      it("Compiles without errors or warnings", async function () {
        expect(log).to.match(
          new RegExp(`${configName} compiled successfully$`),
          log,
        );
      });

      for (const [name, nMatches] of Object.entries(CHUNK_CHECKS)) {
        const outChunk = join(outDir, `src_${name}_js.cjs`);
        if (nodeVersion < 7.6) {
          it(
            `Transpiles the async function to a generator in the ${name} chunk`,
            numMatchesTest(
              outChunk,
              runtime
                ? /var _asyncToGenerator = __webpack_require__/
                : /function _asyncToGenerator\(fn\) {/,
              nMatches,
            ),
          );
        } else {
          it(
            `Contains async arrow function in the ${name} chunk`,
            numMatchesTest(
              outChunk,
              / async \(__webpack_handle_async_dependencies__, __webpack_async_result__\) => {/,
              nMatches,
            ),
          );
        }
        if (nodeVersion < 4) {
          it(
            `Uses the regenerator runtime in the ${name} chunk`,
            numMatchesTest(
              outChunk,
              runtime
                ? /var _regeneratorRuntime = __webpack_require__/
                : / function _regeneratorRuntime\(\) {/,
              nMatches,
            ),
          );
        }
      }

      for (const name of ENTRY_NAMES) {
        const outEntry = join(outDir, `${name}.cjs`);
        it(`Awaits with correct phrase and delay for ${name} entry`, async function () {
          const { goodbye } = (await import(outEntry)) as GoodbyeEntry;
          const { PHRASE, DELAY, awaitedPhrase, awaitedDelay } = await goodbye;
          expect(awaitedPhrase).to.be.a("string").which.equals(PHRASE);
          expect(awaitedDelay)
            .to.be.a("number")
            .which.is.at.least(0.99 * DELAY);
        });
      }
    });
  }
}
