const STATE_CLOSED = 'CLOSED';
const STATE_OPEN = 'OPEN';
const STATE_HALF_OPEN = 'HALF_OPEN';

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';

    this.failureThreshold = options.failureThreshold || 5;
    this.failureWindowMs = options.failureWindowMs || 60000;

    this.openDurationMs = options.openDurationMs || 30000;

    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 2;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold || 2;

    this.state = STATE_CLOSED;
    this.failureCount = 0;
    this.failureTimestamps = [];
    this.openedAt = null;
    this.halfOpenAttempts = 0;
    this.halfOpenSuccesses = 0;

    this.onStateChange = options.onStateChange || null;

    this._stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0,
      totalTimeouts: 0,
      lastFailureTime: null,
      lastFailureMessage: null,
    };
  }

  _recordFailure(error) {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.failureCount++;

    this._stats.totalFailures++;
    this._stats.lastFailureTime = now;
    this._stats.lastFailureMessage = error.message || String(error);

    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => now - ts < this.failureWindowMs
    );

    if (
      this.state === STATE_HALF_OPEN
    ) {
      this._transitionTo(STATE_OPEN);
      return;
    }

    if (
      this.state === STATE_CLOSED &&
      this.failureTimestamps.length >= this.failureThreshold
    ) {
      this._transitionTo(STATE_OPEN);
    }
  }

  _recordSuccess() {
    this._stats.totalSuccesses++;

    if (this.state === STATE_HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this._transitionTo(STATE_CLOSED);
      }
    }
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    if (newState === STATE_OPEN) {
      this.openedAt = Date.now();
      this.halfOpenAttempts = 0;
      this.halfOpenSuccesses = 0;
    }

    if (newState === STATE_HALF_OPEN) {
      this.halfOpenAttempts = 0;
      this.halfOpenSuccesses = 0;
    }

    if (newState === STATE_CLOSED) {
      this.failureCount = 0;
      this.failureTimestamps = [];
    }

    if (this.onStateChange) {
      this.onStateChange(this.name, oldState, newState);
    }

    console.warn(
      `[CircuitBreaker:${this.name}] 状态变更: ${oldState} → ${newState}`
    );
  }

  _checkState() {
    if (this.state === STATE_OPEN) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.openDurationMs) {
        this._transitionTo(STATE_HALF_OPEN);
        return STATE_HALF_OPEN;
      }
      return STATE_OPEN;
    }
    return this.state;
  }

  canExecute() {
    this._stats.totalRequests++;
    const currentState = this._checkState();

    if (currentState === STATE_OPEN) {
      this._stats.totalRejected++;
      return false;
    }

    if (currentState === STATE_HALF_OPEN) {
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        this._stats.totalRejected++;
        return false;
      }
      this.halfOpenAttempts++;
    }

    return true;
  }

  async execute(fn, fallbackFn) {
    if (!this.canExecute()) {
      if (fallbackFn) {
        console.warn(
          `[CircuitBreaker:${this.name}] 熔断中，执行降级函数`
        );
        return fallbackFn();
      }
      const err = new Error(
        `CircuitBreaker [${this.name}] 处于 OPEN 状态，拒绝请求`
      );
      err.code = 'CIRCUIT_OPEN';
      err.circuitState = this.state;
      err.circuitName = this.name;
      throw err;
    }

    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure(error);
      throw error;
    }
  }

  getState() {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureTimestamps.length,
      openedAt: this.openedAt,
      halfOpenAttempts: this.halfOpenAttempts,
      halfOpenSuccesses: this.halfOpenSuccesses,
      ...this._stats,
    };
  }

  reset() {
    this._transitionTo(STATE_CLOSED);
  }
}

module.exports = CircuitBreaker;
module.exports.STATE_CLOSED = STATE_CLOSED;
module.exports.STATE_OPEN = STATE_OPEN;
module.exports.STATE_HALF_OPEN = STATE_HALF_OPEN;
