import * as tf from '@tensorflow/tfjs';

/**
 * Represents PDF data stored in memory.
 * @typedef {ArrayBuffer|null} PdfData
 */

/**
 * Tracks whether TensorFlow.js has been initialized.
 * @type {boolean}
 */
let tfInitialized = false;

/**
 * Stores PDF data locally in the background script.
 * @type {PdfData}
 */
let localPdfData = null;

/**
 * Initializes TensorFlow.js with the WebGL backend for optimal performance.
 * @async
 * @function initializeTensorFlow
 * @returns {Promise<void>} Resolves when TensorFlow is initialized.
 * @throws {Error} If TensorFlow initialization fails due to backend issues.
 */
async function initializeTensorFlow() {
    if (tfInitialized) return;

    try {
        if (!tf.getBackend()) {
            await tf.setBackend('webgl');
            await tf.ready(); // Waits for backend registration and kernel initialization
            console.log('TensorFlow.js initialized with WebGL backend');
        } else if (tf.getBackend() !== 'webgl') {
            console.warn('Switching to WebGL backend from:', tf.getBackend());
            await tf.setBackend('webgl');
            await tf.ready();
        } else {
            console.log('TensorFlow.js already initialized with WebGL backend');
        }
        tfInitialized = true;
    } catch (error) {
        console.error('Failed to initialize TensorFlow.js:', error);
        tfInitialized = false;
    }
}

// Initialize TensorFlow immediately on script load
initializeTensorFlow();

// Handle extension installation event
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

/**
 * Converts a Uint8Array to a string in chunks to prevent stack overflow errors.
 * @function uint8ToString
 * @param {Uint8Array} uint8Arr - The byte array to convert.
 * @returns {string} The resulting string representation.
 */
function uint8ToString(uint8Arr) {
    const CHUNK_SIZE = 0x8000; // 32KB chunks to manage memory efficiently
    let result = '';
    for (let i = 0; i < uint8Arr.length; i += CHUNK_SIZE) {
        result += String.fromCharCode.apply(null, uint8Arr.subarray(i, i + CHUNK_SIZE));
    }
    return result;
}

// Handle messages from other parts of the extension
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
                localPdfData = null; // Clear after sending to free memory
            } else {
                sendResponse({ error: 'No local PDF data available' });
            }
            break;

        case 'GET_TF_STATUS':
            sendResponse({ initialized: tfInitialized && tf.getBackend() === 'webgl' });
            break;

        case 'FETCH_EMBEDDINGS':
            fetch(chrome.runtime.getURL('embeddings.json'), { method: 'GET' })
                .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
                .then(data => sendResponse({ data }))
                .catch(error => {
                    console.error('Embeddings fetch failed:', error);
                    sendResponse({ error: error.message });
                });
            return true; // Keep the message channel open for async response

        case 'FETCH_PDF':
            console.log('Fetching PDF from:', request.url);
            fetch(request.url, { method: 'GET', credentials: 'omit' })
                .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`)))
                .then(data => {
                    console.log('PDF data fetched, size:', data.byteLength);
                    const bytes = new Uint8Array(data);
                    const binary = uint8ToString(bytes);
                    const base64Data = btoa(binary);
                    try {
                        sendResponse({ data: base64Data });
                    } catch (e) {
                        console.warn('Message channel closed before response could be sent:', e);
                    }
                })
                .catch(error => {
                    console.error('PDF fetch failed:', error);
                    try {
                        sendResponse({ error: error.message });
                    } catch (e) {
                        console.warn('Message channel closed before error response:', e);
                    }
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

// Intercept PDF navigation to redirect to custom viewer
chrome.webNavigation.onBeforeNavigate.addListener(
    (details) => {
        if (details.url.toLowerCase().endsWith('.pdf')) {
            const viewerUrl = `${chrome.runtime.getURL('pdfViewer.html')}?file=${encodeURIComponent(details.url)}`;
            chrome.tabs.update(details.tabId, { url: viewerUrl });
        }
    },
    { url: [{ urlMatches: '.*\\.pdf$' }] }
);

// Handle keyboard command to open popup
chrome.commands.onCommand.addListener((command) => {
    if (command === '_execute_action') {
        chrome.action.openPopup();
        console.log('Command+Shift+S triggered, opening popup');
    }
});