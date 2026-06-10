const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const WalletTransaction = sequelize.define(
    'WalletTransaction',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      txNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'tx_no',
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
      },
      orderNo: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'order_no',
      },
      txType: {
        type: DataTypes.TINYINT,
        allowNull: false,
        field: 'tx_type',
        comment: '1-充值，2-消费扣款，3-退款',
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '正数为收入，负数为支出',
      },
      balanceBefore: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'balance_before',
      },
      balanceAfter: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'balance_after',
      },
      remark: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
    },
    {
      tableName: 'wallet_transactions',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: false,
      indexes: [
        { fields: ['tx_no'], unique: true },
        { fields: ['user_id'] },
        { fields: ['order_no'] },
        { fields: ['tx_type'] },
        { fields: ['created_at'] },
      ],
    }
  );

  return WalletTransaction;
};
