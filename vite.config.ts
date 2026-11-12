import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The same build works at the site root or a GitHub Pages repository subpath.
  base: "./",
  plugins: [react()],
});
