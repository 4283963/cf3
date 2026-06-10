const axios = require('axios');
const config = require('../config');

const deviceClient = axios.create({
  baseURL: config.deviceService.baseUrl,
  timeout: config.deviceService.timeout,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-api-token': config.deviceService.internalApiToken,
  },
});

deviceClient.interceptors.request.use((request) => {
  console.log(
    `[Device-Client] ${request.method.toUpperCase()} ${request.baseURL}${request.url}`
  );
  return request;
});

deviceClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error(
        `[Device-Client] 请求失败: ${error.config.method.toUpperCase()} ${
          error.config.url
        } - 状态: ${error.response.status} - ${
          error.response.data?.message || error.message
        }`
      );
    } else if (error.code === 'ECONNABORTED') {
      console.error(
        `[Device-Client] 请求超时: ${error.config.method.toUpperCase()} ${
          error.config.url
        }`
      );
    } else {
      console.error(
        `[Device-Client] 网络错误: ${error.config?.method?.toUpperCase()} ${
          error.config?.url || ''
        } - ${error.message}`
      );
    }
    return Promise.reject(error);
  }
);

const getSessionUsage = async (sessionId) => {
  try {
    const response = await deviceClient.get(
      `/api/device/session/${sessionId}`
    );
    if (response.data.code === 200) {
      return response.data.data;
    }
    throw new Error(response.data.message || '获取会话使用数据失败');
  } catch (error) {
    throw error;
  }
};

const startDeviceSession = async (data) => {
  try {
    const response = await deviceClient.post('/api/device/session/start', data);
    if (response.data.code === 200) {
      return response.data.data;
    }
    throw new Error(response.data.message || '启动设备会话失败');
  } catch (error) {
    throw error;
  }
};

const stopDeviceSession = async (sessionId) => {
  try {
    const response = await deviceClient.post('/api/device/session/stop', {
      sessionId,
    });
    if (response.data.code === 200) {
      return response.data.data;
    }
    throw new Error(response.data.message || '停止设备会话失败');
  } catch (error) {
    throw error;
  }
};

module.exports = {
  deviceClient,
  getSessionUsage,
  startDeviceSession,
  stopDeviceSession,
};
