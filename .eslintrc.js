module.exports = {
    env: {
      browser: true,
      webextensions: true,
      es2021: true,
      node: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
      ecmaVersion: 12,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }]
    }
  };