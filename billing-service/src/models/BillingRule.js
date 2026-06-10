const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const BillingRule = sequelize.define(
    'BillingRule',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      ruleName: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'rule_name',
      },
      waterGunRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: 'water_gun_rate',
        comment: '喷水枪费率（元/分钟）',
      },
      foamGunRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: 'foam_gun_rate',
        comment: '泡沫枪费率（元/分钟）',
      },
      waterUsageRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'water_usage_rate',
        comment: '耗水费率（元/升）',
      },
      minCharge: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'min_charge',
        comment: '最低消费（元）',
      },
      isActive: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        field: 'is_active',
        comment: '0-否，1-是',
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
      tableName: 'billing_rules',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    }
  );

  return BillingRule;
};
