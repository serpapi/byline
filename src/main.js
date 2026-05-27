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

export { getAccountInfo }