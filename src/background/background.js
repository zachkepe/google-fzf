import * as tf from '@tensorflow/tfjs';

let tfInitialized = false;
let localPdfData = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  initializeTensorFlow();
});

async function initializeTensorFlow() {
  if (tfInitialized) return;
  try {
    await tf.setBackend('webgl');
    console.log('TensorFlow.js initialized with WebGL backend');
    tfInitialized = true;
  } catch (error) {
    console.error('Failed to initialize TensorFlow.js:', error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SET_LOCAL_PDF_DATA') {
    localPdfData = request.data;
    console.log('Local PDF data stored, size:', localPdfData.byteLength);
    sendResponse({ success: true });
  } else if (request.type === 'GET_LOCAL_PDF_DATA') {
    if (localPdfData) {
      let binary = '';
      const bytes = new Uint8Array(localPdfData);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      sendResponse({ data: base64Data });
      localPdfData = null;
    } else {
      sendResponse({ error: 'No local PDF data available' });
    }
  } else if (request.type === 'GET_TF_STATUS') {
    sendResponse({ initialized: tfInitialized });
  } else if (request.type === 'FETCH_EMBEDDINGS') {
    const embeddingsUrl = chrome.runtime.getURL('embeddings.json');
    fetch(embeddingsUrl, { method: 'GET' })
      .then(response => {
        if (!response.ok) throw new Error(`Failed to fetch embeddings: ${response.status}`);
        return response.json();
      })
      .then(data => sendResponse({ data }))
      .catch(error => {
        console.error('Embeddings fetch failed:', error);
        sendResponse({ error: error.message });
      });
    return true;
  } else if (request.type === 'FETCH_PDF') {
    console.log('Fetching PDF from:', request.url);
    fetch(request.url, { method: 'GET', credentials: 'omit' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return response.arrayBuffer();
      })
      .then(data => {
        console.log('PDF data fetched, size:', data.byteLength);
        let binary = '';
        const bytes = new Uint8Array(data);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);
        sendResponse({ data: base64Data });
      })
      .catch(error => {
        console.error('PDF fetch failed:', error);
        sendResponse({ error: error.message });
      });
    return true;
  } else if (request.type === 'DOWNLOAD_PDF') {
    chrome.downloads.download({ url: request.url }, downloadId => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError);
      } else {
        console.log('Download started, ID:', downloadId);
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.url.toLowerCase().endsWith('.pdf')) {
      const viewerUrl = chrome.runtime.getURL('pdfViewer.html') + '?file=' + encodeURIComponent(details.url);
      chrome.tabs.update(details.tabId, { url: viewerUrl });
    }
  },
  { url: [{ urlMatches: '.*\\.pdf$' }] }
);
