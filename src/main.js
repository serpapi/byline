// Functions shared across CLI and web frontend

// Blank CSV file template
const csvTemplate = `"Website","Title","Date (Formatted)","Date (ISO)","Link","Snippet","Language"`;

// Settings to use for parsing CSV files
const papaParseOptions = {
    quotes: true,
    header: true,
    skipEmptyLines: true
};

/**
 * Check information for a SerpApi account.
 * More info: https://serpapi.com/account-api
 * @param {string} api_key The API key connected to the account
 * @returns {object} The JSON response from SerpApi.
 */
async function getAccountInfo(api_key) {
    // Create API request
    const url = `https://serpapi.com/account?api_key=${api_key}`
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const result = await response.json();
        return result;
    } catch (error) {
        throw new Error(error);
    }
}

/**
 * Get results for search query using SerpApi Google Search.
 * @param {object} settings The settings configuration.
 * @param {string} settings.apiKey The API key for SerpApi.
 * @param {string} settings.serpAccount The email address or hashed API key of the active SerpApi account.
 * @param {string} settings.author The author or creator to search.
 * @param {string} settings.site The site to search.
 * @param {Array} settings.filters The list of strings to ignore in the URL path. Engines besides Google will only use the first filter.
 * @param {string} settings.engine The search engine to use.
 * @param {string} settings.url If present, this URL will be used for the API call instead of other settings.
 * @returns {object} The JSON response from SerpApi.
 */
async function getSearchResults(settings) {
    let response = {};
    // Create search string
    let query = `"${settings.author}" site:${settings.site}`;
    if (settings?.filters?.length && (settings.engine === "google" || settings.engine === "google_light")) {
        // Google generally supports multiple URL filters
        query += ` ${settings.filters.map(filter => `-inurl:"${filter}"`).join(' ')}`;
    } else if (settings?.filters?.length) {
        // Bing, Yahoo, DuckDuckGo, etc will return zero results if more than one filter is defined
        query += ` -inurl:${settings.filters[0]}`;
    }
    // Create URL for API call
    let url;
    if (settings.url) {
        url = new URL(settings.url);
        url.searchParams.set("api_key", settings.apiKey);
    } else {
        // Some values are not used for all engines, SerpApi ignores the ones that aren't needed
        const options = new URLSearchParams({
            engine: settings.engine,
            hl: "en",
            mkt: "en-US",
            p: query,
            q: query,
            filter: 0,
            api_key: settings.apiKey
        });
        url = ("https://serpapi.com/search?" + options);
        console.log(`[${settings?.serpAccount || "Unknown account"}] Searching ${settings.engine} with query: ${query}`);
    }
    // Make API call
    try {
        const serpResponse = await fetch(url);
        if (serpResponse.ok) {
            response = await serpResponse.json();
        } else {
            console.error(`Response status: ${serpResponse.status}`);
            response.error = `There was a ${serpResponse.status} error.`;
            return response;
        }
    } catch (error) {
        console.error(error);
        response.error = error?.message;
        return response;
    }
    // Add estimate for searches remaining, if this is the first search for the query
    if (!settings.url) {
        let returnData = {};
        const firstPageResults = (response?.organic_results?.length ?? 0) + (response?.inline_videos?.length ?? 0);
        const remainingPages = response?.serpapi_pagination?.other_pages;
        if (firstPageResults && remainingPages) {
            // There is at least one more page of results, but no estimate is available
            const lastPage = Math.max(...Object.keys(remainingPages));
            response.byline_estimate = `Found ${firstPageResults} ${firstPageResults > 1 ? "results" : "result"} on first page. This will require at least ${lastPage} searches to fetch all results.`;
        } else if (firstPageResults > 0) {
            // There are no more pages of results
            response.byline_estimate = `Found ${firstPageResults} results and no more pages.`;
        } else {
            // There are no results
            response.error = response.error || `No results were found with the ${searchEngine} engine.`;
        }
    }
    // Send result
    return response;
}

/**
 * Combine all JSON objects that could contain links to web articles or videos.
 * @param {object} searchResponse A JSON response from SerpApi
 * @returns {Array}
 */
function getAllLinks(searchResponse) {
    const organicResults = searchResponse?.organic_results || [];
    const inlineVideos = searchResponse?.inline_videos || [];
    const visualStories = searchResponse?.visual_stories || [];
    const inlineImages = searchResponse?.inline_images || [];
    return [...organicResults, ...inlineVideos, ...visualStories, ...inlineImages];
}

/**
 * Convert a SerpAPI result into an object for use with Papa Parse.
 * @param {object} searchResult An item from an organic_results API response.
 * @returns {object} Object for Papa Parse data, representing a row in the CSV export.
 */
function writeAsFormatted(searchResult) {
    // Set title, link, source, snippet, and language
    let response;
    if (searchResult?.source_name && searchResult?.original) {
        // Inline image results: https://serpapi.com/google-inline-images
        response = {
            "Website": (searchResult?.source_name || new URL(searchResult?.source).hostname),
            "Title": (searchResult?.title || ""),
            "Link": (searchResult?.source || "")
        }
    } else {
        // Organic results: https://serpapi.com/organic-results
        // Inline videos: https://serpapi.com/inline-videos
        // Visual stories: https://serpapi.com/visual-stories
        response = {
            "Website": (searchResult?.source || searchResult?.platform || new URL(searchResult?.link).hostname),
            "Title": (searchResult?.title || ""),
            "Link": (searchResult?.link || ""),
            "Snippet": (searchResult?.snippet || ""),
            "Language": (searchResult?.about_this_result?.languages || "")
        }
    }
    // Set formatted date strings
    if (searchResult?.date) {
        let publishedDate;
        let currentDate = new Date();
        if (searchResult.date.includes("minute")) {
            // Examples: 28 minutes ago, 1 minute ago
            const amount = parseInt(searchResult.date);
            // Convert minutes to milliseconds: minutes * 60s * 60m * 1000ms
            publishedDate = new Date(currentDate.getTime() - (amount * 60000));
        } else if (searchResult.date.includes("hour")) {
            // Examples: 4 hours ago, 1 hour ago
            const amount = parseInt(searchResult.date);
            // Convert hours to milliseconds: hours * 60m * 60s * 1000ms
            publishedDate = new Date(currentDate.getTime() - (amount * 3600000));
        } else if (searchResult.date.includes("day")) {
            // Examples: 6 days ago, 1 day ago
            const amount = parseInt(searchResult.date);
            // Convert days to milliseconds: days * 24h * 60m * 60s * 1000ms
            publishedDate = new Date(currentDate.getTime() - (amount * 86400000));
        } else if (searchResult.date.includes("month")) {
            // Examples: 1 month ago, 2 months ago
            const amount = parseInt(searchResult.date);
            // Convert months to milliseconds: months * 30 days * 24h * 60m * 60s * 1000ms
            publishedDate = new Date(currentDate.getTime() - (amount * 2592000000));
        } else {
            // Example: Dec 20, 2025
            publishedDate = new Date(searchResult.date);
        }
        // Add international date format for best Excel compatibility, like "2023-10-27"
        response["Date (Formatted)"] = new Intl.DateTimeFormat('en-CA').format(publishedDate);
        // Add ISO 8601 date format for parsing with other tools, like "2023-10-27T14:30:00.000Z"
        response["Date (ISO)"] = publishedDate.toISOString();
    }
    return response;
}

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

export { getAccountInfo, getSearchResults, writeAsFormatted, csvTemplate, papaParseOptions, getArgs, getAllLinks }