import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function redirectProductTrailingSlash(app: Express) {
  app.get(/^\/product\/[^/]+\/$/, (req, res) => {
    const queryIndex = req.originalUrl.indexOf("?");
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
    res.redirect(301, `${req.path.slice(0, -1)}${query}`);
  });
}

export function serveStatic(app: Express, publicPath?: string) {
  const distPath = publicPath ?? path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { redirect: false, extensions: ["html"] }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
