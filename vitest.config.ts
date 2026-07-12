import { defineConfig } from "vitest/config";
import path from "node:path";

// separate from vite.config.ts: tests need no plugins (react, pwa),
// so unit runs skip their config resolution entirely
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
