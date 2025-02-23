// scripts/generate-embeddings.js
const fs = require('fs');
const path = require('path');

const gloveFile = path.join(__dirname, '..', 'glove.6B.50d.txt');
const VOCAB_SIZE = 20000;

async function generateEmbeddings() {
  console.log('Reading GloVe file...');
  const embeddings = [];
  const vocabulary = {};
  let count = 0;

  const fileContent = fs.readFileSync(gloveFile, 'utf8');
  const lines = fileContent.split('\n');

  for (const line of lines) {
    if (count >= VOCAB_SIZE) break;
    
    const parts = line.trim().split(' ');
    if (parts.length !== 51) continue; // Skip malformed lines
    
    const word = parts[0];
    const vector = parts.slice(1).map(Number);

    vocabulary[word] = count;
    embeddings.push(vector);
    count++;
    
    if (count % 1000 === 0) {
      console.log(`Processed ${count} words...`);
    }
  }

  console.log(`Finished processing ${count} words`);

  // Save the reduced embeddings
  const output = {
    vocabulary,
    embeddings
  };

  const outputPath = path.join(__dirname, '..', 'src', 'data', 'embeddings.json');
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(`Created embeddings.json at ${outputPath}`);
}

generateEmbeddings().catch(console.error);