#!/usr/bin/env node

import { machine, type, release } from "os";
import { getAccountInfo } from "./main.js";

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
        return;
    }
    console.log(`SerpAPI Byline - ${type()} ${release()} (${machine()})\n======\nAccount email: ${accountData["account_email"] || "Unknown"}\nRemaining searches: ${accountData["total_searches_left"] || "Unknown"}\nManage account: https://serpapi.com/dashboard\n======\n`);
}

main();