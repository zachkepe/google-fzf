import * as tf from '@tensorflow/tfjs';

/** @typedef {ArrayBuffer|null} PdfData */

/** @type {boolean} TensorFlow initialization status */
let tfInitialized = false;
/** @type {PdfData} Stored PDF data */
let localPdfData = null;

/**
 * Initializes TensorFlow with WebGL backend
 * @async
 * @returns {Promise<void>}
 */
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

// Extension installation handler
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    initializeTensorFlow();
});

/**
 * Converts a Uint8Array to a string in chunks to avoid call stack size exceeded errors.
 * @param {Uint8Array} uint8Arr - The Uint8Array to convert
 * @returns {string} The resulting string
 */
function uint8ToString(uint8Arr) {
    const CHUNK_SIZE = 0x8000; // 32768
    let result = "";
    for (let i = 0; i < uint8Arr.length; i += CHUNK_SIZE) {
        result += String.fromCharCode.apply(null, uint8Arr.subarray(i, i + CHUNK_SIZE));
    }
    return result;
}

// Message handler for various background operations
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'SET_LOCAL_PDF_DATA':
            localPdfData = request.data;
            console.log('Local PDF data stored, size:', localPdfData.byteLength);
            sendResponse({ success: true });
            break;

        case 'GET_LOCAL_PDF_DATA':
            if (localPdfData) {
                const bytes = new Uint8Array(localPdfData);
                const binary = uint8ToString(bytes);
                const base64Data = btoa(binary);
                sendResponse({ data: base64Data });
                localPdfData = null;
            } else {
                sendResponse({ error: 'No local PDF data available' });
            }
            break;

        case 'GET_TF_STATUS':
            sendResponse({ initialized: tfInitialized });
            break;

        case 'FETCH_EMBEDDINGS':
            fetch(chrome.runtime.getURL('embeddings.json'), { method: 'GET' })
                .then(response => response.ok ? response.json() : Promise.reject(response.status))
                .then(data => sendResponse({ data }))
                .catch(error => {
                    console.error('Embeddings fetch failed:', error);
                    sendResponse({ error: error.message });
                });
            return true;

        case 'FETCH_PDF':
            console.log('Fetching PDF from:', request.url);
            fetch(request.url, { method: 'GET', credentials: 'omit' })
                .then(response => response.ok ? response.arrayBuffer() : Promise.reject(response.status))
                .then(data => {
                    console.log('PDF data fetched, size:', data.byteLength);
                    const bytes = new Uint8Array(data);
                    const binary = uint8ToString(bytes);
                    const base64Data = btoa(binary);
                    sendResponse({ data: base64Data });
                })
                .catch(error => {
                    console.error('PDF fetch failed:', error);
                    sendResponse({ error: error.message });
                });
            return true;

        case 'DOWNLOAD_PDF':
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

// PDF navigation interceptor
chrome.webNavigation.onBeforeNavigate.addListener(
    (details) => {
        if (details.url.toLowerCase().endsWith('.pdf')) {
            const viewerUrl = `${chrome.runtime.getURL('pdfViewer.html')}?file=${encodeURIComponent(details.url)}`;
            chrome.tabs.update(details.tabId, { url: viewerUrl });
        }
    },
    { url: [{ urlMatches: '.*\\.pdf$' }] }
);
