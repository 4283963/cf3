const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const BillingOrder = sequelize.define(
    'BillingOrder',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      orderNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'order_no',
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
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
      ruleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'rule_id',
      },
      waterGunTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'water_gun_time',
        comment: '喷水枪时长（分钟，向上取整）',
      },
      foamGunTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'foam_gun_time',
        comment: '泡沫枪时长（分钟，向上取整）',
      },
      waterGunCost: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'water_gun_cost',
        comment: '喷水枪费用（元）',
      },
      foamGunCost: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'foam_gun_cost',
        comment: '泡沫枪费用（元）',
      },
      waterUsageCost: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'water_usage_cost',
        comment: '耗水费用（元）',
      },
      totalAmount: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'total_amount',
        comment: '订单总金额（元）',
      },
      actualAmount: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'actual_amount',
        comment: '实际扣款金额（元）',
      },
      status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '1-计费中，2-待扣款，3-已完成，4-扣款失败',
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'start_time',
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'end_time',
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'paid_at',
      },
      failReason: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'fail_reason',
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
      tableName: 'billing_orders',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      indexes: [
        { fields: ['order_no'], unique: true },
        { fields: ['session_id'], unique: true },
        { fields: ['user_id'] },
        { fields: ['status'] },
      ],
    }
  );

  return BillingOrder;
};
