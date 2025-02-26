document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const searchInput = document.getElementById('search-input');
    const searchMode = document.getElementById('search-mode');
    const cancelButton = document.getElementById('cancel-search');
    const prevButton = document.getElementById('prev-match');
    const nextButton = document.getElementById('next-match');
    const matchPosition = document.getElementById('match-position');
    const confirmButton = document.getElementById('confirm-search'); // Checkmark button

    /** @type {number|undefined} Debounce timeout ID */
    let debounceTimeout;
    let currentIndex = 0;
    let totalMatches = 0;

    // Use chrome.storage.local if available; otherwise log a warning.
    const storageAvailable = chrome && chrome.storage && chrome.storage.local;
    if (storageAvailable) {
        chrome.storage.local.get(['fzfLastMode', 'fzfLastQuery'], (result) => {
            if (result.fzfLastMode) {
                searchMode.value = result.fzfLastMode; // Restore saved mode
            } // If not saved, it will fall back to the default (e.g. "semantic" in your HTML)
            if (result.fzfLastQuery) {
                searchInput.value = result.fzfLastQuery; // Restore saved query
            }
            // After setting stored values, check if there is a user selection.
            checkForSelection();
        });
    } else {
        console.warn('chrome.storage.local not available, using default mode and query.');
        checkForSelection();
    }

    /**
     * Checks for any highlighted text on the active page.
     * If found and if the page is searchable, it sets it as the query and immediately performs a search.
     */
    async function checkForSelection() {
        if (!(await isSearchablePage())) {
            searchInput.disabled = true;
            searchInput.placeholder = 'Cannot search page';
            confirmButton.disabled = true;
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !(await checkContentScript())) return;
        // Ask the content script for any current text selection.
        const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.error('Get selection failed:', chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    resolve(resp);
                }
            });
        });
        if (response?.selection) {
            searchInput.value = response.selection;
            await performSearch(response.selection, searchMode.value); // Search immediately with selection
        } else {
            searchInput.focus();
        }
    }

    /**
     * Updates match position display (e.g. "1/5").
     */
    function updateMatchPosition() {
        matchPosition.textContent = `${(totalMatches > 0 ? currentIndex + 1 : 0)}/${totalMatches}`;
        console.log(totalMatches > 0
            ? `Match position updated: ${currentIndex + 1}/${totalMatches}`
            : 'No matches, showing 0/0');
    }

    /**
     * Checks if the active page is searchable (i.e. not an internal page or Chrome Web Store).
     * Disables search input and button if not.
     * @async
     * @returns {Promise<boolean>}
     */
    async function isSearchablePage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) {
                console.log('No active tab found');
                return false;
            }
            const url = tab.url;
            // Do not allow search on internal pages (like chrome://, about://, etc.) or on the webstore.
            if (/^(chrome|about|edge|brave):\/\//i.test(url) || /chrome.google.com\/webstore/.test(url)) {
                console.log('Search is not available on this page');
                searchInput.disabled = true;
                searchInput.placeholder = 'Cannot search page';
                confirmButton.disabled = true;
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error checking page:', error);
            return false;
        }
    }

    /**
     * Ensures that the content script is injected and responsive.
     * Retries injection if necessary.
     * @async
     * @param {number} [retries=2]
     * @param {number} [delayMs=500]
     * @returns {Promise<boolean>}
     */
    async function checkContentScript(retries = 2, delayMs = 500) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !(await isSearchablePage())) return false;

            const pingContentScript = () => new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('PING failed:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });

            let response = await pingContentScript();
            if (response?.status === 'OK') return true;

            for (let attempt = 0; attempt < retries; attempt++) {
                console.log(`Content script not responding, attempt ${attempt + 1} of ${retries}`);
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.bundle.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    response = await pingContentScript();
                    if (response?.status === 'OK') {
                        console.log('Content script successfully reinjected');
                        return true;
                    }
                } catch (injectionError) {
                    console.error(`Injection attempt ${attempt + 1} failed:`, injectionError);
                }
            }
            console.error('Failed to connect to content script after retries');
            return false;
        } catch (error) {
            console.error('Failed to check content script:', error);
            return false;
        }
    }

    /**
     * Performs a search by sending a message to the content script.
     * Saves the query in storage after a successful search.
     * @async
     * @param {string} query
     * @param {string} mode
     */
    async function performSearch(query, mode) {
        if (!query.trim()) {
            matchPosition.textContent = '0/0';
            currentIndex = 0;
            totalMatches = 0;
            updateMatchPosition();
            return;
        }
        if (query.trim().length < 2) {
            console.log('Please enter at least 2 characters');
            return;
        }
        // Double-check the page is searchable.
        if (!(await isSearchablePage())) {
            console.warn('Page not searchable, aborting search.');
            return;
        }
        console.log('Searching...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !(await checkContentScript())) {
                console.log('Cannot connect to page');
                return;
            }
            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'START_SEARCH',
                    query,
                    mode
                }, (resp) => {
                    if (chrome.runtime.lastError) {
                        console.error('Search message failed:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(resp);
                    }
                });
            });
            if (response?.success) {
                currentIndex = response.currentIndex;
                totalMatches = response.totalMatches;
                console.log(`Found ${response.matchCount} match(es)`);
                updateMatchPosition();
                // Save the query for next time if storage is available.
                if (storageAvailable) {
                    chrome.storage.local.set({ fzfLastQuery: query });
                }
            } else {
                console.log(response?.error || 'Search failed');
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    /**
     * Sends a navigation command (next or previous match) to the content script.
     * @async
     * @param {string} type
     */
    async function navigateMatch(type) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !(await checkContentScript())) {
                console.log('Cannot navigate matches: page not ready');
                return;
            }
            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { type }, (resp) => {
                    if (chrome.runtime.lastError) {
                        console.error(`Navigation (${type}) failed:`, chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(resp);
                    }
                });
            });
            if (!response?.success) {
                console.warn(`Failed to navigate ${type}:`, response?.error);
            }
        } catch (error) {
            console.error(`Error navigating ${type}:`, error);
        }
    }

    // Event listeners for user input and buttons
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => performSearch(e.target.value, searchMode.value), 300);
    });

    searchMode.addEventListener('change', () => {
        if (storageAvailable) {
            chrome.storage.local.set({ fzfLastMode: searchMode.value });
        }
        if (searchInput.value) performSearch(searchInput.value, searchMode.value);
    });

    cancelButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && (await checkContentScript())) {
                await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Cancel search failed:', chrome.runtime.lastError.message);
                        }
                        resolve(response);
                    });
                });
                console.log('Search cancelled');
                matchPosition.textContent = '0/0';
                currentIndex = 0;
                totalMatches = 0;
                updateMatchPosition();
            } else {
                console.log('Content script not available, skipping cancel search');
            }
        } catch (error) {
            console.error('Cancel search error:', error);
        } finally {
            window.close();
        }
    });

    prevButton.addEventListener('click', () => navigateMatch('PREV_MATCH'));
    nextButton.addEventListener('click', () => navigateMatch('NEXT_MATCH'));

    // Focus the search input when the user presses Cmd+Shift+S (or Ctrl+Shift+S)
    document.addEventListener('keydown', (e) => {
        if ((e.key === 's' && e.metaKey && e.shiftKey) ||
            (e.key === 'S' && e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // Shortcut to cycle search modes quickly (Ctrl+Shift+M)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            cycleSearchMode();
        }
    });

    /**
     * Cycles through the available search modes.
     */
    function cycleSearchMode() {
        const modes = ['semantic', 'exact', 'fuzzy'];
        const currentModeIndex = modes.indexOf(searchMode.value);
        const nextIndex = (currentModeIndex + 1) % modes.length;
        searchMode.value = modes[nextIndex];
        if (storageAvailable) {
            chrome.storage.local.set({ fzfLastMode: searchMode.value });
        }
        if (searchInput.value) performSearch(searchInput.value, searchMode.value);
    }

    // Use Enter to navigate matches (Shift+Enter goes to previous)
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                await navigateMatch('PREV_MATCH');
            } else {
                await navigateMatch('NEXT_MATCH');
            }
        }
    });

    // Listen for updates from the content script regarding match changes.
    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'MATCH_UPDATE' || request.type === 'SEARCH_PROGRESS') {
            currentIndex = request.currentIndex;
            totalMatches = request.totalMatches;
            updateMatchPosition();
        }
    });

    // Confirm button triggers a search if there is a query.
    confirmButton.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (query) {
            await performSearch(query, searchMode.value);
        } else {
            console.log('No query entered');
        }
    });
});
