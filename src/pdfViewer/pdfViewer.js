import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import '../content/content.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');

async function renderPDF() {
  const urlParams = new URLSearchParams(window.location.search);
  let pdfData;
  
  if (urlParams.has('local')) {
    // For locally uploaded PDFs via the popup
    pdfData = await fetchLocalPDFData();
  } else {
    const pdfUrl = urlParams.get('file');
    if (!pdfUrl) {
      console.error('No PDF URL provided');
      return;
    }
    if (pdfUrl.startsWith('file://')) {
      pdfData = await fetchLocalFile(pdfUrl);
    } else {
      pdfData = await fetchRemotePDF(pdfUrl);
    }
  }
  
  console.log('PDF data received, size:', pdfData.byteLength);

  try {
    const pdf = await pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/cmaps/'),
      cMapPacked: true
    }).promise;

    const container = document.getElementById('pdf-container');
    container.style.position = 'relative';
    container.innerHTML = ''; // Clear previous content if any

    // Render each page in its own container
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      
      // Create a wrapper div for the page
      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page';
      pageContainer.style.position = 'relative';
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;
      pageContainer.style.marginBottom = '10px';

      // Create and render the canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      
      // Create the text layer div (positioned absolutely within the page container)
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.position = 'absolute';
      textLayerDiv.style.top = '0';
      textLayerDiv.style.left = '0';
      textLayerDiv.style.height = `${viewport.height}px`;
      textLayerDiv.style.width = `${viewport.width}px`;
      
      // Append canvas and text layer to the page container
      pageContainer.appendChild(canvas);
      pageContainer.appendChild(textLayerDiv);
      container.appendChild(pageContainer);

      // Render text layer using PDF.js
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      pdfjsLib.renderTextLayer({
        textContent,
        container: textLayerDiv,
        viewport,
        textDivs: []
      });
    }

    console.log('PDF rendered successfully');
  } catch (error) {
    console.error('Error rendering PDF:', error);
    const container = document.getElementById('pdf-container');
    container.innerHTML = `
      <p style="color: red; padding: 20px;">
        Failed to load PDF: ${error.message}. If this is a remote PDF, it may be due to CORS restrictions.
        <button id="downloadPdf">Download PDF</button>
      </p>
    `;
    document.getElementById('downloadPdf').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_PDF', url: urlParams.get('file') });
    });
  }
}

function fetchLocalFile(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        resolve(xhr.response);
      } else {
        reject(new Error('HTTP error ' + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send();
  });
}

function fetchRemotePDF(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
      } else if (!response.data) {
        reject(new Error('Invalid PDF data received from background script'));
      } else {
        // Decode base64 string to ArrayBuffer
        const binaryString = atob(response.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        resolve(bytes.buffer);
      }
    });
  });
}

function fetchLocalPDFData() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_LOCAL_PDF_DATA' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
      } else if (!response.data) {
        reject(new Error('Invalid PDF data received from background script'));
      } else {
        // Decode base64 string to ArrayBuffer
        const binaryString = atob(response.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        resolve(bytes.buffer);
      }
    });
  });
}

renderPDF();
