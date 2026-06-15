const hostname = document.location.origin;

document.getElementById("byline-start-btn").addEventListener("click", async function () {
    // Create request for server
    const params = new URLSearchParams({
        api_key: document.getElementById("byline-apikey").value,
        author: document.getElementById("byline-author").value,
        filters: document.getElementById("byline-filters").value
    });
    const url = new URL(`${hostname}/api.json`);
    url.search = params.toString();
    // Send request to server
    // TODO: Move all alerts/output to HTML elements
    console.log("Sending request to server:", url.href);
    let json;
    try {
        const response = await fetch(url);
        json = await response.json();
    } catch (error) {
        if (error instanceof SyntaxError) {
            alert('There was a SyntaxError', error);
        } else {
            alert('There was an error', error);
        }
    }
    if (json) {
        alert(json.message);
    }
})