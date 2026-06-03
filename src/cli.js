#!/usr/bin/env node

import { machine, type, release } from "node:os";
import fs from "node:fs/promises";
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from "node:path";
import Papa from 'papaparse';
import { getAccountInfo, getSearchResults, writeAsFormatted, csvTemplate, papaParseOptions } from "./main.js";
import { glob } from "node:fs";

const rl = readline.createInterface({ input: stdin, output: stdout });
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

async function main() {
    const args = getArgs();
    // Print help if requested
    if (args.hasOwnProperty("help")) {
        showHelp();
        return;
    }
    // Check for API key
    if (!(args["api"])) {
        console.log(`\nMissing API key! Get the key from this page: https://serpapi.com/manage-api-key\n\nThen run Byline again with the key, like this:\nbyline -api 1c3a2de014c34641\n\nRun byline -help for more information.\n`);
        process.exit(1);
    }
    // Show welcome message and account status
    let accountData;
    try {
        accountData = await getAccountInfo(args["api"]);
    } catch {
        console.log("\nCould not connect to SerpApi, please try again later.\n");
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
    // TODO: Handle creation of blank file if no file exists at the path
    try {
        let fileContents = await fs.readFile(filePath, { encoding: "utf8" });
        // Create header row if it's not present (e.g. the file is empty)
        if (fileContents === "") {
            fileContents = csvTemplate.toString();
            console.log(fileContents)
        }
        // Parse file
        globalData = Papa.parse(fileContents, papaParseOptions);
        console.log(`Opened data file with ${globalData.data.length} entries: ${filePath}\n`);
    } catch (e) {
        console.log(`There was an error loading the data file:\n${e}\n`);
        process.exit(1);
    }
    // TODO: Make the URL filters user-customizable
    const searchQuery = `"${args['author']}" site:${args["site"]} -inurl:"/archive/" -inurl:"/tag/" -inurl:"/category/"`;
    console.log(`Searching Google with query: ${searchQuery}`);
    const initData = await getSearchResults({
        apiKey: args["api"],
        q: searchQuery
    });
    const resultCount = initData["search_information"]["total_results"]
    // TODO: Exit early if account doesn't have enough credits for estimated search
    console.log(`Found ${resultCount} results. This will require ${resultCount / 10} searches to fetch all results.\n`);
    const answer = await askUser(`Type "start" to start the search:`);
    if (answer === "start") {
        // Write first page to CSV
        for (const result in initData["organic_results"]) {
            globalData.data.push(writeAsFormatted(initData["organic_results"][result]))
        }
        // TODO: Continue through all paginations, don't add URLs that are already present in the object
        // Write new CSV file
        try {
            const csvExport = Papa.unparse(globalData, papaParseOptions)
            await fs.writeFile(path.resolve(filePath), csvExport);
            console.log(`Saved to file: ${path.resolve(filePath)}`);
        } catch (e) {
            console.log(`There was an error saving the data file:\n${e}\n`);
            process.exit(1);
        }
    } else {
        console.log("Search cancelled.")
    }
    // Exit
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