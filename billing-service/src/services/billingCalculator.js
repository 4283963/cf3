const { BillingRule } = require('../models');
const { redis, KeyBuilder } = require('../config/redis');
const config = require('../config');

const RULE_CACHE_TTL = 3600;

const getActiveRule = async () => {
  const cacheKey = KeyBuilder.activeRule();
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const rule = await BillingRule.findOne({
    where: { isActive: 1 },
    order: [['id', 'DESC']],
  });

  if (!rule) {
    throw new Error('未找到启用的计费规则');
  }

  const ruleData = {
    id: rule.id,
    ruleName: rule.ruleName,
    waterGunRate: parseFloat(rule.waterGunRate),
    foamGunRate: parseFloat(rule.foamGunRate),
    waterUsageRate: parseFloat(rule.waterUsageRate),
    minCharge: parseFloat(rule.minCharge),
  };

  await redis.setex(cacheKey, RULE_CACHE_TTL, JSON.stringify(ruleData));

  return ruleData;
};

const calculateFee = (usageData, rule) => {
  const { waterGunMinutes, foamGunMinutes, totalWaterVolume } = usageData;

  const waterGunCost = parseFloat(
    (waterGunMinutes * rule.waterGunRate).toFixed(2)
  );
  const foamGunCost = parseFloat(
    (foamGunMinutes * rule.foamGunRate).toFixed(2)
  );
  const waterUsageCost = parseFloat(
    ((totalWaterVolume || 0) * rule.waterUsageRate).toFixed(2)
  );

  let subtotal = waterGunCost + foamGunCost + waterUsageCost;
  const totalAmount = parseFloat(
    Math.max(subtotal, rule.minCharge).toFixed(2)
  );

  return {
    waterGunMinutes,
    foamGunMinutes,
    totalWaterVolume: totalWaterVolume || 0,
    waterGunCost,
    foamGunCost,
    waterUsageCost,
    subtotal: parseFloat(subtotal.toFixed(2)),
    minCharge: rule.minCharge,
    totalAmount,
    ruleApplied: {
      id: rule.id,
      ruleName: rule.ruleName,
      waterGunRate: rule.waterGunRate,
      foamGunRate: rule.foamGunRate,
      waterUsageRate: rule.waterUsageRate,
    },
  };
};

module.exports = {
  getActiveRule,
  calculateFee,
};
