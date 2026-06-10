require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const { testConnection } = require('./config/database');
require('./config/redis');

const billingRoutes = require('./routes/billingRoutes');
const {
  errorHandler,
  notFoundHandler,
} = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

app.get('/health', (req, res) => {
  res.status(200).json({
    code: 200,
    message: 'Billing-Service is running',
    data: {
      service: 'billing-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      deviceServiceUrl: config.deviceService.baseUrl,
    },
  });
});

app.use('/api/billing', billingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    await testConnection();

    app.listen(config.port, () => {
      console.log('========================================');
      console.log('  Billing-Service 启动成功');
      console.log(`  环境: ${config.nodeEnv}`);
      console.log(`  端口: ${config.port}`);
      console.log(`  健康检查: http://127.0.0.1:${config.port}/health`);
      console.log(
        `  Device-Service: ${config.deviceService.baseUrl}`
      );
      console.log('========================================');
    });
  } catch (error) {
    console.error('[Startup] 服务启动失败:', error.message);
    process.exit(1);
  }
};

startServer();
