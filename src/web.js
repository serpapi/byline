#!/usr/bin/env node

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

// API for communication with frontend page
app.get("/api.json", async function (req, res) {
  const data = {};
  // Check for API key
  console.log("\nReceived data:", req.query);
  if (!req?.query?.api_key) {
    data.message = "No API key was provided!";
    req.json(data);
    return;
  }
  // Check for author
  if (!req?.query?.author) {
    data.message = "No author was provided!";
    req.json(data);
    return;
  }
  // Set up optional URL filters
  let filters = [];
  if (req?.query?.filters) {
    filters = req.query.filters.trim().split(",");
  }
  data.message = "Works!";
  res.json(data);
});

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