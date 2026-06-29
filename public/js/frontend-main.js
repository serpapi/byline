const hostname = document.location.origin;

// Page elements
const errorEl = document.getElementById("byline-error");
const errorMessageEl = document.getElementById("byline-error-message");
const loadingEl = document.getElementById("byline-loading");
const loadingMessageEl = document.getElementById("byline-loading-text");
const confirmEl = document.getElementById("byline-confirm-start");
const confirmMessageEl = document.getElementById("byline-estimate");
const startBtn = document.getElementById("byline-start-btn");

// Form values
const apiField = document.getElementById("byline-apikey");
const authorField = document.getElementById("byline-author");
const websiteField = document.getElementById("byline-website");
const filtersField = document.getElementById("byline-filters");
const confirmCheck = document.getElementById("byline-confirm-check");

// Automatically save all text field values to localStorage
document.querySelectorAll("input[type='text']").forEach(function () {
    this.addEventListener("change", function (event) {
        localStorage.setItem(event.target.id, event.target.value);
    })
})

// Restore settings from localStorage on page load
document.addEventListener("DOMContentLoaded", function () {
    for (const [key, value] of Object.entries(localStorage)) {
        document.getElementById(key).value = value;
    }
})

/**
 * Show the error box with the provided message.
 * @param {String} message
 */
function showError(message) {
    errorMessageEl.innerText = message;
    loadingEl.classList.add("d-none");
    confirmEl.classList.add("d-none");
    errorEl.classList.remove("d-none");
}

/**
 * Show loading box with optional message.
 * @param {String} message
 */
function showLoading(message = null) {
    if (message) {
        loadingMessageEl.innerText = message;
    } else {
        loadingMessageEl.innerText = "Loading, please wait...";
    }
    errorEl.classList.add("d-none");
    confirmEl.classList.add("d-none");
    loadingEl.classList.remove("d-none");
}

/**
 * Show the confirmation box with the provided message.
 * @param {String} message
 */
function showConfirmation(message) {
    confirmMessageEl.innerText = message;
    errorEl.classList.add("d-none");
    loadingEl.classList.add("d-none");
    confirmEl.classList.remove("d-none");
}

async function switchPage(apiKey) {
    // Disable form elements and buttons
    apiField.setAttribute("disabled", "true");
    authorField.setAttribute("disabled", "true");
    websiteField.setAttribute("disabled", "true");
    filtersField.setAttribute("disabled", "true");
    startBtn.setAttribute("disabled", "true");
    // Show initial loading message
    showLoading();
    let status = "loading";
    // Make API requests to check progress
    while (status === "loading") {
        // Wait for 5 seconds
        await new Promise(r => setTimeout(r, 2000));
        // Check status with API
        try {
            const response = await fetch(`${hostname}/api.json?api_key=${apiKey}`);
            const data = await response.json();
            console.log('Data received:', data);
            if (data?.status === "running") {
                showLoading(data.message);
            } else if (data?.status === "done") {
                // TODO: Make this a clickable download link
                showLoading(data.message);
                status = "done";
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showError(error);
        }
    }
}

// Start button
startBtn.addEventListener("click", async function () {
    // Switch to loading message
    showLoading();
    // Create request for server
    const params = new URLSearchParams({
        api_key: apiField.value,
        author: authorField.value,
        website: websiteField.value,
        filters: filtersField.value,
        confirm: confirmCheck.checked
    });
    const url = new URL(`${hostname}/api.json`);
    url.search = params.toString();
    // Uncheck the confirm box, so subsequent requests are not automatically granted
    confirmCheck.checked = false;
    // Send request to SerpApi server
    console.log("Sending request to SerpApi:", url.href);
    let json;
    try {
        const response = await fetch(url);
        json = await response.json();
    } catch (error) {
        console.log(error);
        showError(error);
    }
    console.log("Got response from server:", json);
    if (json?.status === "running") {
        await switchPage(apiField.value);
    } else if (json?.message) {
        showConfirmation(json.message);
    } else if (json?.error) {
        showError(json.error);
    } else {
        showError("Could not read response from server.");
    }
})