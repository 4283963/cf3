const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const DeviceFaultAlert = sequelize.define(
    'DeviceFaultAlert',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      alertId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'alert_id',
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
      faultType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'fault_type',
        comment:
          'FOAM_LOW / WATER_PRESSURE_DROP / WATER_GUN_FAULT / FOAM_GUN_FAULT / WATER_EMPTY / GENERAL_FAULT',
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
      faultLevel: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 2,
        field: 'fault_level',
        comment: '1-警告 2-需立即中断 3-严重',
      },
      sensorData: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'sensor_data',
      },
      isResolved: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        field: 'is_resolved',
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'resolved_at',
      },
      resolvedNote: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'resolved_note',
      },
      triggeredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'triggered_at',
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
      tableName: 'device_fault_alerts',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      indexes: [
        { fields: ['device_no'] },
        { fields: ['session_id'] },
        { fields: ['fault_type'] },
        { fields: ['fault_level'] },
        { fields: ['is_resolved'] },
        { fields: ['triggered_at'] },
      ],
    }
  );

  return DeviceFaultAlert;
};
