const Joi = require('joi');
const dayjs = require('dayjs');
const { Op } = require('sequelize');
const {
  Device,
  DeviceSession,
  DeviceStatusLog,
  GunTimeSegment,
  sequelize,
} = require('../models');
const { redis, KeyBuilder } = require('../config/redis');
const config = require('../config');
const { sendEmergencyInterrupt } = require('../services/billingServiceClient');

const GUN_TYPE_WATER = 1;
const GUN_TYPE_FOAM = 2;
const ACTION_OPEN = 1;
const ACTION_CLOSE = 2;

const DEVICE_STATUS_OFFLINE = 0;
const DEVICE_STATUS_IDLE = 1;
const DEVICE_STATUS_BUSY = 2;
const DEVICE_STATUS_FAULT = 3;

const SESSION_STATUS_ACTIVE = 1;
const SESSION_STATUS_ENDED = 2;

const FAULT_LEVEL_WARNING = 1;
const FAULT_LEVEL_INTERRUPT = 2;
const FAULT_LEVEL_CRITICAL = 3;

const FAULT_TYPE_FOAM_LOW = 'FOAM_LOW';
const FAULT_TYPE_WATER_EMPTY = 'WATER_EMPTY';
const FAULT_TYPE_PRESSURE_DROP = 'WATER_PRESSURE_DROP';
const FAULT_TYPE_WATER_GUN = 'WATER_GUN_FAULT';
const FAULT_TYPE_FOAM_GUN = 'FOAM_GUN_FAULT';
const FAULT_TYPE_GENERAL = 'GENERAL_FAULT';

const GUN_FAULT_CODES = new Set([
  'W001',
  'W002',
  'W003',
  'F001',
  'F002',
  'F003',
]);

const detectHardwareFault = (payload, device) => {
  const faults = [];

  if (payload.waterLevel !== undefined && payload.waterLevel <= 5) {
    faults.push({
      faultType: FAULT_TYPE_WATER_EMPTY,
      faultCode: 'LEV_W001',
      faultMessage: `清水液位过低，当前 ${payload.waterLevel}%`,
      faultLevel: FAULT_LEVEL_INTERRUPT,
    });
  }

  if (payload.foamLevel !== undefined && payload.foamLevel <= 5) {
    faults.push({
      faultType: FAULT_TYPE_FOAM_LOW,
      faultCode: 'LEV_F001',
      faultMessage: `泡沫液位过低，当前 ${payload.foamLevel}%`,
      faultLevel: FAULT_LEVEL_INTERRUPT,
    });
  }

  const prevPressure =
    device && device.waterPressure !== undefined && device.waterPressure !== null
      ? parseFloat(device.waterPressure)
      : null;
  const currPressure =
    payload.waterPressure !== undefined && payload.waterPressure !== null
      ? parseFloat(payload.waterPressure)
      : null;

  if (currPressure !== null && currPressure < 0.5) {
    if (
      prevPressure === null ||
      (prevPressure !== null && prevPressure - currPressure >= 1.0) ||
      currPressure < 0.2
    ) {
      faults.push({
        faultType: FAULT_TYPE_PRESSURE_DROP,
        faultCode: 'PRS_D001',
        faultMessage: `水管压力骤降，当前 ${currPressure} MPa${
          prevPressure !== null ? `，之前 ${prevPressure} MPa` : ''
        }`,
        faultLevel: currPressure < 0.2 ? FAULT_LEVEL_CRITICAL : FAULT_LEVEL_INTERRUPT,
      });
    }
  }

  if (payload.faultCode) {
    const code = String(payload.faultCode).toUpperCase();
    let gunFault = null;
    if (code.startsWith('W')) {
      gunFault = FAULT_TYPE_WATER_GUN;
    } else if (code.startsWith('F')) {
      gunFault = FAULT_TYPE_FOAM_GUN;
    } else if (GUN_FAULT_CODES.has(code) || code.includes('GUN')) {
      gunFault = code.includes('FOAM') || code.startsWith('F')
        ? FAULT_TYPE_FOAM_GUN
        : FAULT_TYPE_WATER_GUN;
    }

    faults.push({
      faultType: payload.faultType || gunFault || FAULT_TYPE_GENERAL,
      faultCode: payload.faultCode,
      faultMessage: payload.faultMessage || '设备上报故障码',
      faultLevel: FAULT_LEVEL_INTERRUPT,
    });
  }

  if (payload.faultType && !faults.find((f) => f.faultType === payload.faultType)) {
    faults.push({
      faultType: payload.faultType,
      faultCode: payload.faultCode || 'CUSTOM',
      faultMessage: payload.faultMessage || '设备上报硬件异常',
      faultLevel: FAULT_LEVEL_INTERRUPT,
    });
  }

  if (faults.length === 0) return null;

  const critical = faults.find((f) => f.faultLevel === FAULT_LEVEL_CRITICAL);
  const interrupt = faults.find((f) => f.faultLevel >= FAULT_LEVEL_INTERRUPT);

  return {
    primary: critical || interrupt || faults[0],
    allFaults: faults,
    shouldInterrupt: faults.some((f) => f.faultLevel >= FAULT_LEVEL_INTERRUPT),
  };
};

