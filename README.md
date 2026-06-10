# 城市社区共享自助洗车机 - 分布式计费与设备监控后端

## 项目概述

基于微服务架构的城市社区共享自助洗车机后端系统，包含两个独立的 Node.js 微服务：

| 服务名           | 端口 | 职责                                                         | Redis DB |
| ---------------- | ---- | ------------------------------------------------------------ | -------- |
| Device-Service   | 3001 | 维护洗车机喷水枪/泡沫枪开关状态、GPS 坐标、会话时长、时间片段 | 0        |
| Billing-Service  | 3002 | 根据洗车时长/耗水量动态算账、扣除用户钱包余额、订单管理、流水 | 1        |

**基础设施**：MySQL 8.0 + Redis 7 + Docker Compose

**技术栈**：Express + Sequelize + ioredis + Joi + Axios + dayjs

---

## 系统架构

```
                    ┌─────────────────────────────────────────┐
                    │           App / Client / IoT            │
                    └─────┬──────────────────────────┬────────┘
                          │                          │
                          ▼                          ▼
                ┌──────────────────┐      ┌──────────────────┐
                │  Billing-Service │      │  Device-Service  │
                │  (Port 3002)     │      │  (Port 3001)     │
                └──────┬───────────┘      └────────┬─────────┘
                       │   跨服务 HTTP 调用          │
                       │  GET /api/device/session/:id│
                       │  (x-internal-api-token)     │
                       └───────────────┬─────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   MySQL 8.0  │  │   Redis 7    │  │    Redis 7   │
            │  Port 3306   │  │   DB 0       │  │   DB 1       │
            │  (共享库)    │  │  (设备状态)  │  │  (订单/钱包) │
            └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 目录结构

```
cf3/
├── docker-compose.yml          # MySQL + Redis 编排
├── sql/
│   └── init.sql                # 数据库初始化 + 测试数据
├── device-service/
│   ├── package.json
│   ├── .env                    # 环境变量
│   ├── .env.example
│   └── src/
│       ├── app.js              # 入口
│       ├── config/
│       │   ├── index.js        # 配置加载
│       │   ├── database.js     # Sequelize 连接
│       │   └── redis.js        # ioredis + KeyBuilder
│       ├── middleware/
│       │   ├── internalAuth.js # 跨服务鉴权
│       │   └── errorHandler.js # 全局错误处理
│       ├── models/             # 4 个 Sequelize 模型
│       │   ├── Device.js
│       │   ├── DeviceSession.js
│       │   ├── DeviceStatusLog.js
│       │   ├── GunTimeSegment.js
│       │   └── index.js
│       ├── controllers/
│       │   └── deviceController.js
│       └── routes/
│           └── deviceRoutes.js
└── billing-service/
    ├── package.json
    ├── .env
    ├── .env.example
    └── src/
        ├── app.js
        ├── config/             # 同上 + Device-Service 客户端配置
        ├── middleware/
        ├── models/             # User / BillingRule / BillingOrder / WalletTransaction
        ├── services/
        │   ├── deviceServiceClient.js   # axios 封装（含 x-internal-api-token）
        │   ├── billingCalculator.js     # 计费计算 + 规则缓存
        │   └── walletService.js         # 钱包扣款 + Redis 分布式锁 + 事务
        ├── controllers/
        │   └── billingController.js
        └── routes/
            └── billingRoutes.js
```

---

## 快速启动

### 第一步：启动基础设施（MySQL + Redis）

```bash
cd /Users/kl/Documents/trae_projects2/cf3
docker-compose up -d
```

等待 15~30 秒后检查健康状态：

```bash
docker-compose ps
```

### 第二步：安装 Device-Service 依赖并启动

```bash
cd device-service
npm install
npm start
```

健康检查：http://127.0.0.1:3001/health

### 第三步：安装 Billing-Service 依赖并启动

```bash
cd ../billing-service
npm install
npm start
```

健康检查：http://127.0.0.1:3002/health

---

## 核心 API 说明

### 一、Device-Service（端口 3001）

基础路径：`http://127.0.0.1:3001/api/device`

