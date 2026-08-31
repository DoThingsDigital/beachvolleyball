import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/components\//, replacement: fileURLToPath(new URL("./src/components/", import.meta.url)) },
      { find: /^@\/lib\//, replacement: fileURLToPath(new URL("./src/lib/", import.meta.url)) },
      { find: /^@\/hooks\//, replacement: fileURLToPath(new URL("./src/hooks/", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
