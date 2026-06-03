// Functions shared across CLI and web frontend

// Blank CSV file template
const csvTemplate = `"Website","Title","Date (Formatted)","Date (ISO)","Link","Snippet"`;
// Settings to use for parsing CSV files
const papaParseOptions = {
    quotes: true,
    header: true
};

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
 * Get results for search query using SerpApi Google Light Search.
 * @param {object} settings The settings configuration.
 * @param {string} settings.apiKey The API key for SerpApi.
 * @param {string} settings.q The full search query.
 * @param {string} settings.url If present, this URL will be used for the API call instead of other settings.
 * @returns {object} The JSON response from SerpApi.
 */
async function getSearchResults(settings) {
    // Create URL for API call
    let url;
    if (settings.url) {
        url = new URL(settings.url);
        url.searchParams.set("api_key", settings.apiKey);
    } else {
        const options = new URLSearchParams({
            engine: "google",
            q: settings.q,
            filter: 0,
            api_key: settings.apiKey
        });
        url = ("https://serpapi.com/search?" + options);
    }
    // Run the API call
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
 * Convert a SerpAPI organic search result into an object for use with Papa Parse.
 * @param {object} searchResult An item from an organic_results API response.
 * @returns {object} Object for Papa Parse data, representing a row in the CSV export.
 */
function writeAsFormatted(searchResult) {
    const response = {
        "Website": (searchResult?.source || new URL(searchResult?.link).hostname),
        "Title": (searchResult?.title || "Unknown Title"),
        "Link": searchResult.link,
        "Snippet": (searchResult?.snippet || "No snippet")
    }
    // Create formatted date strings
    if (searchResult?.date) {
        const date = new Date(searchResult.date);
        // Add international date format for best Excel compatibility, like "2023-10-27"
        response["Date (Formatted)"] = new Intl.DateTimeFormat('en-CA').format(date);
        // Add ISO 8601 date format for parsing with other tools, like "2023-10-27T14:30:00.000Z"
        response["Date (ISO)"] = date.toISOString();
    }
    return response;
}

export { getAccountInfo, getSearchResults, writeAsFormatted, csvTemplate, papaParseOptions }