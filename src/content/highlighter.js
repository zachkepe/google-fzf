const HIGHLIGHT_CLASS = 'fuzzy-search-highlight';
const ACTIVE_HIGHLIGHT_CLASS = 'fuzzy-search-highlight-active';

export function highlight(node) {
  if (!node) {
    console.warn('Invalid node passed to highlight function: null or undefined');
    return null;
  }
  try {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentNode && node.parentNode.classList.contains(HIGHLIGHT_CLASS)) {
        return node.parentNode;
      }
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

export function scrollToMatch(nodes, activeIndex = 0) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    console.warn('Invalid nodes passed to scrollToMatch');
    return;
  }
  try {
    // Remove previous active highlights
    const activeHighlights = document.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`);
    activeHighlights.forEach(el => el.classList.remove(ACTIVE_HIGHLIGHT_CLASS));

    // Highlight all nodes and set the active one
    const highlightElements = nodes.map((node, index) => {
      let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (element) {
        element.classList.add(HIGHLIGHT_CLASS);
        if (index === activeIndex) {
          element.classList.add(ACTIVE_HIGHLIGHT_CLASS);
        }
      }
      return element;
    }).filter(el => el !== null);

    if (highlightElements.length > 0 && activeIndex >= 0 && activeIndex < highlightElements.length) {
      const activeElement = highlightElements[activeIndex];
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  } catch (error) {
    console.error('Error in scrollToMatch:', error);
  }
}
