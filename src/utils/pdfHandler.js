// src/utils/pdfHandler.js
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf';

async function readLocalFile(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    
    request.onload = function() {
      if (request.status === 0 || request.status === 200) {
        resolve(request.response);
      } else {
        reject(new Error(`Failed to load PDF: ${request.statusText}`));
      }
    };
    
    request.onerror = function() {
      reject(new Error('Failed to load local PDF file'));
    };
    
    // Add additional error handling
    request.onabort = function() {
      reject(new Error('PDF loading aborted'));
    };
    
    request.ontimeout = function() {
      reject(new Error('PDF loading timed out'));
    };
    
    try {
      request.send(null);
    } catch (error) {
      reject(new Error(`Failed to send request: ${error.message}`));
    }
  });
}

export async function extractTextFromPDF(url, pageNum = 1) {
  try {
    GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');
    let pdfData;
    if (url.startsWith('file://')) {
      try {
        pdfData = await readLocalFile(url);
      } catch (error) {
        throw new Error('Cannot access local PDF. Enable "Allow access to file URLs" in chrome://extensions/');
      }
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      pdfData = await response.arrayBuffer();
    }
    const loadingTask = getDocument({ 
      data: pdfData,
      cMapUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/cmaps/'),
      cMapPacked: true
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum); // Extract only one page at a time
    const content = await page.getTextContent({ normalizeWhitespace: true });
    const pageText = content.items.map(item => item.str.trim()).join(' ');
    return pageText;
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error);
    throw error;
  }
}