// Same as chained but uses a parent with 2 dependencies.
export const goodbye = import("./with2.js").then(({ pg }) => pg);
