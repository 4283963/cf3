const express = require('express');
const {
  startBilling,
  endBilling,
  queryOrder,
  getWalletInfo,
} = require('../controllers/billingController');

const router = express.Router();

router.post('/start', startBilling);
router.post('/end', endBilling);
router.get('/order', queryOrder);
router.get('/wallet/:userId', getWalletInfo);

module.exports = router;
