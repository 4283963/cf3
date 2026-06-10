-- ============================================
-- 硬件异常实时中断保护功能 - 增量 DDL
-- 执行方式：docker exec -i carwash-mysql mysql -uroot -proot123456 carwash < sql/hardware_interrupt.sql
-- ============================================
USE carwash;

-- ============================================
-- 1. 设备故障告警表 (两个服务共享)
-- ============================================
CREATE TABLE IF NOT EXISTS device_fault_alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alert_id VARCHAR(64) NOT NULL UNIQUE COMMENT '告警ID',
    device_no VARCHAR(64) NOT NULL COMMENT '设备编号',
    session_id VARCHAR(64) DEFAULT NULL COMMENT '关联的会话ID（若有）',
    fault_type VARCHAR(32) NOT NULL COMMENT '故障类型：FOAM_LOW-泡沫液位低 WATER_PRESSURE_DROP-水压骤降 WATER_GUN_FAULT-水枪故障 FOAM_GUN_FAULT-泡沫枪故障 WATER_EMPTY-清水用光 GENERAL_FAULT-通用故障',
    fault_code VARCHAR(32) DEFAULT NULL COMMENT '原始故障码',
    fault_message VARCHAR(256) DEFAULT NULL COMMENT '故障描述',
    fault_level TINYINT NOT NULL DEFAULT 2 COMMENT '故障等级：1-警告 2-需立即中断 3-严重',
    sensor_data JSON DEFAULT NULL COMMENT '传感器原始数据（JSON）',
    is_resolved TINYINT NOT NULL DEFAULT 0 COMMENT '是否已处理：0-未处理 1-已处理',
    resolved_at DATETIME DEFAULT NULL COMMENT '处理时间',
    resolved_note VARCHAR(256) DEFAULT NULL COMMENT '处理备注',
    triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '触发时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_no (device_no),
    INDEX idx_session_id (session_id),
    INDEX idx_fault_type (fault_type),
    INDEX idx_fault_level (fault_level),
    INDEX idx_is_resolved (is_resolved),
    INDEX idx_triggered_at (triggered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备故障告警表';

-- ============================================
-- 2. 订单中断记录表
-- ============================================
CREATE TABLE IF NOT EXISTS order_interruptions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    interruption_id VARCHAR(64) NOT NULL UNIQUE COMMENT '中断记录ID',
    order_no VARCHAR(64) NOT NULL COMMENT '订单号',
    session_id VARCHAR(64) NOT NULL COMMENT '会话ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    device_no VARCHAR(64) NOT NULL COMMENT '设备编号',
    alert_id VARCHAR(64) DEFAULT NULL COMMENT '关联的告警ID',
    fault_type VARCHAR(32) NOT NULL COMMENT '故障类型',
    fault_message VARCHAR(256) DEFAULT NULL COMMENT '故障描述',
    interrupt_reason VARCHAR(256) NOT NULL COMMENT '中断原因',
    order_status_before TINYINT NOT NULL COMMENT '中断前订单状态',
    order_status_after TINYINT NOT NULL COMMENT '中断后订单状态',
    charged_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '中断前已扣金额（元）',
    actual_usage_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '按实际使用计算的金额（元）',
    refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '退款金额（元）',
    refund_tx_no VARCHAR(64) DEFAULT NULL COMMENT '退款交易流水号',
    refund_status TINYINT NOT NULL DEFAULT 0 COMMENT '退款状态：0-无需退款 1-退款成功 2-退款失败 3-退款中',
    refund_fail_reason VARCHAR(256) DEFAULT NULL COMMENT '退款失败原因',
    is_auto TINYINT NOT NULL DEFAULT 1 COMMENT '是否自动触发：0-人工 1-自动',
    interrupted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '中断时间',
    refunded_at DATETIME DEFAULT NULL COMMENT '退款时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_interruption_id (interruption_id),
    INDEX idx_order_no (order_no),
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_device_no (device_no),
    INDEX idx_alert_id (alert_id),
    INDEX idx_refund_status (refund_status),
    INDEX idx_interrupted_at (interrupted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单中断记录表';

-- ============================================
-- 3. 扩展 billing_orders：增加中断相关字段
-- ============================================
ALTER TABLE billing_orders
    ADD COLUMN IF NOT EXISTS interrupt_reason VARCHAR(256) DEFAULT NULL COMMENT '中断原因' AFTER fail_reason,
    ADD COLUMN IF NOT EXISTS interrupted_at DATETIME DEFAULT NULL COMMENT '中断时间' AFTER paid_at,
    ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '退款金额（元）' AFTER actual_amount;

-- ============================================
-- 4. 扩展 devices：新增硬件传感器相关字段
-- ============================================
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS foam_level DECIMAL(5,2) DEFAULT 100.00 COMMENT '泡沫液位百分比(%)' AFTER water_pressure,
    ADD COLUMN IF NOT EXISTS water_level DECIMAL(5,2) DEFAULT 100.00 COMMENT '清水液位百分比(%)' AFTER foam_level,
    ADD COLUMN IF NOT EXISTS last_fault_time DATETIME DEFAULT NULL COMMENT '最后故障时间' AFTER updated_at,
    ADD COLUMN IF NOT EXISTS last_fault_type VARCHAR(32) DEFAULT NULL COMMENT '最后故障类型' AFTER last_fault_time;

-- ============================================
-- 5. 扩展 device_status_logs：新增液位、水压传感器数据
-- ============================================
ALTER TABLE device_status_logs
    ADD COLUMN IF NOT EXISTS foam_level DECIMAL(5,2) DEFAULT NULL COMMENT '泡沫液位百分比(%)' AFTER water_flow_rate,
    ADD COLUMN IF NOT EXISTS water_level DECIMAL(5,2) DEFAULT NULL COMMENT '清水液位百分比(%)' AFTER foam_level,
    ADD COLUMN IF NOT EXISTS water_pressure DECIMAL(5,2) DEFAULT NULL COMMENT '水管压力(bar)' AFTER water_level,
    ADD COLUMN IF NOT EXISTS fault_type VARCHAR(32) DEFAULT NULL COMMENT '故障类型分类' AFTER fault_message;
