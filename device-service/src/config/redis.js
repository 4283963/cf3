const Redis = require('ioredis');
const config = require('./index');

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  keyPrefix: config.redis.keyPrefix,
  retryStrategy: (times) => {
    const delay = Math.min(times * 200, 3000);
    console.log(`[Redis] 正在第 ${times} 次重连，${delay}ms 后重试`);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.log('[Redis] 正在连接...');
});

redis.on('ready', () => {
  console.log('[Redis] 连接成功，已就绪');
});

redis.on('error', (error) => {
  console.error('[Redis] 连接错误:', error.message);
});

redis.on('close', () => {
  console.warn('[Redis] 连接已关闭');
});

const KeyBuilder = {
  deviceStatus: (deviceNo) => `status:${deviceNo}`,
  deviceSession: (sessionId) => `session:${sessionId}`,
  deviceActiveSession: (deviceNo) => `active_session:${deviceNo}`,
  gunState: (sessionId, gunType) => `gun:${sessionId}:${gunType}`,
};

module.exports = {
  redis,
  KeyBuilder,
};
