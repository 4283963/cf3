const axios = require('axios');
const config = require('../config');

const RETRYABLE_ERRORS = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const billingClient = axios.create({
  baseURL: config.billingService.baseUrl,
  timeout: config.billingService.connectTimeout + config.billingService.readTimeout,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-api-token': config.internalApiToken,
  },
  maxRedirects: 0,
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) => {
  if (error.response) {
    return RETRYABLE_STATUS.has(error.response.status);
  }
  if (error.code) {
    return RETRYABLE_ERRORS.has(error.code);
  }
  return false;
};

const sendEmergencyInterrupt = async (payload) => {
  const maxRetries = config.billingService.maxRetries;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const requestId = `DEV-BILL-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

      console.log(
        `[BillingClient] 发送紧急中断 [${requestId}] attempt=${attempt + 1}`,
        `device=${payload.deviceNo}`,
        `session=${payload.sessionId || 'N/A'}`,
        `fault=${payload.faultType}`
      );

      const start = Date.now();
      const response = await billingClient.post('/api/emergency/interrupt', payload, {
        headers: { 'x-request-id': requestId },
      });

      const elapsed = Date.now() - start;
      console.log(
        `[BillingClient] 紧急中断响应 [${requestId}] status=${response.status} elapsed=${elapsed}ms`
      );

      return {
        success: true,
        status: response.status,
        data: response.data,
        requestId,
        attempt: attempt + 1,
      };
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);

      if (attempt < maxRetries && retryable) {
        const backoff = 50 * Math.pow(2, attempt) + Math.random() * 30;
        console.warn(
          `[BillingClient] 紧急中断请求失败，将在 ${backoff.toFixed(0)}ms 后重试 (${attempt + 1}/${maxRetries}): ${err.message}`
        );
        await wait(backoff);
        continue;
      }

      console.error(
        `[BillingClient] 紧急中断请求最终失败: ${err.message}`
      );
      break;
    }
  }

  return {
    success: false,
    error: lastError ? lastError.message : 'Unknown error',
    status: lastError?.response?.status || null,
    attemptCount: maxRetries + 1,
  };
};

module.exports = {
  sendEmergencyInterrupt,
};
