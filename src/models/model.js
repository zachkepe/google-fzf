import * as tf from '@tensorflow/tfjs';

const VOCAB_SIZE = 20000;
const EMBEDDING_DIM = 50;

class SimilaritySearch {
  static instance = null;
  static tfInitialized = false;

  constructor() {
    if (SimilaritySearch.instance) {
      return SimilaritySearch.instance;
    }
    this.model = null;
    this.wordToIndex = null;
    this.embeddings = null;
    this.cache = new Map();
    SimilaritySearch.instance = this;
  }

  async initialize() {
    if (this.embeddings) return;
  
    // Ensure TensorFlow.js is initialized only once
    if (!SimilaritySearch.tfInitialized) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'GET_TF_STATUS' }, resolve);
        });
        if (response && response.initialized) {
          SimilaritySearch.tfInitialized = true;
        }
      }
      if (!SimilaritySearch.tfInitialized) {
        try {
          await tf.setBackend('webgl');
          console.log('TensorFlow.js initialized locally with WebGL backend');
          SimilaritySearch.tfInitialized = true;
        } catch (error) {
          console.error('Failed to initialize TensorFlow.js locally:', error);
          throw error;
        }
      }
    }
  
    // Check if running in a PDF viewer context where resources are inaccessible
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
      const isPDF = window.location.href.toLowerCase().endsWith('.pdf');
      throw new Error(
        isPDF
          ? 'Resource loading unavailable in Chrome PDF viewer. Download the PDF and open locally.'
          : 'chrome.runtime unavailable; cannot load embeddings.'
      );
    }
  
    try {
      const embeddingsUrl = chrome.runtime.getURL('embeddings.json');
      console.log('Attempting to fetch embeddings from:', embeddingsUrl);
      const response = await fetch(embeddingsUrl, { method: 'GET' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch embeddings: ${response.status} ${response.statusText} - Response: ${errorText.slice(0, 100)}`);
      }
      const data = await response.json();
      this.wordToIndex = data.vocabulary;
      this.embeddings = tf.tensor2d(data.embeddings, [VOCAB_SIZE, EMBEDDING_DIM]);
      console.log('Word embeddings loaded successfully');
    } catch (error) {
      console.error('Failed to initialize embeddings:', error);
      throw error;
    }
  }

  async findSimilar(searchText, pageText, threshold = 0.8) {
    await this.initialize();
    try {
      const searchEmbedding = this.getTextEmbedding(searchText);
      if (!searchEmbedding) return false;
      const chunkSize = 50; // Smaller chunks for faster processing
      const chunks = this.splitIntoChunks(pageText, chunkSize);
      const chunkEmbeddings = chunks.map(chunk => this.getTextEmbedding(chunk)).filter(Boolean);
      if (!chunkEmbeddings.length) return false;
      const batchTensor = tf.stack(chunkEmbeddings);
      const similarities = this.batchCosineSimilarity(searchEmbedding, batchTensor).dataSync();
      return similarities.some(sim => sim > threshold);
    } catch (error) {
      console.error('Error in findSimilar:', error);
      return false;
    }
  }

  batchCosineSimilarity(embedding, batchEmbeddings) {
    const dotProduct = tf.matMul(batchEmbeddings, embedding.expandDims(1));
    const norms = tf.norm(batchEmbeddings, 2, 1);
    const embeddingNorm = tf.norm(embedding);
    return tf.squeeze(dotProduct.div(norms.mul(embeddingNorm)));
  }

  getTextEmbedding(text) {
    try {
      if (this.cache.has(text)) {
        return this.cache.get(text);
      }
      if (this.cache.size > 1000) this.cache.clear(); // Clear cache if too large
      const tokens = this.tokenize(text);
      const validIndices = tokens
        .map(token => this.wordToIndex[token])
        .filter(index => index !== undefined && index < VOCAB_SIZE);
      if (validIndices.length === 0) {
        // Do not warn for missing embeddings (it's expected for some tokens)
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

  splitIntoChunks(text, chunkSize = 100) {
    const words = this.tokenize(text);
    const chunks = [];
    
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    
    return chunks;
  }

  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

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

  dispose() {
    // Clean up tensors
    if (this.embeddings) {
      this.embeddings.dispose();
    }
    for (const tensor of this.cache.values()) {
      tensor.dispose();
    }
    this.cache.clear();
  }
}

export default SimilaritySearch;
