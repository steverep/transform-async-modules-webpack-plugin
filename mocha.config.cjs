module.exports = {
  require: "ts-node/register",
  loader: ["ts-node/esm", "./.pnp.loader.mjs"],
  asyncOnly: true,
  forbidOnly: true,
  spec: ["test/**/*.spec.*"],
  watchFiles: ["src"],
};
