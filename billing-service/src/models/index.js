const { sequelize } = require('../config/database');

const User = require('./User')(sequelize);
const BillingRule = require('./BillingRule')(sequelize);
const BillingOrder = require('./BillingOrder')(sequelize);
const WalletTransaction = require('./WalletTransaction')(sequelize);

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

module.exports = {
  sequelize,
  User,
  BillingRule,
  BillingOrder,
  WalletTransaction,
};
