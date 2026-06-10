const config = require('../config');

const internalAuth = (req, res, next) => {
  const token = req.headers['x-internal-api-token'];

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '缺少内部服务鉴权 Token',
      data: null,
    });
  }

  if (token !== config.internalApiToken) {
    return res.status(403).json({
      code: 403,
      message: '内部服务鉴权 Token 无效',
      data: null,
    });
  }

  next();
};

module.exports = internalAuth;
