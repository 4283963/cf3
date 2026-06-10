const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

const {
  BillingOrder,
  User,
  sequelize,
} = require('../models');
const { redis, KeyBuilder } = require('../config/redis');
const config = require('../config');
const { getActiveRule, calculateFee } = require('../services/billingCalculator');
const {
  getUserWallet,
  deductFromWallet,
  getTransactionByOrderNo,
} = require('../services/walletService');
const {
  getSessionUsage,
  startDeviceSession,
  stopDeviceSession,
} = require('../services/deviceServiceClient');

const ORDER_STATUS_BILLING = 1;
const ORDER_STATUS_PENDING_PAY = 2;
const ORDER_STATUS_COMPLETED = 3;
const ORDER_STATUS_FAILED = 4;

const startBillingSchema = Joi.object({
  userId: Joi.number().integer().positive().required().messages({
    'any.required': '用户ID不能为空',
    'number.positive': '用户ID必须大于0',
  }),
  deviceNo: Joi.string().required().trim().max(64).messages({
    'any.required': '设备编号不能为空',
    'string.max': '设备编号长度不能超过64',
  }),
});

const endBillingSchema = Joi.object({
  sessionId: Joi.string().required().trim().max(64).messages({
    'any.required': '会话ID不能为空',
  }),
});

const queryOrderSchema = Joi.object({
  orderNo: Joi.string().trim().max(64),
  sessionId: Joi.string().trim().max(64),
}).or('orderNo', 'sessionId');

const generateOrderNo = () => {
  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BW${timestamp}${random}`;
};

const generateSessionId = () => {
  return `SES${Date.now()}${uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
};

const cacheBillingOrder = async (order) => {
  const orderData = {
    id: order.id,
    orderNo: order.orderNo,
    sessionId: order.sessionId,
    userId: order.userId,
    deviceNo: order.deviceNo,
    ruleId: order.ruleId,
    status: order.status,
    startTime: order.startTime.toISOString(),
    endTime: order.endTime ? order.endTime.toISOString() : null,
    totalAmount: parseFloat(order.totalAmount),
    actualAmount: parseFloat(order.actualAmount),
  };

  await redis.setex(
    KeyBuilder.billingOrder(order.sessionId),
    config.ttl.billingOrder,
    JSON.stringify(orderData)
  );
  await redis.setex(
    KeyBuilder.billingOrderNo(order.orderNo),
    config.ttl.billingOrder,
    JSON.stringify(orderData)
  );
};

const startBilling = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { error, value } = startBillingSchema.validate(req.body);
    if (error) throw error;

    const { userId, deviceNo } = value;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'status', 'walletBalance'],
      transaction: t,
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null,
      });
    }

    if (user.status !== 1) {
      await t.rollback();
      return res.status(400).json({
        code: 400,
        message: '用户账户已被冻结',
        data: null,
      });
    }

    const balance = parseFloat(user.walletBalance);
    if (balance <= 0) {
      await t.rollback();
      return res.status(402).json({
        code: 402,
        message: '钱包余额不足，请先充值',
        data: {
          currentBalance: balance,
        },
      });
    }

    const rule = await getActiveRule();
    if (balance < rule.minCharge) {
      await t.rollback();
      return res.status(402).json({
        code: 402,
        message: `钱包余额低于最低消费 ${rule.minCharge} 元，请先充值`,
        data: {
          currentBalance: balance,
          minCharge: rule.minCharge,
        },
      });
    }

    const sessionId = generateSessionId();
    const orderNo = generateOrderNo();
    const startTime = new Date();

    try {
      await startDeviceSession({
        deviceNo,
        userId,
        sessionId,
      });
    } catch (deviceError) {
      await t.rollback();
      const statusCode = deviceError.response?.status || 502;
      const message =
        deviceError.response?.data?.message ||
        deviceError.message ||
        '启动设备失败';
      return res.status(statusCode).json({
        code: statusCode,
        message: `设备服务调用失败: ${message}`,
        data: null,
      });
    }

    const order = await BillingOrder.create(
      {
        orderNo,
        sessionId,
        userId,
        deviceNo,
        ruleId: rule.id,
        status: ORDER_STATUS_BILLING,
        startTime,
      },
      { transaction: t }
    );

    await t.commit();

    await cacheBillingOrder(order);

    res.status(200).json({
      code: 200,
      message: '开始计费成功',
      data: {
        orderNo,
        sessionId,
        userId,
        deviceNo,
        startTime: startTime.toISOString(),
        currentBalance: balance,
        ruleApplied: {
          ruleName: rule.ruleName,
          waterGunRate: rule.waterGunRate,
          foamGunRate: rule.foamGunRate,
          waterUsageRate: rule.waterUsageRate,
          minCharge: rule.minCharge,
        },
      },
    });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    next(err);
  }
};

