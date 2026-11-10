import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs, so the build works under any path (GitHub Pages serves it from
  // /solution-validator/).
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      // The demo uses the library from source, not from npm.
      "solution-validator": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
});
