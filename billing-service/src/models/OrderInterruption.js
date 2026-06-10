const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const OrderInterruption = sequelize.define(
    'OrderInterruption',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      interruptionId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'interruption_id',
      },
      orderNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'order_no',
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'session_id',
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
      },
      deviceNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'device_no',
      },
      alertId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'alert_id',
      },
      faultType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'fault_type',
      },
      faultMessage: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'fault_message',
      },
      interruptReason: {
        type: DataTypes.STRING(256),
        allowNull: false,
        field: 'interrupt_reason',
      },
      orderStatusBefore: {
        type: DataTypes.TINYINT,
        allowNull: false,
        field: 'order_status_before',
      },
      orderStatusAfter: {
        type: DataTypes.TINYINT,
        allowNull: false,
        field: 'order_status_after',
      },
      chargedAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'charged_amount',
      },
      actualUsageAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'actual_usage_amount',
      },
      refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'refund_amount',
      },
      refundTxNo: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'refund_tx_no',
      },
      refundStatus: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        field: 'refund_status',
        comment: '0-无需退款 1-退款成功 2-退款失败 3-退款中',
      },
      refundFailReason: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'refund_fail_reason',
      },
      isAuto: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        field: 'is_auto',
      },
      interruptedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'interrupted_at',
      },
      refundedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'refunded_at',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at',
      },
    },
    {
      tableName: 'order_interruptions',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      indexes: [
        { fields: ['interruption_id'], unique: true },
        { fields: ['order_no'] },
        { fields: ['session_id'] },
        { fields: ['user_id'] },
        { fields: ['device_no'] },
        { fields: ['alert_id'] },
        { fields: ['refund_status'] },
        { fields: ['interrupted_at'] },
      ],
    }
  );

  return OrderInterruption;
};
