const { v4: uuidv4 } = require('uuid');

const {
  BillingOrder,
  DeviceSession,
  DeviceFaultAlert,
  OrderInterruption,
  sequelize,
} = require('../models');
const { getSessionUsage, stopDeviceSession } = require('./deviceServiceClient');
const { getActiveRule, calculateFee } = require('./billingCalculator');
const {
  refundToWallet,
  TX_TYPE_CONSUME,
  getTransactionByOrderNo,
} = require('./walletService');

const ORDER_STATUS_BILLING = 1;
const ORDER_STATUS_PENDING_PAY = 2;
const ORDER_STATUS_COMPLETED = 3;
const ORDER_STATUS_FAILED = 4;
const ORDER_STATUS_DEGRADED = 5;
const ORDER_STATUS_INTERRUPTED_REFUNDED = 6;

const REFUND_NONE = 0;
const REFUND_SUCCESS = 1;
const REFUND_FAILED = 2;
const REFUND_PENDING = 3;

const FAULT_TYPE_LABELS = {
  FOAM_LOW: '泡沫液位过低',
  WATER_PRESSURE_DROP: '水压骤降',
  WATER_GUN_FAULT: '喷水枪故障',
  FOAM_GUN_FAULT: '泡沫枪故障',
  WATER_EMPTY: '清水已用光',
  GENERAL_FAULT: '设备通用故障',
};

