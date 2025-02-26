import * as tf from '@tensorflow/tfjs';

/** @constant {number} Vocabulary size */
const VOCAB_SIZE = 15000;
/** @constant {number} Embedding dimension */
const EMBEDDING_DIM = 50;

/**
 * Handles semantic similarity search using word embeddings
 * @class
 */
class SimilaritySearch {
    static instance = null;
    static tfInitialized = false;

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
     * Initializes embeddings, relying on background script for TensorFlow
     * @async
     * @returns {Promise<void>}
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
     * Finds similar text based on semantic similarity
     * @async
     * @param {string} searchText - Search query
     * @param {string} pageText - Page content
     * @param {number} [threshold=0.8] - Similarity threshold
     * @returns {Promise<boolean>} Whether similar text was found
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
     * Calculates batch cosine similarity
     * @param {tf.Tensor} embedding - Single embedding
     * @param {tf.Tensor} batchEmbeddings - Batch of embeddings
     * @returns {tf.Tensor} Similarity scores
     */
    batchCosineSimilarity(embedding, batchEmbeddings) {
        const dotProduct = tf.matMul(batchEmbeddings, embedding.expandDims(1));
        const norms = tf.norm(batchEmbeddings, 2, 1);
        const embeddingNorm = tf.norm(embedding);
        return tf.squeeze(dotProduct.div(norms.mul(embeddingNorm)));
    }

    /**
     * Generates text embedding
     * @param {string} text - Input text
     * @param {boolean} isQuery - Whether this is a search query
     * @returns {tf.Tensor|null} Text embedding or null if failed
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
            console.error('Error in getTextEmbedding:', error);
            return null;
        }
    }

    /**
     * Splits text into chunks
     * @param {string} text - Input text
     * @param {number} [chunkSize=50] - Words per chunk
     * @returns {string[]} Text chunks
     */
    splitIntoChunks(text, chunkSize = 50) {
        const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
        const chunks = [];
        for (let i = 0; i < words.length; i += chunkSize) {
            chunks.push(words.slice(i, i + chunkSize).join(' '));
        }
        return chunks;
    }

    /** @type {string[]|null} Stores tokenized query */
    tokenizedQuery = null;

    /**
     * Tokenizes text for embedding
     * @param {string} text - Input text
     * @param {boolean} isQuery - Whether this is a search query
     * @returns {string[]} Tokens
     */
    tokenize(text, isQuery = false) {
        const cleanedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const tokens = cleanedText.split(/\s+/).filter(word => word.length > 2);
        if (isQuery) this.tokenizedQuery = tokens;
        return tokens;
    }

    /**
     * Calculates cosine similarity between two embeddings
     * @param {tf.Tensor} embedding1 - First embedding
     * @param {tf.Tensor} embedding2 - Second embedding
     * @returns {number} Similarity score
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

    /** Cleans up TensorFlow resources */
    async dispose() {
        if (this.embeddings) this.embeddings.dispose();
        for (const tensor of this.cache.values()) tensor.dispose();
        this.cache.clear();
        this.isInitialized = false;
        console.log('SimilaritySearch resources disposed');
    }
}

export default SimilaritySearch;