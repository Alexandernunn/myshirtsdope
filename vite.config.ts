import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

function deferBuiltStylesheets(): Plugin {
  return {
    name: "defer-built-stylesheets",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return html.replace(
          /<link\s+[^>]*\brel=["']stylesheet["'][^>]*>/gi,
          (stylesheetTag) => {
            const href = stylesheetTag.match(/\bhref=["']([^"']+)["']/i)?.[1];
            if (!href) return stylesheetTag;

            const crossorigin = /\bcrossorigin(?:=["'][^"']*["'])?/i.test(stylesheetTag)
              ? " crossorigin"
              : "";

            return `<link rel="preload" as="style" href="${href}"${crossorigin} data-deferred-stylesheet="true">\n    <noscript><link rel="stylesheet" href="${href}"${crossorigin}></noscript>`;
          },
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    deferBuiltStylesheets(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
