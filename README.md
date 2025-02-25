# GoogleFZF
GoogleFZF is an open-source Chrome extension that enhances the standard "Command + F" search by using AI-powered contextual search. Instead of only matching exact words, GoogleFZF understands similar words and phrases on a webpage, making it easier to find what you're looking for. Additionally, it runs 100% in the browser.

## Getting the Embeddings
`cd` into `google-fzf` and run the following command:

``` bash
node scripts/generate_embeddings.js
```

This will generate the embeddings for the words in the `src/data/embeddings.json` file.

## Running the Extension
To run the extension, follow these steps:

1. Run `npm install` to install the necessary dependencies.
2. Run `npm run build` to build the extension.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable Developer Mode.
5. Click on "Load unpacked" and select the `dist` folder.
6. The extension should now be running.

## Contributions
GoogleFZF welcomes contributions from the community! If you'd like to contribute:

1. Fork the repository on GitHub.
2. Make your changes in your forked repository.
3. Submit a pull request with a clear description of your improvements or fixes.

All contributions are appreciated, whether they're bug fixes, new features, or documentation improvements.

## Shortcuts
Once the extension is running, you can use the following keyboard shortcuts in the search popup:
- `Enter`: Navigate to the next search match.
- `Shift + Enter`: Navigate to the previous search match.