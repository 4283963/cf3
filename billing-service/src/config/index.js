require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3002,
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123456',
    name: process.env.DB_NAME || 'carwash',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
    },
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || 'redis123456',
    db: parseInt(process.env.REDIS_DB, 10) || 1,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'billing:',
  },

  deviceService: {
    baseUrl: process.env.DEVICE_SERVICE_BASE_URL || 'http://127.0.0.1:3001',
    timeout: parseInt(process.env.DEVICE_SERVICE_TIMEOUT, 10) || 5000,
    internalApiToken: process.env.INTERNAL_API_TOKEN || 'dev-internal-token-2024',
  },

  ttl: {
    billingOrder: parseInt(process.env.BILLING_ORDER_TTL, 10) || 86400,
    walletLock: parseInt(process.env.WALLET_LOCK_TTL, 10) || 10,
  },
};
