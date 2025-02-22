// src/pdfViewer/pdfViewer.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import '../content/content.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');

async function renderPDF() {
  const urlParams = new URLSearchParams(window.location.search);
  const pdfUrl = urlParams.get('file');
  if (!pdfUrl) {
    console.error('No PDF URL provided');
    return;
  }

  try {
    let pdfData;
    if (pdfUrl.startsWith('file://')) {
      // For local PDFs, use XMLHttpRequest directly
      pdfData = await fetchLocalFile(pdfUrl);
    } else {
      // For remote PDFs, request via background
      pdfData = await fetchRemotePDF(pdfUrl);
    }
    console.log('PDF data received, size:', pdfData.byteLength);

    const pdf = await pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/cmaps/'),
      cMapPacked: true
    }).promise;

    const container = document.getElementById('pdf-container');
    container.style.position = 'relative';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      container.appendChild(canvas);

      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;
      container.appendChild(textLayerDiv);

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
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_PDF', url: pdfUrl });
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
        } else if (!response.data || !(response.data instanceof ArrayBuffer)) {
          reject(new Error('Invalid PDF data received from background script'));
        } else {
          resolve(response.data);
        }
      });
    });
  }
  

renderPDF();
