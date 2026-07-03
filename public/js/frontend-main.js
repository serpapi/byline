const hostname = document.location.origin;

// Page elements
const errorEl = document.getElementById("byline-error");
const errorMessageEl = document.getElementById("byline-error-message");
const loadingEl = document.getElementById("byline-loading");
const loadingMessageEl = document.getElementById("byline-loading-text");
const confirmEl = document.getElementById("byline-confirm-start");
const confirmMessageEl = document.getElementById("byline-estimate");
const startBtn = document.getElementById("byline-start-btn");
const downloadEl = document.getElementById("byline-download");
const downloadBtn = document.getElementById("byline-download-btn");

// Form values
const apiField = document.getElementById("byline-apikey");
const authorField = document.getElementById("byline-author");
const websiteField = document.getElementById("byline-website");
const limitField = document.getElementById("byline-limit");
const filtersField = document.getElementById("byline-filters");
const confirmCheck = document.getElementById("byline-confirm-check");

// Automatically save all text/number field values to localStorage
document.querySelectorAll("input[type='text'],input[type='number']").forEach(function () {
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
    // Set message
    errorMessageEl.innerText = message;
    // Hide other elements
    downloadEl.classList.add("d-none");
    loadingEl.classList.add("d-none");
    confirmEl.classList.add("d-none");
    errorEl.classList.remove("d-none");
    // Enable form elements
    apiField.removeAttribute("disabled");
    authorField.removeAttribute("disabled");
    websiteField.removeAttribute("disabled");
    limitField.removeAttribute("disabled");
    filtersField.removeAttribute("disabled");
    startBtn.removeAttribute("disabled");
}

/**
 * Show loading box with optional message.
 * @param {String} message
 */
function showLoading(message = null) {
    // Set message
    if (message) {
        loadingMessageEl.innerText = message;
    } else {
        loadingMessageEl.innerText = "Loading, please wait...";
    }
    // Hide other elements
    downloadEl.classList.add("d-none");
    errorEl.classList.add("d-none");
    confirmEl.classList.add("d-none");
    // Disable form elements and buttons
    apiField.setAttribute("disabled", "true");
    authorField.setAttribute("disabled", "true");
    websiteField.setAttribute("disabled", "true");
    limitField.setAttribute("disabled", "true");
    filtersField.setAttribute("disabled", "true");
    startBtn.setAttribute("disabled", "true");
    // Show loading element
    loadingEl.classList.remove("d-none");
}

/**
 * Show the confirmation box with the provided message.
 * @param {String} message
 */
function showConfirmation(message) {
    // Set message
    confirmMessageEl.innerText = message;
    // Hide other elements
    downloadEl.classList.add("d-none");
    errorEl.classList.add("d-none");
    loadingEl.classList.add("d-none");
    // Disable form elements
    apiField.setAttribute("disabled", "true");
    authorField.setAttribute("disabled", "true");
    websiteField.setAttribute("disabled", "true");
    limitField.setAttribute("disabled", "true");
    filtersField.setAttribute("disabled", "true");
    // Enable start button again
    startBtn.removeAttribute("disabled");
    // Show confirmation element
    confirmEl.classList.remove("d-none");
}

function showDownload(path) {
    // Set download link and file name
    downloadBtn.setAttribute("download", "Byline Export - " + authorField.value);
    downloadBtn.setAttribute("href", path);
    // Show download alert and hide all other alerts
    errorEl.classList.add("d-none");
    loadingEl.classList.add("d-none");
    confirmMessageEl.classList.add("d-none");
    downloadEl.classList.remove("d-none");
}

async function switchPage(apiKey) {
    // Show initial loading message and disable form elements
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
                showDownload(data.download);
                status = "done";
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showError(error);
        }
    }
}

// Delete button
document.getElementById("byline-confirm-delete").addEventListener("click", async function () {
    // Create request for server
    const req = `${hostname}/delete.json?api_key=${apiField.value}`;
    try {
        const response = await fetch(`${hostname}/delete.json?api_key=${apiField.value}`);
        const data = await response.json();
        console.log('Data received:', data);
        if (data?.message === "done") {
            location.reload();
        } else {
            showError("There was an unknown error.");
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showError(error);
    }

});

// Start button
startBtn.addEventListener("click", async function () {
    // Switch to loading message
    document.documentElement.dataset.loading = "true";
    showLoading();
    // Create request for server
    const params = new URLSearchParams({
        api_key: apiField.value,
        author: authorField.value,
        website: websiteField.value,
        limit: limitField.value,
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
        document.documentElement.dataset.loading = "false";
        console.log(error);
        showError(error);
    }
    console.log("Got response from server:", json);
    if (json?.status === "done") {
        showDownload(json.download);
    } else if (json?.status === "running") {
        await switchPage(apiField.value);
    } else if (json?.message) {
        showConfirmation(json.message);
    } else if (json?.error) {
        showError(json.error);
    } else {
        showError("Could not read response from server.");
    }
    document.documentElement.dataset.loading = "false";
})