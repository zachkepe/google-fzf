// src/content/content.js
import SimilaritySearch from '../models/model';
import { sanitizeInput, validateSearchPattern } from '../utils/sanitizer';
import RateLimiter from '../utils/rateLimiter';
import { highlight, clearHighlights, scrollToMatch } from './highlighter';

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
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      await this.similaritySearch.initialize();
      this.isInitialized = true;
      console.log('Search manager initialized');
    } catch (error) {
      console.error('Failed to initialize search manager:', error);
      throw error;
    }
  }

  async processPage() {
    const textLayers = document.querySelectorAll('.textLayer span');
    if (textLayers.length > 0) {
      // PDF viewer context
      return Array.from(textLayers).filter(span => span.textContent.trim());
    }
    // Regular webpage context
    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, div:not(.textLayer)');
    return Array.from(elements)
      .flatMap(el => Array.from(el.childNodes))
      .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
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
      const nodes = await this.processPage();
      const batchSize = 10;
      for (let i = 0; i < nodes.length; i += batchSize) {
        if (!this.isSearching) break;
        const batch = nodes.slice(i, i + batchSize);
        const promises = batch.map(async node => {
          const text = node.textContent || node.innerText || '';
          if (text.trim().length < 2) return null;
          const isSimilar = await this.similaritySearch.findSimilar(
            sanitizedQuery,
            text
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
  async function initializeExtension() {
    try {
      searchManager = new ContentSearchManager();
      await searchManager.initialize();
      
      if (typeof chrome !== 'undefined' && chrome.runtime) {
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
      } else {
        console.warn('Chrome runtime unavailable; extension limited to local functionality');
      }
    } catch (error) {
      console.error('Failed to initialize extension:', error);
    }
  }
  initializeExtension();
}