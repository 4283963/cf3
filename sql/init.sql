-- ============================================
-- 城市社区共享自助洗车机数据库初始化脚本
-- ============================================

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS carwash DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE carwash;

-- ============================================
-- Device-Service 相关表
-- ============================================

-- 洗车机设备表
CREATE TABLE IF NOT EXISTS devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_no VARCHAR(64) NOT NULL UNIQUE COMMENT '设备编号',
    name VARCHAR(128) NOT NULL COMMENT '设备名称',
    community VARCHAR(128) NOT NULL COMMENT '所属社区',
    address VARCHAR(256) NOT NULL COMMENT '具体地址',
    latitude DECIMAL(10, 7) NOT NULL COMMENT 'GPS 纬度',
    longitude DECIMAL(10, 7) NOT NULL COMMENT 'GPS 经度',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '设备状态：0-离线，1-在线空闲，2-使用中，3-故障',
    water_pressure DECIMAL(5, 2) DEFAULT 0 COMMENT '水压 (bar)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_no (device_no),
    INDEX idx_status (status),
    INDEX idx_community (community)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='洗车机设备表';

-- 设备会话表（每次洗车的一次完整会话）
CREATE TABLE IF NOT EXISTS device_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE COMMENT '会话ID，由 Billing-Service 生成',
    device_no VARCHAR(64) NOT NULL COMMENT '设备编号',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '会话状态：1-进行中，2-已结束',
    start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
    end_time DATETIME DEFAULT NULL COMMENT '结束时间',
    water_gun_total_time INT NOT NULL DEFAULT 0 COMMENT '喷水枪总时长（秒）',
    foam_gun_total_time INT NOT NULL DEFAULT 0 COMMENT '泡沫枪总时长（秒）',
    total_water_volume DECIMAL(8, 2) NOT NULL DEFAULT 0 COMMENT '总耗水量（升）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_device_no (device_no),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备会话表';