const closeAllGunsInSession = async (sessionId, deviceNo, reportTime, t) => {
  const sessionKey = KeyBuilder.deviceSession(sessionId);
  const cached = await redis.get(sessionKey);
  const sessionData = cached ? JSON.parse(cached) : null;

  if (!sessionData) return { sessionData: null, closed: false };

  let changed = false;

  if (sessionData.waterGunOpen && sessionData.waterGunOpenTime) {
    const openTime = new Date(sessionData.waterGunOpenTime);
    const duration = Math.floor((reportTime.getTime() - openTime.getTime()) / 1000);
    if (duration > 0) {
      sessionData.waterGunTotalTime += duration;
      await DeviceSession.increment(
        { waterGunTotalTime: duration },
        { where: { sessionId }, transaction: t }
      );
    }
    sessionData.waterGunOpen = false;
    sessionData.waterGunOpenTime = null;
    await GunTimeSegment.create(
      {
        sessionId,
        deviceNo,
        gunType: GUN_TYPE_WATER,
        actionType: ACTION_CLOSE,
        actionTime: reportTime,
      },
      { transaction: t }
    );
    changed = true;
  }

  if (sessionData.foamGunOpen && sessionData.foamGunOpenTime) {
    const openTime = new Date(sessionData.foamGunOpenTime);
    const duration = Math.floor((reportTime.getTime() - openTime.getTime()) / 1000);
    if (duration > 0) {
      sessionData.foamGunTotalTime += duration;
      await DeviceSession.increment(
        { foamGunTotalTime: duration },
        { where: { sessionId }, transaction: t }
      );
    }
    sessionData.foamGunOpen = false;
    sessionData.foamGunOpenTime = null;
    await GunTimeSegment.create(
      {
        sessionId,
        deviceNo,
        gunType: GUN_TYPE_FOAM,
        actionType: ACTION_CLOSE,
        actionTime: reportTime,
      },
      { transaction: t }
    );
    changed = true;
  }

  if (changed) {
    await redis.setex(
      sessionKey,
      config.ttl.session,
      JSON.stringify(sessionData)
    );
  }

  return { sessionData, closed: changed };
};

const startSessionSchema = Joi.object({
  deviceNo: Joi.string().required().trim().max(64).messages({
    'any.required': '设备编号不能为空',
    'string.max': '设备编号长度不能超过64',
  }),
  userId: Joi.number().integer().positive().required().messages({
    'any.required': '用户ID不能为空',
    'number.positive': '用户ID必须大于0',
  }),
  sessionId: Joi.string().required().trim().max(64).messages({
    'any.required': '会话ID不能为空',
    'string.max': '会话ID长度不能超过64',
  }),
});

const stopSessionSchema = Joi.object({
  sessionId: Joi.string().required().trim().max(64).messages({
    'any.required': '会话ID不能为空',
  }),
});

