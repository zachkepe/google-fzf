document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const searchInput = document.getElementById('search-input');
    const searchMode = document.getElementById('search-mode');
    const resultsCount = document.getElementById('results-count');
    const status = document.getElementById('status');
    const cancelButton = document.getElementById('cancel-search');
    const prevButton = document.getElementById('prev-match');
    const nextButton = document.getElementById('next-match');
    const matchPosition = document.getElementById('match-position');

    /** @type {number|undefined} Debounce timeout ID */
    let debounceTimeout;
    let currentIndex = 0;
    let totalMatches = 0;

    /**
     * Updates status message
     * @param {string} message - Status text
     * @param {boolean} [isError=false] - Whether it's an error message
     */
    function updateStatus(message, isError = false) {
        status.textContent = message;
        status.className = isError ? 'error' : 'success';
    }

    /** Updates match position display */
    function updateMatchPosition() {
        matchPosition.textContent = totalMatches > 0 ? `${currentIndex + 1}/${totalMatches}` : '';
        console.log(totalMatches > 0 ? 
            `Match position updated: ${currentIndex + 1}/${totalMatches}` : 
            'No matches, clearing position'
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
                updateStatus('No active tab found', true);
                return false;
            }
            const url = tab.url;
            if (url.startsWith(chrome.runtime.getURL('pdfViewer.html'))) return true;
            if (/^(chrome|about|edge|brave):\/\//i.test(url)) {
                updateStatus('Search is not available on this page', true);
                searchInput.disabled = true;
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error checking page:', error);
            updateStatus('Error checking page availability', true);
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
            updateStatus('Cannot connect to page content', true);
            return false;
        } catch (error) {
            console.error('Failed to check content script:', error);
            updateStatus('Cannot search on this page', true);
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
            resultsCount.textContent = '';
            matchPosition.textContent = '';
            currentIndex = 0;
            totalMatches = 0;
            updateMatchPosition();
            return;
        }

        // Check minimum length before proceeding
        if (query.trim().length < 2) {
            updateStatus('Please enter at least 2 characters', true);
            return;
        }

        updateStatus('Searching...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !await checkContentScript()) {
                updateStatus('Cannot connect to page', true);
                return;
            }

            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { 
                    type: 'START_SEARCH', 
                    query,
                    mode 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Search message failed:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response?.success) {
                currentIndex = response.currentIndex;
                totalMatches = response.totalMatches;
                resultsCount.textContent = `Found ${response.matchCount} match${response.matchCount !== 1 ? 'es' : ''}`;
                updateMatchPosition();
                updateStatus('');
            } else {
                updateStatus(response?.error || 'Search failed', true);
            }
        } catch (error) {
            updateStatus('Error: Could not perform search', true);
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
                updateStatus('Cannot navigate matches: page not ready', true);
                return;
            }
            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { type }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(`Navigation (${type}) failed:`, chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });
            if (!response?.success) {
                console.warn(`Failed to navigate ${type}:`, response?.error);
            }
        } catch (error) {
            console.error(`Error navigating ${type}:`, error);
            updateStatus(`Error navigating matches`, true);
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
                updateStatus('Search cancelled');
                resultsCount.textContent = '';
                matchPosition.textContent = '';
                currentIndex = 0;
                totalMatches = 0;
                updateMatchPosition();
            }
        } catch (error) {
            console.error('Cancel search error:', error);
        }
    });

    prevButton.addEventListener('click', () => navigateMatch('PREV_MATCH'));

    nextButton.addEventListener('click', () => navigateMatch('NEXT_MATCH'));

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

    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'MATCH_UPDATE' || request.type === 'SEARCH_PROGRESS') {
            currentIndex = request.currentIndex;
            totalMatches = request.totalMatches;
            updateMatchPosition();
            if (request.type === 'SEARCH_PROGRESS') {
                resultsCount.textContent = `Found ${request.count} match${request.count !== 1 ? 'es' : ''}`;
            }
        }
    });

    // Initialization
    try {
        if (await isSearchablePage()) {
            if (await checkContentScript()) {
                searchInput.focus();
            } else {
                updateStatus('Failed to connect to page content', true);
            }
        }
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('Failed to initialize extension', true);
    }
});