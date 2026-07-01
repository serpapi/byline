#!/usr/bin/env node

// Web interface/server for Byline

import express, { json } from "express";
import serveStatic from "serve-static";
import path from "node:path";
import Papa from 'papaparse';
import fs from "node:fs/promises";
import crypto from "crypto";
import { getArgs, getAccountInfo, csvTemplate, papaParseOptions, getSearchResults, writeAsFormatted } from "./main.js";

// Initialize Express
const app = express();

// Paths to primary directories
const publicDir = path.resolve(import.meta.dirname, '../public');
const tmpFilesDir = path.resolve(import.meta.dirname, '../public/tmp');
const mainDir = path.resolve(import.meta.dirname, '../');

// Initialize database for running all search jobs
const globalDatabase = {};

// Get command-line arguments
const args = getArgs();

// Set up serve-static middleware to serve files from the 'public' folder
app.use(serveStatic(publicDir));

/**
 * Hashes the provided key using SHA-256
 * @param {string} key - The plain text API key
 * @returns {string} - The hex-encoded hash
 */
function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// API for communication with frontend page
app.get("/api.json", async function (req, res) {
  const responseData = {};
  // Check for API key
  if (!req?.query?.api_key) {
    responseData.error = "No API key was provided!";
    res.json(responseData);
    return;
  }
  // Create hashed key used for the global database
  const hashedKey = hashKey(req.query.api_key);
  // Check if this is a search status request
  console.log(globalDatabase)
  if (hashedKey in globalDatabase) {
    if (globalDatabase[hashedKey].running) {
      responseData.status = "running";
      responseData.message = `Saved ${globalDatabase[hashedKey].data.length} results, still searching...`
      res.json(responseData);
      return
    } else if (globalDatabase[hashedKey].done) {
      responseData.status = "done";
      responseData.download = globalDatabase[hashedKey].download;
      res.json(responseData);
      return;
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
    engine: "google",
    serpAccount: (accountData["account_email"] || "Unknown")
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
  globalDatabase[hashedKey] = Papa.parse(csvTemplate, papaParseOptions);
  globalDatabase[hashedKey].running = true;
  // Write first page to data object
  for (const result in searchResponse["organic_results"]) {
    if (globalDatabase[hashedKey].data.some(item => item.Link === searchResponse["organic_results"][result]["link"])) {
      console.log(`[${accountData["account_email"]}] URL already saved, skipped: ${searchResponse["organic_results"][result]["link"]}`);
    } else {
      const formattedRow = writeAsFormatted(searchResponse["organic_results"][result]);
      globalDatabase[hashedKey].data.push(formattedRow);
    }
  }
  // Send loading status to front end
  responseData.status = "running";
  res.json(responseData);
  // Repeat API call for all remaining pages of search results
  // TODO: Parse video card results, add error handling/wait period for each request
  if (searchResponse?.serpapi_pagination?.next && searchResponse?.serpapi_pagination?.current) {
    while (searchResponse?.serpapi_pagination?.next) {
      console.log(`[${accountData["account_email"]}] Finished page ${searchResponse.serpapi_pagination.current} with ${searchResponse.organic_results.length} results, starting next page...`);
      // Fetch next page of search results
      searchResponse = await getSearchResults({
        apiKey: req.query.api_key,
        url: searchResponse.serpapi_pagination.next
      });
      // Write  page to data object and CSV
      for (const result in searchResponse["organic_results"]) {
        if (globalDatabase[hashedKey].data.some(item => item.Link === searchResponse["organic_results"][result]["link"])) {
          console.log(`[${accountData["account_email"]}] URL already saved, skipped: ${searchResponse["organic_results"][result]["link"]}`);
        } else {
          const formattedRow = writeAsFormatted(searchResponse["organic_results"][result]);
          globalDatabase[hashedKey].data.push(formattedRow);
        }
      }
    }
  }
  // Move results to CSV file for downloading
  const exportFile = `${hashedKey}.csv`;
  const exportPath = path.resolve(tmpFilesDir, exportFile);
  const csvExport = Papa.unparse(globalDatabase[hashedKey], papaParseOptions);
  await fs.writeFile(path.resolve(exportPath), csvExport);
  console.log(`[${accountData["account_email"]}] Finished search!`);
  // Update database entry
  globalDatabase[hashedKey] = {
    done: true,
    download: `/tmp/${exportFile}`
  }
  // TODO: Allow user to run a new search without server restart, automatically clean up database entries over time
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