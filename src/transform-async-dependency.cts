import { type Hash } from "node:crypto";
import { Dependency, dependencies, util } from "webpack";
// @ts-expect-error Not exported yet
import InitFragment from "webpack/lib/InitFragment";

const { ModuleDependency } = dependencies;
const { serialization } = util;

type TemplateApply = InstanceType<typeof ModuleDependency.Template>["apply"];
type TemplateSource = Parameters<TemplateApply>[1];
type TemplateContext = Parameters<TemplateApply>[2];

export class TransformAsyncDependency
  extends ModuleDependency
  implements Dependency
{
  #identifier: string;
  #ids: string[];

  constructor(request: string, identifier: string, ids: string[] = []) {
    super(request);
    this.#identifier = identifier;
    this.#ids = ids;
  }

  override get type() {
    return "transform async" as const;
  }

  override get category() {
    return "esm" as const;
  }

  override getReferencedExports() {
    return this.#ids.length > 0
      ? [this.#ids]
      : Dependency.EXPORTS_OBJECT_REFERENCED;
  }

  override updateHash(hash: Hash) {
    hash.update(`${this.#identifier},${this.#ids.join(",")}`);
  }

  override serialize(context: Parameters<Dependency["serialize"]>[0]) {
    context.write(this.#identifier);
    context.write(this.#ids);
    super.serialize(context);
  }

  override deserialize(context: Parameters<Dependency["deserialize"]>[0]) {
    this.#identifier = context.read() as string;
    this.#ids = context.read() as string[];
    super.deserialize(context);
  }

  static override Template = class extends ModuleDependency.Template {
    override apply(
      dep: TransformAsyncDependency,
      _source: TemplateSource,
      {
        runtime,
        runtimeTemplate,
        moduleGraph,
        chunkGraph,
        initFragments,
        runtimeRequirements,
      }: TemplateContext,
    ) {
      const module = moduleGraph.getModule(dep)!;
      const exportsInfo = moduleGraph.getExportsInfo(module);
      const usedName = exportsInfo.getUsedName(dep.#ids, runtime) || [];
      const exportProps = (Array.isArray(usedName) ? usedName : [usedName])
        .map((prop) => `[${JSON.stringify(prop)}]`)
        .join("");
      const exportExpr = `${runtimeTemplate.moduleExports({
        module,
        chunkGraph,
        request: dep.request,
        runtimeRequirements,
      })}${exportProps}`;
      initFragments.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        new InitFragment(
          `/* transform async */ var ${dep.#identifier} = ${exportExpr};\n`,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          InitFragment.STAGE_ASYNC_BOUNDARY,
          -1,
        ) as (typeof initFragments)[number],
      );
    }
  };
}

// Register the constructor to be able to cache the dependency.
serialization.register(TransformAsyncDependency, __filename, null, {
  serialize: (dep: TransformAsyncDependency, context) => dep.serialize(context),
  deserialize: (context) => {
    const dep = new TransformAsyncDependency("TBD", "TBD", ["TBD"]);
    dep.deserialize(context);
    return dep;
  },
});
