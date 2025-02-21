const sanitizeInput = (input) => {
    // Remove potentially dangerous characters and HTML tags
    return input
      .replace(/[<>]/g, '')
      .trim();
  };
  
  const validateSearchPattern = (pattern) => {
    // Ensure pattern is not too long or complex
    if (pattern.length > 100) {
      throw new Error('Search pattern too long');
    }
    if (pattern.length < 2) {
      throw new Error('Search pattern too short');
    }
    return pattern;
  };
  
  export { sanitizeInput, validateSearchPattern };