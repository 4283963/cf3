const Joi = require('joi');
const {
  processEmergencyInterrupt,
} = require('../services/HardwareInterruptService');

const FAULT_TYPES = [
  'FOAM_LOW',
  'WATER_PRESSURE_DROP',
  'WATER_GUN_FAULT',
  'FOAM_GUN_FAULT',
  'WATER_EMPTY',
  'GENERAL_FAULT',
];

const interruptSchema = Joi.object({
  deviceNo: Joi.string().required().trim().max(64).messages({
    'any.required': '设备编号不能为空',
  }),
  sessionId: Joi.string().allow(null, '').trim().max(64),
  faultType: Joi.string()
    .required()
    .valid(...FAULT_TYPES)
    .messages({
      'any.required': '故障类型不能为空',
      'any.only': `故障类型必须是以下之一: ${FAULT_TYPES.join(', ')}`,
    }),
  faultCode: Joi.string().allow(null, '').trim().max(32),
  faultMessage: Joi.string().allow(null, '').trim().max(256),
  faultLevel: Joi.number().integer().valid(1, 2, 3).default(2),
  sensorData: Joi.object().allow(null),
  triggerSource: Joi.string()
    .valid('device_auto', 'manual', 'monitor')
    .default('device_auto'),
});

const emergencyInterrupt = async (req, res, next) => {
  try {
    const { error, value } = interruptSchema.validate(req.body);
    if (error) throw error;

    const interruptId = `EMG${Date.now()}${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    console.log(
      `[EmergencyInterrupt] 收到紧急中断请求 [${interruptId}]`,
      `device=${value.deviceNo}`,
      `session=${value.sessionId || 'N/A'}`,
      `fault=${value.faultType}`,
      value.faultMessage ? `msg=${value.faultMessage}` : ''
    );

    const result = await processEmergencyInterrupt(value);

    console.log(
      `[EmergencyInterrupt] 处理完成 [${interruptId}]: ${result.message}`
    );

    const httpStatus = result.orderInterrupted
      ? result.refund?.refundStatus === 'FAILED'
        ? 500
        : 200
      : 200;

    res.status(httpStatus).json({
      code: 200,
      message: result.message || '紧急中断处理完成',
      data: {
        interruptId,
        alertId: result.alertId,
        deviceNo: result.deviceNo,
        sessionId: result.sessionId,
        orderNo: result.orderNo,
        userId: result.userId,
        faultType: result.faultType,
        faultLevel: result.faultLevel,
        interruptReason: result.interruptReason,
        interruptedAt: result.interruptedAt,
        orderInterrupted: result.orderInterrupted,
        refund: result.refund,
      },
    });
  } catch (err) {
    console.error('[EmergencyInterrupt] 处理异常:', err);
    next(err);
  }
};

module.exports = {
  emergencyInterrupt,
};
