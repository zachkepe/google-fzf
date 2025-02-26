/**
 * Sanitizes input by removing potentially dangerous characters.
 * @function sanitizeInput
 * @param {string} input - The input string to sanitize.
 * @returns {string} The sanitized string with '<' and '>' removed and trimmed.
 */
const sanitizeInput = (input) => {
  return input.replace(/[<>]/g, '').trim();
};

/**
* Validates a search pattern, ensuring it meets basic requirements.
* @function validateSearchPattern
* @param {string} pattern - The search pattern to validate.
* @returns {string} The trimmed pattern if valid.
* @throws {Error} If validation fails (currently no constraints enforced beyond trimming).
*/
const validateSearchPattern = (pattern) => {
  return pattern.trim();
};

export { sanitizeInput, validateSearchPattern };