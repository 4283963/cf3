const axios = require('axios');
const http = require('http');
const https = require('https');
const config = require('../config');
const CircuitBreaker = require('./CircuitBreaker');
const { STATE_OPEN, STATE_HALF_OPEN, STATE_CLOSED } = require('./CircuitBreaker');
const RetryWithBackoff = require('./RetryWithBackoff');

const CB_NAME_GET_SESSION = 'device:getSessionUsage';
const CB_NAME_START_SESSION = 'device:startSession';
const CB_NAME_STOP_SESSION = 'device:stopSession';

const cbConfig = config.deviceService.circuitBreaker;
const retryConfig = config.deviceService.retry;
const timeoutConfig = config.deviceService.timeout;

const circuitBreakers = {};

const createCircuitBreaker = (name) => {
  const cb = new CircuitBreaker({
    name,
    failureThreshold: cbConfig.failureThreshold,
    failureWindowMs: cbConfig.failureWindowMs,
    openDurationMs: cbConfig.openDurationMs,
    halfOpenMaxAttempts: cbConfig.halfOpenMaxAttempts,
    halfOpenSuccessThreshold: cbConfig.halfOpenSuccessThreshold,
    onStateChange: (cbName, oldState, newState) => {
      if (newState === STATE_OPEN) {
        console.error(
          `[Device-Client] ⚠️ 熔断器 ${cbName} 已打开！后续请求将被快速拒绝`
        );
      } else if (newState === STATE_HALF_OPEN) {
        console.warn(
          `[Device-Client] 🔄 熔断器 ${cbName} 进入半开状态，将放行少量探测请求`
        );
      } else if (newState === STATE_CLOSED) {
        console.info(
          `[Device-Client] ✅ 熔断器 ${cbName} 已关闭，服务恢复正常`
        );
      }
    },
  });
  circuitBreakers[name] = cb;
  return cb;
};

const getSessionCB = createCircuitBreaker(CB_NAME_GET_SESSION);
const startSessionCB = createCircuitBreaker(CB_NAME_START_SESSION);
const stopSessionCB = createCircuitBreaker(CB_NAME_STOP_SESSION);

const retryPolicy = new RetryWithBackoff({
  maxRetries: retryConfig.maxRetries,
  baseDelayMs: retryConfig.baseDelayMs,
  maxDelayMs: retryConfig.maxDelayMs,
  jitterFactor: retryConfig.jitterFactor,
});

const deviceClient = axios.create({
  baseURL: config.deviceService.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-api-token': config.deviceService.internalApiToken,
  },
  httpAgent: new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: timeoutConfig.maxConnections,
    maxFreeSockets: timeoutConfig.maxFreeConnections,
    timeout: timeoutConfig.connectTimeout,
    scheduling: 'fifo',
  }),
  httpsAgent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: timeoutConfig.maxConnections,
    maxFreeSockets: timeoutConfig.maxFreeConnections,
    timeout: timeoutConfig.connectTimeout,
    scheduling: 'fifo',
  }),
  timeout: timeoutConfig.readTimeout,
  maxRedirects: 0,
  validateStatus: (status) => status >= 200 && status < 300,
});

