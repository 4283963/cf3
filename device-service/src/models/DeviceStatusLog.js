const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const DeviceStatusLog = sequelize.define(
    'DeviceStatusLog',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      deviceNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'device_no',
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'session_id',
      },
      waterGun: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        field: 'water_gun',
        comment: '0-关，1-开',
      },
      foamGun: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        field: 'foam_gun',
        comment: '0-关，1-开',
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      waterFlowRate: {
        type: DataTypes.DECIMAL(6, 2),
        defaultValue: 0,
        field: 'water_flow_rate',
        comment: '水流量（升/分钟）',
      },
      faultCode: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'fault_code',
      },
      faultMessage: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'fault_message',
      },
      foamLevel: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'foam_level',
        comment: '泡沫液位百分比 0-100',
      },
      waterLevel: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'water_level',
        comment: '清水液位百分比 0-100',
      },
      waterPressure: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'water_pressure',
        comment: '水管压力（MPa）',
      },
      faultType: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'fault_type',
        comment: '故障分类：FOAM_LOW/WATER_PRESSURE_DROP/WATER_GUN_FAULT等',
      },
      reportedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'reported_at',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
    },
    {
      tableName: 'device_status_logs',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: false,
      indexes: [
        { fields: ['device_no'] },
        { fields: ['session_id'] },
        { fields: ['reported_at'] },
      ],
    }
  );

  return DeviceStatusLog;
};
