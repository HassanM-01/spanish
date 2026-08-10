import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel serves at the domain root; GitHub Pages serves at /spanish/.
// Vercel sets the VERCEL env var during its build, so one config covers both.
export default defineConfig({
  base: process.env.VERCEL ? "/" : "/spanish/",
  plugins: [react()],
});
