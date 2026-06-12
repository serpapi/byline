// Web interface/server for Byline

import express, { json } from "express";
import serveStatic from "serve-static";
import path from "node:path";
import { getArgs } from "./main.js";

// Initialize Express
const app = express();

// Paths to primary directories
const publicDir = path.resolve(import.meta.dirname, '../public');
const mainDir = path.resolve(import.meta.dirname, '../');

// Get command-line arguments
const args = getArgs();

// Set up serve-static middleware to serve files from the 'public' folder
app.use(serveStatic(publicDir));

// Start the HTTP server
const port = (args["port"] || 3500);
app.listen(port, () => {
  console.log(`Server is running: http://localhost:${port}`);
});

// Listen for termination signals
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing server...');
  process.exit(0);
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);