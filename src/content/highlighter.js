const HIGHLIGHT_CLASS = 'fuzzy-search-highlight';
const ACTIVE_HIGHLIGHT_CLASS = 'fuzzy-search-highlight-active';

export function highlight(node) {
  if (!node) {
    console.warn('Invalid node:', node);
    return null;
  }
  try {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      if (!parent) {
        console.warn('No parent for text node');
        return null;
      }
      if (parent.classList.contains(HIGHLIGHT_CLASS)) {
        return parent;
      }
      const span = document.createElement('span');
      span.className = HIGHLIGHT_CLASS;
      span.setAttribute('data-wrapper', 'true');
      parent.insertBefore(span, node);
      span.appendChild(node);
      console.log('Highlighted text node:', span);
      return span;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (!node.classList.contains(HIGHLIGHT_CLASS)) {
        node.classList.add(HIGHLIGHT_CLASS);
      }
      console.log('Highlighted element:', node);
      return node;
    }
    return null;
  } catch (error) {
    console.error('Highlight error:', error);
    return null;
  }
}

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
        highlight.classList.remove(HIGHLIGHT_CLASS);
        highlight.classList.remove(ACTIVE_HIGHLIGHT_CLASS);
      }
    });
    console.log('Highlights cleared');
  } catch (error) {
    console.error('Clear highlights error:', error);
  }
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export const scrollToMatch = debounce((nodes, activeIndex = 0) => {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    console.warn('Invalid nodes for scrollToMatch');
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
    }).filter(el => el);

    if (highlightElements.length > 0 && activeIndex >= 0 && activeIndex < highlightElements.length) {
      const activeElement = highlightElements[activeIndex];
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log('Scrolled to:', activeElement);
    }
  } catch (error) {
    console.error('Scroll error:', error);
  }
}, 100);