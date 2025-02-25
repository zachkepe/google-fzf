const fs = require('fs');
const path = require('path');

/**
 * Configuration constants
 * @constant {string} gloveFile - Path to GloVe embeddings file
 * @constant {number} VOCAB_SIZE - Maximum number of vocabulary words to process
 */
const gloveFile = path.join(__dirname, '..', 'glove.6B.50d.txt');
const VOCAB_SIZE = 15000;

/**
 * Generates word embeddings from GloVe file and saves as JSON
 * @async
 * @function generateEmbeddings
 * @returns {Promise<void>}
 * @throws {Error} If file reading or writing fails
 */
async function generateEmbeddings() {
    console.log('Reading GloVe file...');
    
    // Initialize data structures
    const embeddings = [];
    const vocabulary = {};
    let count = 0;

    // Read and process GloVe file
    const fileContent = fs.readFileSync(gloveFile, 'utf8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
        if (count >= VOCAB_SIZE) break;

        const parts = line.trim().split(' ');
        if (parts.length !== 51) continue; // Skip invalid lines

        const word = parts[0];
        const vector = parts.slice(1).map(Number);

        vocabulary[word] = count;
        embeddings.push(vector);
        count++;

        // Progress logging
        if (count % 1000 === 0) {
            console.log(`Processed ${count} words...`);
        }
    }

    console.log(`Finished processing ${count} words`);

    // Prepare and save output
    const output = { vocabulary, embeddings };
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'embeddings.json');
    
    fs.writeFileSync(outputPath, JSON.stringify(output));
    console.log(`Created embeddings.json at ${outputPath}`);
}

// Execute the generation process
generateEmbeddings().catch(console.error);