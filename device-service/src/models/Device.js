const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const Device = sequelize.define(
    'Device',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      deviceNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'device_no',
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      community: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '0-离线，1-在线空闲，2-使用中，3-故障',
      },
      waterPressure: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        field: 'water_pressure',
      },
      foamLevel: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 100.0,
        field: 'foam_level',
        comment: '泡沫液位百分比 0-100',
      },
      waterLevel: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 100.0,
        field: 'water_level',
        comment: '清水液位百分比 0-100',
      },
      lastFaultTime: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_fault_time',
      },
      lastFaultType: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'last_fault_type',
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
      tableName: 'devices',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    }
  );

  return Device;
};
