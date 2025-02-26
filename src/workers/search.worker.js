import * as tf from '@tensorflow/tfjs';

/** @constant {number} Minimum similarity score for matches */
const SIMILARITY_THRESHOLD = 0.8;
/** @constant {number} Maximum number of search results */
const MAX_RESULTS = 50;
/** @constant {number} Number of context words to include */
const CONTEXT_WORDS = 10;
/** @constant {number} Vocabulary size */
const VOCAB_SIZE = 15000;
/** @constant {number} Embedding dimension */
const EMBEDDING_DIM = 50;

/** @type {Object|null} Word to index mapping */
let wordToIndex = null;
/** @type {tf.Tensor|null} Word embeddings tensor */
let embeddings = null;
/** @type {Map<string, tf.Tensor>} Cache for text embeddings */
let embeddingCache = new Map();

/**
 * Worker message handler
 * @param {MessageEvent} e - Worker message event
 */
self.onmessage = async function(e) {
    if (e.data.type === 'INIT') {
        try {
            if (!tf.getBackend()) {
                await tf.setBackend('webgl');
                await tf.ready();
                console.log('TensorFlow.js initialized in worker with WebGL backend');
            }
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

/**
 * Calculates relevance score for a chunk
 * @param {Object} chunk - Text chunk object
 * @param {string} query - Search query
 * @param {number} similarity - Cosine similarity score
 * @returns {number} Relevance score
 */
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
    score += (overlap / queryWords.size) * 0.3;

    // Length penalty
    const idealLength = query.length * 5;
    const lengthDiff = Math.abs(chunk.text.length - idealLength) / idealLength;
    score -= lengthDiff * 0.1;

    // Sequential term bonus
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
        if (foundInOrder) score += 0.25;
    }

    return score;
}

/**
 * Performs semantic search on text chunks
 * @async
 * @param {string} query - Search query
 * @param {Object[]} chunks - Text chunks to search
 * @returns {Promise<Object[]>} Search results
 */
async function performSearch(query, chunks) {
    try {
        const queryEmbedding = await getTextEmbedding(query);
        if (!queryEmbedding) return [];

        const results = [];
        const queryTerms = query.toLowerCase().split(/\s+/);
        const isMultiWord = queryTerms.length > 1;

        for (const chunk of chunks) {
            if (isMultiWord && !queryTerms.some(term => chunk.text.toLowerCase().includes(term))) {
                continue;
            }

            const similarity = await getSimilarity(queryEmbedding, chunk.text);
            if (similarity > SIMILARITY_THRESHOLD) {
                const score = calculateRelevanceScore(chunk, query, similarity);
                
                if (score > SIMILARITY_THRESHOLD) {
                    const chunkWords = chunk.text.split(/\s+/);
                    const matchIndex = chunk.text.toLowerCase().indexOf(query.toLowerCase());
                    const contextStart = Math.max(0, matchIndex - CONTEXT_WORDS);
                    const contextEnd = Math.min(chunkWords.length, matchIndex + CONTEXT_WORDS);

                    results.push({
                        ...chunk,
                        score,
                        context: chunkWords.slice(contextStart, contextEnd).join(' ')
                    });
                }
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * Generates text embedding
 * @async
 * @param {string} text - Input text
 * @returns {Promise<tf.Tensor|null>} Text embedding or null if failed
 */
async function getTextEmbedding(text) {
    try {
        if (embeddingCache.has(text)) return embeddingCache.get(text);
        if (embeddingCache.size > 1000) embeddingCache.clear();

        const tokens = tokenize(text);
        const validIndices = tokens
            .map(token => wordToIndex[token])
            .filter(index => index !== undefined && index < VOCAB_SIZE);

        if (validIndices.length === 0) {
            console.log(`No embeddings found for text: "${text}"`);
            return null;
        }

        return tf.tidy(() => {
            const embeddingsArr = validIndices.map(index =>
                embeddings.slice([index, 0], [1, EMBEDDING_DIM])
            );
            const stacked = tf.concat(embeddingsArr, 0);
            const meanEmbedding = stacked.mean(0);
            embeddingCache.set(text, meanEmbedding);
            return meanEmbedding;
        });
    } catch (error) {
        console.error('Error in getTextEmbedding:', error);
        return null;
    }
}

/**
 * Calculates similarity between query and text
 * @async
 * @param {tf.Tensor} queryEmbedding - Query embedding
 * @param {string} text - Text to compare
 * @returns {Promise<number>} Similarity score
 */
async function getSimilarity(queryEmbedding, text) {
    const textEmbedding = await getTextEmbedding(text);
    if (!textEmbedding) return 0;
    return cosineSimilarity(queryEmbedding, textEmbedding);
}

/**
 * Tokenizes text for embedding
 * @param {string} text - Input text
 * @returns {string[]} Tokens
 */
function tokenize(text) {
    const cleanedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return cleanedText.split(/\s+/).filter(word => word.length > 2);
}

/**
 * Calculates cosine similarity between embeddings
 * @param {tf.Tensor} embedding1 - First embedding
 * @param {tf.Tensor} embedding2 - Second embedding
 * @returns {number} Similarity score
 */
function cosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2) return 0;
    return tf.tidy(() => {
        const dotProduct = embedding1.dot(embedding2);
        const norm1 = embedding1.norm();
        const norm2 = embedding2.norm();
        const similarity = dotProduct.div(norm1.mul(norm2)).dataSync()[0];
        return isNaN(similarity) ? 0 : similarity;
    });
}

/**
 * Cleans up TensorFlow resources
 */
function dispose() {
    if (embeddings) embeddings.dispose();
    for (const tensor of embeddingCache.values()) tensor.dispose();
    embeddingCache.clear();
}
