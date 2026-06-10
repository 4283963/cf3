const { DataTypes } = require('../config/database');

module.exports = (sequelize) => {
  const GunTimeSegment = sequelize.define(
    'GunTimeSegment',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'session_id',
      },
      deviceNo: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'device_no',
      },
      gunType: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '1-喷水枪，2-泡沫枪',
        field: 'gun_type',
      },
      actionType: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '1-开，2-关',
        field: 'action_type',
      },
      actionTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'action_time',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
    },
    {
      tableName: 'gun_time_segments',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: false,
      indexes: [
        { fields: ['session_id'] },
        { fields: ['device_no'] },
        { fields: ['gun_type'] },
        { fields: ['action_time'] },
      ],
    }
  );

  return GunTimeSegment;
};
