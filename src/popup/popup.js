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
     * Ensures content script is injected and responsive
     * @async
     * @returns {Promise<boolean>}
     */
    async function checkContentScript() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !await isSearchablePage()) return false;

            // Check if content script is already responsive
            try {
                const response = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { type: 'PING' }, resolve);
                });
                if (response?.status === 'OK') return true;
            } catch (error) {
                console.log('Content script not responding, attempting injection:', error.message);
            }

            // Inject content script if not already present
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.bundle.js']
                });
                // Verify injection worked
                const response = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { type: 'PING' }, resolve);
                });
                if (response?.status === 'OK') return true;
                throw new Error('Content script injected but not responding');
            } catch (injectionError) {
                console.error('Failed to inject or verify content script:', injectionError);
                updateStatus('Cannot connect to page content', true);
                return false;
            }
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
                }, resolve);
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
                await chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' });
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

    prevButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'PREV_MATCH' });
        } catch (error) {
            console.error('Previous match error:', error);
        }
    });

    nextButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'NEXT_MATCH' });
        } catch (error) {
            console.error('Next match error:', error);
        }
    });

    document.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                    await chrome.tabs.sendMessage(tab.id, { 
                        type: e.shiftKey ? 'PREV_MATCH' : 'NEXT_MATCH' 
                    });
                }
            } catch (error) {
                console.error('Keyboard shortcut error:', error);
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