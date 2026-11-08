// Desktop (Electron) build config — same app, but the server is built for
// plain Node.js instead of Cloudflare so it can run inside the desktop app.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "path";

const serverEnv = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        "entities": path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
  nitro: {
    preset: "node-server",
  },
} as Parameters<typeof defineConfig>[0]);
