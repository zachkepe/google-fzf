import SimilaritySearch from '../models/model';
import { sanitizeInput, validateSearchPattern } from '../utils/sanitizer';
import RateLimiter from '../utils/rateLimiter';
import { highlight, clearHighlights, scrollToMatch } from './highlighter';
import Fuse from 'fuse.js';

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
      // PDF handling remains unchanged
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

    // Improved HTML text extraction
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: node => {
          const parent = node.parentElement;
          if (!parent || parent.closest('.textLayer')) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          return (style.display !== 'none' && style.visibility !== 'hidden' && node.textContent.trim())
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    const chunks = [];
    let currentChunk = { text: '', nodes: [] };
    let wordCount = 0;

    for (const node of textNodes) {
      const nodeText = node.textContent.trim();
      if (!nodeText) continue;
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

  async search(query, mode = 'semantic') {
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
  
      if (mode === 'fuzzy') {
        // Use Fuse.js for fuzzy searching with a threshold for more controlled matching.
        const fuseOptions = {
          keys: ['text'],
          includeScore: true,
          threshold: 0.6
        };
        const fuse = new Fuse(chunks, fuseOptions);
        const fuseResults = fuse.search(sanitizedQuery);
  
        for (const result of fuseResults) {
          const matchingChunk = result.item;
          this.currentMatches.push(matchingChunk);
          const elementsToHighlight = isPDF ? matchingChunk.spans : matchingChunk.nodes;
          for (const element of elementsToHighlight) {
            const highlightEl = highlight(element);
            if (highlightEl) {
              this.highlightElements.push(highlightEl);
            }
          }
        }
      } else {
        for (const chunk of chunks) {
          if (!this.isSearching) break;
          let isMatch = false;
  
          switch (mode) {
            case 'exact': {
              const queryLower = sanitizedQuery.toLowerCase();
              const textLower = chunk.text.toLowerCase();
              if (textLower.includes(queryLower)) {
                isMatch = true;
                const elementsToHighlight = [];
                for (const node of (isPDF ? chunk.spans : chunk.nodes)) {
                  const nodeText = node.textContent.toLowerCase();
                  if (nodeText.includes(queryLower)) {
                    elementsToHighlight.push(node);
                  }
                }
                if (elementsToHighlight.length > 0) {
                  this.currentMatches.push({ ...chunk, matchedElements: elementsToHighlight });
                  for (const element of elementsToHighlight) {
                    const highlightEl = highlight(element);
                    if (highlightEl) {
                      this.highlightElements.push(highlightEl);
                    }
                  }
                }
              }
              break;
            }
            case 'semantic': {
              const similarity = await this.similaritySearch.findSimilar(
                sanitizedQuery,
                chunk.text
              );
              isMatch = similarity;
              if (isMatch) {
                this.currentMatches.push(chunk);
                const elementsToHighlight = isPDF ? chunk.spans : chunk.nodes;
                for (const element of elementsToHighlight) {
                  const highlightEl = highlight(element);
                  if (highlightEl) {
                    this.highlightElements.push(highlightEl);
                  }
                }
              }
              break;
            }
          }
        }
      }
  
      if (this.currentMatches.length > 0) {
        this.currentMatchIndex = 0;
        const firstMatch = this.currentMatches[0];
        scrollToMatch(isPDF ? firstMatch.spans : (firstMatch.matchedElements || firstMatch.nodes));
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
    scrollToMatch(match.spans || match.matchedElements || match.nodes);
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
    scrollToMatch(match.spans || match.matchedElements || match.nodes);
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
                const result = await searchManager.search(request.query, request.mode);
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