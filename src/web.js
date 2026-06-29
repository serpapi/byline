#!/usr/bin/env node

// Web interface/server for Byline

import express, { json } from "express";
import serveStatic from "serve-static";
import path from "node:path";
import Papa from 'papaparse';
import { getArgs, getAccountInfo, csvTemplate, papaParseOptions, getSearchResults, writeAsFormatted } from "./main.js";

// Initialize Express
const app = express();

// Paths to primary directories
const publicDir = path.resolve(import.meta.dirname, '../public');
const mainDir = path.resolve(import.meta.dirname, '../');

// Initialize database for running all search jobs
const globalDatabase = {};

// Get command-line arguments
const args = getArgs();

// Set up serve-static middleware to serve files from the 'public' folder
app.use(serveStatic(publicDir));

// API for communication with frontend page
app.get("/api.json", async function (req, res) {
  const responseData = {};
  // Check for API key
  console.log("\nReceived data:", req.query);
  if (!req?.query?.api_key) {
    responseData.error = "No API key was provided!";
    res.json(responseData);
    return;
  }
  // Check if this is a search status request
  if (req.query.api_key in globalDatabase) {
    if (globalDatabase[req.query.api_key].running) {
      responseData.status = "running";
      responseData.message = `Saved ${globalDatabase[req.query.api_key].data.length} results, still searching...`
      res.json(responseData);
      return
    } else {
      // TODO: Implement sending final status
    }
  }
  // Check for author
  if (!req?.query?.author) {
    responseData.error = "No author was provided!";
    res.json(responseData);
    return;
  }
  // Check for website
  if (!req?.query?.website) {
    responseData.error = "No website was provided!";
    res.json(responseData);
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
    responseData.accountEmail = (accountData["account_email"] || "Unknown");
    responseData.remainingSearches = (accountData["total_searches_left"] || "Unknown");
  } catch (e) {
    console.error(e);
    responseData.error = "Could not connect to SerpApi, please try again later or check your API key is correct.";
    res.json(responseData);
    return;
  }
  // Run first search
  let searchResponse = await getSearchResults({
    author: req.query.author.trim(),
    site: req.query.website.trim(),
    filters: searchFilters,
    apiKey: req.query.api_key,
    engine: "google"
  });
  if (searchResponse?.error) {
    responseData.error = `Error: ${searchResponse.error}`;
    res.json(responseData);
    return;
  }
  // Return early if this is a non-confirmed search
  if (!(req?.query?.confirm === "true")) {
    responseData.message = `${searchResponse.byline_estimate}\n\nCheck the box below, then click the Start search button again.`;
    res.json(responseData);
    return;
  }
  // Start full search
  globalDatabase[req.query.api_key] = Papa.parse(csvTemplate.toString());
  globalDatabase[req.query.api_key].running = true;
  // Write first page to data object and CSV
  for (const result in searchResponse["organic_results"]) {
    if (globalDatabase[req.query.api_key].data.some(item => item.Link === searchResponse["organic_results"][result]["link"])) {
      console.log(`URL already saved, skipped: ${searchResponse["organic_results"][result]["link"]}`);
    } else {
      const formattedRow = writeAsFormatted(searchResponse["organic_results"][result]);
      globalDatabase[req.query.api_key].data.push(formattedRow);
    }
  }
  // Send loading status to front end
  responseData.status = "running";
  res.json(responseData);
  // Repeat API call for all remaining pages of search results
  // TODO: Parse video card results, add error handling/wait period for each request
  if (searchResponse?.serpapi_pagination?.next && searchResponse?.serpapi_pagination?.current) {
    while (searchResponse?.serpapi_pagination?.next) {
      console.log(`Finished page ${searchResponse.serpapi_pagination.current} with ${searchResponse.organic_results.length} results, starting next page...`);
      // Fetch next page of search results
      searchResponse = await getSearchResults({
        apiKey: req.query.api_key,
        url: searchResponse.serpapi_pagination.next
      });
      // Write  page to data object and CSV
      for (const result in searchResponse["organic_results"]) {
        if (globalDatabase[req.query.api_key].data.some(item => item.Link === searchResponse["organic_results"][result]["link"])) {
          console.log(`URL already saved, skipped: ${searchResponse["organic_results"][result]["link"]}`);
        } else {
          const formattedRow = writeAsFormatted(searchResponse["organic_results"][result]);
          globalDatabase[req.query.api_key].data.push(formattedRow);
        }
      }
    }
  }
  // TODO: Return data as CSV file
  responseData.message = "Search done!";
    res.json(responseData);
    return;
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