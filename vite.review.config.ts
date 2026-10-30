import { defineConfig } from "vite";
import { resolve } from "node:path";

/** Lightweight static review only. Publish docs/ using GitHub Pages main/docs. */
export default defineConfig({
  base: "./",
  build: {
    outDir: "docs/site",
    emptyOutDir: true,
    rollupOptions: { input: { review: resolve(import.meta.dirname, "animation-review.html") } },
  },
});
