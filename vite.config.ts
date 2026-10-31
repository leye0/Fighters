import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, "index.html"),
        beatEmUp: resolve(import.meta.dirname, "beat-em-up.html"),
      },
    },
  },
});
