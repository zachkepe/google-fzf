class RateLimiter {
    constructor(maxRequests = 10, perMinutes = 1) {
      this.tokens = maxRequests;
      this.maxTokens = maxRequests;
      this.lastRefill = Date.now();
      this.refillTime = perMinutes * 60 * 1000;
    }
  
    async tryAcquire() {
      this.refill();
      if (this.tokens > 0) {
        this.tokens--;
        return true;
      }
      return false;
    }
  
    refill() {
      const now = Date.now();
      const timePassed = now - this.lastRefill;
      const refillTokens = Math.floor(timePassed / this.refillTime) * this.maxTokens;
      this.tokens = Math.min(this.maxTokens, this.tokens + refillTokens);
      this.lastRefill = now;
    }
  }
  
  export default RateLimiter;