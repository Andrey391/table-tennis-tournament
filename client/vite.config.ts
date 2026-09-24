import { defineConfig, build, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const swEntry = fileURLToPath(new URL("./src/sw.ts", import.meta.url));

// src/sw.ts is built on its own into /sw.js: one classic script with the
// dictionary inlined, since a module service worker with shared chunks would not
// register on older Safari. The dev server builds it on request.
function buildServiceWorker(outDir: string, write: boolean) {
  return build({
    configFile: false,
    logLevel: "warn",
    publicDir: false,
    build: {
      outDir, write, emptyOutDir: false, copyPublicDir: false, minify: write,
      lib: { entry: swEntry, formats: ["iife"], name: "sw", fileName: () => "sw.js" },
    },
  });
}

function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "service-worker",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use("/sw.js", async (_req, res) => {
        try {
          const out = await buildServiceWorker(outDir, false);
          const code = (Array.isArray(out) ? out[0] : out as any).output[0].code;
          res.setHeader("Content-Type", "application/javascript");
          res.end(code);
        } catch (err: any) {
          res.statusCode = 500;
          res.end(String(err?.message ?? err));
        }
      });
    },
    async closeBundle() {
      if (this.meta.watchMode) return;
      await buildServiceWorker(outDir, true);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { port: 5173, proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true }, "/socket.io": { target: "http://localhost:3000", ws: true } } },
});
