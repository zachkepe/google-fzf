# GoogleFZF
GoogleFZF is an open-source Chrome extension that enhances web and PDF search with AI-powered contextual capabilities. Unlike traditional "Ctrl/Cmd+F", it understands similar words and phrases, running entirely in-browser for privacy and speed.

## Features
- Semantic Search: Finds contextually similar text using GloVe embeddings and cosine similarity.
- Fuzzy Search: Matches approximate text with Fuse.js.
- Exact Search: Classic keyword matching.
- PDF Support: Intercepts and renders PDFs with searchable text layers.
- Privacy-First: All processing happens locally, no data leaves your browser.

## Architecture
- Background: Manages TensorFlow.js initialization, PDF fetching, and message passing.
- Content: Handles page text extraction, highlighting, and search execution.
- Popup: Provides a sleek UI with mode selection and match navigation.
- Worker: Offloads semantic search computation for performance.
- Tech Stack: TensorFlow.js, GloVe embeddings, pdfjs-dist, Fuse.js.

## Getting Started
### Prerequisites
- Node.js 16+
- Chrome 88+

### Generating Embeddings
``` bash
cd google-fzf
node scripts/generate-embeddings.js
```

### Running the Extension
1. Run `npm install` to install dependencies.
2. Run `npm run build` to build the extension.
3. Open Chrome, go to chrome://extensions/.
4. Enable Developer Mode.
5. Click "Load unpacked" and select the dist folder.

## Shortcuts
- Mac: `Command+Shift+S` - Open popup
- Windows: `Ctrl+Shift+S` - Open popup
- `Ctrl+Shift+M` - Cycle search modes
- `Enter` - Next match
- `Shift+Enter` - Previous match

## Contributing
We welcome contributions! To get started:
1. Fork the repo on GitHub.
2. Make changes in your fork.
3. Submit a pull request with a clear description.

Why contribute? Enhance an open source, cutting-edge tool!

## Troubleshooting
- PDF Fails to Load: May be due to CORS. Use "Download PDF" to save locally.
- Slow Search: Reduce VOCAB_SIZE in config.js (future feature) or ensure WebGL is enabled.
- Extension Not Loading: Check console for errors and ensure all files are in dist.

## License
MIT © Zachary Kepe