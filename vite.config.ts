/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: "./tsconfig.app.json",
      exclude: ["node_modules/**", "**/*.spec.tsx"],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "use-observable",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "mobx", "mobx-react-lite"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    emptyOutDir: true,
  },
  test: {
    environment: "happy-dom",
    restoreMocks: true,
    setupFiles: ["./setupTests.ts"],
  },
});
