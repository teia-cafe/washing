import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// BASE_PATH lets the same build run at a domain root (washing.teia.cafe, a
// custom domain) or under a sub-path such as GitHub Pages' /<repository>/.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
