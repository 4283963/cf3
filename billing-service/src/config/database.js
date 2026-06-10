const { Sequelize } = require('sequelize');
const config = require('./index');

const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4',
      dateStrings: true,
      typeCast: true,
    },
    timezone: '+08:00',
    pool: {
      max: config.database.pool.max,
      min: config.database.pool.min,
      acquire: config.database.pool.acquire,
      idle: config.database.pool.idle,
    },
    isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    logging: config.nodeEnv === 'development' ? console.log : false,
  }
);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('[Database] MySQL 连接成功');
  } catch (error) {
    console.error('[Database] MySQL 连接失败:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection,
  Sequelize,
  DataTypes: Sequelize.DataTypes,
};
