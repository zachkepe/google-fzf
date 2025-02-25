import * as pdfjsLib from 'pdfjs-dist';
import '../content/content.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.bundle.js');

async function renderPDF() {
  const urlParams = new URLSearchParams(window.location.search);
  let pdfData;

  if (urlParams.has('local')) {
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

      // Get textContentSource first - this is the proper way in newer PDF.js versions
      try {
        const textContentSource = page.streamTextContent({ normalizeWhitespace: true });
        
        try {
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource, // Use textContentSource instead of textContent
            container: textLayerDiv,
            viewport,
            page,
          });
          await textLayer.render();
          console.log(`Text layer rendered for page ${pageNum}`);
        } catch (textError) {
          console.error(`Failed to render text layer with textContentSource for page ${pageNum}:`, textError);
          
          // Fallback to the older API approach
          try {
            const textContent = await page.getTextContent({ normalizeWhitespace: true });
            console.log('Text content for page', pageNum, ':', textContent);
            
            const textLayer = new pdfjsLib.TextLayer({
              textContent, // Fallback to older API
              container: textLayerDiv,
              viewport,
              page, // Optional: pass page for newer versions if needed
            });
            await textLayer.render();
            console.log(`Text layer rendered for page ${pageNum} using fallback method`);
          } catch (fallbackError) {
            console.error(`Fallback text layer rendering also failed:`, fallbackError);
            textLayerDiv.innerHTML = '<span style="color: orange;">Text layer rendering failed</span>';
          }
        }
      } catch (sourceError) {
        console.error(`Error getting text content source for page ${pageNum}:`, sourceError);
        // If streamTextContent failed, go straight to fallback
        try {
          const textContent = await page.getTextContent({ normalizeWhitespace: true });
          console.log('Text content for page', pageNum, ':', textContent);
          
          const textLayer = new pdfjsLib.TextLayer({
            textContent,
            container: textLayerDiv,
            viewport,
            page,
          });
          await textLayer.render();
          console.log(`Text layer rendered for page ${pageNum} using fallback method`);
        } catch (fallbackError) {
          console.error(`Fallback text layer rendering also failed:`, fallbackError);
          textLayerDiv.innerHTML = '<span style="color: orange;">Text layer rendering failed</span>';
        }
      }
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
    document.getElementById('downloadPdf')?.addEventListener('click', () => {
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