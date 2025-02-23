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