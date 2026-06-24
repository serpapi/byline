const hostname = document.location.origin;
const errorEl = document.getElementById("byline-error");
const errorMessageEl = document.getElementById("byline-error-message");
const loadingEl = document.getElementById("byline-loading");
const confirmEl = document.getElementById("byline-confirm-start");
const confirmMessageEl = document.getElementById("byline-estimate");

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
 * Show loading box and hide other messages.
 */
function showLoading() {
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

// Start button
document.getElementById("byline-start-btn").addEventListener("click", async function () {
    // Switch to loading message
    showLoading();
    // Create request for server
    const params = new URLSearchParams({
        api_key: document.getElementById("byline-apikey").value,
        author: document.getElementById("byline-author").value,
        website: document.getElementById("byline-website").value,
        filters: document.getElementById("byline-filters").value
    });
    const url = new URL(`${hostname}/api.json`);
    url.search = params.toString();
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
    if (json?.message) {
        showConfirmation(json.message);
    } else if (json?.error) {
        showError(json.error);
    } else {
        showError("Could not read response from server.");
    }
})