const endBilling = async (req, res, next) => {
  try {
    const { error, value } = endBillingSchema.validate(req.body);
    if (error) throw error;

    const { sessionId } = value;

    const order = await BillingOrder.findOne({
      where: { sessionId },
    });

    if (!order) {
      return res.status(404).json({
        code: 404,
        message: '订单不存在',
        data: null,
      });
    }

    if (order.status === ORDER_STATUS_COMPLETED) {
      return res.status(400).json({
        code: 400,
        message: '订单已完成扣款',
        data: {
          orderNo: order.orderNo,
          actualAmount: parseFloat(order.actualAmount),
          paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        },
      });
    }

    if (order.status === ORDER_STATUS_PENDING_PAY) {
      return res.status(400).json({
        code: 400,
        message: '订单正在处理扣款中',
        data: null,
      });
    }

    await BillingOrder.update(
      { status: ORDER_STATUS_PENDING_PAY },
      { where: { id: order.id } }
    );

    let usageData;
    try {
      usageData = await getSessionUsage(sessionId);
    } catch (deviceError) {
      await BillingOrder.update(
        { status: ORDER_STATUS_BILLING },
        { where: { id: order.id } }
      );
      const statusCode = deviceError.response?.status || 502;
      const message =
        deviceError.response?.data?.message ||
        deviceError.message ||
        '获取设备使用数据失败';
      return res.status(statusCode).json({
        code: statusCode,
        message: `设备服务调用失败: ${message}`,
        data: null,
      });
    }

    try {
      await stopDeviceSession(sessionId);
    } catch (stopError) {
      console.warn(
        `[endBilling] 停止设备会话非致命失败: ${stopError.message}`
      );
    }

    const rule = await getActiveRule();
    const feeResult = calculateFee(usageData, rule);
    const endTime = usageData.endTime ? new Date(usageData.endTime) : new Date();

    const t = await sequelize.transaction();

    try {
      await BillingOrder.update(
        {
          waterGunTime: feeResult.waterGunMinutes,
          foamGunTime: feeResult.foamGunMinutes,
          waterGunCost: feeResult.waterGunCost,
          foamGunCost: feeResult.foamGunCost,
          waterUsageCost: feeResult.waterUsageCost,
          totalAmount: feeResult.totalAmount,
          actualAmount: feeResult.totalAmount,
          endTime,
        },
        { where: { id: order.id }, transaction: t }
      );

      let deductResult;
      try {
        deductResult = await deductFromWallet(
          order.userId,
          feeResult.totalAmount,
          order.orderNo,
          `洗车消费 - 设备${order.deviceNo}`
        );
      } catch (deductError) {
        let failReason = deductError.message;
        if (deductError.code === 'INSUFFICIENT_BALANCE') {
          failReason = `余额不足：当前余额${deductError.balanceBefore}元，需支付${deductError.requiredAmount}元`;
        }

        await BillingOrder.update(
          {
            status: ORDER_STATUS_FAILED,
            failReason,
            endTime,
            waterGunTime: feeResult.waterGunMinutes,
            foamGunTime: feeResult.foamGunMinutes,
            waterGunCost: feeResult.waterGunCost,
            foamGunCost: feeResult.foamGunCost,
            waterUsageCost: feeResult.waterUsageCost,
            totalAmount: feeResult.totalAmount,
            actualAmount: 0,
          },
          { where: { id: order.id }, transaction: t }
        );

        await t.commit();

        return res.status(402).json({
          code: 402,
          message: `扣款失败: ${failReason}`,
          data: {
            orderNo: order.orderNo,
            sessionId: order.sessionId,
            feeDetail: feeResult,
            usageData: {
              waterGunSeconds: usageData.waterGunSeconds,
              foamGunSeconds: usageData.foamGunSeconds,
              totalWaterVolume: usageData.totalWaterVolume,
            },
          },
        });
      }

      await BillingOrder.update(
        {
          status: ORDER_STATUS_COMPLETED,
          paidAt: new Date(),
        },
        { where: { id: order.id }, transaction: t }
      );

      await t.commit();

      redis.del(KeyBuilder.billingOrder(sessionId));
      redis.del(KeyBuilder.billingOrderNo(order.orderNo));

      const updatedOrder = await BillingOrder.findByPk(order.id);
      const walletBalance = await getUserWallet(order.userId);

      res.status(200).json({
        code: 200,
        message: '计费扣款成功',
        data: {
          orderNo: updatedOrder.orderNo,
          sessionId: updatedOrder.sessionId,
          userId: updatedOrder.userId,
          deviceNo: updatedOrder.deviceNo,
          usageData: {
            waterGunSeconds: usageData.waterGunSeconds,
            waterGunMinutes: feeResult.waterGunMinutes,
            foamGunSeconds: usageData.foamGunSeconds,
            foamGunMinutes: feeResult.foamGunMinutes,
            totalWaterVolume: usageData.totalWaterVolume,
            startTime: usageData.startTime,
            endTime: usageData.endTime || endTime.toISOString(),
          },
          feeDetail: feeResult,
          actualAmount: deductResult.amount,
          walletBalance: deductResult.balanceAfter,
          transaction: {
            txNo: deductResult.txNo,
            balanceBefore: deductResult.balanceBefore,
            balanceAfter: deductResult.balanceAfter,
          },
          paidAt: updatedOrder.paidAt ? updatedOrder.paidAt.toISOString() : null,
        },
      });
    } catch (innerErr) {
      if (!t.finished) {
        await t.rollback();
      }
      await BillingOrder.update(
        { status: ORDER_STATUS_BILLING },
        { where: { id: order.id } }
      );
      throw innerErr;
    }
  } catch (err) {
    next(err);
  }
};

