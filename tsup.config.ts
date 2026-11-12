import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "packs/core": "src/packs/core.ts",
    "packs/aws": "src/packs/aws.ts",
    "packs/azure": "src/packs/azure.ts",
  },
  format: ["esm"],
  target: "es2022",
  // The library runs in browsers and in Node.js, so the bundle assumes neither.
  platform: "neutral",
  tsconfig: "tsconfig.lib.json",
  dts: true,
  sourcemap: true,
  clean: true,
});
