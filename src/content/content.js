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
      const spans = Array.from(textLayers).filter(span => span.textContent.trim());
      const chunks = [];
      let currentChunk = { text: '', spans: [] };
      let wordCount = 0;

      for (const span of spans) {
        const spanText = span.textContent.trim();
        const words = spanText.split(/\s+/);
        currentChunk.text += spanText + ' ';
        currentChunk.spans.push(span);
        wordCount += words.length;

        if (wordCount >= 50) {
          chunks.push({ text: currentChunk.text.trim(), spans: [...currentChunk.spans] });
          currentChunk = { text: '', spans: [] };
          wordCount = 0;
        }
      }
      if (currentChunk.text.trim()) {
        chunks.push({ text: currentChunk.text.trim(), spans: [...currentChunk.spans] });
      }
      return { isPDF: true, chunks };
    }

    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, div:not(.textLayer)');
    const textNodes = Array.from(elements)
      .flatMap(el => Array.from(el.childNodes))
      .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

    const chunks = [];
    let currentChunk = { text: '', nodes: [] };
    let wordCount = 0;

    for (const node of textNodes) {
      const nodeText = node.textContent.trim();
      const words = nodeText.split(/\s+/);
      currentChunk.text += nodeText + ' ';
      currentChunk.nodes.push(node);
      wordCount += words.length;

      if (wordCount >= 50) {
        chunks.push({ text: currentChunk.text.trim(), nodes: [...currentChunk.nodes] });
        currentChunk = { text: '', nodes: [] };
        wordCount = 0;
      }
    }
    if (currentChunk.text.trim()) {
      chunks.push({ text: currentChunk.text.trim(), nodes: [...currentChunk.nodes] });
    }
    return { isPDF: false, chunks };
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
      const { isPDF, chunks } = await this.processPage();

      for (const chunk of chunks) {
        if (!this.isSearching) break;
        const isSimilar = await this.similaritySearch.findSimilar(sanitizedQuery, chunk.text);
        if (isSimilar) {
          this.currentMatches.push(chunk);
          const elementsToHighlight = isPDF ? chunk.spans : chunk.nodes;
          for (const element of elementsToHighlight) {
            const highlightEl = highlight(element);
            if (highlightEl) {
              this.highlightElements.push(highlightEl);
            }
          }
        }
      }

      if (this.currentMatches.length > 0) {
        this.currentMatchIndex = 0;
        const firstMatch = this.currentMatches[0];
        scrollToMatch(isPDF ? firstMatch.spans : firstMatch.nodes);
      }

      chrome.runtime.sendMessage({ 
        type: 'SEARCH_PROGRESS', 
        count: this.currentMatches.length,
        currentIndex: this.currentMatchIndex,
        totalMatches: this.currentMatches.length
      });
      
      return {
        matchCount: this.currentMatches.length,
        currentIndex: this.currentMatchIndex,
        totalMatches: this.currentMatches.length
      };
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    } finally {
      this.isSearching = false;
    }
  }

  nextMatch() {
    if (this.currentMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.currentMatches.length;
    const match = this.currentMatches[this.currentMatchIndex];
    scrollToMatch(match.spans || match.nodes);
    chrome.runtime.sendMessage({
      type: 'MATCH_UPDATE',
      currentIndex: this.currentMatchIndex,
      totalMatches: this.currentMatches.length
    });
  }

  previousMatch() {
    if (this.currentMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatches.length + this.currentMatchIndex - 1) % this.currentMatches.length;
    const match = this.currentMatches[this.currentMatchIndex];
    scrollToMatch(match.spans || match.nodes);
    chrome.runtime.sendMessage({
      type: 'MATCH_UPDATE',
      currentIndex: this.currentMatchIndex,
      totalMatches: this.currentMatches.length
    });
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
                const result = await searchManager.search(request.query);
                sendResponse({ success: true, ...result });
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