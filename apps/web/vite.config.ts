import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 25010,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@robo-fleet/ui/styles": path.resolve(
          __dirname,
          "../../packages/ui/src/styles/globals.css",
      ),
      "@robo-fleet/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
});
