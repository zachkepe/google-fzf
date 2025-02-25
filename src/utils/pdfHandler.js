import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf';

/**
 * Extracts text content from a PDF file
 * @async
 * @param {string} url - URL of the PDF file
 * @param {number} [pageNum=1] - Page number to extract (default: 1)
 * @returns {Promise<string>} Extracted text content
 * @throws {Error} If PDF loading or text extraction fails
 */
export async function extractTextFromPDF(url, pageNum = 1) {
    try {
        // Configure PDF.js worker
        GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');
        let pdfData;

        // Handle different URL types
        if (url.startsWith('file://')) {
            pdfData = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, response => {
                    if (response.error) reject(new Error(response.error));
                    else resolve(response.data);
                });
            });
        } else {
            const response = await fetch(url, { credentials: 'omit' });
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            pdfData = await response.arrayBuffer();
        }

        // Validate PDF data
        if (!pdfData || pdfData.byteLength === 0) {
            throw new Error('Invalid or empty PDF data');
        }

        // Load and process PDF
        const loadingTask = getDocument({
            data: pdfData,
            cMapUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/cmaps/'),
            cMapPacked: true
        });
        const pdf = await loadingTask.promise;

        if (pdf.numPages < pageNum) {
            throw new Error(`Page ${pageNum} does not exist in PDF`);
        }

        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent({ normalizeWhitespace: true });
        const pageText = content.items.map(item => item.str.trim()).join(' ');

        if (!pageText) {
            console.warn('No text extracted from PDF page');
        }

        return pageText || '';
    } catch (error) {
        console.error('Error in extractTextFromPDF:', error.message);
        throw error;
    }
}