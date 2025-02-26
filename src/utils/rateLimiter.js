/**
 * Implements a token bucket rate limiter to control request frequency.
 * @class
 */
class RateLimiter {
    /**
     * Initializes the rate limiter with specified limits.
     * @constructor
     * @param {number} [maxRequests=10] - Maximum number of requests allowed in the time window.
     * @param {number} [perMinutes=1] - Time window in minutes for token replenishment.
     */
    constructor(maxRequests = 10, perMinutes = 1) {
        this.tokens = maxRequests;
        this.maxTokens = maxRequests;
        this.lastRefill = Date.now();
        this.refillTime = perMinutes * 60 * 1000;
    }

    /**
     * Attempts to acquire a token, refilling bucket as needed.
     * @async
     * @returns {Promise<boolean>} True if a token is acquired, false if rate limit is exceeded.
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
     * Refills tokens based on elapsed time since last refill.
     * @private
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