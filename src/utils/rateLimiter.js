/**
 * Implements a token bucket rate limiter
 * @class
 */
class RateLimiter {
  /**
   * @param {number} [maxRequests=10] - Maximum number of requests allowed
   * @param {number} [perMinutes=1] - Time window in minutes for token refill
   */
  constructor(maxRequests = 10, perMinutes = 1) {
      this.tokens = maxRequests;
      this.maxTokens = maxRequests;
      this.lastRefill = Date.now();
      this.refillTime = perMinutes * 60 * 1000;
  }

  /**
   * Attempts to acquire a token
   * @async
   * @returns {Promise<boolean>} Whether a token was acquired
   */
  async tryAcquire() {
      this.refill();
      if (this.tokens > 0) {
          this.tokens--;
          return true;
      }
      return false;
  }

  /**
   * Refills tokens based on elapsed time
   */
  refill() {
      const now = Date.now();
      const timePassed = now - this.lastRefill;
      const refillTokens = Math.floor(timePassed / this.refillTime) * this.maxTokens;
      this.tokens = Math.min(this.maxTokens, this.tokens + refillTokens);
      this.lastRefill = now;
  }
}

export default RateLimiter;