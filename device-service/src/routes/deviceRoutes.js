const express = require('express');
const {
  startSession,
  stopSession,
  reportStatus,
  getSessionUsage,
  getDeviceStatus,
} = require('../controllers/deviceController');
const internalAuth = require('../middleware/internalAuth');

const router = express.Router();

router.post('/session/start', startSession);
router.post('/session/stop', stopSession);
router.post('/status/report', reportStatus);

router.get('/device/:deviceNo', getDeviceStatus);
router.get('/session/:sessionId', internalAuth, getSessionUsage);

module.exports = router;