const queryOrder = async (req, res, next) => {
  try {
    const { error, value } = queryOrderSchema.validate(req.query);
    if (error) throw error;

    const { orderNo, sessionId } = value;

    let order = null;

    if (sessionId) {
      const cached = await redis.get(KeyBuilder.billingOrder(sessionId));
      if (cached) {
        order = JSON.parse(cached);
      }
    }
    if (!order && orderNo) {
      const cached = await redis.get(KeyBuilder.billingOrderNo(orderNo));
      if (cached) {
        order = JSON.parse(cached);
      }
    }

    if (!order) {
      const where = {};
      if (orderNo) where.orderNo = orderNo;
      if (sessionId) where.sessionId = sessionId;

      const dbOrder = await BillingOrder.findOne({ where });
      if (!dbOrder) {
        return res.status(404).json({
          code: 404,
          message: '订单不存在',
          data: null,
        });
      }

      order = {
        id: dbOrder.id,
        orderNo: dbOrder.orderNo,
        sessionId: dbOrder.sessionId,
        userId: dbOrder.userId,
        deviceNo: dbOrder.deviceNo,
        ruleId: dbOrder.ruleId,
        waterGunTime: dbOrder.waterGunTime,
        foamGunTime: dbOrder.foamGunTime,
        waterGunCost: parseFloat(dbOrder.waterGunCost),
        foamGunCost: parseFloat(dbOrder.foamGunCost),
        waterUsageCost: parseFloat(dbOrder.waterUsageCost),
        totalAmount: parseFloat(dbOrder.totalAmount),
        actualAmount: parseFloat(dbOrder.actualAmount),
        status: dbOrder.status,
        statusText:
          dbOrder.status === 1
            ? '计费中'
            : dbOrder.status === 2
            ? '待扣款'
            : dbOrder.status === 3
            ? '已完成'
            : '扣款失败',
        startTime: dbOrder.startTime.toISOString(),
        endTime: dbOrder.endTime ? dbOrder.endTime.toISOString() : null,
        paidAt: dbOrder.paidAt ? dbOrder.paidAt.toISOString() : null,
        failReason: dbOrder.failReason,
        createdAt: dbOrder.createdAt.toISOString(),
      };

      if (dbOrder.status === ORDER_STATUS_BILLING) {
        await cacheBillingOrder(dbOrder);
      }
    } else {
      order.statusText =
        order.status === 1
          ? '计费中'
          : order.status === 2
          ? '待扣款'
          : order.status === 3
          ? '已完成'
          : '扣款失败';
    }

    let transaction = null;
    if (order.status === ORDER_STATUS_COMPLETED) {
      transaction = await getTransactionByOrderNo(order.orderNo);
    }

    res.status(200).json({
      code: 200,
      message: '查询成功',
      data: {
        order,
        transaction,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getWalletInfo = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const uid = parseInt(userId, 10);

    if (!uid || uid <= 0) {
      return res.status(400).json({
        code: 400,
        message: '用户ID无效',
        data: null,
      });
    }

    const user = await User.findByPk(uid, {
      attributes: [
        'id',
        'phone',
        'nickname',
        'walletBalance',
        'totalRecharge',
        'totalConsumption',
        'status',
      ],
    });

    if (!user) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null,
      });
    }

    res.status(200).json({
      code: 200,
      message: '查询成功',
      data: {
        userId: user.id,
        phone: user.phone,
        nickname: user.nickname,
        walletBalance: parseFloat(user.walletBalance),
        totalRecharge: parseFloat(user.totalRecharge),
        totalConsumption: parseFloat(user.totalConsumption),
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  startBilling,
  endBilling,
  queryOrder,
  getWalletInfo,
};
