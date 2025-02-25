/**
 * Sanitizes input by removing dangerous characters
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
  return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .trim();
};

/**
* Validates search pattern constraints
* @param {string} pattern - Search pattern to validate
* @returns {string} Validated pattern
* @throws {Error} If pattern is too long or short
*/
const validateSearchPattern = (pattern) => {
  if (pattern.length > 100) {
      throw new Error('Search pattern too long');
  }
  if (pattern.length < 2) {
      throw new Error('Search pattern too short');
  }
  return pattern;
};

export { sanitizeInput, validateSearchPattern };