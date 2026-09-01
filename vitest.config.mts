import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next setzt jsx:preserve; Vitest/Vite (OXC) braucht die Transformation
  oxc: { jsx: { runtime: "automatic" } },
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
    exclude: ["src/**/*.int.test.ts", "**/node_modules/**"],
    environment: "node",
    passWithNoTests: true,
  },
});