| 方法   | 路径                  | 鉴权        | 功能                                       |
| ------ | --------------------- | ----------- | ------------------------------------------ |
| POST   | `/session/start`      | 无          | 启动设备会话（由 Billing-Service 调用）    |
| POST   | `/session/stop`       | 无          | 停止设备会话，自动补全未关闭枪的时长       |
| POST   | `/status/report`      | 无          | 设备高频状态上报（枪开关、GPS、故障码）    |
| GET    | `/device/:deviceNo`   | 无          | 查询设备实时状态（Redis 缓存优先）         |
| GET    | `/session/:sessionId` | Header 鉴权 | **跨服务接口**：获取会话喷水/泡沫时长      |

> `GET /session/:sessionId` 需在 Header 携带 `x-internal-api-token: dev-internal-token-2024`

### 二、Billing-Service（端口 3002）

基础路径：`http://127.0.0.1:3002/api/billing`

| 方法   | 路径              | 功能                                                         |
| ------ | ----------------- | ------------------------------------------------------------ |
| POST   | `/start`          | **开始计费**：校验余额→调用 Device `/session/start`→创建订单 |
| POST   | `/end`            | **结束扣款**：调用 Device `/session/:id` → 计算费用 → 分布式锁扣钱包 |
| GET    | `/order`          | 查询订单详情（orderNo 或 sessionId 二选一）                  |
| GET    | `/wallet/:userId` | 查询用户钱包余额                                             |

---

## 完整调用流程示例（洗车全过程）

### 测试数据

| 类型   | 标识            | 说明                        |
| ------ | --------------- | --------------------------- |
| 设备   | CW-BJ-0001      | 朝阳区1号洗车机（在线空闲） |
| 用户   | id=1 (13800138001) | 张三，余额 500 元        |
| 规则   | 标准计费规则    | 水枪 2元/分，泡沫 3元/分，耗水 0.1元/升，最低 5 元 |

### 1️⃣ 开始计费

```bash
curl -X POST http://127.0.0.1:3002/api/billing/start \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "deviceNo": "CW-BJ-0001"
  }'
```

返回示例：

```json
{
  "code": 200,
  "message": "开始计费成功",
  "data": {
    "orderNo": "BW20260610153000ABC123",
    "sessionId": "SES1781077800000A1B2C3D4E5F6G7H8I9J",
    "userId": 1,
    "deviceNo": "CW-BJ-0001",
    "startTime": "2026-06-10T07:30:00.000Z",
    "currentBalance": 500.00,
    "ruleApplied": {
      "ruleName": "标准计费规则",
      "waterGunRate": 2.00,
      "foamGunRate": 3.00,
      "waterUsageRate": 0.10,
      "minCharge": 5.00
    }
  }
}
```

> ⚠️ **记下返回的 sessionId**，后面每一步都要用到

### 2️⃣ 洗车中：设备持续上报状态（模拟喷水枪开）

```bash
curl -X POST http://127.0.0.1:3001/api/device/status/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceNo": "CW-BJ-0001",
    "sessionId": "替换为上面返回的 sessionId",
    "waterGun": 1,
    "foamGun": 0,
    "latitude": 39.9961343,
    "longitude": 116.4785376,
    "waterFlowRate": 12.0
  }'
```

### 3️⃣ 等待 95 秒后，切换到泡沫枪

先关闭喷水枪（记录第一段时长 ~95 秒）：

```bash
curl -X POST http://127.0.0.1:3001/api/device/status/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceNo": "CW-BJ-0001",
    "sessionId": "同上 sessionId",
    "waterGun": 0,
    "foamGun": 0,
    "waterFlowRate": 0
  }'
```

再打开泡沫枪：

```bash
curl -X POST http://127.0.0.1:3001/api/device/status/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceNo": "CW-BJ-0001",
    "sessionId": "同上 sessionId",
    "waterGun": 0,
    "foamGun": 1,
    "waterFlowRate": 8.0
  }'
```

### 4️⃣ 等待 40 秒后，全部关闭

```bash
curl -X POST http://127.0.0.1:3001/api/device/status/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceNo": "CW-BJ-0001",
    "sessionId": "同上 sessionId",
    "waterGun": 0,
    "foamGun": 0,
    "waterFlowRate": 0
  }'
```

### 5️⃣ 结束洗车：触发计费扣款

