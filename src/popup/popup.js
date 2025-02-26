document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const searchInput = document.getElementById('search-input');
    const searchMode = document.getElementById('search-mode');
    const cancelButton = document.getElementById('cancel-search');
    const prevButton = document.getElementById('prev-match');
    const nextButton = document.getElementById('next-match');
    const matchPosition = document.getElementById('match-position');

    /** @type {number|undefined} Debounce timeout ID */
    let debounceTimeout;
    let currentIndex = 0;
    let totalMatches = 0;

    /**
     * Updates match position display (e.g., "1/5").
     * Shows "0/0" if no matches exist.
     */
    function updateMatchPosition() {
        matchPosition.textContent = `${(totalMatches > 0 ? currentIndex + 1 : 0)}/${totalMatches}`;
        console.log(
            totalMatches > 0 
                ? `Match position updated: ${currentIndex + 1}/${totalMatches}`
                : 'No matches, showing 0/0'
        );
    }

    /**
     * Checks if current page is searchable
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
            // Also skip if the domain is the Chrome Web Store or internal pages
            if (
                /^(chrome|about|edge|brave):\/\//i.test(url) ||
                /chrome.google.com\/webstore/.test(url)
            ) {
                console.log('Search is not available on this page');
                searchInput.disabled = true;
                searchInput.placeholder = 'Cannot search page';
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error checking page:', error);
            return false;
        }
    }

    /**
     * Ensures content script is injected and responsive with retries
     * @async
     * @param {number} [retries=2] - Number of retries
     * @param {number} [delayMs=500] - Delay between retries in milliseconds
     * @returns {Promise<boolean>}
     */
    async function checkContentScript(retries = 2, delayMs = 500) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !await isSearchablePage()) return false;

            // Helper function to send PING and wait for response
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

            // Check if content script is already responsive
            let response = await pingContentScript();
            if (response?.status === 'OK') return true;

            // Retry logic if initial PING fails
            for (let attempt = 0; attempt < retries; attempt++) {
                console.log(`Content script not responding, attempt ${attempt + 1} of ${retries}`);
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.bundle.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, delayMs)); // Wait for script to load
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
     * Performs search operation
     * @async
     * @param {string} query - Search query
     * @param {string} mode - Search mode
     */
    async function performSearch(query, mode) {
        if (!query.trim()) {
            matchPosition.textContent = '0/0';
            currentIndex = 0;
            totalMatches = 0;
            updateMatchPosition();
            return;
        }

        // Minimum length check
        if (query.trim().length < 2) {
            console.log('Please enter at least 2 characters');
            return;
        }

        console.log('Searching...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !await checkContentScript()) {
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
            } else {
                console.log(response?.error || 'Search failed');
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    /**
     * Sends navigation command to content script
     * @async
     * @param {string} type - Navigation type ('PREV_MATCH' or 'NEXT_MATCH')
     */
    async function navigateMatch(type) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !await checkContentScript()) {
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

    // Event listeners
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => performSearch(e.target.value, searchMode.value), 300);
    });

    searchMode.addEventListener('change', () => {
        if (searchInput.value) performSearch(searchInput.value, searchMode.value);
    });

    cancelButton.addEventListener('click', async () => {
        try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
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
        }
        } catch (error) {
        console.error('Cancel search error:', error);
        } finally {
        window.close();
        }
    });

    prevButton.addEventListener('click', () => navigateMatch('PREV_MATCH'));
    nextButton.addEventListener('click', () => navigateMatch('NEXT_MATCH'));

    // Focus the search input when Cmd+Shift+S is pressed
    document.addEventListener('keydown', (e) => {
        if ((e.key === 's' && e.metaKey && e.shiftKey) ||  // Mac: Command+Shift+S
            (e.key === 'S' && e.ctrlKey && e.shiftKey)) {  // Windows/Linux: Ctrl+Shift+S
            e.preventDefault();
            document.getElementById('search-input').focus();
        }
    });

    // Listen for Enter to navigate matches
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

    // Handle updates from content script about match changes
    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'MATCH_UPDATE' || request.type === 'SEARCH_PROGRESS') {
            currentIndex = request.currentIndex;
            totalMatches = request.totalMatches;
            updateMatchPosition();
        }
    });

    // Initialization
    try {
        if (await isSearchablePage()) {
            if (await checkContentScript()) {
                searchInput.focus();
            } else {
                console.log('Failed to connect to page content');
            }
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
});
