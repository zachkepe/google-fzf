import SimilaritySearch from '../models/model';
import { sanitizeInput, validateSearchPattern } from '../utils/sanitizer';
import RateLimiter from '../utils/rateLimiter';
import { highlight, clearHighlights, scrollToMatch } from './highlighter';
import { extractTextFromPDF } from '../utils/pdfHandler'; // New import for PDF processing

// Global instance
let searchManager = null;

class ContentSearchManager {
  constructor() {
    this.similaritySearch = new SimilaritySearch();
    this.rateLimiter = new RateLimiter(10, 1);
    this.currentMatches = [];
    this.currentMatchIndex = -1;
    this.isSearching = false;
    this.isInitialized = false;
    this.highlightElements = [];
    this.pdfTextExtracted = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await this.similaritySearch.initialize();
      this.isInitialized = true;
      console.log('Search manager initialized');
      // If page is a PDF, extract its text
      if (this.isPDFPage()) {
        await this.extractPDFText();
      }
    } catch (error) {
      console.error('Failed to initialize search manager:', error);
      throw error;
    }
  }
  
  isPDFPage() {
    return window.location.href.toLowerCase().endsWith('.pdf') ||
           (document.contentType && document.contentType === 'application/pdf');
  }
  
  async extractPDFText() {
    if (this.pdfTextExtracted) return;
    try {
      const pdfText = await extractTextFromPDF(window.location.href, 1); // Start with page 1
      let pdfContainer = document.getElementById('pdf-text-content');
      if (!pdfContainer) {
        pdfContainer = document.createElement('div');
        pdfContainer.id = 'pdf-text-content';
        pdfContainer.style.display = 'none';
        document.body.appendChild(pdfContainer);
      }
      pdfContainer.textContent = pdfText;
      this.pdfTextExtracted = true;
      console.log('PDF page 1 text extracted for search.');
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      chrome.runtime.sendMessage({ 
        type: 'PDF_ERROR', 
        message: error.message 
      });
    }
  }

  async processPage() {
    const pdfContainer = document.getElementById('pdf-text-content');
    if (pdfContainer && pdfContainer.textContent) {
      return [pdfContainer]; // Return the container directly
    }
    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    return Array.from(elements).filter(el => el.textContent.trim());
  }

  async search(query) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (!await this.rateLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded. Please wait.');
    }
    try {
      clearHighlights();
      const sanitizedQuery = sanitizeInput(query);
      validateSearchPattern(sanitizedQuery);
      this.isSearching = true;
      this.currentMatches = [];
      this.currentMatchIndex = -1;
      this.highlightElements = [];
      const textNodes = await this.processPage();
      const batchSize = 10;
      for (let i = 0; i < textNodes.length; i += batchSize) {
        if (!this.isSearching) break; // Allow cancellation
        const batch = textNodes.slice(i, i + batchSize);
        const promises = batch.map(async node => {
          if (node.textContent.trim().length < 2) return null;
          const isSimilar = await this.similaritySearch.findSimilar(
            sanitizedQuery,
            node.textContent
          );
          return isSimilar ? node : null;
        });
        const results = await Promise.all(promises);
        const matches = results.filter(r => r !== null);
        for (const node of matches) {
          this.currentMatches.push(node);
          const highlightEl = highlight(node);
          if (highlightEl) {
            this.highlightElements.push(highlightEl);
          }
        }
        chrome.runtime.sendMessage({ 
          type: 'SEARCH_PROGRESS', 
          count: this.currentMatches.length 
        });
      }
      if (this.currentMatches.length > 0) {
        this.currentMatchIndex = 0;
        scrollToMatch(this.currentMatches[0]);
      }
      return this.currentMatches.length;
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    } finally {
      this.isSearching = false;
    }
  }

  nextMatch() {
    if (this.currentMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatches.length + this.currentMatchIndex + 1) % this.currentMatches.length;
    scrollToMatch(this.currentMatches[this.currentMatchIndex]);
  }

  previousMatch() {
    if (this.currentMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatches.length + this.currentMatchIndex - 1) % this.currentMatches.length;
    scrollToMatch(this.currentMatches[this.currentMatchIndex]);
  }
}

if (!window.googleFzfInitialized) {
  window.googleFzfInitialized = true;
  // Initialize manager and set up message listeners
  async function initializeExtension() {
    try {
      searchManager = new ContentSearchManager();
      await searchManager.initialize();
      
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        (async () => {
          try {
            if (request.type === 'PING') {
              sendResponse({ status: 'OK' });
              return true;
            }
            if (request.type === 'START_SEARCH') {
              const matchCount = await searchManager.search(request.query);
              sendResponse({ success: true, matchCount });
            } else if (request.type === 'NEXT_MATCH') {
              searchManager.nextMatch();
              sendResponse({ success: true });
            } else if (request.type === 'PREV_MATCH') {
              searchManager.previousMatch();
              sendResponse({ success: true });
            } else if (request.type === 'CANCEL_SEARCH') {
              searchManager.isSearching = false;
              sendResponse({ success: true });
            }
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;
      });
      chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
    } catch (error) {
      console.error('Failed to initialize extension:', error);
    }
  }

  // Start initialization
  initializeExtension();
}