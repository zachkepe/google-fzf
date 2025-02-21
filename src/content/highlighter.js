// highlighter.js

// Constants for class names
const HIGHLIGHT_CLASS = 'fuzzy-search-highlight';
const ACTIVE_HIGHLIGHT_CLASS = 'fuzzy-search-highlight-active';

// Create and inject CSS styles
const style = document.createElement('style');
style.textContent = `
  .${HIGHLIGHT_CLASS} {
    background-color: rgba(255, 255, 0, 0.3);
    border-radius: 2px;
    transition: background-color 0.2s ease;
  }
  
  .${ACTIVE_HIGHLIGHT_CLASS} {
    background-color: rgba(255, 165, 0, 0.5);
    box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.2);
  }
`;

// Only inject styles if not already present
if (!document.getElementById('fuzzy-search-styles')) {
  style.id = 'fuzzy-search-styles';
  document.head.appendChild(style);
}

/**
 * Highlights a text node by wrapping it in a span element
 * @param {Node} textNode - The text node to highlight
 * @returns {HTMLElement|null} The created highlight span element or null if failed
 */
export function highlight(node) {
  if (!node) {
    console.warn('Invalid node passed to highlight function: null or undefined');
    return null;
  }

  try {
    // If it's an element node, find its first text node
    let textNode = node;
    if (node.nodeType === Node.ELEMENT_NODE) {
      textNode = Array.from(node.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
      if (!textNode || !textNode.textContent.trim()) {
        console.warn('No valid text node found in element');
        return null;
      }
    } else if (node.nodeType !== Node.TEXT_NODE) {
      console.warn('Invalid node type passed to highlight function:', node.nodeType);
      return null;
    }

    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS;
    
    const parent = textNode.parentNode;
    if (!parent) {
      console.warn('Text node has no parent');
      return null;
    }

    parent.insertBefore(span, textNode);
    span.appendChild(textNode);
    
    return span;
  } catch (error) {
    console.error('Error in highlight function:', error);
    return null;
  }
}

/**
 * Removes all highlights from the document
 */
export function clearHighlights() {
  try {
    const highlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    
    highlights.forEach(highlight => {
      const parent = highlight.parentNode;
      if (!parent) return;

      while (highlight.firstChild) {
        parent.insertBefore(highlight.firstChild, highlight);
      }
      parent.removeChild(highlight);
    });
  } catch (error) {
    console.error('Error in clearHighlights:', error);
  }
}

/**
 * Scrolls to a matched node and updates its highlight style
 * @param {Node} node - The node to scroll to
 */
export function scrollToMatch(node) {
  if (!node) {
    console.warn('Invalid node passed to scrollToMatch');
    return;
  }

  try {
    const activeHighlights = document.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`);
    activeHighlights.forEach(h => h.classList.remove(ACTIVE_HIGHLIGHT_CLASS));
    
    let highlightElement = node.parentElement;
    if (!highlightElement || !highlightElement.classList.contains(HIGHLIGHT_CLASS)) {
      console.warn('Node is not properly highlighted, searching for existing highlight');
      highlightElement = node.closest(`.${HIGHLIGHT_CLASS}`) || node.parentElement;
      if (!highlightElement || !highlightElement.classList.contains(HIGHLIGHT_CLASS)) {
        console.warn('No highlight element found for node');
        return;
      }
    }

    highlightElement.classList.add(ACTIVE_HIGHLIGHT_CLASS);

    const rect = highlightElement.getBoundingClientRect();
    const isOutOfView = (
      rect.bottom > window.innerHeight ||
      rect.top < 0 ||
      rect.right > window.innerWidth ||
      rect.left < 0
    );

    if (isOutOfView) {
      highlightElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  } catch (error) {
    console.error('Error in scrollToMatch:', error);
  }
}

/**
 * Checks if any highlights exist in the document
 * @returns {boolean} True if highlights exist, false otherwise
 */
export function hasHighlights() {
  return document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).length > 0;
}

export function highlightSubstring(textNode, startIndex, endIndex) {
  try {
    const range = document.createRange();
    range.setStart(textNode, startIndex);
    range.setEnd(textNode, endIndex);
    
    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS;
    
    range.surroundContents(span);
    return span;
  } catch (error) {
    console.error('Error in highlightSubstring:', error);
    return null;
  }
}

export function highlightWithContext(result) {
  const { node, text, context, startIndex, length } = result;
  
  try {
    // Create wrapper for context
    const contextWrapper = document.createElement('mark');
    contextWrapper.className = 'fuzzy-search-context';
    contextWrapper.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
    
    // Create highlight for the match
    const highlightSpan = document.createElement('span');
    highlightSpan.className = HIGHLIGHT_CLASS;
    
    // Find the matched text within the context
    const matchStart = text.indexOf(context.slice(startIndex, startIndex + length));
    if (matchStart === -1) return null;
    
    const range = document.createRange();
    range.setStart(node, matchStart);
    range.setEnd(node, matchStart + length);
    
    // Wrap the match in highlight span
    range.surroundContents(highlightSpan);
    
    // Wrap the context
    const contextRange = document.createRange();
    contextRange.setStart(node, Math.max(0, matchStart - context.length / 2));
    contextRange.setEnd(node, Math.min(node.length, matchStart + length + context.length / 2));
    contextRange.surroundContents(contextWrapper);
    
    return { highlight: highlightSpan, context: contextWrapper };
  } catch (error) {
    console.error('Error in highlightWithContext:', error);
    return null;
  }
}