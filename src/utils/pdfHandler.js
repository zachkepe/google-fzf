// src/utils/pdfHandler.js
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf';

export async function extractTextFromPDF(url, pageNum = 1) {
  try {
    GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');
    let pdfData;

    if (url.startsWith('file://')) {
      pdfData = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, response => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        });
      });
    } else {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      pdfData = await response.arrayBuffer();
    }

    if (!pdfData || pdfData.byteLength === 0) {
      throw new Error('Invalid or empty PDF data');
    }

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