```bash
curl -X POST http://127.0.0.1:3002/api/billing/end \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "同上 sessionId"
  }'
```

**计费计算示例**（实际以返回为准）：

- 喷水枪 95 秒 → 向上取整 2 分钟 → 2 × 2.00 = **4.00 元**
- 泡沫枪 40 秒 → 向上取整 1 分钟 → 1 × 3.00 = **3.00 元**
- 耗水量 ≈ (95/60)×12 + (40/60)×8 ≈ 19 + 5.33 = 24.33 升 → 24.33 × 0.10 ≈ **2.43 元**
- 小计 = 4 + 3 + 2.43 = **9.43 元**（高于最低消费 5 元，直接取 9.43）

返回示例：

```json
{
  "code": 200,
  "message": "计费扣款成功",
  "data": {
    "orderNo": "BW20260610153000ABC123",
    "sessionId": "SES...",
    "usageData": {
      "waterGunSeconds": 95,
      "waterGunMinutes": 2,
      "foamGunSeconds": 40,
      "foamGunMinutes": 1,
      "totalWaterVolume": 24.33
    },
    "feeDetail": {
      "waterGunCost": 4.00,
      "foamGunCost": 3.00,
      "waterUsageCost": 2.43,
      "subtotal": 9.43,
      "minCharge": 5.00,
      "totalAmount": 9.43
    },
    "actualAmount": 9.43,
    "walletBalance": 490.57,
    "transaction": {
      "txNo": "TX1781079000...",
      "balanceBefore": 500.00,
      "balanceAfter": 490.57
    }
  }
}
```

---

## 关键设计亮点

### 1. 时长计算精确性
- 每次枪开关都写入 `gun_time_segments` 表，便于审计与对账
- Redis 中缓存"当前枪是否开启+开启时间"，状态上报为关时立即计算时长
- 停止会话时自动检测"未关闭的枪"，补计从开枪时刻到停止时刻的时长

### 2. 跨服务鉴权
- Device-Service 的 `GET /session/:sessionId` 必须携带 `x-internal-api-token` Header
- Billing-Service 的 axios 客户端已注入该 Token，外部无法直接调用时长接口

### 3. 钱包并发安全
- 钱包扣款前使用 **Redis SET NX + Lua 脚本** 实现分布式锁（TTL 10s，最多重试 5 次）
- MySQL 事务中使用 `SELECT ... FOR UPDATE` 行级锁二次保障
- 扣款成功后立即写 `wallet_transactions` 流水，保证可追溯
- 所有余额操作均为 `DECIMAL(10,2)`，避免浮点数精度丢失

### 4. 计费计费策略
- 时长向上取整（95 秒 → 2 分钟），符合共享经济惯例
- 最低消费保障：若分项合计低于 `min_charge`，按最低消费计费
- 耗水量按实际水流量 × 枪开启时长计算（模拟计量）

### 5. Redis 缓存层次
| 缓存 Key 类型            | TTL    | 说明                           |
| ------------------------ | ------ | ------------------------------ |
| device:status:{deviceNo} | 300s   | 设备最新上报状态               |
| device:session:{id}      | 7200s  | 会话实时状态（枪开/关、累计时长） |
| billing:order:{session}  | 86400s | 计费中订单快照                |
| billing:wallet:{userId}  | 86400s | 钱包余额缓存                   |
| billing:rule:active      | 3600s  | 启用中的计费规则               |
| billing:wallet_lock:{id} | 10s    | 钱包操作分布式锁               |

---

## 故障情况处理

| 场景                         | 处理方式                                                 |
| ---------------------------- | -------------------------------------------------------- |
| 结束扣款时 Device 服务超时   | 订单状态回滚为"计费中"，返回 502，前端可重试             |
| 停止会话时某枪仍处于"开"状态 | 自动补算该枪从开启时刻到 `end_time` 的时长               |
| 钱包余额不足                 | 订单标记为"扣款失败"，写 fail_reason，前端引导充值       |
| 并发扣款（同一用户多次操作） | Redis 分布式锁排队，最大等待 500ms，超时返回"请稍后重试" |
| 设备上报故障码               | 设备状态置为"故障"，禁止新的计费启动                     |