const reportStatusSchema = Joi.object({
  deviceNo: Joi.string().required().trim().max(64).messages({
    'any.required': '设备编号不能为空',
  }),
  sessionId: Joi.string().allow(null, '').trim().max(64),
  waterGun: Joi.number().integer().valid(0, 1).required().messages({
    'any.required': '喷水枪状态不能为空',
    'any.only': '喷水枪状态只能是0或1',
  }),
  foamGun: Joi.number().integer().valid(0, 1).required().messages({
    'any.required': '泡沫枪状态不能为空',
    'any.only': '泡沫枪状态只能是0或1',
  }),
  latitude: Joi.number().when('hasLocation', {
    is: true,
    then: Joi.number().min(-90).max(90),
  }),
  longitude: Joi.number().when('hasLocation', {
    is: true,
    then: Joi.number().min(-180).max(180),
  }),
  waterFlowRate: Joi.number().min(0).default(0),
  foamLevel: Joi.number().min(0).max(100).default(100),
  waterLevel: Joi.number().min(0).max(100).default(100),
  waterPressure: Joi.number().min(0).max(10).default(0),
  faultCode: Joi.string().allow(null, '').trim().max(32),
  faultMessage: Joi.string().allow(null, '').trim().max(256),
  faultType: Joi.string().allow(null, '').trim().max(64),
});

