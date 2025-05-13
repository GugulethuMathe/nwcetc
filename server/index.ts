// Import the MySQLStorage class
import { MySQLStorage } from './MySQLStorage';

// Directly instantiate and export MySQLStorage
// The application will now *only* use the MySQL database.
// This export should be available for other modules like ./routes or ./db-seed
export const storage = new MySQLStorage();

// Imports from the main server logic (originally in the pasted text file)
import express, { type Request, type Response, type NextFunction } from "express";
import type { Server as HttpServer } from "http"; // For type safety of 'server'

import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
// import { seedDatabase } from "./db-seed"; // Commented out due to missing module

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson: any, ...args: any[]) { // Adjusted types for compatibility
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args] as any); // Cast args for apply
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// IIFE to start the server
(async () => {
  // Seed the database with initial data if needed
  // if (process.env.DATABASE_URL) { // Commented out due to missing db-seed
  //   try {
  //     await seedDatabase(); // Assumes seedDatabase might use the exported 'storage'
  //   } catch (error) {
  //     log(`Error seeding database: ${(error as Error).message}`);
  //   }
  // }
  
  // registerRoutes is expected to return an http.Server instance
  const server: HttpServer = await registerRoutes(app); // Assumes registerRoutes might use 'storage'

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    log(`Unhandled error during request: ${err.stack || err.message}`);
    // Avoid re-throwing if response already sent or if it's the final handler.
  });

  // Setup Vite for development or serve static files for production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use port 80 when running as admin, otherwise use a higher port
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 80;
  
  // Simplified server listen call without reusePort option
  server.listen(port, "0.0.0.0", () => {
    log(`Server running at http://0.0.0.0:${port}`);
  });
})().catch(err => {
  log(`Failed to start server: ${err.stack || (err as Error).message}`);
  process.exit(1);
});