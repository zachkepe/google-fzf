import * as pdfjsLib from 'pdfjs-dist';
import '../content/content.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');

// Track current request to allow cancellation
let currentRequest = null;
// Track search timeout for debouncing
let searchTimeout = null;

/**
 * Debounces search operations to prevent multiple concurrent requests
 * @param {Function} searchFn - The search function to call
 * @param {string} searchTerm - The search term
 */
function debouncedSearch(searchFn, searchTerm) {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
        searchFn(searchTerm);
        searchTimeout = null;
    }, 300); // 300ms delay
}

/**
 * Renders a PDF document in the viewer, page by page, with text layers.
 * @async
 * @function renderPDF
 * @returns {Promise<void>} Resolves when rendering is complete.
 * @throws {Error} If PDF data cannot be fetched or rendering fails.
 */
async function renderPDF() {
    // Cancel any ongoing request
    if (currentRequest) {
        // If using AbortController
        if (currentRequest.abort) {
            currentRequest.abort();
        }
        currentRequest = null;
    }

    const urlParams = new URLSearchParams(window.location.search);
    let pdfData;

    try {
        // Create AbortController for fetch operations if needed
        const controller = new AbortController();
        currentRequest = controller;

        if (urlParams.has('local')) {
            pdfData = await fetchLocalPDFData(controller.signal);
        } else {
            const pdfUrl = urlParams.get('file');
            if (!pdfUrl) throw new Error('No PDF URL provided');
            pdfData = pdfUrl.startsWith('file://') ? 
                await fetchLocalFile(pdfUrl, controller.signal) : 
                await fetchRemotePDF(pdfUrl);
        }

        console.log('PDF data received, size:', pdfData.byteLength);

        const pdf = await pdfjsLib.getDocument({
            data: pdfData,
            cMapUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/cmaps/'),
            cMapPacked: true,
        }).promise;

        const container = document.getElementById('pdf-container');
        container.style.position = 'relative';
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            // Check if rendering was cancelled
            if (!currentRequest) {
                throw new Error('Rendering cancelled');
            }

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page';
            pageContainer.style.position = 'relative';
            pageContainer.style.width = `${viewport.width}px`;
            pageContainer.style.height = `${viewport.height}px`;
            pageContainer.style.marginBottom = '10px';
            pageContainer.setAttribute('aria-label', `Page ${pageNum}`);

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context, viewport }).promise;

            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.style.position = 'absolute';
            textLayerDiv.style.top = '0';
            textLayerDiv.style.left = '0';
            textLayerDiv.style.height = `${viewport.height}px`;
            textLayerDiv.style.width = `${viewport.width}px`;

            pageContainer.appendChild(canvas);
            pageContainer.appendChild(textLayerDiv);
            container.appendChild(pageContainer);

            try {
                const textContentSource = page.streamTextContent({ normalizeWhitespace: true });
                try {
                    const textLayer = new pdfjsLib.TextLayer({
                        textContentSource,
                        container: textLayerDiv,
                        viewport,
                        page,
                    });
                    await textLayer.render();
                    console.log(`Text layer rendered for page ${pageNum}`);
                } catch (textError) {
                    console.error(`Text layer render failed for page ${pageNum}:`, textError);
                    await renderTextLayerFallback(page, textLayerDiv, viewport);
                }
            } catch (sourceError) {
                console.error(`Text content source error for page ${pageNum}:`, sourceError);
                await renderTextLayerFallback(page, textLayerDiv, viewport);
            }
        }

        console.log('PDF rendered successfully');
        currentRequest = null;
    } catch (error) {
        currentRequest = null;
        console.error('Error rendering PDF:', error);
        handleRenderError(error, urlParams.get('file'));
    }
}

/**
 * Fallback rendering for text layers when primary method fails.
 * @async
 * @param {Object} page - The PDF page object from pdfjs-dist.
 * @param {HTMLElement} textLayerDiv - The container for the text layer.
 * @param {Object} viewport - The viewport settings for the page.
 * @returns {Promise<void>} Resolves when fallback rendering is complete.
 */
async function renderTextLayerFallback(page, textLayerDiv, viewport) {
    try {
        const textContent = await page.getTextContent({ normalizeWhitespace: true });
        console.log('Text content for page', page.pageNumber, ':', textContent);

        const textLayer = new pdfjsLib.TextLayer({
            textContent,
            container: textLayerDiv,
            viewport,
            page,
        });
        await textLayer.render();
        console.log(`Text layer rendered for page ${page.pageNumber} using fallback`);
    } catch (fallbackError) {
        console.error(`Fallback rendering failed:`, fallbackError);
        textLayerDiv.innerHTML = '<span style="color: orange;">Text layer rendering failed</span>';
    }
}

