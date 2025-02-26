/**
 * Base CSS class for highlighted elements.
 * @constant {string}
 */
const HIGHLIGHT_CLASS = 'fuzzy-search-highlight';

/**
 * CSS class for the currently active highlighted element.
 * @constant {string}
 */
const ACTIVE_HIGHLIGHT_CLASS = 'fuzzy-search-highlight-active';

/**
 * Highlights a DOM node by wrapping it in a styled span or adding a class.
 * @function highlight
 * @param {Node} node - The DOM node to highlight (text or element).
 * @returns {HTMLElement|null} The highlighted element, or null if highlighting fails.
 */
export function highlight(node) {
    if (!node) {
        console.warn('Invalid node provided for highlighting:', node);
        return null;
    }

    try {
        if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentNode;
            if (!parent) {
                console.warn('No parent for text node');
                return null;
            }
            if (parent.classList.contains(HIGHLIGHT_CLASS)) return parent;

            const span = document.createElement('span');
            span.className = HIGHLIGHT_CLASS;
            span.setAttribute('data-wrapper', 'true');
            span.setAttribute('aria-label', 'Highlighted search result');
            parent.insertBefore(span, node);
            span.appendChild(node);
            console.log('Highlighted text node:', span);
            return span;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (!node.classList.contains(HIGHLIGHT_CLASS)) {
                node.classList.add(HIGHLIGHT_CLASS);
                node.setAttribute('aria-label', 'Highlighted search result');
            }
            console.log('Highlighted element:', node);
            return node;
        }
        return null;
    } catch (error) {
        console.error('Highlighting error:', error);
        return null;
    }
}

/**
 * Removes all highlights from the document, restoring original DOM structure.
 * @function clearHighlights
 */
export function clearHighlights() {
    try {
        const highlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
        highlights.forEach(highlight => {
            if (highlight.hasAttribute('data-wrapper')) {
                const parent = highlight.parentNode;
                if (parent) {
                    while (highlight.firstChild) {
                        parent.insertBefore(highlight.firstChild, highlight);
                    }
                    parent.removeChild(highlight);
                }
            } else {
                highlight.classList.remove(HIGHLIGHT_CLASS, ACTIVE_HIGHLIGHT_CLASS);
                highlight.removeAttribute('aria-label');
            }
        });
        console.log('All highlights cleared');
    } catch (error) {
        console.error('Error clearing highlights:', error);
    }
}

/**
 * Creates a debounced function that delays execution until after a wait period.
 * @function debounce
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @returns {Function} A debounced version of the input function.
 * @private
 */
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Scrolls the viewport to a specific match, applying active highlight styling.
 * Debounced to prevent excessive scroll events.
 * @function scrollToMatch
 * @param {Node[]} nodes - Array of DOM nodes representing the match.
 * @param {number} [activeIndex=0] - Index of the node to mark as active.
 */
export const scrollToMatch = debounce((nodes, activeIndex = 0) => {
    if (!nodes?.length) {
        console.warn('Invalid nodes array for scrolling');
        return;
    }

    try {
        const activeHighlights = document.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`);
        activeHighlights.forEach(el => el.classList.remove(ACTIVE_HIGHLIGHT_CLASS));

        const highlightElements = nodes.map((node, index) => {
            let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            if (element && !element.classList.contains(HIGHLIGHT_CLASS)) {
                element.classList.add(HIGHLIGHT_CLASS);
            }
            if (index === activeIndex && element) {
                element.classList.add(ACTIVE_HIGHLIGHT_CLASS);
            }
            return element;
        }).filter(Boolean);

        if (highlightElements.length > 0 && activeIndex >= 0 && activeIndex < highlightElements.length) {
            const activeElement = highlightElements[activeIndex];
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            console.log('Scrolled to match:', activeElement);
        }
    } catch (error) {
        console.error('Scroll to match error:', error);
    }
}, 100);