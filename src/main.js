// Functions shared across CLI and web frontend

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
 * @param {*} api_key The API key for SerpApi.
 * @param {*} searchQuery The full search query.
 * @param {*} pagination The page of search results to extract.
 * @returns {object} The JSON response from SerpApi.
 */
async function getSearchResults(api_key, searchQuery, pagination=0) {
    // Create URL request
    const options = new URLSearchParams({
        engine: "google",
        q: searchQuery,
        filter: 0,
        start: (pagination * 10),
        api_key: api_key
    });
    const url = ("https://serpapi.com/search?" + options);
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

export { getAccountInfo, getSearchResults }