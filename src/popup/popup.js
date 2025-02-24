document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('search-input');
  const resultsCount = document.getElementById('results-count');
  const status = document.getElementById('status');
  const cancelButton = document.getElementById('cancel-search');
  const pdfFileInput = document.getElementById('pdf-file-input');
  const prevButton = document.getElementById('prev-match');
  const nextButton = document.getElementById('next-match');
  const matchPosition = document.getElementById('match-position');
  let debounceTimeout;
  let currentIndex = 0;
  let totalMatches = 0;

  function updateStatus(message, isError = false) {
    status.textContent = message;
    status.className = isError ? 'error' : 'success';
  }

  function updateMatchPosition() {
    if (totalMatches > 0) {
      matchPosition.textContent = `${currentIndex + 1}/${totalMatches}`;
    } else {
      matchPosition.textContent = '';
    }
  }

  async function isSearchablePage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url || '';
      if (url.startsWith(chrome.runtime.getURL('pdfViewer.html'))) {
        return true;
      }
      if (url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('brave://')) {
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
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        return true;
      } catch (error) {
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
      matchPosition.textContent = '';
      currentIndex = 0;
      totalMatches = 0;
      return;
    }
    updateStatus('Searching...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!await checkContentScript()) {
        return;
      }
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_SEARCH', query });
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

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => performSearch(e.target.value), 300);
  });

  cancelButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_SEARCH' });
    updateStatus('Search cancelled');
    resultsCount.textContent = '';
    matchPosition.textContent = '';
    currentIndex = 0;
    totalMatches = 0;
  });

  pdfFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const pdfData = reader.result;
        await chrome.runtime.sendMessage({ type: 'SET_LOCAL_PDF_DATA', data: pdfData });
        const viewerUrl = chrome.runtime.getURL('pdfViewer.html') + '?local=true';
        chrome.tabs.create({ url: viewerUrl });
      };
      reader.readAsArrayBuffer(file);
    }
  });

  prevButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'PREV_MATCH' });
  });

  nextButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'NEXT_MATCH' });
  });

  // Listen for match updates from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'MATCH_UPDATE') {
      currentIndex = request.currentIndex;
      totalMatches = request.totalMatches;
      updateMatchPosition();
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