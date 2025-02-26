/**
 * Sanitizes input by removing dangerous characters
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
  return input.replace(/[<>]/g, '').trim();
};

/**
 * Validates search pattern constraints.
 * (Note: Length validations have been removed.)
 * @param {string} pattern - Search pattern to validate
 * @returns {string} The trimmed pattern
 */
const validateSearchPattern = (pattern) => {
  return pattern.trim();
};

export { sanitizeInput, validateSearchPattern };