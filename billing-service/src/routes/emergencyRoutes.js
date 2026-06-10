const express = require('express');
const { emergencyInterrupt } = require('../controllers/emergencyController');
const internalAuth = require('../middleware/internalAuth');

const router = express.Router();

router.post('/interrupt', internalAuth, emergencyInterrupt);

module.exports = router;
