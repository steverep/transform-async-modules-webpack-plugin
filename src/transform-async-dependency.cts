import { type Hash } from "node:crypto";
import { Dependency, dependencies, util } from "webpack";

const { ModuleDependency } = dependencies;

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
      const connection = moduleGraph.getConnection(dep)!;
      const exportsInfo = moduleGraph.getExportsInfo(connection.module);
      const usedName = exportsInfo.getUsedName(dep.#ids, runtime) || [];
      const exportProps = (Array.isArray(usedName) ? usedName : [usedName])
        .map((prop) => `[${JSON.stringify(prop)}]`)
        .join("");
      // initFragments.push(
      //   new InitFragment(
      //     `/* transform async dependency */ var ${
      //       dep.#identifier
      //     } = ${runtimeTemplate.moduleExports({
      //       module: moduleGraph.getModule(dep),
      //       chunkGraph,
      //       request: dep.request,
      //       runtimeRequirements,
      //     })}${exportProps};\n`,
      //     InitFragment.STAGE_ASYNC_BOUNDARY,
      //     -1,
      //   ),
      // );
    }
  };
}

util.serialization.register(TransformAsyncDependency, __filename, null, {
  serialize: (dep: TransformAsyncDependency, context) => dep.serialize(context),
  deserialize: (context) => {
    const dep = new TransformAsyncDependency("TBD", "TBD", ["TBD"]);
    dep.deserialize(context);
    return dep;
  },
});
