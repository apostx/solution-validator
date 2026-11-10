import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs, so the build works under any path (GitHub Pages serves it from
  // /solution-validator/).
  base: "./",
  plugins: [react()],
  resolve: {
    // The demo uses the library and the official packs from source, not from npm.
    alias: [
      {
        find: /^solution-validator\/packs\/(.*)$/,
        replacement: fileURLToPath(new URL("../src/packs/$1.ts", import.meta.url)),
      },
      {
        find: /^solution-validator$/,
        replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    ],
  },
});
