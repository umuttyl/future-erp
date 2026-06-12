import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // happy-dom: jsdom'un css-color ESM require() sorununu önler (jsdom 27 + vitest 4)
      environment: "happy-dom",
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      restoreMocks: true,
    },
  }),
);
