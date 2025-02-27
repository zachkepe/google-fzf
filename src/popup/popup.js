/**
 * Initializes the popup UI and handles search functionality.
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const searchInput = document.getElementById('search-input');
    const searchMode = document.getElementById('search-mode');
    const cancelButton = document.getElementById('cancel-search');
    const prevButton = document.getElementById('prev-match');
    const nextButton = document.getElementById('next-match');
    const matchPosition = document.getElementById('match-position');
    const confirmButton = document.getElementById('confirm-search');

    /** @type {number|undefined} Timeout ID for debouncing search input */
    let debounceTimeout;
    let currentIndex = 0;
    let totalMatches = 0;

    const storageAvailable = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);

    // Wait for content script readiness before proceeding
    const pageSearchable = await isSearchablePage();
    if (!pageSearchable) {
        searchInput.disabled = true;
        searchInput.placeholder = 'Cannot search page';
        confirmButton.disabled = true;
        return;
    }

    const contentScriptReady = await waitForContentScript();
    if (!contentScriptReady) {
        console.warn('Content script not ready after timeout; functionality may be limited');
        searchInput.placeholder = 'Page not fully loaded yet';
        searchInput.disabled = true;
        confirmButton.disabled = true;
        return;
    }

    if (storageAvailable) {
        chrome.storage.local.get(['fzfLastMode', 'fzfLastQuery'], (result) => {
            if (result.fzfLastMode) searchMode.value = result.fzfLastMode;
            if (result.fzfLastQuery) searchInput.value = result.fzfLastQuery;
            checkForSelection();
        });
    } else {
        console.warn('chrome.storage.local not available, using defaults.');
        checkForSelection();
    }

    /**
     * Waits for the content script to be ready with a timeout.
     * @async
     * @returns {Promise<boolean>} True if ready, false if timed out.
     */
    async function waitForContentScript(timeoutMs = 2000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (await checkContentScript()) return true;
            await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
        }
        return false;
    }

    /**
     * Checks for selected text on the active page and triggers a search if present.
     * @async
     */
    async function checkForSelection() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        const response = await new Promise(resolve => {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }, resp => {
                if (chrome.runtime.lastError) {
                    console.log('Initial selection check failed (may occur on first load):', chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    resolve(resp);
                }
            });
        });
        if (response?.selection) {
            searchInput.value = response.selection;
            await performSearch(response.selection, searchMode.value);
        } else {
            searchInput.focus();
        }
    }

    /**
     * Updates the match position display in the UI (e.g., "1/5").
     * @private
     */
    function updateMatchPosition() {
        matchPosition.textContent = `${totalMatches > 0 ? currentIndex + 1 : 0}/${totalMatches}`;
        console.log(totalMatches > 0
            ? `Match position updated: ${currentIndex + 1}/${totalMatches}`
            : 'No matches, showing 0/0');
    }

    /**
     * Determines if the current page can be searched.
     * @async
     * @returns {Promise<boolean>} True if searchable, false otherwise.
     */
    async function isSearchablePage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) {
                console.log('No active tab found');
                return false;
            }
            const url = tab.url;
            if (/^(chrome|about|edge|brave):\/\//i.test(url) || /chrome.google.com\/webstore/.test(url)) {
                console.log('Search unavailable on this page');
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error checking page searchability:', error);
            return false;
        }
    }

    /**
     * Verifies and reinjects the content script if necessary.
     * @async
     * @param {number} [retries=2] - Number of retry attempts.
     * @param {number} [delayMs=500] - Delay between retries in milliseconds.
     * @returns {Promise<boolean>} True if script is responsive, false otherwise.
     */
    async function checkContentScript(retries = 2, delayMs = 500) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !(await isSearchablePage())) return false;

            const pingContentScript = () => new Promise(resolve => {
                chrome.tabs.sendMessage(tab.id, { type: 'PING' }, response => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });

            let response = await pingContentScript();
            if (response?.status === 'OK') return true;

            for (let attempt = 0; attempt < retries; attempt++) {
                console.log(`Content script not responding, attempt ${attempt + 1}/${retries}`);
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
            console.log('Failed to connect to content script after retries');
            return false;
        } catch (error) {
            console.error('Error checking content script:', error);
            return false;
        }
    }

    /**
     * Executes a search operation on the active tab.
     * @async
     * @param {string} query - The search query.
     * @param {string} mode - The search mode ('semantic', 'exact', 'fuzzy').
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
            console.log('Query must be at least 2 characters');
            return;
        }
        if (!(await isSearchablePage())) {
            console.warn('Page not searchable, aborting.');
            return;
        }
        console.log('Searching...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !(await checkContentScript())) {
                console.log('Cannot connect to page');
                return;
            }
            const response = await new Promise(resolve =>
                chrome.tabs.sendMessage(tab.id, { type: 'START_SEARCH', query, mode }, resolve)
            );
            if (response?.success) {
                currentIndex = response.currentIndex;
                totalMatches = response.totalMatches;
                console.log(`Found ${response.matchCount} match(es)`);
                updateMatchPosition();
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
     * Sends a navigation command to the content script.
     * @async
     * @param {string} type - Navigation type ('NEXT_MATCH' or 'PREV_MATCH').
     */
    async function navigateMatch(type) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || !(await checkContentScript())) {
                console.log('Cannot navigate matches: page not ready');
                return;
            }
            const response = await new Promise(resolve =>
                chrome.tabs.sendMessage(tab.id, { type }, resolve)
            );
            if (!response?.success) {
                console.warn(`Navigation (${type}) failed:`, response?.error);
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
        if (storageAvailable) chrome.storage.local.set({ fzfLastMode: searchMode.value });
        if (searchInput.value) performSearch(searchInput.value, searchMode.value);
    });

    cancelButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && (await checkContentScript())) {
                await new Promise(resolve =>
                    chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' }, resolve)
                );
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

    document.addEventListener('keydown', (e) => {
        if ((e.key === 's' && e.metaKey && e.shiftKey) || (e.key === 'S' && e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            cycleSearchMode();
        }
    });

    /**
     * Cycles through available search modes.
     * @private
     */
    function cycleSearchMode() {
        const modes = ['semantic', 'exact', 'fuzzy'];
        const currentModeIndex = modes.indexOf(searchMode.value);
        const nextIndex = (currentModeIndex + 1) % modes.length;
        searchMode.value = modes[nextIndex];
        if (storageAvailable) chrome.storage.local.set({ fzfLastMode: searchMode.value });
        if (searchInput.value) performSearch(searchInput.value, searchMode.value);
    }

    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) await navigateMatch('PREV_MATCH');
            else await navigateMatch('NEXT_MATCH');
        }
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'MATCH_UPDATE' || request.type === 'SEARCH_PROGRESS') {
            currentIndex = request.currentIndex;
            totalMatches = request.totalMatches;
            updateMatchPosition();
        }
    });

    confirmButton.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (query) await performSearch(query, searchMode.value);
    });

    window.addEventListener('unload', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id && (await checkContentScript())) {
            chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' });
        }
    });

    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && (await checkContentScript())) {
                chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' });
            }
            window.close();
        }
    });
});