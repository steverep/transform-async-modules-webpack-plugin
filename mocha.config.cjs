module.exports = {
  require: "ts-node/register",
  loader: ["ts-node/esm", "./.pnp.loader.mjs"],
  spec: ["test/**/*.spec.*"],
  watchFiles: ["src"],
};