-- 设备状态上报日志表
CREATE TABLE IF NOT EXISTS device_status_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_no VARCHAR(64) NOT NULL COMMENT '设备编号',
    session_id VARCHAR(64) DEFAULT NULL COMMENT '关联的会话ID',
    water_gun TINYINT NOT NULL DEFAULT 0 COMMENT '喷水枪状态：0-关，1-开',
    foam_gun TINYINT NOT NULL DEFAULT 0 COMMENT '泡沫枪状态：0-关，1-开',
    latitude DECIMAL(10, 7) DEFAULT NULL COMMENT 'GPS 纬度',
    longitude DECIMAL(10, 7) DEFAULT NULL COMMENT 'GPS 经度',
    water_flow_rate DECIMAL(6, 2) DEFAULT 0 COMMENT '水流量（升/分钟）',
    fault_code VARCHAR(32) DEFAULT NULL COMMENT '故障代码',
    fault_message VARCHAR(256) DEFAULT NULL COMMENT '故障描述',
    reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上报时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_no (device_no),
    INDEX idx_session_id (session_id),
    INDEX idx_reported_at (reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备状态上报日志表';

-- 枪开关时间片段表（用于精确计费）
CREATE TABLE IF NOT EXISTS gun_time_segments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL COMMENT '会话ID',
    device_no VARCHAR(64) NOT NULL COMMENT '设备编号',
    gun_type TINYINT NOT NULL COMMENT '枪类型：1-喷水枪，2-泡沫枪',
    action_type TINYINT NOT NULL COMMENT '操作类型：1-开，2-关',
    action_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_device_no (device_no),
    INDEX idx_gun_type (gun_type),
    INDEX idx_action_time (action_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='枪开关时间片段表';

-- ============================================
-- Billing-Service 相关表
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(16) NOT NULL UNIQUE COMMENT '手机号',
    nickname VARCHAR(64) DEFAULT NULL COMMENT '昵称',
    wallet_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '钱包余额（元）',
    total_recharge DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '累计充值（元）',
    total_consumption DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '累计消费（元）',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：0-冻结，1-正常',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 计费规则表
CREATE TABLE IF NOT EXISTS billing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rule_name VARCHAR(64) NOT NULL COMMENT '规则名称',
    water_gun_rate DECIMAL(5, 2) NOT NULL COMMENT '喷水枪费率（元/分钟）',
    foam_gun_rate DECIMAL(5, 2) NOT NULL COMMENT '泡沫枪费率（元/分钟）',
    water_usage_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00 COMMENT '耗水费率（元/升）',
    min_charge DECIMAL(5, 2) NOT NULL DEFAULT 0.00 COMMENT '最低消费（元）',
    is_active TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用：0-否，1-是',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='计费规则表';

-- 计费订单表
CREATE TABLE IF NOT EXISTS billing_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(64) NOT NULL UNIQUE COMMENT '订单号',
    session_id VARCHAR(64) NOT NULL UNIQUE COMMENT '设备会话ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    device_no VARCHAR(64) NOT NULL COMMENT '设备编号',
    rule_id INT NOT NULL COMMENT '计费规则ID',
    water_gun_time INT NOT NULL DEFAULT 0 COMMENT '喷水枪时长（分钟，向上取整）',
    foam_gun_time INT NOT NULL DEFAULT 0 COMMENT '泡沫枪时长（分钟，向上取整）',
    water_gun_cost DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT '喷水枪费用（元）',
    foam_gun_cost DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT '泡沫枪费用（元）',
    water_usage_cost DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT '耗水费用（元）',
    total_amount DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT '订单总金额（元）',
    actual_amount DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT '实际扣款金额（元）',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-计费中，2-待扣款，3-已完成，4-扣款失败',
    start_time DATETIME NOT NULL COMMENT '开始时间',
    end_time DATETIME DEFAULT NULL COMMENT '结束时间',
    paid_at DATETIME DEFAULT NULL COMMENT '扣款时间',
    fail_reason VARCHAR(256) DEFAULT NULL COMMENT '扣款失败原因',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_no (order_no),
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='计费订单表';

-- 钱包交易流水表
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_no VARCHAR(64) NOT NULL UNIQUE COMMENT '交易流水号',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    order_no VARCHAR(64) DEFAULT NULL COMMENT '关联订单号',
    tx_type TINYINT NOT NULL COMMENT '交易类型：1-充值，2-消费扣款，3-退款',
    amount DECIMAL(10, 2) NOT NULL COMMENT '交易金额（元），正数为收入，负数为支出',
    balance_before DECIMAL(10, 2) NOT NULL COMMENT '交易前余额',
    balance_after DECIMAL(10, 2) NOT NULL COMMENT '交易后余额',
    remark VARCHAR(256) DEFAULT NULL COMMENT '备注',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tx_no (tx_no),
    INDEX idx_user_id (user_id),
    INDEX idx_order_no (order_no),
    INDEX idx_tx_type (tx_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='钱包交易流水表';

-- ============================================
-- 初始化测试数据
-- ============================================

-- 插入测试设备
INSERT INTO devices (device_no, name, community, address, latitude, longitude, status) VALUES
('CW-BJ-0001', '朝阳区1号洗车机', '望京SOHO社区', '北京市朝阳区望京街道阜通东大街6号', 39.9961343, 116.4785376, 1),
('CW-BJ-0002', '朝阳区2号洗车机', '国贸CBD社区', '北京市朝阳区建国门外大街1号', 39.9088230, 116.4600579, 1),
('CW-BJ-0003', '海淀区1号洗车机', '中关村科技园社区', '北京市海淀区海淀大街27号', 39.9847410, 116.3133930, 1),
('CW-SH-0001', '浦东新区1号洗车机', '陆家嘴金融社区', '上海市浦东新区陆家嘴环路1000号', 31.2407013, 121.5058749, 1),
('CW-SZ-0001', '南山区1号洗车机', '科技园社区', '深圳市南山区高新南一道6号', 22.5433150, 113.9464740, 1);

-- 插入测试用户
INSERT INTO users (phone, nickname, wallet_balance, total_recharge, status) VALUES
('13800138001', '张三', 500.00, 500.00, 1),
('13800138002', '李四', 200.00, 300.00, 1),
('13800138003', '王五', 50.00, 200.00, 1),
('13800138004', '赵六', 0.00, 100.00, 1);

-- 插入默认计费规则
INSERT INTO billing_rules (rule_name, water_gun_rate, foam_gun_rate, water_usage_rate, min_charge, is_active) VALUES
('标准计费规则', 2.00, 3.00, 0.10, 5.00, 1),
('高峰时段规则', 3.00, 4.00, 0.15, 8.00, 0);