const generateAlertId = () =>
  `ALT${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const generateInterruptionId = () =>
  `ITR${Date.now()}${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

const fetchUsageDataWithFallback = async (sessionId, localSession) => {
  try {
    return await getSessionUsage(sessionId);
  } catch (err) {
    console.warn(
      `[HardwareInterrupt] 跨服务获取会话数据失败，使用本地数据: ${err.message}`
    );
    if (!localSession) return null;

    const endTime = new Date();
    const waterSeconds = localSession.waterGunTotalTime || 0;
    const foamSeconds = localSession.foamGunTotalTime || 0;
    return {
      sessionId: localSession.sessionId,
      deviceNo: localSession.deviceNo,
      userId: localSession.userId,
      status: localSession.status,
      startTime: localSession.startTime.toISOString(),
      endTime: endTime.toISOString(),
      waterGunSeconds: waterSeconds,
      waterGunMinutes: Math.ceil(waterSeconds / 60),
      foamGunSeconds: foamSeconds,
      foamGunMinutes: Math.ceil(foamSeconds / 60),
      totalWaterVolume: parseFloat(localSession.totalWaterVolume) || 0,
      _source: 'local_fallback',
    };
  }
};

const computeRefund = async (order, usageData) => {
  const rule = await getActiveRule();
  const feeResult = calculateFee(usageData, rule);

  const consumedTx = await getTransactionByOrderNo(order.orderNo, TX_TYPE_CONSUME);
  const chargedAmount = consumedTx ? Math.abs(consumedTx.amount) : parseFloat(order.actualAmount) || 0;

  const actualUsageAmount = feeResult.totalAmount;
  const refundAmount = parseFloat(Math.max(0, chargedAmount - actualUsageAmount).toFixed(2));

  return {
    rule,
    feeResult,
    chargedAmount,
    actualUsageAmount,
    refundAmount,
  };
};

const processEmergencyInterrupt = async (params) => {
  const {
    deviceNo,
    sessionId,
    faultType,
    faultCode,
    faultMessage,
    faultLevel,
    sensorData,
    triggerSource = 'device_auto',
  } = params;

  const interruptTime = new Date();
  const alertId = generateAlertId();
  const interruptReason = FAULT_TYPE_LABELS[faultType] || faultMessage || '设备硬件异常';

  const result = {
    alertId,
    faultType,
    faultMessage,
    faultLevel,
    interruptReason,
    interruptedAt: interruptTime.toISOString(),
    deviceNo,
    sessionId: null,
    orderNo: null,
    userId: null,
    orderInterrupted: false,
    refund: null,
    message: null,
  };

  const t = await sequelize.transaction();

  try {
    await DeviceFaultAlert.create(
      {
        alertId,
        deviceNo,
        sessionId: sessionId || null,
        faultType,
        faultCode: faultCode || null,
        faultMessage: faultMessage || null,
        faultLevel: faultLevel || 2,
        sensorData: sensorData || null,
        isResolved: 0,
        triggeredAt: interruptTime,
      },
      { transaction: t }
    );

    if (!sessionId) {
      await t.commit();
      result.message = `告警已记录，但当前设备无进行中会话，无需中断订单`;
      return result;
    }

    const order = await BillingOrder.findOne({
      where: { sessionId },
      transaction: t,
    });

    if (!order) {
      await t.commit();
      result.message = `告警已记录，但会话 ${sessionId} 未找到对应订单`;
      result.sessionId = sessionId;
      return result;
    }

    result.sessionId = sessionId;
    result.orderNo = order.orderNo;
    result.userId = order.userId;

    if (
      order.status === ORDER_STATUS_COMPLETED ||
      order.status === ORDER_STATUS_INTERRUPTED_REFUNDED
    ) {
      await t.commit();
      result.message = `订单 ${order.orderNo} 已完成或已中断退款，无需重复处理`;
      return result;
    }

    const orderStatusBefore = order.status;

    try {
      await stopDeviceSession(sessionId);
    } catch (err) {
      console.warn(
        `[HardwareInterrupt] 停止设备会话非致命失败: ${err.message}`
      );
    }

    const localSession = await DeviceSession.findOne({
      where: { sessionId },
      transaction: t,
    });

    const usageData = await fetchUsageDataWithFallback(sessionId, localSession);
    if (!usageData) {
      await t.rollback();
      throw new Error('无法获取会话使用数据（跨服务和本地都失败）');
    }

    const refundCalc = await computeRefund(order, usageData);
    result.refund = {
      chargedAmount: refundCalc.chargedAmount,
      actualUsageAmount: refundCalc.actualUsageAmount,
      refundAmount: refundCalc.refundAmount,
      feeDetail: refundCalc.feeResult,
      usageData: {
        waterGunSeconds: usageData.waterGunSeconds,
        waterGunMinutes: usageData.waterGunMinutes,
        foamGunSeconds: usageData.foamGunSeconds,
        foamGunMinutes: usageData.foamGunMinutes,
        totalWaterVolume: usageData.totalWaterVolume,
      },
    };

    const endTime = new Date(usageData.endTime || interruptTime);
    let refundStatus = REFUND_NONE;
    let refundTxNo = null;
    let refundFailReason = null;
    let orderStatusAfter = ORDER_STATUS_INTERRUPTED_REFUNDED;

    if (orderStatusBefore === ORDER_STATUS_BILLING || orderStatusBefore === ORDER_STATUS_PENDING_PAY) {
      refundStatus = REFUND_NONE;
    } else if (refundCalc.refundAmount > 0) {
      try {
        const refundResult = await refundToWallet(
          order.userId,
          refundCalc.refundAmount,
          order.orderNo,
          `硬件异常中断退款 - ${interruptReason}`
        );
        refundStatus = REFUND_SUCCESS;
        refundTxNo = refundResult.txNo;
        result.refund.refundTxNo = refundResult.txNo;
        result.refund.balanceBefore = refundResult.balanceBefore;
        result.refund.balanceAfter = refundResult.balanceAfter;
      } catch (refundErr) {
        refundStatus = REFUND_FAILED;
        refundFailReason = refundErr.message;
        orderStatusAfter = ORDER_STATUS_FAILED;
        console.error(
          `[HardwareInterrupt] 退款失败 order=${order.orderNo} amount=${refundCalc.refundAmount}: ${refundErr.message}`
        );
      }
    } else {
      refundStatus = REFUND_NONE;
    }

    const orderUpdate = {
      status: refundStatus === REFUND_FAILED ? ORDER_STATUS_FAILED : orderStatusAfter,
      waterGunTime: refundCalc.feeResult.waterGunMinutes,
      foamGunTime: refundCalc.feeResult.foamGunMinutes,
      waterGunCost: refundCalc.feeResult.waterGunCost,
      foamGunCost: refundCalc.feeResult.foamGunCost,
      waterUsageCost: refundCalc.feeResult.waterUsageCost,
      totalAmount: refundCalc.feeResult.totalAmount,
      actualAmount: refundCalc.actualUsageAmount,
      refundAmount: refundCalc.refundAmount,
      endTime,
      interruptedAt: interruptTime,
      interruptReason,
      failReason: refundFailReason || order.failReason,
      paidAt: refundStatus === REFUND_SUCCESS ? new Date() : order.paidAt,
    };

    await BillingOrder.update(orderUpdate, {
      where: { id: order.id },
      transaction: t,
    });

    await OrderInterruption.create(
      {
        interruptionId: generateInterruptionId(),
        orderNo: order.orderNo,
        sessionId,
        userId: order.userId,
        deviceNo,
        alertId,
        faultType,
        faultMessage: faultMessage || null,
        interruptReason,
        orderStatusBefore,
        orderStatusAfter,
        chargedAmount: refundCalc.chargedAmount,
        actualUsageAmount: refundCalc.actualUsageAmount,
        refundAmount: refundCalc.refundAmount,
        refundTxNo,
        refundStatus,
        refundFailReason,
        isAuto: 1,
        interruptedAt: interruptTime,
        refundedAt: refundStatus === REFUND_SUCCESS ? new Date() : null,
      },
      { transaction: t }
    );

    await t.commit();

    result.orderInterrupted = true;
    result.refund.refundStatus =
      refundStatus === REFUND_SUCCESS
        ? 'SUCCESS'
        : refundStatus === REFUND_FAILED
        ? 'FAILED'
        : refundStatus === REFUND_PENDING
        ? 'PENDING'
        : 'NONE';

    if (refundStatus === REFUND_SUCCESS) {
      result.message = `订单已中断，已自动退款 ${refundCalc.refundAmount} 元`;
    } else if (refundStatus === REFUND_NONE) {
      result.message = `订单已中断，无余额可退（尚未扣款或实际使用等于已扣款）`;
    } else {
      result.message = `订单已中断，但退款失败：${refundFailReason}（请人工复核）`;
    }

    return result;
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error(
      `[HardwareInterrupt] 紧急中断处理异常 session=${sessionId} device=${deviceNo}:`,
      err
    );
    throw err;
  }
};

module.exports = {
  processEmergencyInterrupt,
  ORDER_STATUS_INTERRUPTED_REFUNDED,
  REFUND_NONE,
  REFUND_SUCCESS,
  REFUND_FAILED,
  REFUND_PENDING,
  FAULT_TYPE_LABELS,
};
