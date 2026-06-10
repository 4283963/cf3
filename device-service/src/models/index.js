const { sequelize } = require('../config/database');

const Device = require('./Device')(sequelize);
const DeviceSession = require('./DeviceSession')(sequelize);
const DeviceStatusLog = require('./DeviceStatusLog')(sequelize);
const GunTimeSegment = require('./GunTimeSegment')(sequelize);

Device.hasMany(DeviceSession, {
  foreignKey: 'deviceNo',
  sourceKey: 'deviceNo',
  as: 'sessions',
});

DeviceSession.belongsTo(Device, {
  foreignKey: 'deviceNo',
  targetKey: 'deviceNo',
  as: 'device',
});

DeviceSession.hasMany(GunTimeSegment, {
  foreignKey: 'sessionId',
  sourceKey: 'sessionId',
  as: 'gunSegments',
});

GunTimeSegment.belongsTo(DeviceSession, {
  foreignKey: 'sessionId',
  targetKey: 'sessionId',
  as: 'session',
});

DeviceSession.hasMany(DeviceStatusLog, {
  foreignKey: 'sessionId',
  sourceKey: 'sessionId',
  as: 'statusLogs',
});

DeviceStatusLog.belongsTo(DeviceSession, {
  foreignKey: 'sessionId',
  targetKey: 'sessionId',
  as: 'session',
});

module.exports = {
  sequelize,
  Device,
  DeviceSession,
  DeviceStatusLog,
  GunTimeSegment,
};
