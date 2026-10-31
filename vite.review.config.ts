import { defineConfig } from "vite";
import { resolve } from "node:path";

/** Static animation review + diagnostic beat'em up. Publish docs/ using Pages. */
export default defineConfig({
  base: "./",
  build: {
    outDir: "docs/site",
    emptyOutDir: true,
    rollupOptions: { input: {
      review: resolve(import.meta.dirname, "animation-review.html"),
      beatEmUp: resolve(import.meta.dirname, "beat-em-up.html"),
      nativeMixamoReview: resolve(import.meta.dirname, "native-mixamo-review.html"),
    } },
  },
});
