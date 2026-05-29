#!/usr/bin/env node

import { machine, type, release } from "node:os";
import fs from "node:fs/promises";
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from "node:path";
import convert from "xml-js";
import { getAccountInfo, getSearchResults } from "./main.js";

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
    return response.replace(/^(['"])(.*)\1$/, '$2');
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
    let filePath, fileHandler;
    if (args["data"]) {
        filePath = path.resolve(args["data"]);
    } else {
        filePath = path.resolve("links.html");
    }
    // Open the file
    // TODO: Handle creation of blank file if no file exists at the path
    try {
        fileHandler = await fs.open(path.resolve(filePath), "r+");
        const fileContents = await fileHandler.readFile({ encoding: 'utf8' });
        // Parse the file
        globalData = convert.xml2js(fileContents, { compact: true });
        console.log(`Opened data file: ${filePath}\n`);
    } catch (e) {
        console.log(`There was an error loading the data file:\n${e}\n`);
        process.exit(1);
    }
    const searchQuery = `"${args['author']}" site:${args["site"]} -inurl:"/archive/" -inurl:"/tag/"`;
    const data = await getSearchResults(args["api"], searchQuery);
    const resultCount = data["search_information"]["total_results"]
    console.log(`Found ${resultCount} results. This will require ${resultCount / 10} searches to fetch all results.\n`);
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