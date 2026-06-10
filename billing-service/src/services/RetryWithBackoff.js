const RETRIABLE_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN',
]);

const RETRIABLE_HTTP_STATUS = new Set([
  408,
  429,
  500,
  502,
  503,
  504,
]);

class RetryWithBackoff {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 2;
    this.baseDelayMs = options.baseDelayMs || 200;
    this.maxDelayMs = options.maxDelayMs || 3000;
    this.jitterFactor = options.jitterFactor || 0.25;
    this.retriableErrorCodes = options.retriableErrorCodes || RETRIABLE_ERROR_CODES;
    this.retriableHttpStatus = options.retriableHttpStatus || RETRIABLE_HTTP_STATUS;
  }

  _calculateDelay(attempt) {
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    const jitterRange = cappedDelay * this.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.floor(cappedDelay + jitter));
  }

  isRetriable(error) {
    if (error.code && this.retriableErrorCodes.has(error.code)) {
      return true;
    }

    if (error.code === 'CIRCUIT_OPEN') {
      return false;
    }

    const status = error.response?.status;
    if (status && this.retriableHttpStatus.has(status)) {
      return true;
    }

    return false;
  }

  async execute(fn, contextLabel) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt >= this.maxRetries) {
          break;
        }

        if (!this.isRetriable(error)) {
          break;
        }

        const delay = this._calculateDelay(attempt);
        console.warn(
          `[RetryWithBackoff${contextLabel ? `:${contextLabel}` : ''}] ` +
          `第 ${attempt + 1} 次重试，${delay}ms 后执行 ` +
          `(错误: ${error.code || error.message})`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

module.exports = RetryWithBackoff;
