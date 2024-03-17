import { expect } from "chai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TransformAsyncModulesPlugin } from "transform-async-modules-webpack-plugin";
import webpack from "webpack";

type GoodbyeEntry = typeof import("./src/simple.js");

const context = fileURLToPath(new URL(".", import.meta.url));
const ENTRY_NAMES = ["simple", "chained"] as const;
const CHECK_CHUNKS = ["goodbye", "parent"] as const;

for (const nodeVersion of [8, 6, 0.12]) {
  describe(`Goodbye delay with node ${nodeVersion} target`, function () {
    const outDir = join(context, "dist", `v${nodeVersion}`);
    let compileProblems = "";

    before("Run Webpack", function (done) {
      this.timeout("5s");
      webpack(
        {
          name: `goodbye-node${nodeVersion}`,
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
            }),
          ],
          devtool: "source-map",
          mode: "development",
          node: false,
        },
        (err, stats) => {
          if (stats?.hasErrors()) {
            compileProblems = stats.toString("errors-only");
          }
          done(err);
        },
      );
    });

    it("Compiles without errors", async function () {
      expect(compileProblems, compileProblems).to.be.empty;
    });

    for (const name of CHECK_CHUNKS) {
      const outChunk = join(outDir, `src_${name}_js.cjs`);
      if (nodeVersion < 7.6) {
        it(`Transpiles the async function to a generator in the ${name} chunk`, async function () {
          const code = await readFile(outChunk, "utf-8");
          expect(code).to.have.string("function _asyncToGenerator(fn) {");
        });
      } else {
        it(`Contains async arrow function in the ${name} chunk`, async function () {
          const code = await readFile(outChunk, "utf-8");
          expect(code).to.have.string(
            " async (__webpack_handle_async_dependencies__, __webpack_async_result__) => {",
          );
        });
      }
      if (nodeVersion < 4) {
        it(`Uses the regenerator runtime in the ${name} chunk`, async function () {
          const code = await readFile(outChunk, "utf-8");
          expect(code).to.have.string(" function _regeneratorRuntime() {");
        });
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
