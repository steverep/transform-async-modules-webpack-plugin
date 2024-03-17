// Chained entrypoint where both the TLA module and its parent are async.
export const goodbye = import("./parent.js").then(({ pg }) => pg);
