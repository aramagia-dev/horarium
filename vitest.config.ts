import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "lib/__tests__/server-only-mock.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
    globals: false,
    deps: { inline: [/server-only/] },
  },
});
