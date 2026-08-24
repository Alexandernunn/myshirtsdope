import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

function criticalStylesPlugin(): Plugin {
  const criticalStylesPath = path.resolve(import.meta.dirname, "client", "src", "critical.css");

  return {
    name: "inline-critical-storefront-styles",
    enforce: "post",
    transformIndexHtml(html) {
      const criticalStyles = readFileSync(criticalStylesPath, "utf8");
      const withCriticalStyles = html.replace(
        /<\/head>/i,
        `    <style data-critical-styles>${criticalStyles}</style>\n  </head>`,
      );

      return withCriticalStyles.replace(
        /<link rel="stylesheet"([^>]*?)>/gi,
        (tag, rawAttributes: string) => {
          const attributes = rawAttributes.trim().replace(/\/\s*$/, "");
          return [
            `<link rel="preload" as="style" ${attributes} onload="this.onload=null;this.rel='stylesheet'" />`,
            `<noscript><link rel="stylesheet" ${attributes} /></noscript>`,
          ].join("\n    ");
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV === "production" ? [criticalStylesPlugin()] : []),
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
