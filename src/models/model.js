import * as tf from '@tensorflow/tfjs';

/**
 * Vocabulary size for the embedding model.
 * @constant {number}
 */
const VOCAB_SIZE = 15000;

/**
 * Dimension of each word embedding vector.
 * @constant {number}
 */
const EMBEDDING_DIM = 50;

/**
 * Manages semantic similarity search using pre-trained word embeddings.
 * Implements a singleton pattern to ensure a single instance.
 * @class
 */
class SimilaritySearch {
    /**
     * Singleton instance of SimilaritySearch.
     * @type {SimilaritySearch|null}
     * @static
     */
    static instance = null;

    /**
     * Tracks TensorFlow.js initialization status.
     * @type {boolean}
     * @static
     */
    static tfInitialized = false;

    /**
     * Initializes a new instance or returns the existing singleton.
     * @constructor
     */
    constructor() {
        if (SimilaritySearch.instance) return SimilaritySearch.instance;
        this.model = null;
        this.wordToIndex = null;
        this.embeddings = null;
        this.cache = new Map();
        this.isInitialized = false;
        SimilaritySearch.instance = this;
    }

    /**
     * Initializes the similarity search by loading embeddings and verifying TensorFlow.js.
     * @async
     * @returns {Promise<void>} Resolves when initialization is complete.
     * @throws {Error} If embeddings cannot be fetched or TensorFlow.js is not initialized.
     */
    async initialize() {
        if (this.isInitialized) return;
        try {
            if (!SimilaritySearch.tfInitialized) {
                const response = await new Promise(resolve =>
                    chrome.runtime.sendMessage({ type: 'GET_TF_STATUS' }, resolve)
                );
                if (!response?.initialized) {
                    throw new Error('TensorFlow.js not initialized in background script');
                }
                SimilaritySearch.tfInitialized = true;
            }

            const embeddingsUrl = chrome.runtime.getURL('embeddings.json');
            const response = await fetch(embeddingsUrl, { method: 'GET' });
            if (!response.ok) throw new Error(`Failed to fetch embeddings: ${response.status}`);
            const data = await response.json();
            this.wordToIndex = data.vocabulary;
            this.embeddings = tf.tensor2d(data.embeddings, [VOCAB_SIZE, EMBEDDING_DIM]);
            console.log('Word embeddings loaded successfully');
            this.isInitialized = true;
            console.log('SimilaritySearch initialized');
        } catch (error) {
            console.error('Failed to initialize similarity search:', error);
            throw error;
        }
    }

    /**
     * Determines if the provided text is semantically similar to the search query.
     * @async
     * @param {string} searchText - The search query string.
     * @param {string} pageText - The text content to compare against.
     * @param {number} [threshold=0.8] - Minimum similarity score to consider a match.
     * @returns {Promise<boolean>} True if similarity exceeds the threshold, false otherwise.
     */
    async findSimilar(searchText, pageText, threshold = 0.8) {
        await this.initialize();
        try {
            const searchEmbedding = this.getTextEmbedding(searchText, true);
            if (!searchEmbedding) return false;

            const chunks = this.splitIntoChunks(pageText, 50);
            const chunkEmbeddings = chunks.map(chunk => this.getTextEmbedding(chunk, false)).filter(Boolean);
            if (!chunkEmbeddings.length) return false;

            const batchTensor = tf.stack(chunkEmbeddings);
            const similarities = this.batchCosineSimilarity(searchEmbedding, batchTensor).dataSync();
            console.log(`Similarity scores for "${searchText}":`, similarities);
            return similarities.some(sim => sim > threshold);
        } catch (error) {
            console.error('Error in findSimilar:', error);
            return false;
        }
    }

    /**
     * Computes batch cosine similarity between a single embedding and multiple embeddings.
     * @param {tf.Tensor} embedding - The reference embedding (e.g., search query).
     * @param {tf.Tensor} batchEmbeddings - Tensor of embeddings to compare against.
     * @returns {tf.Tensor} A tensor of similarity scores.
     * @private
     */
    batchCosineSimilarity(embedding, batchEmbeddings) {
        const dotProduct = tf.matMul(batchEmbeddings, embedding.expandDims(1));
        const norms = tf.norm(batchEmbeddings, 2, 1);
        const embeddingNorm = tf.norm(embedding);
        return tf.squeeze(dotProduct.div(norms.mul(embeddingNorm)));
    }

    /**
     * Generates a mean embedding vector for the given text.
     * @param {string} text - The input text to embed.
     * @param {boolean} isQuery - Indicates if the text is a search query (affects tokenization).
     * @returns {tf.Tensor|null} The mean embedding tensor, or null if no valid tokens are found.
     */
    getTextEmbedding(text, isQuery = false) {
        try {
            if (this.cache.has(text)) return this.cache.get(text);
            if (this.cache.size > 1000) this.cache.clear();

            const tokens = this.tokenize(text, isQuery);
            const validIndices = tokens
                .map(token => this.wordToIndex[token])
                .filter(index => index !== undefined && index < VOCAB_SIZE);

            if (validIndices.length === 0) {
                console.log(`No embeddings found for text: "${text}"`);
                return null;
            }

            return tf.tidy(() => {
                const embeddings = validIndices.map(index =>
                    this.embeddings.slice([index, 0], [1, EMBEDDING_DIM])
                );
                const stacked = tf.concat(embeddings, 0);
                const meanEmbedding = stacked.mean(0);
                this.cache.set(text, meanEmbedding);
                return meanEmbedding;
            });
        } catch (error) {
            console.error('Error generating text embedding:', error);
            return null;
        }
    }

    /**
     * Splits text into manageable chunks for embedding.
     * @param {string} text - The input text to split.
     * @param {number} [chunkSize=50] - Maximum number of words per chunk.
     * @returns {string[]} An array of text chunks.
     */
    splitIntoChunks(text, chunkSize = 50) {
        const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
        const chunks = [];
        for (let i = 0; i < words.length; i += chunkSize) {
            chunks.push(words.slice(i, i + chunkSize).join(' '));
        }
        return chunks;
    }

    /**
     * Stores tokenized query for debugging or reuse.
     * @type {string[]|null}
     */
    tokenizedQuery = null;

    /**
     * Tokenizes text into words suitable for embedding.
     * @param {string} text - The input text to tokenize.
     * @param {boolean} isQuery - Indicates if the text is a search query.
     * @returns {string[]} An array of cleaned and filtered tokens.
     */
    tokenize(text, isQuery = false) {
        const cleanedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const tokens = cleanedText.split(/\s+/).filter(word => word.length > 2);
        if (isQuery) this.tokenizedQuery = tokens;
        return tokens;
    }

    /**
     * Computes cosine similarity between two embedding vectors.
     * @param {tf.Tensor} embedding1 - The first embedding vector.
     * @param {tf.Tensor} embedding2 - The second embedding vector.
     * @returns {number} The cosine similarity score (0 if invalid).
     */
    cosineSimilarity(embedding1, embedding2) {
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
     * Disposes of TensorFlow resources to free memory.
     * @async
     */
    async dispose() {
        if (this.embeddings) this.embeddings.dispose();
        for (const tensor of this.cache.values()) tensor.dispose();
        this.cache.clear();
        this.isInitialized = false;
        console.log('SimilaritySearch resources disposed');
    }
}

export default SimilaritySearch;