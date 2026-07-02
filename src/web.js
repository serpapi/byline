#!/usr/bin/env node

// Web interface/server for Byline

import express, { json } from "express";
import serveStatic from "serve-static";
import path from "node:path";
import Papa from 'papaparse';
import fs from "node:fs/promises";
import crypto from "crypto";
import schedule from "node-schedule";
import { getArgs, getAccountInfo, csvTemplate, papaParseOptions, getSearchResults, writeAsFormatted } from "./main.js";

// Initialize Express
const app = express();

// Paths to primary directories
const publicDir = path.resolve(import.meta.dirname, '../public');
const tmpFilesDir = path.resolve(import.meta.dirname, '../public/tmp');
const mainDir = path.resolve(import.meta.dirname, '../');

/**
 * The database for ongoing and completed searches. There is a key for each SerpApi account, represented by a hashed API key.
 * 
 * @example
 * {
 *  'c27ecc686d49...bf1': {
 *    data: [..],
 *    errors: [..],
 *    meta: {..}
 *    done: false
 *    createdDate: 1783024407134
 *  },
 *  'hmfwqwngix9...c83': {
 *    done: true 
 *    download: '/tmp/hmfwqwngix9...c83.csv',
 *    fullPath: '/Users/me/byline/public/tmp/hmfwqwngix9...c83.csv',
 *    createdDate: 1783024141669
 *  }
 * }
 */
const globalDatabase = {};

// Get command-line arguments
const args = getArgs();

/**
 * Hashes the provided key using SHA-256
 * @param {string} key - The plain text API key
 * @returns {string} - The hex-encoded hash
 */
function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Function to delete items more than 24 hours old from global database and storage.
 */
async function cleanupDatabase() {
  console.log(`[Server] Running database cleanup on ${Object.keys(globalDatabase).length} items...`);
  const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
  const nowDate = Date.now();
  for (const i in globalDatabase) {
    // Set creation date to now if it's missing
    if (!("createdDate" in globalDatabase[i])) {
      globalDatabase[i]["createdDate"] = Number(Date.now());
      console.log(`[${i}] Database entry was missing creation date, fixed.`);
      continue;
    }
    // Delete the entry if needed
    const olderThan24Hours = nowDate - globalDatabase[i]["createdDate"] > twentyFourHoursInMs;
    if (olderThan24Hours) {
      deleteBackup(i);
    }
  }
  console.log(`[Server] Database cleanup complete, ${Object.keys(globalDatabase).length} items remaining.`);
}

/**
 * Check for existing backups in the /tmp directory, and allow them to be downloaded again.
 */
async function restoreDatabaseFromDisk() {
  try {
    const files = await fs.readdir(tmpFilesDir);
    const csvFiles = files.filter(file => file.endsWith(".csv"));
    for (const file of csvFiles) {
      const hashedKey = path.parse(file).name;
      const fullPath = path.resolve(tmpFilesDir, file);
      const stats = await fs.stat(fullPath);
      globalDatabase[hashedKey] = {
        done: true,
        download: `/tmp/${file}`,
        fullPath: fullPath,
        createdDate: stats.birthtimeMs
      };
      console.log(`[${hashedKey}] Restored search results from storage.`);
    }
  } catch (err) {
    console.error("Error restoring database from disk:", err.message);
  }
}

/**
 * Deletes all data for a given user, represented by their API key, from the global database and /tmp directory.
 * @param {String} hashedKey The hash of a SerpAPI API key.
 */
async function deleteBackup(hashedKey) {
  if (hashedKey in globalDatabase) {
    // Delete the CSV file from storage
    try {
      await fs.unlink(globalDatabase[hashedKey].fullPath);
      console.log(`[${hashedKey}] Deleted CSV file.`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`[${hashedKey}] Could not find CSV file to delete, skipping.`);
      } else {
        console.error(`[${hashedKey}] An error occured deleting the CSV file:`, err.message);
      }
    }
    // Delete database object
    delete globalDatabase[hashedKey];
    console.log(`[${hashedKey}] Deleted backup from database.`);
  } else {
    console.log(`[${hashedKey}] Backup is not in database, skipping deletion.`);
  }
};

// API call for deleting existing backup so a new one can be created
app.get("/delete.json", async function (req, res) {
  const responseData = {};
  if (!req?.query?.api_key) {
    responseData.error = "No API key was provided!";
    res.json(responseData);
    return;
  }
  // Create hashed key used for the global database
  const hashedKey = hashKey(req.query.api_key);
  await deleteBackup(hashedKey);
  responseData.message = "done";
  res.json(responseData);
});

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
  if (hashedKey in globalDatabase) {
    if (globalDatabase[hashedKey]?.done) {
      responseData.status = "done";
      responseData.download = globalDatabase[hashedKey].download;
      res.json(responseData);
      return;
    } else {
      responseData.status = "running";
      responseData.message = `Saved ${globalDatabase[hashedKey].data.length} results, still searching...`
      res.json(responseData);
      return
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
    serpAccount: hashedKey
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
  globalDatabase[hashedKey].createdDate = Number(Date.now());
  globalDatabase[hashedKey] = Papa.parse(csvTemplate, papaParseOptions);
  globalDatabase[hashedKey].running = true;
  // Write first page to data object
  for (const result in searchResponse["organic_results"]) {
    if (globalDatabase[hashedKey].data.some(item => item.Link === searchResponse["organic_results"][result]["link"])) {
      console.log(`[${hashedKey}] URL already saved, skipped: ${searchResponse["organic_results"][result]["link"]}`);
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
      console.log(`[${hashedKey}] Finished page ${searchResponse.serpapi_pagination.current} with ${searchResponse.organic_results.length} results, starting next page...`);
      // Fetch next page of search results
      searchResponse = await getSearchResults({
        apiKey: req.query.api_key,
        url: searchResponse.serpapi_pagination.next
      });
      // Write  page to data object and CSV
      for (const result in searchResponse["organic_results"]) {
        if (globalDatabase[hashedKey].data.some(item => item.Link === searchResponse["organic_results"][result]["link"])) {
          console.log(`[${hashedKey}] URL already saved, skipped: ${searchResponse["organic_results"][result]["link"]}`);
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
  console.log(`[${hashedKey}] Finished search!`);
  // Update database entry
  globalDatabase[hashedKey] = {
    done: true,
    download: `/tmp/${exportFile}`,
    fullPath: exportPath
  };
});

// Set up serve-static middleware to serve files from the 'public' folder
app.use(serveStatic(publicDir));

// Restore backups from storage
restoreDatabaseFromDisk();

// Start the HTTP server
const port = (args["port"] || 3500);
app.listen(port, () => {
  console.log(`[Server] Web UI is running: http://localhost:${port}`);
});

// Schedule database cleanup at the top of each hour
const cleanupJob = schedule.scheduleJob("0 * * * *", cleanupDatabase);

// Listen for termination signals
const gracefulShutdown = () => {
  console.log('[Server] Received shutdown signal, closing server...');
  process.exit(0);
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);