deviceClient.interceptors.request.use((request) => {
  request._startTime = Date.now();
  request.metadata = {
    requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  console.log(
    `[Device-Client] → ${request.method.toUpperCase()} ${request.baseURL}${
      request.url
    } [id:${request.metadata.requestId}]`
  );
  return request;
});

deviceClient.interceptors.response.use(
  (response) => {
    const duration = Date.now() - (response.config._startTime || Date.now());
    console.log(
      `[Device-Client] ← ${response.status} ${response.config.method.toUpperCase()} ` +
      `${response.config.url} [${duration}ms] [id:${response.config.metadata?.requestId}]`
    );
    return response;
  },
  (error) => {
    const duration = error.config?._startTime
      ? Date.now() - error.config._startTime
      : '?';
    const requestId = error.config?.metadata?.requestId || 'unknown';

    if (error.code === 'ECONNABORTED') {
      console.error(
        `[Device-Client] ← 超时 ${error.config?.method?.toUpperCase()} ` +
        `${error.config?.url} [${duration}ms] [id:${requestId}] ` +
        `(connectTimeout=${timeoutConfig.connectTimeout}ms, readTimeout=${timeoutConfig.readTimeout}ms)`
      );
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH') {
      console.error(
        `[Device-Client] ← 连接被拒 ${error.config?.method?.toUpperCase()} ` +
        `${error.config?.url} [${duration}ms] [id:${requestId}]`
      );
    } else if (error.response) {
      console.error(
        `[Device-Client] ← ${error.response.status} ${error.config?.method?.toUpperCase()} ` +
        `${error.config?.url} [${duration}ms] [id:${requestId}]`
      );
    } else {
      console.error(
        `[Device-Client] ← 网络错误 ${error.code || error.message} ` +
        `${error.config?.method?.toUpperCase()} ${error.config?.url || ''} ` +
        `[${duration}ms] [id:${requestId}]`
      );
    }

    return Promise.reject(error);
  }
);

const enrichError = (error, operation, sessionId) => {
  error.operation = operation;
  error.sessionId = sessionId || null;
  error.serviceName = 'Device-Service';
  error.timestamp = new Date().toISOString();

  if (error.code === 'ECONNABORTED') {
    error.faultType = 'TIMEOUT';
    error.userMessage = '设备服务响应超时，请稍后重试';
  } else if (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENETUNREACH' ||
    error.code === 'ECONNRESET'
  ) {
    error.faultType = 'CONNECTION_ERROR';
    error.userMessage = '设备服务不可用，请稍后重试';
  } else if (error.code === 'CIRCUIT_OPEN') {
    error.faultType = 'CIRCUIT_OPEN';
    error.userMessage = '设备服务当前不可用（熔断保护中），请稍后重试';
  } else if (error.response) {
    error.faultType = 'HTTP_ERROR';
    error.httpStatus = error.response.status;
    error.userMessage =
      error.response.data?.message || '设备服务返回错误';
  } else {
    error.faultType = 'UNKNOWN';
    error.userMessage = '设备服务调用异常，请稍后重试';
  }

  return error;
};

const getSessionUsage = async (sessionId, fallbackFn) => {
  const cb = getSessionCB;

  return cb.execute(
    () =>
      retryPolicy.execute(
        () => deviceClient.get(`/api/device/session/${sessionId}`),
        CB_NAME_GET_SESSION
      ).then((response) => {
        if (response.data.code === 200) {
          return response.data.data;
        }
        throw new Error(response.data.message || '获取会话使用数据失败');
      }),
    fallbackFn
  ).catch((error) => {
    throw enrichError(error, 'getSessionUsage', sessionId);
  });
};

const startDeviceSession = async (data, fallbackFn) => {
  const cb = startSessionCB;

  return cb.execute(
    () =>
      retryPolicy.execute(
        () => deviceClient.post('/api/device/session/start', data),
        CB_NAME_START_SESSION
      ).then((response) => {
        if (response.data.code === 200) {
          return response.data.data;
        }
        throw new Error(response.data.message || '启动设备会话失败');
      }),
    fallbackFn
  ).catch((error) => {
    throw enrichError(error, 'startDeviceSession', data.sessionId);
  });
};

const stopDeviceSession = async (sessionId, fallbackFn) => {
  const cb = stopSessionCB;

  return cb.execute(
    () =>
      retryPolicy.execute(
        () => deviceClient.post('/api/device/session/stop', { sessionId }),
        CB_NAME_STOP_SESSION
      ).then((response) => {
        if (response.data.code === 200) {
          return response.data.data;
        }
        throw new Error(response.data.message || '停止设备会话失败');
      }),
    fallbackFn
  ).catch((error) => {
    error._isNonFatal = true;
    console.warn(
      `[Device-Client] 停止设备会话失败（非致命）: ${error.faultType} - ${error.message}`
    );
    if (fallbackFn) {
      return fallbackFn();
    }
    return null;
  });
};

const getCircuitBreakerStats = () => {
  const stats = {};
  for (const [name, cb] of Object.entries(circuitBreakers)) {
    stats[name] = cb.getStats();
  }
  return stats;
};

module.exports = {
  deviceClient,
  getSessionUsage,
  startDeviceSession,
  stopDeviceSession,
  getCircuitBreakerStats,
  circuitBreakers,
};
