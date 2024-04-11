// This is the same as parent.js, except it also depends on another TLA.
import * as pg from "./goodbye.js";
import { zero } from "./another.js";
export { pg, zero };