const startSession = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { error, value } = startSessionSchema.validate(req.body);
    if (error) throw error;

    const { deviceNo, userId, sessionId } = value;

    const device = await Device.findOne({
      where: { deviceNo },
      transaction: t,
    });

    if (!device) {
      return res.status(404).json({
        code: 404,
        message: `设备不存在: ${deviceNo}`,
        data: null,
      });
    }

    if (device.status === DEVICE_STATUS_OFFLINE) {
      return res.status(400).json({
        code: 400,
        message: '设备当前离线，无法使用',
        data: null,
      });
    }

    if (device.status === DEVICE_STATUS_FAULT) {
      return res.status(400).json({
        code: 400,
        message: '设备故障，无法使用',
        data: null,
      });
    }

    if (device.status === DEVICE_STATUS_BUSY) {
      return res.status(409).json({
        code: 409,
        message: '设备正在使用中',
        data: null,
      });
    }

    const existingSession = await DeviceSession.findOne({
      where: { sessionId },
      transaction: t,
    });

    if (existingSession) {
      return res.status(409).json({
        code: 409,
        message: '会话ID已存在',
        data: null,
      });
    }

    await DeviceSession.create(
      {
        sessionId,
        deviceNo,
        userId,
        status: SESSION_STATUS_ACTIVE,
        startTime: new Date(),
      },
      { transaction: t }
    );

    await Device.update(
      { status: DEVICE_STATUS_BUSY },
      { where: { deviceNo }, transaction: t }
    );

    await t.commit();

    await redis.setex(
      KeyBuilder.deviceActiveSession(deviceNo),
      config.ttl.session,
      sessionId
    );

    await redis.setex(
      KeyBuilder.deviceSession(sessionId),
      config.ttl.session,
      JSON.stringify({
        sessionId,
        deviceNo,
        userId,
        status: SESSION_STATUS_ACTIVE,
        startTime: new Date().toISOString(),
        waterGunTotalTime: 0,
        foamGunTotalTime: 0,
        totalWaterVolume: 0,
        waterGunOpen: false,
        foamGunOpen: false,
        waterGunOpenTime: null,
        foamGunOpenTime: null,
      })
    );

    res.status(200).json({
      code: 200,
      message: '会话启动成功',
      data: {
        sessionId,
        deviceNo,
        userId,
        startTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const stopSession = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { error, value } = stopSessionSchema.validate(req.body);
    if (error) throw error;

    const { sessionId } = value;

    const session = await DeviceSession.findOne({
      where: { sessionId },
      transaction: t,
    });

    if (!session) {
      return res.status(404).json({
        code: 404,
        message: '会话不存在',
        data: null,
      });
    }

    if (session.status === SESSION_STATUS_ENDED) {
      return res.status(400).json({
        code: 400,
        message: '会话已结束',
        data: null,
      });
    }

    const sessionKey = KeyBuilder.deviceSession(sessionId);
    const cached = await redis.get(sessionKey);
    let sessionData = cached ? JSON.parse(cached) : null;

    const endTime = new Date();
    let waterGunTotal = session.waterGunTotalTime;
    let foamGunTotal = session.foamGunTotalTime;

    if (sessionData) {
      if (sessionData.waterGunOpen && sessionData.waterGunOpenTime) {
        const extra = Math.floor(
          (endTime.getTime() - new Date(sessionData.waterGunOpenTime).getTime()) /
            1000
        );
        waterGunTotal += extra;

        await GunTimeSegment.create(
          {
            sessionId,
            deviceNo: session.deviceNo,
            gunType: GUN_TYPE_WATER,
            actionType: ACTION_CLOSE,
            actionTime: endTime,
          },
          { transaction: t }
        );
      }

      if (sessionData.foamGunOpen && sessionData.foamGunOpenTime) {
        const extra = Math.floor(
          (endTime.getTime() - new Date(sessionData.foamGunOpenTime).getTime()) /
            1000
        );
        foamGunTotal += extra;

        await GunTimeSegment.create(
          {
            sessionId,
            deviceNo: session.deviceNo,
            gunType: GUN_TYPE_FOAM,
            actionType: ACTION_CLOSE,
            actionTime: endTime,
          },
          { transaction: t }
        );
      }
    }

    await DeviceSession.update(
      {
        status: SESSION_STATUS_ENDED,
        endTime,
        waterGunTotalTime: waterGunTotal,
        foamGunTotalTime: foamGunTotal,
      },
      { where: { sessionId }, transaction: t }
    );

    await Device.update(
      { status: DEVICE_STATUS_IDLE },
      { where: { deviceNo: session.deviceNo }, transaction: t }
    );

    await t.commit();

    await redis.del(KeyBuilder.deviceActiveSession(session.deviceNo));
    await redis.del(sessionKey);

    res.status(200).json({
      code: 200,
      message: '会话结束成功',
      data: {
        sessionId,
        deviceNo: session.deviceNo,
        endTime: endTime.toISOString(),
        waterGunTotalTime: waterGunTotal,
        foamGunTotalTime: foamGunTotal,
        totalWaterVolume: session.totalWaterVolume,
      },
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const reportStatus = async (req, res, next) => {
  try {
    const hasLocation =
      req.body.latitude !== undefined && req.body.longitude !== undefined;
    const { error, value } = reportStatusSchema.validate({
      ...req.body,
      hasLocation,
    });
    if (error) throw error;

    const {
      deviceNo,
      sessionId: incomingSessionId,
      waterGun,
      foamGun,
      latitude,
      longitude,
      waterFlowRate,
      foamLevel,
      waterLevel,
      waterPressure,
      faultCode,
      faultMessage,
      faultType: explicitFaultType,
    } = value;

    const device = await Device.findOne({ where: { deviceNo } });
    if (!device) {
      return res.status(404).json({
        code: 404,
        message: `设备不存在: ${deviceNo}`,
        data: null,
      });
    }

    const reportTime = new Date();
    const sensorPayload = {
      foamLevel,
      waterLevel,
      waterPressure,
      faultCode: faultCode || null,
      faultMessage: faultMessage || null,
      faultType: explicitFaultType || null,
    };

    const faultInfo = detectHardwareFault(sensorPayload, device);
    const effectiveFaultType = faultInfo
      ? faultInfo.primary.faultType
      : explicitFaultType || null;
    const effectiveFaultMessage = faultInfo
      ? faultInfo.primary.faultMessage
      : faultMessage || null;
    const effectiveFaultCode = faultInfo
      ? faultInfo.primary.faultCode
      : faultCode || null;

    let effectiveWaterGun = waterGun;
    let effectiveFoamGun = foamGun;
    let sessionId = incomingSessionId;
    let interruptTriggered = false;
    let interruptResult = null;

    const t = await sequelize.transaction();
    try {
      if (faultInfo && faultInfo.shouldInterrupt) {
        effectiveWaterGun = 0;
        effectiveFoamGun = 0;

        const activeSessionKey = KeyBuilder.deviceActiveSession(deviceNo);
        const activeSessionId = await redis.get(activeSessionKey);
        if (activeSessionId && !sessionId) {
          sessionId = activeSessionId;
        }

        if (sessionId) {
          const closed = await closeAllGunsInSession(
            sessionId,
            deviceNo,
            reportTime,
            t
          );

          await DeviceSession.update(
            {
              status: SESSION_STATUS_ENDED,
              endTime: reportTime,
            },
            { where: { sessionId }, transaction: t }
          );

          await redis.del(activeSessionKey);

          interruptTriggered = true;

          setImmediate(async () => {
            try {
              const billingResp = await sendEmergencyInterrupt({
                deviceNo,
                sessionId: sessionId || null,
                faultType: faultInfo.primary.faultType,
                faultCode: faultInfo.primary.faultCode,
                faultMessage: faultInfo.primary.faultMessage,
                faultLevel: faultInfo.primary.faultLevel,
                sensorData: {
                  foamLevel,
                  waterLevel,
                  waterPressure,
                  waterGun,
                  foamGun,
                  waterFlowRate,
                },
                triggerSource: 'device_auto',
              });
              console.log(
                `[HardwareInterrupt] Billing-Service 回调结果 device=${deviceNo} session=${sessionId}:`,
                JSON.stringify(billingResp)
              );
            } catch (billingErr) {
              console.error(
                `[HardwareInterrupt] Billing-Service 回调异常 device=${deviceNo} session=${sessionId}:`,
                billingErr.message
              );
            }
          });

          interruptResult = {
            faultType: faultInfo.primary.faultType,
            faultMessage: faultInfo.primary.faultMessage,
            faultLevel: faultInfo.primary.faultLevel,
            sessionId,
          };
        }

        await Device.update(
          {
            status: DEVICE_STATUS_FAULT,
            waterPressure,
            foamLevel,
            waterLevel,
            lastFaultTime: reportTime,
            lastFaultType: faultInfo.primary.faultType,
            ...(latitude !== undefined ? { latitude } : {}),
            ...(longitude !== undefined ? { longitude } : {}),
          },
          { where: { deviceNo }, transaction: t }
        );
      } else {
        await Device.update(
          {
            ...(latitude !== undefined && longitude !== undefined
              ? { latitude, longitude }
              : {}),
            waterPressure,
            foamLevel,
            waterLevel,
            status:
              device.status === DEVICE_STATUS_OFFLINE
                ? DEVICE_STATUS_IDLE
                : device.status,
          },
          { where: { deviceNo }, transaction: t }
        );
      }

      await DeviceStatusLog.create(
        {
          deviceNo,
          sessionId: sessionId || null,
          waterGun: effectiveWaterGun,
          foamGun: effectiveFoamGun,
          latitude: latitude || null,
          longitude: longitude || null,
          waterFlowRate: waterFlowRate || 0,
          foamLevel,
          waterLevel,
          waterPressure,
          faultCode: effectiveFaultCode,
          faultMessage: effectiveFaultMessage,
          faultType: effectiveFaultType,
          reportedAt: reportTime,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (txErr) {
      if (!t.finished) await t.rollback();
      throw txErr;
    }

    const finalDeviceStatus = faultInfo
      ? DEVICE_STATUS_FAULT
      : device.status === DEVICE_STATUS_OFFLINE
      ? DEVICE_STATUS_IDLE
      : device.status;

    await redis.setex(
      KeyBuilder.deviceStatus(deviceNo),
      config.ttl.deviceStatus,
      JSON.stringify({
        deviceNo,
        status: finalDeviceStatus,
        waterGun: effectiveWaterGun,
        foamGun: effectiveFoamGun,
        latitude: latitude || device.latitude,
        longitude: longitude || device.longitude,
        waterFlowRate: waterFlowRate || 0,
        foamLevel,
        waterLevel,
        waterPressure,
        faultCode: effectiveFaultCode,
        faultMessage: effectiveFaultMessage,
        faultType: effectiveFaultType,
        reportedAt: reportTime.toISOString(),
      })
    );

    if (sessionId && !interruptTriggered) {
      const sessionKey = KeyBuilder.deviceSession(sessionId);
      let cached = await redis.get(sessionKey);
      let sessionData = cached ? JSON.parse(cached) : null;

      if (!sessionData) {
        const dbSession = await DeviceSession.findOne({ where: { sessionId } });
        if (dbSession && dbSession.status === SESSION_STATUS_ACTIVE) {
          sessionData = {
            sessionId,
            deviceNo: dbSession.deviceNo,
            userId: dbSession.userId,
            status: SESSION_STATUS_ACTIVE,
            startTime: dbSession.startTime.toISOString(),
            waterGunTotalTime: dbSession.waterGunTotalTime,
            foamGunTotalTime: dbSession.foamGunTotalTime,
            totalWaterVolume: parseFloat(dbSession.totalWaterVolume),
            waterGunOpen: false,
            foamGunOpen: false,
            waterGunOpenTime: null,
            foamGunOpenTime: null,
          };
        }
      }

      if (sessionData && sessionData.status === SESSION_STATUS_ACTIVE) {
        const st = await sequelize.transaction();
        try {
          if (effectiveWaterGun === 1 && !sessionData.waterGunOpen) {
            sessionData.waterGunOpen = true;
            sessionData.waterGunOpenTime = reportTime.toISOString();

            await GunTimeSegment.create(
              {
                sessionId,
                deviceNo,
                gunType: GUN_TYPE_WATER,
                actionType: ACTION_OPEN,
                actionTime: reportTime,
              },
              { transaction: st }
            );
          } else if (
            effectiveWaterGun === 0 &&
            sessionData.waterGunOpen
          ) {
            const openTime = new Date(sessionData.waterGunOpenTime);
            const duration = Math.floor(
              (reportTime.getTime() - openTime.getTime()) / 1000
            );
            sessionData.waterGunTotalTime += duration;
            sessionData.waterGunOpen = false;
            sessionData.waterGunOpenTime = null;

            const volumePerMinute = waterFlowRate || 10;
            const volumeUsed = (duration / 60) * volumePerMinute;
            sessionData.totalWaterVolume = parseFloat(
              (sessionData.totalWaterVolume + volumeUsed).toFixed(2)
            );

            await GunTimeSegment.create(
              {
                sessionId,
                deviceNo,
                gunType: GUN_TYPE_WATER,
                actionType: ACTION_CLOSE,
                actionTime: reportTime,
              },
              { transaction: st }
            );

            await DeviceSession.increment(
              {
                waterGunTotalTime: duration,
                totalWaterVolume: volumeUsed,
              },
              { where: { sessionId }, transaction: st }
            );
          }

          if (effectiveFoamGun === 1 && !sessionData.foamGunOpen) {
            sessionData.foamGunOpen = true;
            sessionData.foamGunOpenTime = reportTime.toISOString();

            await GunTimeSegment.create(
              {
                sessionId,
                deviceNo,
                gunType: GUN_TYPE_FOAM,
                actionType: ACTION_OPEN,
                actionTime: reportTime,
              },
              { transaction: st }
            );
          } else if (effectiveFoamGun === 0 && sessionData.foamGunOpen) {
            const openTime = new Date(sessionData.foamGunOpenTime);
            const duration = Math.floor(
              (reportTime.getTime() - openTime.getTime()) / 1000
            );
            sessionData.foamGunTotalTime += duration;
            sessionData.foamGunOpen = false;
            sessionData.foamGunOpenTime = null;

            await GunTimeSegment.create(
              {
                sessionId,
                deviceNo,
                gunType: GUN_TYPE_FOAM,
                actionType: ACTION_CLOSE,
                actionTime: reportTime,
              },
              { transaction: st }
            );

            await DeviceSession.increment(
              { foamGunTotalTime: duration },
              { where: { sessionId }, transaction: st }
            );
          }

          await st.commit();

          await redis.setex(
            sessionKey,
            config.ttl.session,
            JSON.stringify(sessionData)
          );
        } catch (innerErr) {
          if (!st.finished) await st.rollback();
          throw innerErr;
        }
      }
    }

    const responseData = {
      deviceNo,
      reportedAt: reportTime.toISOString(),
      deviceStatus: finalDeviceStatus,
      waterGun: effectiveWaterGun,
      foamGun: effectiveFoamGun,
    };

    if (interruptTriggered) {
      responseData.fault = {
        ...interruptResult,
        interruptTriggered: true,
      };
    }

    res.status(200).json({
      code: 200,
      message: interruptTriggered
        ? `检测到硬件异常（${effectiveFaultMessage || effectiveFaultType}），已自动关枪并进入故障维护`
        : '状态上报成功',
      data: responseData,
    });
  } catch (err) {
    next(err);
  }
};

const getSessionUsage = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await DeviceSession.findOne({
      where: { sessionId },
    });

    if (!session) {
      return res.status(404).json({
        code: 404,
        message: '会话不存在',
        data: null,
      });
    }

    let waterSeconds = session.waterGunTotalTime;
    let foamSeconds = session.foamGunTotalTime;
    const endTime = session.endTime || new Date();

    if (session.status === SESSION_STATUS_ACTIVE) {
      const sessionKey = KeyBuilder.deviceSession(sessionId);
      const cached = await redis.get(sessionKey);
      const sessionData = cached ? JSON.parse(cached) : null;

      if (sessionData) {
        if (sessionData.waterGunOpen && sessionData.waterGunOpenTime) {
          waterSeconds += Math.floor(
            (endTime.getTime() -
              new Date(sessionData.waterGunOpenTime).getTime()) /
              1000
          );
        }
        if (sessionData.foamGunOpen && sessionData.foamGunOpenTime) {
          foamSeconds += Math.floor(
            (endTime.getTime() -
              new Date(sessionData.foamGunOpenTime).getTime()) /
              1000
          );
        }
      }
    }

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        sessionId: session.sessionId,
        deviceNo: session.deviceNo,
        userId: session.userId,
        status: session.status,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime ? session.endTime.toISOString() : null,
        waterGunSeconds: waterSeconds,
        waterGunMinutes: Math.ceil(waterSeconds / 60),
        foamGunSeconds: foamSeconds,
        foamGunMinutes: Math.ceil(foamSeconds / 60),
        totalWaterVolume: parseFloat(session.totalWaterVolume),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getDeviceStatus = async (req, res, next) => {
  try {
    const { deviceNo } = req.params;

    const statusKey = KeyBuilder.deviceStatus(deviceNo);
    const cached = await redis.get(statusKey);

    if (cached) {
      return res.status(200).json({
        code: 200,
        message: '获取成功',
        data: JSON.parse(cached),
      });
    }

    const device = await Device.findOne({ where: { deviceNo } });
    if (!device) {
      return res.status(404).json({
        code: 404,
        message: '设备不存在',
        data: null,
      });
    }

    const latestLog = await DeviceStatusLog.findOne({
      where: { deviceNo },
      order: [['reportedAt', 'DESC']],
    });

    const data = {
      deviceNo: device.deviceNo,
      status: device.status,
      name: device.name,
      community: device.community,
      address: device.address,
      latitude: parseFloat(device.latitude),
      longitude: parseFloat(device.longitude),
      waterPressure: parseFloat(device.waterPressure),
      foamLevel: parseFloat(device.foamLevel),
      waterLevel: parseFloat(device.waterLevel),
      lastFaultTime: device.lastFaultTime ? device.lastFaultTime.toISOString() : null,
      lastFaultType: device.lastFaultType || null,
      waterGun: latestLog ? latestLog.waterGun : 0,
      foamGun: latestLog ? latestLog.foamGun : 0,
      waterFlowRate: latestLog ? parseFloat(latestLog.waterFlowRate) : 0,
      faultCode: latestLog ? latestLog.faultCode : null,
      faultMessage: latestLog ? latestLog.faultMessage : null,
      faultType: latestLog ? latestLog.faultType : null,
      reportedAt: latestLog ? latestLog.reportedAt.toISOString() : null,
    };

    await redis.setex(statusKey, config.ttl.deviceStatus, JSON.stringify(data));

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  startSession,
  stopSession,
  reportStatus,
  getSessionUsage,
  getDeviceStatus,
};
