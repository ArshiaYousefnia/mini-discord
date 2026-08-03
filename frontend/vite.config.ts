import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],

  // Temporary debugging configuration:
  // maps minified production errors back to the original TSX files.
  build: {
    sourcemap: true,
    minify: false,
  },
});
