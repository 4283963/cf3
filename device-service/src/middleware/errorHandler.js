const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err);

  if (err.name === 'ValidationError') {
    const details = err.details.map((d) => d.message).join('; ');
    return res.status(400).json({
      code: 400,
      message: `参数校验失败: ${details}`,
      data: null,
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      code: 409,
      message: '数据唯一约束冲突',
      data: null,
    });
  }

  if (err.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      code: 503,
      message: '数据库连接异常',
      data: null,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    code: statusCode,
    message,
    data: null,
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    code: 404,
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: null,
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
