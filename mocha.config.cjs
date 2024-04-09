module.exports = {
  require: ["ts-node/register", "./test/snapshot-setup.ts"],
  loader: ["ts-node/esm", "./.pnp.loader.mjs"],
  asyncOnly: true,
  forbidOnly: true,
  enableSourceMaps: true,
  spec: ["test/**/*.spec.ts"],
  watchFiles: ["src"],
};
