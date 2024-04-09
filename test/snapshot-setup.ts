import { use } from "chai";
import jestSnapshot from "chai-jest-snapshot";
import type { Context, RootHookObject } from "mocha";

use(jestSnapshot);

export const mochaHooks: RootHookObject = {
  beforeAll() {
    jestSnapshot.resetSnapshotRegistry();
  },
  beforeEach(this: Context) {
    jestSnapshot.configureUsingMochaContext(this);
  },
};
