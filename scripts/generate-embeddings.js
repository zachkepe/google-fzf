const fs = require('fs');
const path = require('path');

/**
 * Configuration constants for embedding generation.
 * @constant {string} gloveFile - Absolute path to the GloVe embeddings file.
 * @constant {number} VOCAB_SIZE - Maximum number of vocabulary words to process from the GloVe file.
 */
const gloveFile = path.join(__dirname, '..', 'glove.6B.50d.txt');
const VOCAB_SIZE = 15000;

/**
 * Asynchronously generates word embeddings from a GloVe file and saves them as a JSON file.
 * Processes the GloVe file line-by-line, extracting word vectors and building a vocabulary index.
 * @async
 * @function generateEmbeddings
 * @returns {Promise<void>} Resolves when embeddings are successfully generated and saved.
 * @throws {Error} If file reading, parsing, or writing operations fail.
 */
async function generateEmbeddings() {
    console.log('Reading GloVe file...');

    // Initialize data structures for embeddings and vocabulary
    const embeddings = [];
    const vocabulary = {};
    let count = 0;

    // Read and process the GloVe file synchronously for simplicity
    const fileContent = fs.readFileSync(gloveFile, 'utf8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
        if (count >= VOCAB_SIZE) break;

        const parts = line.trim().split(' ');
        if (parts.length !== 51) continue; // Skip lines that don’t match expected format (word + 50D vector)

        const word = parts[0];
        const vector = parts.slice(1).map(Number);

        vocabulary[word] = count;
        embeddings.push(vector);
        count++;

        // Log progress at regular intervals
        if (count % 1000 === 0) {
            console.log(`Processed ${count} words...`);
        }
    }

    console.log(`Finished processing ${count} words`);

    // Prepare output data and save to JSON file
    const output = { vocabulary, embeddings };
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'embeddings.json');

    fs.writeFileSync(outputPath, JSON.stringify(output));
    console.log(`Created embeddings.json at ${outputPath}`);
}

// Execute the embedding generation process and handle any errors
generateEmbeddings().catch(error => {
    console.error('Error generating embeddings:', error);
});