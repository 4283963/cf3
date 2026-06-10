const { v4: uuidv4 } = require('uuid');
const { User, WalletTransaction, sequelize } = require('../models');
const { redis, KeyBuilder } = require('../config/redis');
const config = require('../config');

const TX_TYPE_RECHARGE = 1;
const TX_TYPE_CONSUME = 2;
const TX_TYPE_REFUND = 3;

const WALLET_LOCK_MAX_RETRY = 5;
const WALLET_LOCK_RETRY_INTERVAL = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireWalletLock = async (userId) => {
  const lockKey = KeyBuilder.walletLock(userId);
  const lockValue = uuidv4();
  const ttl = config.ttl.walletLock;

  for (let i = 0; i < WALLET_LOCK_MAX_RETRY; i++) {
    const result = await redis.set(lockKey, lockValue, 'EX', ttl, 'NX');
    if (result === 'OK') {
      return { lockKey, lockValue };
    }
    await sleep(WALLET_LOCK_RETRY_INTERVAL);
  }

  throw new Error('钱包操作繁忙，请稍后重试');
};

const releaseWalletLock = async (lockKey, lockValue) => {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, lockKey, lockValue);
};

const getUserWallet = async (userId, useCache = true) => {
  if (useCache) {
    const cacheKey = KeyBuilder.userWallet(userId);
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return parseFloat(cached);
    }
  }

  const user = await User.findByPk(userId, {
    attributes: ['id', 'walletBalance', 'status'],
  });

  if (!user) {
    throw new Error('用户不存在');
  }

  if (useCache) {
    const cacheKey = KeyBuilder.userWallet(userId);
    await redis.setex(
      cacheKey,
      config.ttl.billingOrder,
      user.walletBalance.toString()
    );
  }

  return parseFloat(user.walletBalance);
};

const invalidateWalletCache = async (userId) => {
  const cacheKey = KeyBuilder.userWallet(userId);
  await redis.del(cacheKey);
};

const deductFromWallet = async (userId, amount, orderNo, remark) => {
  if (amount <= 0) {
    throw new Error('扣款金额必须大于0');
  }

  const lock = await acquireWalletLock(userId);

  try {
    const t = await sequelize.transaction();

    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'walletBalance', 'status', 'totalConsumption'],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!user) {
        await t.rollback();
        throw new Error('用户不存在');
      }

      if (user.status !== 1) {
        await t.rollback();
        throw new Error('用户账户已被冻结');
      }

      const balanceBefore = parseFloat(user.walletBalance);
      const balanceAfter = parseFloat((balanceBefore - amount).toFixed(2));

      if (balanceAfter < 0) {
        await t.rollback();
        const error = new Error('钱包余额不足');
        error.code = 'INSUFFICIENT_BALANCE';
        error.balanceBefore = balanceBefore;
        error.requiredAmount = amount;
        throw error;
      }

      await User.update(
        {
          walletBalance: balanceAfter,
          totalConsumption: parseFloat(
            (parseFloat(user.totalConsumption) + amount).toFixed(2)
          ),
        },
        {
          where: { id: userId },
          transaction: t,
        }
      );

      const txNo = `TX${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      await WalletTransaction.create(
        {
          txNo,
          userId,
          orderNo: orderNo || null,
          txType: TX_TYPE_CONSUME,
          amount: -Math.abs(amount),
          balanceBefore,
          balanceAfter,
          remark: remark || '洗车消费扣款',
        },
        { transaction: t }
      );

      await t.commit();

      await invalidateWalletCache(userId);

      return {
        success: true,
        txNo,
        orderNo: orderNo || null,
        amount,
        balanceBefore,
        balanceAfter,
      };
    } catch (innerError) {
      if (!t.finished) {
        await t.rollback();
      }
      throw innerError;
    }
  } finally {
    await releaseWalletLock(lock.lockKey, lock.lockValue);
  }
};

const getTransactionByOrderNo = async (orderNo, txType) => {
  const where = { orderNo };
  if (txType) where.txType = txType;

  const tx = await WalletTransaction.findOne({
    where,
    order: [['createdAt', 'DESC']],
  });

  if (!tx) return null;

  return {
    txNo: tx.txNo,
    userId: tx.userId,
    orderNo: tx.orderNo,
    txType: tx.txType,
    amount: parseFloat(tx.amount),
    balanceBefore: parseFloat(tx.balanceBefore),
    balanceAfter: parseFloat(tx.balanceAfter),
    remark: tx.remark,
    createdAt: tx.createdAt.toISOString(),
  };
};

const refundToWallet = async (userId, amount, orderNo, remark) => {
  if (amount <= 0) {
    throw new Error('退款金额必须大于0');
  }

  const lock = await acquireWalletLock(userId);

  try {
    const t = await sequelize.transaction();

    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'walletBalance', 'status', 'totalConsumption'],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!user) {
        await t.rollback();
        throw new Error('用户不存在');
      }

      if (user.status !== 1) {
        await t.rollback();
        throw new Error('用户账户已被冻结');
      }

      const existingRefund = await getTransactionByOrderNo(orderNo, TX_TYPE_REFUND);
      if (existingRefund) {
        await t.rollback();
        const error = new Error('该订单已存在退款记录');
        error.code = 'DUPLICATE_REFUND';
        throw error;
      }

      const balanceBefore = parseFloat(user.walletBalance);
      const balanceAfter = parseFloat((balanceBefore + amount).toFixed(2));

      const newTotalConsumption = parseFloat(
        Math.max(0, parseFloat(user.totalConsumption) - amount).toFixed(2)
      );

      await User.update(
        {
          walletBalance: balanceAfter,
          totalConsumption: newTotalConsumption,
        },
        {
          where: { id: userId },
          transaction: t,
        }
      );

      const txNo = `TX${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}R`;

      await WalletTransaction.create(
        {
          txNo,
          userId,
          orderNo: orderNo || null,
          txType: TX_TYPE_REFUND,
          amount: Math.abs(amount),
          balanceBefore,
          balanceAfter,
          remark: remark || '退款',
        },
        { transaction: t }
      );

      await t.commit();

      await invalidateWalletCache(userId);

      return {
        success: true,
        txNo,
        orderNo: orderNo || null,
        amount,
        balanceBefore,
        balanceAfter,
      };
    } catch (innerError) {
      if (!t.finished) {
        await t.rollback();
      }
      throw innerError;
    }
  } finally {
    await releaseWalletLock(lock.lockKey, lock.lockValue);
  }
};

module.exports = {
  getUserWallet,
  deductFromWallet,
  refundToWallet,
  getTransactionByOrderNo,
  invalidateWalletCache,
  TX_TYPE_RECHARGE,
  TX_TYPE_CONSUME,
  TX_TYPE_REFUND,
};
