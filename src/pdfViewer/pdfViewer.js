import * as pdfjsLib from 'pdfjs-dist';
import '../content/content.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');

/**
 * Renders PDF document in the viewer
 * @async
 */
async function renderPDF() {
    const urlParams = new URLSearchParams(window.location.search);
    let pdfData;

    try {
        if (urlParams.has('local')) {
            pdfData = await fetchLocalPDFData();
        } else {
            const pdfUrl = urlParams.get('file');
            if (!pdfUrl) throw new Error('No PDF URL provided');
            pdfData = pdfUrl.startsWith('file://') ? await fetchLocalFile(pdfUrl) : await fetchRemotePDF(pdfUrl);
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
    } catch (error) {
        console.error('Error rendering PDF:', error);
        handleRenderError(error, urlParams.get('file'));
    }
}

/**
 * Fallback method for text layer rendering
 * @async
 * @param {Object} page - PDF page object
 * @param {HTMLElement} textLayerDiv - Text layer container
 * @param {Object} viewport - Page viewport
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
 * Handles PDF rendering errors
 * @param {Error} error - Rendering error
 * @param {string} url - PDF URL
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
 * Fetches local file data
 * @async
 * @param {string} url - File URL
 * @returns {Promise<ArrayBuffer>}
 */
function fetchLocalFile(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => (xhr.status === 200 || xhr.status === 0) ? resolve(xhr.response) : reject(new Error('HTTP error ' + xhr.status));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
    });
}

/**
 * Fetches remote PDF data
 * @async
 * @param {string} url - PDF URL
 * @returns {Promise<ArrayBuffer>}
 */
function fetchRemotePDF(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, response => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (response.error) return reject(new Error(response.error));
            if (!response.data) return reject(new Error('Invalid PDF data'));

            const binaryString = atob(response.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            resolve(bytes.buffer);
        });
    });
}

/**
 * Fetches local PDF data from background script
 * @async
 * @returns {Promise<ArrayBuffer>}
 */
function fetchLocalPDFData() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_LOCAL_PDF_DATA' }, response => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (response.error) return reject(new Error(response.error));
            if (!response.data) return reject(new Error('Invalid PDF data'));

            const binaryString = atob(response.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            resolve(bytes.buffer);
        });
    });
}

renderPDF();