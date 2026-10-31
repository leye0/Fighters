import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Each HTML entry is hosted beneath /Fighters/site/ on GitHub Pages.
  // Relative URLs also work in local preview and offline mirrors.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, "index.html"),
        beatEmUp: resolve(import.meta.dirname, "beat-em-up.html"),
      },
    },
  },
});
