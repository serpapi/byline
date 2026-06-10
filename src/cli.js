#!/usr/bin/env node

import { machine, type, release } from "node:os";
import fs from "node:fs/promises";
import * as readline from 'node:readline/promises';
import { env, loadEnvFile, stdin, stdout } from 'node:process';
import path from "node:path";
import Papa from 'papaparse';
import { getAccountInfo, getSearchResults, writeAsFormatted, csvTemplate, papaParseOptions } from "./main.js";
import { glob } from "node:fs";

const rl = readline.createInterface({ input: stdin, output: stdout });
const envPath = path.resolve("byline-settings.txt");
let globalApiKey = process.env.SERPAPI_KEY;
let globalData = {};

/**
 * Get the list of arguments from command line and parse them as an object.
 * @returns {object}
 */
function getArgs() {
    const array = process.argv;
    const result = {};
    for (let i = 0; i < array.length; i++) {
        const currentItem = array[i];
        if (currentItem.startsWith('-')) {
            // Remove all leading dashes
            const cleanKey = currentItem.replace(/^-+/, '');
            // Get the value and store it
            const nextValue = array[i + 1];
            result[cleanKey] = nextValue;
        }
    }
    return result;
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
    console.log("Not implemented yet!")
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
    await fs.writeFile(pathToFile, `SERPAPI_KEY=${apiKey}`);
    console.log(`Saved API key to ${pathToFile}`);
    return apiKey;
}

async function main() {
    const args = getArgs();
    // Print help if requested
    if (args.hasOwnProperty("help")) {
        showHelp();
        return;
    }
    // Change saved API key if requested
    if (args.hasOwnProperty("login")) {
        await saveApiKey(envPath);
        return;
    }
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
    // Show welcome message and account status
    let accountData;
    try {
        accountData = await getAccountInfo(globalApiKey);
    } catch {
        console.log(`\nCould not connect to SerpApi, please try again later or check your API key in ${envPath} is correct.\n`);
        process.exit(1);
    }
    console.log(`SerpAPI Byline - ${type()} ${release()} (${machine()})\n======\nAccount email: ${accountData["account_email"] || "Unknown"}\nRemaining searches: ${accountData["total_searches_left"] || "Unknown"}\nManage account: https://serpapi.com/dashboard\n======\n`);
    // Get data file location
    let filePath;
    if (args["data"]) {
        filePath = path.resolve(args["data"]);
    } else {
        filePath = path.resolve("data.csv");
    }
    // Open the file
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
        console.log(e)
        console.log(`There was an error loading the data file:\n${e}\n`);
        process.exit(1);
    }
    // TODO: Make the URL filters user-customizable
    const searchQuery = `"${args['author']}" site:${args["site"]} -inurl:"/archive/" -inurl:"/tag/" -inurl:"/category/"`;
    console.log(`Searching Google with query: ${searchQuery}\n`);
    let searchResponse = await getSearchResults({
        apiKey: globalApiKey,
        q: searchQuery
    });
    if (searchResponse?.error) {
        console.log(`Error: ${searchResponse.error}`);
        process.exit(1);
    }
    let resultCount = searchResponse["search_information"]["total_results"];
    // TODO: Exit early if account doesn't have enough credits for estimated search
    console.log(`Found ${resultCount} results. This will require ${resultCount / 10} searches to fetch all results.\n`);
    const answer = await askUser(`Type "start" to start the search:`);
    if (answer != "start") {
        console.log("Search cancelled.");
        process.exit();
    }
    // Write first page to data object and CSV
    for (const result in searchResponse["organic_results"]) {
        const formattedRow = writeAsFormatted(searchResponse["organic_results"][result]);
        globalData.data.push(formattedRow);
    }
    await writeToCsv(filePath, globalData);
    // Repeat API call for all remaining pages of search results
    // TODO: Don't add URLs that are already present in the object, add error handling/wait period for each request
    if (searchResponse?.serpapi_pagination?.next && searchResponse?.serpapi_pagination?.current) {
        while (searchResponse?.serpapi_pagination?.next) {
            console.log(`Finished page ${searchResponse.serpapi_pagination.current} with ${searchResponse.organic_results.length} results, starting next page...`);
            // Fetch next page of search results
            searchResponse = await getSearchResults({
                apiKey: globalApiKey,
                url: searchResponse.serpapi_pagination.next
            });
            // Write  page to data object and CSV
            for (const result in searchResponse["organic_results"]) {
                const formattedRow = writeAsFormatted(searchResponse["organic_results"][result]);
                globalData.data.push(formattedRow);
            }
            await writeToCsv(filePath, globalData);
        }
    }
    // Exit
    console.log("Save complete!");
    process.exit();
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