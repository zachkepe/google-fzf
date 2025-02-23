const HIGHLIGHT_CLASS = 'fuzzy-search-highlight';
const ACTIVE_HIGHLIGHT_CLASS = 'fuzzy-search-highlight-active';

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

if (!document.getElementById('fuzzy-search-styles')) {
  style.id = 'fuzzy-search-styles';
  document.head.appendChild(style);
}

export function highlight(node) {
  if (!node) {
    console.warn('Invalid node passed to highlight function: null or undefined');
    return null;
  }

  try {
    if (node.nodeType === Node.TEXT_NODE) {
      const span = document.createElement('span');
      span.className = HIGHLIGHT_CLASS;
      span.setAttribute('data-wrapper', 'true');
      const parent = node.parentNode;
      if (!parent) {
        console.warn('Text node has no parent');
        return null;
      }
      parent.insertBefore(span, node);
      span.appendChild(node);
      return span;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      node.classList.add(HIGHLIGHT_CLASS);
      return node;
    } else {
      console.warn('Invalid node type passed to highlight function:', node.nodeType);
      return null;
    }
  } catch (error) {
    console.error('Error in highlight function:', error);
    return null;
  }
}

export function clearHighlights() {
  try {
    const highlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    highlights.forEach(highlight => {
      if (highlight.hasAttribute('data-wrapper')) {
        const parent = highlight.parentNode;
        if (!parent) return;
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
      } else {
        highlight.classList.remove(HIGHLIGHT_CLASS);
        highlight.classList.remove(ACTIVE_HIGHLIGHT_CLASS);
      }
    });
  } catch (error) {
    console.error('Error in clearHighlights:', error);
  }
}

export function scrollToMatch(nodes) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    console.warn('Invalid nodes passed to scrollToMatch');
    return;
  }

  try {
    // Clear existing active highlights
    const activeHighlights = document.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`);
    activeHighlights.forEach(h => h.classList.remove(ACTIVE_HIGHLIGHT_CLASS));

    // Highlight all nodes in the chunk
    const highlightElements = nodes
      .map(node => {
        let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (element && element.classList.contains(HIGHLIGHT_CLASS)) {
          element.classList.add(ACTIVE_HIGHLIGHT_CLASS);
          return element;
        }
        return null;
      })
      .filter(el => el !== null);

    if (highlightElements.length === 0) {
      console.warn('No highlight elements found for nodes');
      return;
    }

    // Scroll to the first highlight element
    const firstHighlight = highlightElements[0];
    const rect = firstHighlight.getBoundingClientRect();
    const isOutOfView = (
      rect.bottom > window.innerHeight ||
      rect.top < 0 ||
      rect.right > window.innerWidth ||
      rect.left < 0
    );

    if (isOutOfView) {
      firstHighlight.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  } catch (error) {
    console.error('Error in scrollToMatch:', error);
  }
}