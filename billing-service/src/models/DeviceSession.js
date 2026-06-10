const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const DeviceSession = sequelize.define(
    'DeviceSession',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'session_id',
      },
      deviceNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'device_no',
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
      },
      status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '1-进行中，2-已结束',
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'start_time',
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'end_time',
      },
      waterGunTotalTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'water_gun_total_time',
      },
      foamGunTotalTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'foam_gun_total_time',
      },
      totalWaterVolume: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'total_water_volume',
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
      tableName: 'device_sessions',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    }
  );

  return DeviceSession;
};
