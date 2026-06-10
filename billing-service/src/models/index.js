const { sequelize } = require('../config/database');

const User = require('./User')(sequelize);
const BillingRule = require('./BillingRule')(sequelize);
const BillingOrder = require('./BillingOrder')(sequelize);
const WalletTransaction = require('./WalletTransaction')(sequelize);
const DeviceSession = require('./DeviceSession')(sequelize);
const DeviceFaultAlert = require('./DeviceFaultAlert')(sequelize);
const OrderInterruption = require('./OrderInterruption')(sequelize);

User.hasMany(BillingOrder, {
  foreignKey: 'userId',
  sourceKey: 'id',
  as: 'orders',
});

BillingOrder.belongsTo(User, {
  foreignKey: 'userId',
  targetKey: 'id',
  as: 'user',
});

BillingOrder.belongsTo(BillingRule, {
  foreignKey: 'ruleId',
  targetKey: 'id',
  as: 'rule',
});

User.hasMany(WalletTransaction, {
  foreignKey: 'userId',
  sourceKey: 'id',
  as: 'transactions',
});

WalletTransaction.belongsTo(User, {
  foreignKey: 'userId',
  targetKey: 'id',
  as: 'user',
});

WalletTransaction.belongsTo(BillingOrder, {
  foreignKey: 'orderNo',
  targetKey: 'orderNo',
  as: 'order',
});

DeviceSession.hasMany(BillingOrder, {
  foreignKey: 'sessionId',
  sourceKey: 'sessionId',
  as: 'billingOrders',
});

BillingOrder.belongsTo(DeviceSession, {
  foreignKey: 'sessionId',
  targetKey: 'sessionId',
  as: 'deviceSession',
});

DeviceFaultAlert.hasMany(OrderInterruption, {
  foreignKey: 'alertId',
  sourceKey: 'alertId',
  as: 'interruptions',
});

OrderInterruption.belongsTo(DeviceFaultAlert, {
  foreignKey: 'alertId',
  targetKey: 'alertId',
  as: 'faultAlert',
});

BillingOrder.hasMany(OrderInterruption, {
  foreignKey: 'orderNo',
  sourceKey: 'orderNo',
  as: 'interruptions',
});

OrderInterruption.belongsTo(BillingOrder, {
  foreignKey: 'orderNo',
  targetKey: 'orderNo',
  as: 'order',
});

module.exports = {
  sequelize,
  User,
  BillingRule,
  BillingOrder,
  WalletTransaction,
  DeviceSession,
  DeviceFaultAlert,
  OrderInterruption,
};