/**
 * Displays an error message and download option when PDF rendering fails.
 * @param {Error} error - The error encountered during rendering.
 * @param {string} url - The URL of the PDF that failed to render.
 */
function handleRenderError(error, url) {
    const container = document.getElementById('pdf-container');
    container.innerHTML = `
        <p style="color: red; padding: 20px;" role="alert">
            Failed to load PDF: ${error.message}. If this is a remote PDF, it may be due to CORS restrictions.
            <button id="downloadPdf" aria-label="Download PDF">Download PDF</button>
        </p>
    `;
    document.getElementById('downloadPdf')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_PDF', url });
    });
}

/**
 * Fetches PDF data from a local file URL.
 * @async
 * @param {string} url - The file:// URL of the PDF.
 * @param {AbortSignal} signal - Optional AbortSignal to cancel the request.
 * @returns {Promise<ArrayBuffer>} The PDF data as an ArrayBuffer.
 * @throws {Error} If the fetch operation fails.
 */
function fetchLocalFile(url, signal) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        
        // Handle abort if signal is provided
        if (signal) {
            if (signal.aborted) {
                return reject(new Error('Aborted'));
            }
            
            signal.addEventListener('abort', () => {
                xhr.abort();
                reject(new Error('Aborted'));
            });
        }
        
        xhr.onload = () => (xhr.status === 200 || xhr.status === 0) ? resolve(xhr.response) : reject(new Error('HTTP error ' + xhr.status));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
    });
}

/**
 * Fetches PDF data from a remote URL via the background script.
 * @async
 * @param {string} url - The remote URL of the PDF.
 * @returns {Promise<ArrayBuffer>} The PDF data as an ArrayBuffer.
 * @throws {Error} If the fetch operation fails or data is invalid.
 */
function fetchRemotePDF(url) {
    return new Promise((resolve, reject) => {
        // Add a timeout to prevent hanging requests
        const timeoutId = setTimeout(() => {
            reject(new Error('Request timed out after 30 seconds'));
        }, 30000);
        
        chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, response => {
            clearTimeout(timeoutId); // Clear the timeout
            
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response?.error) return reject(new Error(response.error));
            if (!response?.data) return reject(new Error('Invalid or missing PDF data'));

            try {
                const binaryString = atob(response.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                resolve(bytes.buffer);
            } catch (e) {
                reject(new Error(`Failed to process PDF data: ${e.message}`));
            }
        });
    });
}

/**
 * Fetches locally stored PDF data from the background script.
 * @async
 * @param {AbortSignal} signal - Optional AbortSignal to cancel the request.
 * @returns {Promise<ArrayBuffer>} The PDF data as an ArrayBuffer.
 * @throws {Error} If the data cannot be retrieved or is invalid.
 */
function fetchLocalPDFData(signal) {
    return new Promise((resolve, reject) => {
        // Handle abort if signal is provided
        if (signal && signal.aborted) {
            return reject(new Error('Aborted'));
        }
        
        // Add a timeout to prevent hanging requests
        const timeoutId = setTimeout(() => {
            reject(new Error('Request timed out after 30 seconds'));
        }, 30000);
        
        chrome.runtime.sendMessage({ type: 'GET_LOCAL_PDF_DATA' }, response => {
            clearTimeout(timeoutId); // Clear the timeout
            
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response?.error) return reject(new Error(response.error));
            if (!response?.data) return reject(new Error('Invalid or missing PDF data'));

            try {
                const binaryString = atob(response.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                resolve(bytes.buffer);
            } catch (e) {
                reject(new Error(`Failed to process PDF data: ${e.message}`));
            }
        });
    });
}

/**
 * Performs a search operation within the PDF
 * @param {string} searchTerm - The text to search for
 */
function performSearch(searchTerm) {
    // Implement your search logic here
    console.log(`Searching for: ${searchTerm}`);
    
    // Example implementation:
    const textLayers = document.querySelectorAll('.textLayer');
    // Clear previous highlights
    document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight');
    });
    
    if (!searchTerm) return;
    
    let foundCount = 0;
    textLayers.forEach(layer => {
        const textElements = layer.querySelectorAll('span');
        textElements.forEach(span => {
            if (span.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
                span.classList.add('search-highlight');
                foundCount++;
            }
        });
    });
    
    console.log(`Found ${foundCount} matches for "${searchTerm}"`);
}

// Set up search input if it exists
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('pdf-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            debouncedSearch(performSearch, e.target.value);
        });
    }
    
    // Start rendering the PDF
    renderPDF();
});

// Export the render function for potential external use
export { renderPDF };