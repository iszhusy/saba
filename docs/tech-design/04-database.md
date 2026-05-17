# 数据库层详细设计

> 文档版本：v3.0（2026-05-16）
> 实现状态：已实现（Cloudflare D1 + KV）

## 1. 数据库概览

### 1.1 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 主数据库 | Cloudflare D1 (SQLite) | 关系数据，SQL 查询，边缘部署 |
| 缓存/评估存储 | Cloudflare KV | 高速读写，评估结果缓存 |
| 部署 | Cloudflare 全球边缘 | 低延迟，高可用 |

### 1.2 数据模型总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户相关                                  │
├─────────────────────────────────────────────────────────────────┤
│  users ─────────────────────────────────────────────────────────│
│       │                                                        │
│       ├── user_profiles ───────────────────────────────────────│
│       │                                                          │
│       └── team_patient_mappings                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         评估相关                                  │
├─────────────────────────────────────────────────────────────────┤
│  assessments ───────────────────────────────────────────────────│
│       │                                                        │
│       ├── feedbacks                                            │
│       │                                                        │
│       └── notifications                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         规则相关                                  │
├─────────────────────────────────────────────────────────────────┤
│  rule_versions ────────────────────────────────────────────────│
│       │                                                        │
│       └── rule_audit_logs                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         审计相关                                  │
├─────────────────────────────────────────────────────────────────┤
│  audit_logs                                                     │
│       │                                                        │
│       └── agent_metrics                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 表结构设计

### 2.1 用户相关表

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 基本信息
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    
    -- 角色
    role VARCHAR(20) NOT NULL DEFAULT 'patient',  -- 'patient' | 'team' | 'admin'
    
    -- 状态
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'inactive' | 'suspended'
    
    -- 患者特有信息
    patient_info JSONB,  -- {treatment_start_date, diagnosis_type, ...}
    
    -- 团队用户特有信息
    team_info JSONB,    -- {team_id, department, specialty}
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    
    -- 约束
    CONSTRAINT users_role_check CHECK (role IN ('patient', 'team', 'admin'))
);

-- 用户资料表
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 基本资料
    name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(10),
    
    -- 医疗信息
    medical_info JSONB NOT NULL DEFAULT '{}',  -- {
                                                  --   diagnosis_date: date,
                                                  --   cancer_type: string,
                                                  --   stage: string,
                                                  --   treatment_plan: [],
                                                  --   known_allergies: [],
                                                  --   medications: []
                                                  -- }
    
    -- 治疗上下文
    treatment_context JSONB DEFAULT '{}',  -- {
                                              --   current_treatment: string,
                                              --   treatment_phase: string,
                                              --   known_side_effects: []
                                            -- }
    
    -- 偏好设置
    preferences JSONB DEFAULT '{}',  -- {language, notification_preferences}
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- 团队-患者关系表
CREATE TABLE team_patient_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES users(id),
    patient_id UUID NOT NULL REFERENCES users(id),
    
    -- 关系类型
    relationship VARCHAR(50) NOT NULL,  -- 'primary_doctor' | 'nurse' | 'case_manager'
    
    -- 授权范围
    access_level VARCHAR(20) DEFAULT 'full',  -- 'full' | 'limited' | 'emergency_only'
    
    -- 状态
    status VARCHAR(20) DEFAULT 'active',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    
    -- 唯一约束
    UNIQUE(team_id, patient_id)
);

-- 创建索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_team_patient_team ON team_patient_mappings(team_id);
CREATE INDEX idx_team_patient_patient ON team_patient_mappings(patient_id);
```

### 2.2 评估相关表

```sql
-- 评估记录表
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 用户标识
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- 输入内容
    raw_input TEXT NOT NULL,
    structured_input JSONB,  -- {
                                --   symptoms: [{name, confidence, severity}],
                                --   duration: string,
                                --   severity_score: number
                                -- }
    
    -- 评估结果
    risk_level VARCHAR(10) NOT NULL,  -- 'high' | 'medium' | 'low'
    risk_score DECIMAL(5,2) NOT NULL,  -- 0-100
    
    -- 决策依据
    triggered_rules JSONB NOT NULL DEFAULT '[]',  -- [{rule_id, name, confidence, source}]
    reasoning TEXT,  -- AI 生成的推理过程
    
    -- 建议
    immediate_action TEXT NOT NULL,
    follow_up_suggestion TEXT,
    team_contact_required BOOLEAN DEFAULT FALSE,
    
    -- 上下文
    context JSONB,  -- {treatment_phase, treatment_type, treatment_day, known_side_effects}
    
    -- 元数据
    version VARCHAR(20),  -- 规则版本
    model_version VARCHAR(20),  -- 模型版本
    processing_time_ms INTEGER,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'completed',  -- 'processing' | 'completed' | 'failed'
    
    -- 关联
    notification_id UUID,  -- 如果触发了团队通知
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT assessments_risk_level_check CHECK (risk_level IN ('high', 'medium', 'low'))
);

