import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// The TanStack Router plugin must come before the React plugin. It generates
// `src/routeTree.gen.ts` from the files under `src/routes/`.
export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
});
