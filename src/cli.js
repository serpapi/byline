#!/usr/bin/env node

import { machine, type, release } from "node:os";
import fs from "node:fs/promises";
import * as readline from 'node:readline/promises';
import { spawn, execSync } from "node:child_process";
import { env, loadEnvFile, stdin, stdout } from 'node:process';
import path from "node:path";
import Papa from 'papaparse';
import { getAccountInfo, getSearchResults, writeAsFormatted, csvTemplate, papaParseOptions, getArgs, getAllLinks } from "./main.js";
import { glob } from "node:fs";

const rl = readline.createInterface({ input: stdin, output: stdout });
const envPath = path.resolve("byline-settings.txt");
let globalApiKey = process.env.SERPAPI_KEY;
let globalData = {};

/**
 * Checks if a given command or executable is available to the system.
 * This is used primarily to see if Monolith is installed.
 * @param {string} command The name of the command to check.
 * @returns {boolean}
 */
async function checkCmdExists(command) {
    try {
        let checkCmd;
        // 'which' for Unix, 'where' for Windows
        if (process.platform === "win32") {
            checkCmd = `where ${command}`;
        } else {
            checkCmd = `which ${command}`
        }
        execSync(checkCmd, { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Runs a command in a child process as a Promise
 * @param {String} command The command to run and wait for completion
 * @param {Array} args The arguments to pass to the command
 * @returns 
 */
function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        // Pipe output to parent console
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        // Resolve when the process finishes successfully
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
        // Reject if the command fails to start (e.g., command not found)
        child.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Prompt the user for text input using the active readline interface.
 * @param {String} query The question to display in the CLI.
 * @returns {String} The response, with any surrounding quotation marks ('' and "") removed.
 */
async function askUser(query) {
    const response = await rl.question(query + " ");
    return response.replace(/^(['"])(.*)\1$/, '$2').trim();
}

/**
 * Show help information in the console.
 */
function showHelp() {
    const helpMessage = `Usage: byline [options...]

REQUIRED OPTIONS:
-author "name"          Full name that appears on published work
-site "example.com"     Web domain to search

MORE OPTIONS:
-backup                 Back up articles from CSV file with Monolith
-i "/path/to/data.csv"  Path for CSV file instead of ./data.csv
-filters "/tag/,"/cat/" URLs containing these strings will be skipped
-limit 20               Maximum number of search results pages to load
-start "1/5/2024"       Search only for items published after this date
-end "2/6/2026"         Search only for items published before this date
-login                  Save API key from SerpApi

Dates for -start and -end must be formatted in US style (M/D/YYYY).

Monolith must be installed for HTML backups:
https://crates.io/crates/monolith

More information about Byline:
https://github.com/serpapi/byline
`;
    console.log(helpMessage);
}

/**
 * Writes a Papa Parse data object as a CSV file, replacing the contents of the file currently at the path.
 * @param {string} filePath The path to the file, already processed with path.resolve()
 * @param {object} obj The Papa Parse data object.
 */
async function writeToCsv(filePath, obj) {
    const csvExport = Papa.unparse(obj, papaParseOptions)
    await fs.writeFile(path.resolve(filePath), csvExport);
}

/**
 * Prompts the user for an API key, and saves it to the settings file.
 * @param {string} envPath Full path to settings/env file
 * @returns New API key
 */
async function saveApiKey(pathToFile) {
    const apiKey = await askUser("Paste your API key from the https://serpapi.com/manage-api-key page:");
    await fs.writeFile(pathToFile, `SERPAPI_KEY=${apiKey}\nINFO=DO NOT SHARE THIS FILE!`);
    console.log(`Saved API key to ${pathToFile}`);
    return apiKey;
}

/**
 * Read or create the CSV database file, then save its contents to the globalData variable.
 * @param {String} filePath The path to the file.
 */
async function readDataFile(filePath) {
    try {
        let fileContents;
        try {
            fileContents = await fs.readFile(filePath, { encoding: "utf8" });
            // Create header rows if the file is empty
            fileContents = (fileContents || csvTemplate.toString());
        } catch (err) {
            if (err.code === "ENOENT") {
                await fs.writeFile(filePath, csvTemplate.toString());
                fileContents = csvTemplate.toString();
            } else {
                console.log(`Error accessing data file: ${e}`);
                process.exit(1);
            }
        }
        // Parse file
        globalData = Papa.parse(fileContents, papaParseOptions);
        console.log(`Opened data file with ${globalData.data.length} entries: ${filePath}\n`);
    } catch (e) {
        console.log(`There was an error loading the data file:\n${e}\n`);
        process.exit(1);
    }
}

/**
 * Start an interactive article backup with Monolith.
 * 
 * Monolith documentation: https://github.com/Y2Z/monolith
 * @param {obj} args JSON object of command-line arguments.
 */
async function startBackup(args) {
    // Check if Monolith is installed
    const monolithInstalled = await checkCmdExists("monolith");
    if (!monolithInstalled) {
        console.log("\nMonolith is required for backups, but it is not installed.\n\nDownload Monolith, then try again: https://github.com/Y2Z/monolith#installation\n");
        return;
    }
    // Read CSV file into globalData object
    let filePath;
    if (args["i"]) {
        filePath = path.resolve(args["i"]);
    } else {
        filePath = path.resolve("data.csv");
    }
    await readDataFile(filePath);
    // Create backup directory if it doesn't exist
    const backupDir = path.resolve("./backup/");
    try {
        await fs.mkdir(backupDir, { recursive: true });
    } catch (err) {
        console.error('Error creating backup directory:', err);
        process.exit(1);
    }
    // Ask to start
    const answer = await askUser(`Ready to back up ${globalData.data.length} links in directory: ${path.resolve()}\nType "start" to start:`);
    if (answer != "start") {
        console.log("Backup cancelled.");
        return
    }
    // Start backups
    for (const item of globalData.data) {
        // Set up target directory
        let thisDir;
        if (item["Date (Formatted)"] && item["Date (Formatted)"].includes("-")) {
            thisDir = path.resolve(backupDir, item["Date (Formatted)"].replaceAll("-", "/"));
        } else {
            thisDir = path.resolve(backupDir, "Unknown Date");
        }
        // Run monolith in target directory
        try {
            await fs.mkdir(thisDir, { recursive: true });
            console.log(`Created directory: ${thisDir}\nRunning monolith for: ${item.Link}`);
            const htmlFile = path.resolve(thisDir, "%title%.html");
            // Skip audio (-a) and video (-v) resources
            await runCommand('monolith', [item["Link"], "-a", "-v", "-o", htmlFile]);
        } catch (err) {
            console.error(`Error saving ${item["Link"]}, skipping:`, err);
            continue;
        }
    }
    console.log(`Done!\n`);
}

/**
 * Start an interactive search that saves data to the CSV file.
 * @param {obj} args JSON object of command-line arguments.
 */
async function startSearch(args) {
    // Check for API key
    if (!globalApiKey) {
        try {
            loadEnvFile(envPath);
            globalApiKey = (process.env.SERPAPI_KEY || await saveApiKey(envPath));
        } catch (err) {
            if (err.code === "ENOENT") {
                globalApiKey = await saveApiKey(envPath);
            } else {
                console.log(`Error accessing settings file: ${e}`);
                process.exit(1);
            }
        }
    }
    // Check for search filters
    let searchFilters = [];
    if (args?.filters) {
        searchFilters = args.filters.trim().split(",");
    }
    // Show welcome message and account status
    let accountData;
    try {
        accountData = await getAccountInfo(globalApiKey);
    } catch {
        console.log(`\nCould not connect to SerpApi, please try again later or check your API key in ${envPath} is correct.\n`);
        process.exit(1);
    }
    console.log(`SerpAPI Byline - ${type()} ${release()} (${machine()})\n======\nAccount email: ${accountData["account_email"] || "Unknown"}\nRemaining searches: ${accountData["total_searches_left"] || "Unknown"}\nManage account: https://serpapi.com/dashboard\n======\n`);
    // Read CSV file into globalData object
    let filePath;
    if (args["i"]) {
        filePath = path.resolve(args["i"]);
    } else {
        filePath = path.resolve("data.csv");
    }
    await readDataFile(filePath);
    // Run first search
    let searchResponse = await getSearchResults({
        author: args.author.trim(),
        site: args.site.trim(),
        filters: searchFilters,
        apiKey: globalApiKey,
        engine: "google",
        startDate: args?.start,
        endDate: args?.end,
        serpAccount: (accountData["account_email"] || "Unknown")
    });
    if (searchResponse?.error) {
        console.log(`${searchResponse.error}\n`);
        process.exit(1);
    }
    console.log(`${searchResponse.byline_estimate}\n`);
    // Set maximum pagination and warn user if one is not configured
    let maxPagination = null;
    if (args.limit && Number(args.limit)) {
        maxPagination = (Number(args.limit) - 1); // subtracted by 1, because one search was already completed
        console.log(`Search will end after ${Number(args.limit) - 1} more pages of results.\n`);
    } else {
        console.log("No search limit specified! This could potentially use hundreds of search credits for longer search queries.\n");
    }
    const answer = await askUser(`Type "start" to start:`);
    if (answer != "start") {
        console.log("Search cancelled.");
        process.exit();
    }
    // Write first page to data object and CSV
    for (const result of getAllLinks(searchResponse)) {
        if (globalData.data.some(item => item.Link === result.link)) {
            console.log(`URL already saved, skipped: ${result.link}`);
        } else {
            const formattedRow = writeAsFormatted(result);
            globalData.data.push(formattedRow);
        }
    };
    await writeToCsv(filePath, globalData);
    // Repeat API call for all remaining pages of search results
    // TODO: Add error handling/wait period for each request
    if (searchResponse?.serpapi_pagination?.next && searchResponse?.serpapi_pagination?.current) {
        let nextPageExists = searchResponse?.serpapi_pagination?.next;
        let searchStillAllowed = (maxPagination && (maxPagination >= Number(searchResponse?.serpapi_pagination?.current)));
        while (searchResponse?.serpapi_pagination?.next && searchStillAllowed) {
            console.log(`Finished page ${searchResponse.serpapi_pagination.current} with ${searchResponse.organic_results.length} results, starting next page...`);
            // Fetch next page of search results
            searchResponse = await getSearchResults({
                apiKey: globalApiKey,
                url: searchResponse.serpapi_pagination.next,
                serpAccount: (accountData["account_email"] || "Unknown")
            });
            // Write page to data object and CSV
            for (const result of getAllLinks(searchResponse)) {
                if (globalData.data.some(item => item.Link === result.link)) {
                    console.log(`URL already saved, skipped: ${result.link}`);
                } else {
                    const formattedRow = writeAsFormatted(result);
                    globalData.data.push(formattedRow);
                }
            }
            await writeToCsv(filePath, globalData);
            // Update counter for remaining pages
            searchStillAllowed = (maxPagination && (maxPagination >= Number(searchResponse?.serpapi_pagination?.current)));
        }
    }
    // Exit
    console.log(`Save complete with ${searchResponse?.serpapi_pagination?.current} pages!`);
    process.exit();
}

async function main() {
    const args = getArgs();
    if (args.hasOwnProperty("help")) {
        // Print help if requested
        showHelp();
    } else if (args.hasOwnProperty("login")) {
        // Change saved API key if requested
        await saveApiKey(envPath);
    } else if (args.hasOwnProperty("author") && args.hasOwnProperty("site")) {
        // Start search if requested
        await startSearch(args);
    } else if (args.hasOwnProperty("backup")) {
        // Start article backup with Monolith
        await startBackup(args);
    } else {
        showHelp();
    }
}

// Listen for termination signals
const gracefulShutdown = function () {
    rl.close();
    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start main process
await main();
gracefulShutdown();