-- 评估索引
CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_created_at ON assessments(created_at DESC);
CREATE INDEX idx_assessments_risk_level ON assessments(risk_level);
CREATE INDEX idx_assessments_user_created ON assessments(user_id, created_at DESC);

-- 反馈表
CREATE TABLE feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    
    -- 反馈类型
    feedback_type VARCHAR(20) NOT NULL,  -- 'user_rating' | 'team_verdict' | 'behavior'
    source VARCHAR(20) NOT NULL,  -- 'patient' | 'team' | 'system'
    
    -- 用户显式反馈
    is_helpful BOOLEAN,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    
    -- 团队反馈
    team_verdict VARCHAR(20),  -- 'accurate' | 'inaccurate' | 'needs_adjustment'
    team_comment TEXT,
    
    -- 隐式反馈（行为追踪）
    user_acted BOOLEAN,  -- 用户是否按建议行动
    user_sought_medical_help BOOLEAN,  -- 用户是否就医
    medical_help_details JSONB,  -- {hospital, diagnosis, date}
    
    -- 来源用户/团队
    submitted_by UUID REFERENCES users(id),
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT feedbacks_feedback_type_check CHECK (
        feedback_type IN ('user_rating', 'team_verdict', 'behavior')
    )
);

CREATE INDEX idx_feedbacks_assessment_id ON feedbacks(assessment_id);
CREATE INDEX idx_feedbacks_created_at ON feedbacks(created_at DESC);
CREATE INDEX idx_feedbacks_source ON feedbacks(source);

-- 通知表
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 关联评估
    assessment_id UUID NOT NULL REFERENCES assessments(id),
    patient_id UUID NOT NULL REFERENCES users(id),
    
    -- 通知类型
    notification_type VARCHAR(30) NOT NULL,  -- 'high_risk_alert' | 'patient_request' | 'reminder'
    
    -- 优先级
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',  -- 'urgent' | 'high' | 'normal' | 'low'
    
    -- 内容
    summary TEXT NOT NULL,
    triggered_rules JSONB,
    recommended_action TEXT,
    patient_message TEXT,  -- 患者附言
    
    -- 发送状态
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'sent' | 'delivered' | 'acknowledged' | 'failed'
    
    -- 发送详情
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    delivery_channels JSONB,  -- ['email', 'push', 'sms']
    
    -- 接收人
    recipients JSONB NOT NULL,  -- [{user_id, channel, status}]
    
    -- 重试信息
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    failure_reason TEXT,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_patient_id ON notifications(patient_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_priority ON notifications(priority);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
```

### 2.3 规则相关表

```sql
-- 规则版本表
CREATE TABLE rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL UNIQUE,
    
    -- 规则内容
    rules JSONB NOT NULL,  -- 完整的规则集合
    
    -- 版本信息
    description TEXT,
    change_summary TEXT,
    change_reason TEXT,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'draft',  -- 'draft' | 'testing' | 'active' | 'deprecated'
    
    -- 部署信息
    deployed_at TIMESTAMP,
    deployed_by VARCHAR(100),
    
    -- 测试指标
    test_results JSONB,  -- {accuracy, precision, recall, f1}
    
    -- 元数据
    total_rules INTEGER,
    high_risk_rules INTEGER,
    medium_risk_rules INTEGER,
    low_risk_rules INTEGER,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 激活规则的唯一性
    CONSTRAINT unique_active_version EXCLUDE USING gist (
        version WITH = 
        WHERE status = 'active'
    )
);

CREATE INDEX idx_rule_versions_status ON rule_versions(status);
CREATE INDEX idx_rule_versions_created_at ON rule_versions(created_at DESC);

-- 规则审计日志
CREATE TABLE rule_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 版本信息
    old_version VARCHAR(20),
    new_version VARCHAR(20),
    
    -- 变更类型
    change_type VARCHAR(30) NOT NULL,  -- 'create' | 'update' | 'activate' | 'deactivate'
    
    -- 变更详情
    changed_rules JSONB,  -- [{rule_id, change_type, before, after}]
    
    -- 变更原因
    reason TEXT,
    source VARCHAR(20),  -- 'human' | 'ai_suggestion' | 'automatic'
    
    -- 操作人
    changed_by VARCHAR(100),
    approved_by VARCHAR(100),
    
    -- 审批状态
    approval_status VARCHAR(20) DEFAULT 'approved',  -- 'pending' | 'approved' | 'rejected'
    approval_comment TEXT,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rule_audit_version ON rule_audit_logs(new_version);
