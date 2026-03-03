import express, { type Request, Response, NextFunction } from "express";
import serverless from "serverless-http";
import { createServer } from "http";
import { registerRoutes } from "../../server/routes";
import { startBackgroundLoad } from "../../server/storage";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);

// startBackgroundLoad();
registerRoutes(httpServer, app);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("Error:", err);
  res.status(status).json({ message });
});

export const handler = serverless(app);
