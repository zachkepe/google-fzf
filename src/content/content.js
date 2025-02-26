import SimilaritySearch from '../models/model';
import { sanitizeInput, validateSearchPattern } from '../utils/sanitizer';
import RateLimiter from '../utils/rateLimiter';
import { highlight, clearHighlights, scrollToMatch } from './highlighter';
import Fuse from 'fuse.js';

/** @type {ContentSearchManager|null} Global search manager instance */
let searchManager = null;

/**
 * Manages content searching functionality
 * @class
 */
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

    /**
     * Initializes the search manager
     * @async
     * @returns {Promise<void>}
     */
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

    /**
     * Processes page content into searchable chunks
     * @async
     * @returns {Promise<{isPDF: boolean, chunks: Array}>}
     */
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
                currentChunk.text += `${spanText} `;
                currentChunk.spans.push(span);
                wordCount += words.length;

                if (wordCount >= 20) { // Reduced from 50 for more precise highlights
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

        // Process regular HTML content
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
            currentChunk.text += `${nodeText} `;
            currentChunk.nodes.push(node);
            wordCount += words.length;

            if (wordCount >= 20) { // Reduced from 50 for more precise highlights
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

    /**
     * Performs a search with specified query and mode
     * @async
     * @param {string} query - Search query
     * @param {string} [mode='semantic'] - Search mode (semantic, exact, fuzzy)
     * @returns {Promise<{matchCount: number, currentIndex: number, totalMatches: number}>}
     */
    async search(query, mode = 'semantic') {
        if (!this.isInitialized) await this.initialize();
        if (!await this.rateLimiter.tryAcquire()) {
            throw new Error('Rate limit exceeded. Please wait.');
        }

        try {
            clearHighlights();
            this.currentMatches = [];
            this.currentMatchIndex = -1;
            this.highlightElements = [];
            const sanitizedQuery = sanitizeInput(query);
            validateSearchPattern(sanitizedQuery);
            this.isSearching = true;
            const { isPDF, chunks } = await this.processPage();

            if (mode === 'fuzzy') {
                const fuse = new Fuse(chunks, {
                    keys: ['text'],
                    includeScore: true,
                    threshold: 0.4,
                    shouldSort: false
                });
                const fuseResults = fuse.search(sanitizedQuery);

                for (const result of fuseResults) {
                    const matchingChunk = result.item;
                    this.currentMatches.push(matchingChunk);
                    const elements = isPDF ? matchingChunk.spans : matchingChunk.nodes;
                    elements.forEach(element => {
                        const highlightEl = highlight(element);
                        if (highlightEl) this.highlightElements.push(highlightEl);
                    });
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
                                const elementsToHighlight = (isPDF ? chunk.spans : chunk.nodes)
                                    .filter(node => node.textContent.toLowerCase().includes(queryLower));
                                if (elementsToHighlight.length > 0) {
                                    this.currentMatches.push({ ...chunk, matchedElements: elementsToHighlight });
                                    elementsToHighlight.forEach(element => {
                                        const highlightEl = highlight(element);
                                        if (highlightEl) this.highlightElements.push(highlightEl);
                                    });
                                }
                            }
                            break;
                        }
                        case 'semantic': {
                            const similarity = await this.similaritySearch.findSimilar(sanitizedQuery, chunk.text);
                            if (similarity) {
                                isMatch = true;
                                this.currentMatches.push(chunk);
                                const elements = isPDF ? chunk.spans : chunk.nodes;
                                elements.forEach(element => {
                                    const highlightEl = highlight(element);
                                    if (highlightEl) this.highlightElements.push(highlightEl);
                                });
                            }
                            break;
                        }
                    }
                }
            }

            if (this.currentMatches.length > 0) {
                this.currentMatchIndex = 0;
                this.updateHighlights();
                this.scrollToCurrentMatch();
                console.log(`Search found ${this.currentMatches.length} matches`);
            } else {
                console.log('No matches found');
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

    /** Updates highlight styles based on current match */
    updateHighlights() {
        this.highlightElements.forEach(el => {
            const matchIndex = this.currentMatches.findIndex(match => {
                const elements = match.matchedElements || match.spans || match.nodes; // Changed order
                return elements.includes(el.nodeType === Node.TEXT_NODE ? el.parentElement : el);
            });
    
            if (matchIndex === this.currentMatchIndex) {
                const currentMatch = this.currentMatches[this.currentMatchIndex];
                const chunkElements = currentMatch.matchedElements || currentMatch.spans || currentMatch.nodes; // Changed order
                chunkElements.forEach(element => {
                    const highlightEl = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
                    if (highlightEl && highlightEl.classList.contains('fuzzy-search-highlight')) {
                        highlightEl.classList.add('fuzzy-search-highlight-active');
                    }
                });
            } else {
                el.classList.remove('fuzzy-search-highlight-active');
            }
        });
    }

    /** Scrolls to the current match */
    scrollToCurrentMatch() {
        if (this.currentMatchIndex >= 0 && this.currentMatches.length > 0) {
            const match = this.currentMatches[this.currentMatchIndex];
            const nodes = match.spans || match.matchedElements || match.nodes;
            scrollToMatch(nodes, 0);
        }
    }

    /** Navigates to next match */
    nextMatch() {
        if (this.currentMatches.length === 0) return;
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.currentMatches.length;
        this.updateHighlights();
        this.scrollToCurrentMatch();
        chrome.runtime.sendMessage({
            type: 'MATCH_UPDATE',
            currentIndex: this.currentMatchIndex,
            totalMatches: this.currentMatches.length
        });
    }

    /** Navigates to previous match */
    previousMatch() {
        if (this.currentMatches.length === 0) return;
        this.currentMatchIndex = (this.currentMatches.length + this.currentMatchIndex - 1) % this.currentMatches.length;
        this.updateHighlights();
        this.scrollToCurrentMatch();
        chrome.runtime.sendMessage({
            type: 'MATCH_UPDATE',
            currentIndex: this.currentMatchIndex,
            totalMatches: this.currentMatches.length
        });
    }
}

// Initialization logic
if (!window.googleFzfInitialized) {
    window.googleFzfInitialized = true;

    /**
     * Initializes the extension
     * @async
     */
    async function initializeExtension() {
        try {
            searchManager = new ContentSearchManager();
            await searchManager.initialize();

            // Inject highlight styles
            const style = document.createElement('style');
            style.textContent = `
                .fuzzy-search-highlight {
                    background-color: #4A5568 !important;
                    padding: 1px;
                }
                .fuzzy-search-highlight-active {
                    background-color: #63B3ED !important;
                    color: #fff !important;
                    padding: 1px;
                }
            `;
            document.head.appendChild(style);
            console.log('Highlight CSS injected');

            if (chrome?.runtime) {
                chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
            } else {
                console.warn('Chrome runtime unavailable; extension limited to local functionality');
            }
        } catch (error) {
            console.error('Failed to initialize extension:', error);
        }
    }

    // Set up message listener immediately
    if (chrome?.runtime) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'PING') {
                sendResponse({ status: 'OK' });
                return true; // Keep the channel open
            }
            // Defer other messages until searchManager is ready
            if (!searchManager) {
                sendResponse({ success: false, error: 'Search manager not initialized' });
                return true;
            }
            (async () => {
                try {
                    switch (request.type) {
                        case 'START_SEARCH':
                            const result = await searchManager.search(request.query, request.mode);
                            sendResponse({ success: true, ...result });
                            break;
                        case 'NEXT_MATCH':
                            searchManager.nextMatch();
                            sendResponse({ success: true });
                            break;
                        case 'PREV_MATCH':
                            searchManager.previousMatch();
                            sendResponse({ success: true });
                            break;
                        case 'CANCEL_SEARCH':
                            searchManager.isSearching = false;
                            clearHighlights();
                            sendResponse({ success: true });
                            break;
                    }
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true; // Indicate async response
        });
    }

    initializeExtension();
}