CREATE INDEX idx_rule_audit_created_at ON rule_audit_logs(created_at DESC);
```

### 2.4 审计和监控表

```sql
-- 审计日志表
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 操作信息
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(30),
    resource_id UUID,
    
    -- 请求信息
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    request_method VARCHAR(10),
    request_path TEXT,
    
    -- 响应信息
    response_status INTEGER,
    
    -- 变更详情
    changes JSONB,  -- {before: {}, after: {}}
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- 保留策略
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '2 years'
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Agent 指标表
CREATE TABLE agent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agent 信息
    agent_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100),
    
    -- 执行指标
    execution_id UUID,
    task_type VARCHAR(50),
    status VARCHAR(20),  -- 'started' | 'completed' | 'failed'
    
    -- 时间指标
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_ms INTEGER,
    
    -- 质量指标
    success BOOLEAN,
    error_message TEXT,
    output_size INTEGER,
    
    -- 上下文
    context JSONB,  -- {user_id, assessment_id, metadata}
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_metrics_agent_id ON agent_metrics(agent_id);
CREATE INDEX idx_agent_metrics_created_at ON agent_metrics(created_at DESC);
CREATE INDEX idx_agent_metrics_status ON agent_metrics(status);
```

## 3. 数据库操作

### 3.1 SQLAlchemy 模型

```python
# src/models/database.py

from sqlalchemy import Column, String, Boolean, Integer, Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

Base = declarative_base()

