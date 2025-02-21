// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('search-input');
  const resultsCount = document.getElementById('results-count');
  const status = document.getElementById('status');
  const cancelButton = document.getElementById('cancel-search');
  let debounceTimeout;

  function updateStatus(message, isError = false) {
    status.textContent = message;
    status.className = isError ? 'error' : 'success';
  }
  
    // Check if the current tab is searchable
    async function isSearchablePage() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url || '';
        
        // Check for restricted URLs
        if (url.startsWith('chrome://') || 
            url.startsWith('chrome-extension://') ||
            url.startsWith('about:') ||
            url.startsWith('edge://') ||
            url.startsWith('brave://')) {
          updateStatus('Search is not available on this page', true);
          searchInput.disabled = true;
          return false;
        }
        return true;
      } catch (error) {
        console.error('Error checking page:', error);
        return false;
      }
    }
  
    async function checkContentScript() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!await isSearchablePage()) {
          return false;
        }
  
        // Try to send a test message first
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
          return true;
        } catch (error) {
          // Content script not loaded, try to inject it
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.bundle.js']
          });
          return true;
        }
      } catch (error) {
        console.error('Failed to inject content script:', error);
        updateStatus('Cannot search on this page', true);
        return false;
      }
    }
  
    async function performSearch(query) {
      if (!query.trim()) {
        resultsCount.textContent = '';
        return;
      }
  
      updateStatus('Searching...');
  
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!await checkContentScript()) {
          return;
        }
  
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'START_SEARCH',
          query: query
        });
  
        if (response?.success) {
          const count = response.matchCount;
          resultsCount.textContent = `Found ${count} match${count !== 1 ? 'es' : ''}`;
          updateStatus('');
        } else {
          updateStatus(response?.error || 'Search failed', true);
        }
      } catch (error) {
        updateStatus('Error: Could not perform search', true);
        console.error('Search error:', error);
      }
    }
  
    // Handle input with debouncing
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        performSearch(e.target.value);
      }, 300);
    });

    cancelButton.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' });
      updateStatus('Search cancelled');
      resultsCount.textContent = '';
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SEARCH_PROGRESS') {
        resultsCount.textContent = `Found ${msg.count} matches so far...`;
      } else if (msg.type === 'PDF_ERROR') {
        updateStatus(`PDF error: ${msg.message}`, true);
      }
    });
    
    const prevButton = document.getElementById('prev-match');
    const nextButton = document.getElementById('next-match');

    // Add click handlers for navigation buttons
    prevButton.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { type: 'PREV_MATCH' });
    });

    nextButton.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { type: 'NEXT_MATCH' });
    });

    // Handle keyboard navigation
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && await isSearchablePage()) {
            if (e.shiftKey) {
                prevButton.click();
            } else {
                nextButton.click();
            }
        }
    });
  
    // Initialize
    try {
      if (await isSearchablePage()) {
        await checkContentScript();
        searchInput.focus();
      }
    } catch (error) {
      console.error('Initialization error:', error);
      updateStatus('Failed to initialize extension', true);
    }
  });