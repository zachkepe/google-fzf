import * as tf from '@tensorflow/tfjs';
import FuzzySearch from 'fuzzy-search';

const SIMILARITY_THRESHOLD = 0.8;
const MAX_RESULTS = 50;
const CONTEXT_WORDS = 10;
const VOCAB_SIZE = 15000; // Match generate-embeddings.js
const EMBEDDING_DIM = 50;

let wordToIndex = null;
let embeddings = null;
let embeddingCache = new Map();

self.onmessage = async function(e) {
  if (e.data.type === 'INIT') {
    try {
      const response = await fetch(e.data.embeddingsUrl);
      const data = await response.json();
      wordToIndex = data.vocabulary;
      embeddings = tf.tensor2d(data.embeddings, [VOCAB_SIZE, EMBEDDING_DIM]);
      self.postMessage({ type: 'INIT_COMPLETE' });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  } else if (e.data.type === 'SEARCH') {
    const results = await performSearch(e.data.query, e.data.chunks);
    self.postMessage({ type: 'SEARCH_RESULTS', results });
  }
};

function calculateRelevanceScore(chunk, query, similarity) {
  let score = similarity;
  
  // Exact match bonus
  if (chunk.text.toLowerCase().includes(query.toLowerCase())) {
    score += 0.2;
  }

  // Word overlap score
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  const chunkWords = new Set(chunk.text.toLowerCase().split(/\s+/));
  const overlap = [...queryWords].filter(word => chunkWords.has(word)).length;
  const overlapScore = overlap / queryWords.size;
  score += overlapScore * 0.3;

  // Penalize very short or very long chunks
  const idealLength = query.length * 5;
  const lengthDiff = Math.abs(chunk.text.length - idealLength) / idealLength;
  score -= lengthDiff * 0.1;

  // Bonus for chunks that contain most or all query terms in order
  const queryTerms = query.toLowerCase().split(/\s+/);
  if (queryTerms.length > 1) {
    let foundInOrder = true;
    let lastIndex = -1;
    for (const term of queryTerms) {
      const index = chunk.text.toLowerCase().indexOf(term, lastIndex + 1);
      if (index === -1 || index <= lastIndex) {
        foundInOrder = false;
        break;
      }
      lastIndex = index;
    }
    if (foundInOrder) {
      score += 0.25;
    }
  }

  return score;
}

async function performSearch(query, chunks) {
  try {
    const queryEmbedding = await getTextEmbedding(query);
    if (!queryEmbedding) return [];

    const results = [];
    const queryTerms = query.toLowerCase().split(/\s+/);
    const isMultiWord = queryTerms.length > 1;

    for (const chunk of chunks) {
      // Quick pre-filter for multi-word queries
      if (isMultiWord) {
        const hasAnyTerm = queryTerms.some(term => 
          chunk.text.toLowerCase().includes(term)
        );
        if (!hasAnyTerm) continue;
      }

      const similarity = await getSimilarity(queryEmbedding, chunk.text);
      if (similarity > SIMILARITY_THRESHOLD) {
        const score = calculateRelevanceScore(chunk, query, similarity);
        
        // Only include results with good relevance scores
        if (score > SIMILARITY_THRESHOLD) {
          // Get surrounding context
          const chunkWords = chunk.text.split(/\s+/);
          const matchIndex = chunk.text.toLowerCase().indexOf(query.toLowerCase());
          
          let contextStart = Math.max(0, matchIndex - CONTEXT_WORDS);
          let contextEnd = Math.min(chunkWords.length, matchIndex + CONTEXT_WORDS);
          
          results.push({
            ...chunk,
            score,
            context: chunkWords.slice(contextStart, contextEnd).join(' ')
          });
        }
      }
    }

    // Sort by score and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}