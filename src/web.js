#!/usr/bin/env node

// Web interface/server for Byline

import express, { json } from "express";
import serveStatic from "serve-static";
import path from "node:path";
import Papa from 'papaparse';
import { getArgs, getAccountInfo, csvTemplate, papaParseOptions, getSearchResults } from "./main.js";

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
    res.json(data);
    return;
  }
  // Check for author
  if (!req?.query?.author) {
    data.message = "No author was provided!";
    res.json(data);
    return;
  }
  // Check for website
  if (!req?.query?.website) {
    data.message = "No website was provided!";
    res.json(data);
    return;
  }
  // Set up optional URL filters
  let searchFilters = [];
  if (req?.query?.filters) {
    searchFilters = req.query.filters.trim().split(",");
  }
  // Check account status
  let accountData;
  try {
    accountData = await getAccountInfo(req.query.api_key);
    data.accountEmail = (accountData["account_email"] || "Unknown");
    data.remainingSearches = (accountData["total_searches_left"] || "Unknown");
  } catch (e) {
    console.error(e);
    data.message = "Could not connect to SerpApi, please try again later or check your API key is correct.";
    res.json(data);
    return;
  }
  // Create data object for search
  // TODO: Allow importing existing CSV file, allow resuming partial search
  let listData = Papa.parse(csvTemplate, papaParseOptions);
  // Run first search
  let searchResponse = await getSearchResults({
    author: req.query.author.trim(),
    site: req.query.website.trim(),
    filters: searchFilters,
    apiKey: req.query.api_key,
    engine: "google"
  });
  if (searchResponse?.error) {
    data.message = `Error: ${searchResponse.error}`;
    res.json(data);
    return;
  }
  data.message = `${searchResponse.byline_estimate}\n\nList save not implemented yet!`;
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