class User(Base):
    """用户模型"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20))
    password_hash = Column(String(255), nullable=False)
    
    role = Column(String(20), nullable=False, default="patient")
    status = Column(String(20), nullable=False, default="active")
    
    patient_info = Column(JSON)
    team_info = Column(JSON)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = Column(DateTime)
    
    # 关系
    profile = relationship("UserProfile", back_populates="user", uselist=False)
    assessments = relationship("Assessment", back_populates="user")
    feedbacks = relationship("Feedback", back_populates="user")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "email": self.email,
            "role": self.role,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class UserProfile(Base):
    """用户资料模型"""
    __tablename__ = "user_profiles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    
    name = Column(String(100))
    date_of_birth = Column(DateTime)
    gender = Column(String(10))
    
    medical_info = Column(JSON, default=dict)
    treatment_context = Column(JSON, default=dict)
    preferences = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    user = relationship("User", back_populates="profile")

class Assessment(Base):
    """评估模型"""
    __tablename__ = "assessments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # 输入
    raw_input = Column(Text, nullable=False)
    structured_input = Column(JSON)
    
    # 结果
    risk_level = Column(String(10), nullable=False)
    risk_score = Column(String(10), nullable=False)  # 存储为字符串，JSONB 支持
    
    # 决策
    triggered_rules = Column(JSON, default=list)
    reasoning = Column(Text)
    
    # 建议
    immediate_action = Column(Text, nullable=False)
    follow_up_suggestion = Column(Text)
    team_contact_required = Column(Boolean, default=False)
    
    # 上下文
    context = Column(JSON)
    
    # 元数据
    version = Column(String(20))
    model_version = Column(String(20))
    processing_time_ms = Column(Integer)
    status = Column(String(20), default="completed")
    
    notification_id = Column(UUID(as_uuid=True))
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    user = relationship("User", back_populates="assessments")
    feedbacks = relationship("Feedback", back_populates="assessment")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "risk_level": self.risk_level,
            "risk_score": float(self.risk_score) if self.risk_score else 0,
            "triggered_rules": self.triggered_rules or [],
            "immediate_action": self.immediate_action,
            "team_contact_required": self.team_contact_required,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class Feedback(Base):
    """反馈模型"""
    __tablename__ = "feedbacks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    
    feedback_type = Column(String(20), nullable=False)
    source = Column(String(20), nullable=False)
    
    # 用户反馈
    is_helpful = Column(Boolean)
    rating = Column(Integer)
    comment = Column(Text)
    
    # 团队反馈
    team_verdict = Column(String(20))
    team_comment = Column(Text)
    
    # 隐式反馈
    user_acted = Column(Boolean)
    user_sought_medical_help = Column(Boolean)
    medical_help_details = Column(JSON)
    
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    assessment = relationship("Assessment", back_populates="feedbacks")
    user = relationship("User", back_populates="feedbacks")

class Notification(Base):
    """通知模型"""
    __tablename__ = "notifications"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    notification_type = Column(String(30), nullable=False)
    priority = Column(String(20), nullable=False, default="normal")
    
    summary = Column(Text, nullable=False)
    triggered_rules = Column(JSON)
    recommended_action = Column(Text)
    patient_message = Column(Text)
    
    status = Column(String(20), default="pending")
    
    sent_at = Column(DateTime)
    delivered_at = Column(DateTime)
    acknowledged_at = Column(DateTime)
    delivery_channels = Column(JSON)
    
    recipients = Column(JSON, nullable=False)
    
    retry_count = Column(Integer, default=0)
    last_retry_at = Column(DateTime)
    failure_reason = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class RuleVersion(Base):
    """规则版本模型"""
    __tablename__ = "rule_versions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version = Column(String(20), unique=True, nullable=False)
    
    rules = Column(JSON, nullable=False)
    description = Column(Text)
    change_summary = Column(Text)
    change_reason = Column(Text)
    
    status = Column(String(20), default="draft")
    
    deployed_at = Column(DateTime)
    deployed_by = Column(String(100))
    
    test_results = Column(JSON)
    
    total_rules = Column(Integer)
    high_risk_rules = Column(Integer)
    medium_risk_rules = Column(Integer)
    low_risk_rules = Column(Integer)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AuditLog(Base):
    """审计日志模型"""
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String(50), nullable=False)
    resource_type = Column(String(30))
    resource_id = Column(UUID(as_uuid=True))
    
    ip_address = Column(INET)
    user_agent = Column(Text)
    request_id = Column(String(100))
    request_method = Column(String(10))
    request_path = Column(Text)
    
    response_status = Column(Integer)
    
    changes = Column(JSON)
    
    created_at = Column(DateTime, default=datetime.utcnow)

class AgentMetric(Base):
    """Agent 指标模型"""
    __tablename__ = "agent_metrics"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    agent_id = Column(String(50), nullable=False, index=True)
    session_id = Column(String(100))
    
    execution_id = Column(UUID(as_uuid=True))
    task_type = Column(String(50))
    status = Column(String(20))
    
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime)
    duration_ms = Column(Integer)
    
    success = Column(Boolean)
    error_message = Column(Text)
    output_size = Column(Integer)
    
    context = Column(JSON)
    
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 3.2 数据库连接

```python
# src/core/database.py

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import logging

from .config import settings

logger = logging.getLogger(__name__)

# 创建引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,  # 使用连接池管理
    echo=settings.DEBUG,  # 开发环境打印 SQL
    pool_pre_ping=True,   # 连接前检查
    pool_size=10,
    max_overflow=20
)

# 创建会话工厂
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """上下文管理器方式的数据库会话"""
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()

class DatabaseManager:
    """数据库管理器"""
    
    def __init__(self):
        self.engine = engine
        self.session_factory = AsyncSessionLocal
    
    async def create_tables(self):
        """创建所有表"""
        from src.models.database import Base
        
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database tables created")
    
    async def drop_tables(self):
        """删除所有表（仅用于测试）"""
        from src.models.database import Base
        
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        
        logger.info("Database tables dropped")
    
    async def health_check(self) -> bool:
        """健康检查"""
        try:
            async with self.engine.connect() as conn:
                await conn.execute("SELECT 1")
            return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

# 数据库管理器实例
db_manager = DatabaseManager()
```

### 3.3 迁移脚本

```python
# migrations/env.py

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
import asyncio
import logging

from src.models.database import Base
from src.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

config = context.config

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """运行离线迁移"""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """运行异步迁移"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """运行在线迁移"""
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 3.4 数据访问层

```python
# src/repositories/assessment_repository.py

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
import logging

from ..models.database import Assessment, Feedback, Notification

logger = logging.getLogger(__name__)

class AssessmentRepository:
    """评估数据访问层"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, assessment_data: Dict[str, Any]) -> Assessment:
        """创建评估记录"""
        assessment = Assessment(**assessment_data)
        self.session.add(assessment)
        await self.session.flush()
        return assessment
    
    async def get_by_id(self, assessment_id: UUID) -> Optional[Assessment]:
        """根据ID获取评估"""
        result = await self.session.execute(
            select(Assessment).where(Assessment.id == assessment_id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_user(
        self,
        user_id: UUID,
        page: int = 1,
        page_size: int = 20,
        risk_level: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> tuple[List[Assessment], int]:
        """获取用户的评估列表"""
        query = select(Assessment).where(Assessment.user_id == user_id)
        
        # 应用筛选
        if risk_level:
            query = query.where(Assessment.risk_level == risk_level)
        if start_date:
            query = query.where(Assessment.created_at >= start_date)
        if end_date:
            query = query.where(Assessment.created_at <= end_date)
        
        # 获取总数
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.session.execute(count_query)
        total_count = total.scalar()
        
        # 分页
        query = query.order_by(Assessment.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await self.session.execute(query)
        assessments = result.scalars().all()
        
        return list(assessments), total_count
    
    async def get_recent_by_user(
        self,
        user_id: UUID,
        days: int = 7
    ) -> List[Assessment]:
        """获取用户最近的评估"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.session.execute(
            select(Assessment)
            .where(
                and_(
                    Assessment.user_id == user_id,
                    Assessment.created_at >= cutoff_date
                )
            )
            .order_by(Assessment.created_at.desc())
        )
        
        return list(result.scalars().all())
    
    async def get_high_risk_count(
        self,
        user_id: UUID,
        days: int = 30
    ) -> int:
        """获取用户高风险评估数量"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.session.execute(
            select(func.count())
            .where(
                and_(
                    Assessment.user_id == user_id,
                    Assessment.risk_level == "high",
                    Assessment.created_at >= cutoff_date
                )
            )
        )
        
        return result.scalar()


class FeedbackRepository:
    """反馈数据访问层"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, feedback_data: Dict[str, Any]) -> Feedback:
        """创建反馈记录"""
        feedback = Feedback(**feedback_data)
        self.session.add(feedback)
        await self.session.flush()
        return feedback
    
    async def get_by_assessment(self, assessment_id: UUID) -> List[Feedback]:
        """获取评估的所有反馈"""
        result = await self.session.execute(
            select(Feedback)
            .where(Feedback.assessment_id == assessment_id)
            .order_by(Feedback.created_at.desc())
        )
        
        return list(result.scalars().all())
    
    async def get_recent(
        self,
        days: int = 7,
        min_count: int = 10
    ) -> List[Feedback]:
        """获取最近的反馈（用于分析）"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.session.execute(
            select(Feedback)
            .where(Feedback.created_at >= cutoff_date)
            .options(selectinload(Feedback.assessment))
            .order_by(Feedback.created_at.desc())
        )
        
        return list(result.scalars().all())
    
    async def get_team_accuracy(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """计算团队准确率"""
        query = select(Feedback).where(Feedback.feedback_type == "team_verdict")
        
        if start_date:
            query = query.where(Feedback.created_at >= start_date)
        if end_date:
            query = query.where(Feedback.created_at <= end_date)
        
        result = await self.session.execute(query)
        feedbacks = list(result.scalars().all())
        
        if not feedbacks:
            return {"accuracy_rate": 1.0, "total": 0}
        
        accurate = sum(1 for f in feedbacks if f.team_verdict == "accurate")
        
        return {
            "accuracy_rate": accurate / len(feedbacks),
            "total": len(feedbacks),
            "accurate_count": accurate,
            "inaccurate_count": len(feedbacks) - accurate
        }


class NotificationRepository:
    """通知数据访问层"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, notification_data: Dict[str, Any]) -> Notification:
        """创建通知记录"""
        notification = Notification(**notification_data)
        self.session.add(notification)
        await self.session.flush()
        return notification
    
    async def get_by_patient(
        self,
        patient_id: UUID,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None
    ) -> tuple[List[Notification], int]:
        """获取患者的所有通知"""
        query = select(Notification).where(Notification.patient_id == patient_id)
        
        if status:
            query = query.where(Notification.status == status)
        
        # 获取总数
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.session.execute(count_query)
        total_count = total.scalar()
        
        # 分页
        query = query.order_by(Notification.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await self.session.execute(query)
        notifications = result.scalars().all()
        
        return list(notifications), total_count
    
    async def update_status(
        self,
        notification_id: UUID,
        status: str,
        timestamp: Optional[datetime] = None
    ):
        """更新通知状态"""
        notification = await self.session.get(Notification, notification_id)
        
        if notification:
            notification.status = status
            
            if status == "sent" and not notification.sent_at:
                notification.sent_at = timestamp or datetime.utcnow()
            elif status == "delivered" and not notification.delivered_at:
                notification.delivered_at = timestamp or datetime.utcnow()
            elif status == "acknowledged" and not notification.acknowledged_at:
                notification.acknowledged_at = timestamp or datetime.utcnow()
            
            await self.session.flush()
```
