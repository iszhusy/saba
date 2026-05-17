# 可观测性系统设计

> 文档版本：v3.0（2026-05-16）
> 实现状态：部分实现（Cloudflare Analytics）

## 1. 可观测性架构

### 1.1 技术选型

| 组件 | 推荐方案 | 用途 |
|------|----------|------|
| 日志/指标 | Cloudflare Analytics | Workers 内置日志和指标 |
| 追踪 | Workers Runtime + Console | 基础请求追踪 |
| 错误监控 | Cloudflare Workers Error | 自动错误捕获 |
| 告警 | Cloudflare Alerts | 异常告警 |

> 当前版本以 Console.log 为主，详细可观测性系统为后续迭代目标。

## 2. 日志系统

### 2.1 日志设计

```python
# src/core/logging.py

import logging
import json
from datetime import datetime
from typing import Dict, Any, Optional
from contextvars import ContextVar
import structlog

# 上下文变量
request_id: ContextVar[str] = ContextVar("request_id", default="")
user_id: ContextVar[str] = ContextVar("user_id", default="")
agent_id: ContextVar[str] = ContextVar("agent_id", default="")

class StructuredLogger:
    """
    结构化日志器
    
    输出格式:
    {
        "timestamp": "2024-01-15T10:30:00Z",
        "level": "INFO",
        "message": "Assessment completed",
        "request_id": "xxx",
        "user_id": "xxx",
        "agent_id": "xxx",
        "duration_ms": 150,
        "metadata": {...}
    }
    """

    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
        
        # 添加 JSON 处理器
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        self.logger.addHandler(handler)

    def _log(
        self,
        level: str,
        message: str,
        **kwargs
    ):
        """记录日志"""
        extra = {
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": request_id.get(),
            "user_id": user_id.get(),
            "agent_id": agent_id.get(),
            **kwargs
        }
        
        getattr(self.logger, level.lower())(message, extra=extra)

    def info(self, message: str, **kwargs):
        self._log("INFO", message, **kwargs)

    def warning(self, message: str, **kwargs):
        self._log("WARNING", message, **kwargs)

    def error(self, message: str, **kwargs):
        self._log("ERROR", message, **kwargs)

    def debug(self, message: str, **kwargs):
        self._log("DEBUG", message, **kwargs)

class JsonFormatter(logging.Formatter):
    """JSON 格式器"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        
        # 添加额外字段
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "agent_id"):
            log_data["agent_id"] = record.agent_id
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        
        # 添加 metadata
        if hasattr(record, "metadata"):
            log_data["metadata"] = record.metadata
        
        return json.dumps(log_data)

# 预配置的日志器
logger = StructuredLogger("saba")
agent_logger = StructuredLogger("saba.agent")
api_logger = StructuredLogger("saba.api")
```

### 2.2 Agent 日志

```python
# src/agents/monitoring/agent_logger.py

from typing import Dict, Any, Optional
from datetime import datetime
from contextvars import copy_context
import time

from ...core.logging import agent_logger

class AgentLogger:
    """Agent 专用日志器"""
    
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        
    def log_execution_start(
        self,
        execution_id: str,
        task_type: str,
        context: Optional[Dict] = None
    ):
        """记录执行开始"""
        agent_logger.info(
            "Agent execution started",
            agent_id=self.agent_id,
            execution_id=execution_id,
            task_type=task_type,
            context=context
        )
    
    def log_execution_end(
        self,
        execution_id: str,
        duration_ms: float,
        success: bool,
        output: Optional[Dict] = None,
        error: Optional[str] = None
    ):
        """记录执行结束"""
        if success:
            agent_logger.info(
                "Agent execution completed",
                agent_id=self.agent_id,
                execution_id=execution_id,
                duration_ms=duration_ms,
                success=success
            )
        else:
            agent_logger.error(
                "Agent execution failed",
                agent_id=self.agent_id,
                execution_id=execution_id,
                duration_ms=duration_ms,
                success=success,
                error=error
            )
    
    def log_tool_call(
        self,
        execution_id: str,
        tool_name: str,
        params: Dict[str, Any],
        result: Any,
        duration_ms: float
    ):
        """记录工具调用"""
        agent_logger.debug(
            "Tool call",
            agent_id=self.agent_id,
            execution_id=execution_id,
            tool_name=tool_name,
            params=params,
            duration_ms=duration_ms
        )
    
    def log_state_transition(
        self,
        execution_id: str,
        from_state: str,
        to_state: str,
        reason: Optional[str] = None
    ):
        """记录状态转换"""
        agent_logger.info(
            "Agent state transition",
            agent_id=self.agent_id,
            execution_id=execution_id,
            from_state=from_state,
            to_state=to_state,
            reason=reason
        )
    
    def log_message_sent(
        self,
        sender_id: str,
        receiver_id: str,
        message_type: str,
        correlation_id: Optional[str] = None
    ):
        """记录消息发送"""
        agent_logger.debug(
            "Agent message sent",
            agent_id=self.agent_id,
            sender=sender_id,
            receiver=receiver_id,
            message_type=message_type,
            correlation_id=correlation_id
        )
    
    def log_error(
        self,
        execution_id: str,
        error_type: str,
        error_message: str,
        stack_trace: Optional[str] = None
    ):
        """记录错误"""
        agent_logger.error(
            "Agent error",
            agent_id=self.agent_id,
            execution_id=execution_id,
            error_type=error_type,
            error_message=error_message,
            stack_trace=stack_trace
        )

class ExecutionTimer:
    """执行计时器"""
    
    def __init__(self, logger: AgentLogger, execution_id: str):
        self.logger = logger
        self.execution_id = execution_id
        self.start_time = time.time()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.time() - self.start_time) * 1000
        
        if exc_type:
            self.logger.log_execution_end(
                execution_id=self.execution_id,
                duration_ms=duration_ms,
                success=False,
                error=str(exc_val)
            )
        else:
            self.logger.log_execution_end(
                execution_id=self.execution_id,
                duration_ms=duration_ms,
                success=True
            )
```

## 3. 指标系统

### 3.1 指标定义

```python
# src/monitoring/metrics.py

from prometheus_client import Counter, Histogram, Gauge, Summary
import time

# 业务指标
ASSESSMENT_COUNT = Counter(
    "saba_assessment_total",
    "Total number of assessments",
    ["risk_level", "source"]
)

ASSESSMENT_DURATION = Histogram(
    "saba_assessment_duration_seconds",
    "Assessment processing duration",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

FEEDBACK_COUNT = Counter(
    "saba_feedback_total",
    "Total number of feedback submissions",
    ["feedback_type", "source"]
)

NOTIFICATION_COUNT = Counter(
    "saba_notification_total",
    "Total number of notifications sent",
    ["notification_type", "priority", "status"]
)

# Agent 指标
AGENT_EXECUTION_COUNT = Counter(
    "saba_agent_execution_total",
    "Total number of agent executions",
    ["agent_id", "task_type", "status"]
)

AGENT_EXECUTION_DURATION = Histogram(
    "saba_agent_execution_duration_seconds",
    "Agent execution duration",
    ["agent_id", "task_type"],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0]
)

AGENT_TOOL_CALL_COUNT = Counter(
    "saba_agent_tool_call_total",
    "Total number of tool calls",
    ["agent_id", "tool_name", "status"]
)

# 系统指标
ACTIVE_SESSIONS = Gauge(
    "saba_active_sessions",
    "Number of active sessions"
)

RULE_CACHE_HITS = Counter(
    "saba_rule_cache_hits_total",
    "Total number of rule cache hits"
)

API_REQUEST_COUNT = Counter(
    "saba_api_request_total",
    "Total number of API requests",
    ["method", "endpoint", "status_code"]
)

API_REQUEST_DURATION = Histogram(
    "saba_api_request_duration_seconds",
    "API request duration",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5]
)

# 业务指标类
class BusinessMetrics:
    """业务指标收集"""
    
    @staticmethod
    def record_assessment(risk_level: str, duration_ms: float):
        ASSESSMENT_COUNT.labels(risk_level=risk_level, source="user").inc()
        ASSESSMENT_DURATION.observe(duration_ms / 1000)
    
    @staticmethod
    def record_feedback(feedback_type: str, source: str):
        FEEDBACK_COUNT.labels(feedback_type=feedback_type, source=source).inc()
    
    @staticmethod
    def record_notification(notif_type: str, priority: str, status: str):
        NOTIFICATION_COUNT.labels(
            notification_type=notif_type,
            priority=priority,
            status=status
        ).inc()
    
    @staticmethod
    def record_api_request(method: str, endpoint: str, status_code: int, duration_ms: float):
        API_REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
        API_REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration_ms / 1000)
    
    @staticmethod
    def set_active_sessions(count: int):
        ACTIVE_SESSIONS.set(count)

class AgentMetrics:
    """Agent 指标收集"""
    
    @staticmethod
    def record_execution(agent_id: str, task_type: str, status: str, duration_ms: float):
        AGENT_EXECUTION_COUNT.labels(
            agent_id=agent_id,
            task_type=task_type,
            status=status
        ).inc()
        AGENT_EXECUTION_DURATION.labels(
            agent_id=agent_id,
            task_type=task_type
        ).observe(duration_ms / 1000)
    
    @staticmethod
    def record_tool_call(agent_id: str, tool_name: str, status: str):
        AGENT_TOOL_CALL_COUNT.labels(
            agent_id=agent_id,
            tool_name=tool_name,
            status=status
        ).inc()
    
    @staticmethod
    def record_cache_hit():
        RULE_CACHE_HITS.inc()
```

### 3.2 指标收集中间件

```python
# src/monitoring/collectors.py

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import time

from .metrics import BusinessMetrics

class MetricsCollectorMiddleware(BaseHTTPMiddleware):
    """指标收集中间件"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()
        
        # 处理请求
        response = await call_next(request)
        
        # 计算耗时
        duration_ms = (time.time() - start_time) * 1000
        
        # 记录指标
        BusinessMetrics.record_api_request(
            method=request.method,
            endpoint=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms
        )
        
        return response
```

## 4. 追踪系统

### 4.1 追踪设计

```python
# src/monitoring/tracing.py

from typing import Optional, Dict, Any
from datetime import datetime
from contextvars import ContextVar
import uuid

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource

# 追踪上下文
trace_id: ContextVar[str] = ContextVar("trace_id", default="")
span_id: ContextVar[str] = ContextVar("span_id", default="")

class TracingManager:
    """追踪管理器"""
    
    def __init__(self):
        self.tracer = None
        self._setup_tracing()
    
    def _setup_tracing(self):
        """设置追踪"""
        
        # 创建资源
        resource = Resource.create({
            "service.name": "saba",
            "service.version": "1.0.0"
        })
        
        # 创建追踪器
        provider = TracerProvider(resource=resource)
        
        # 添加处理器
        processor = BatchSpanProcessor(
            # 配置导出器（Jaeger / OTLP）
        )
        provider.add_span_processor(processor)
        
        # 设置为全局追踪器
        trace.set_tracer_provider(provider)
        
        self.tracer = trace.get_tracer("saba")
    
    def create_span(
        self,
        name: str,
        attributes: Optional[Dict[str, Any]] = None,
        parent_span: Optional[Any] = None
    ):
        """创建跨度"""
        
        span = self.tracer.start_span(
            name=name,
            context=parent_span,
            attributes=attributes or {}
        )
        
        return span
    
    def add_span_attribute(self, key: str, value: Any):
        """添加跨度属性"""
        span = trace.get_current_span()
        if span:
            span.set_attribute(key, value)
    
    def record_exception(self, exception: Exception):
        """记录异常"""
        span = trace.get_current_span()
        if span:
            span.record_exception(exception)

class AgentTracer:
    """Agent 追踪器"""
    
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.tracing_manager = TracingManager()
    
    def start_trace(self, execution_id: str, task_type: str) -> Any:
        """开始追踪"""
        
        span = self.tracing_manager.create_span(
            name=f"agent.{self.agent_id}.{task_type}",
            attributes={
                "agent.id": self.agent_id,
                "execution.id": execution_id,
                "task.type": task_type
            }
        )
        
        return span
    
    def end_trace(self, span: Any, success: bool, error: Optional[str] = None):
        """结束追踪"""
        
        if error:
            span.set_attribute("error", True)
            span.set_attribute("error.message", error)
        
        span.set_attribute("success", success)
        span.end()

# 追踪中间件
async def trace_middleware(request: Request, call_next):
    """追踪中间件"""
    
    # 创建请求追踪
    trace_id_value = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
    
    with tracer.start_as_current_span(
        f"{request.method} {request.url.path}",
        attributes={
            "http.method": request.method,
            "http.url": str(request.url),
            "http.request_id": trace_id_value
        }
    ) as span:
        # 处理请求
        response = await call_next(request)
        
        # 添加响应属性
        span.set_attribute("http.status_code", response.status_code)
        
        return response
```

## 5. 仪表盘

### 5.1 仪表盘配置

```yaml
# grafana/dashboards/saba-overview.json

{
  "dashboard": {
    "title": "SABA 系统概览",
    "panels": [
      {
        "title": "评估请求量",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(saba_assessment_total[5m])) by (risk_level)",
            "legendFormat": "{{risk_level}}"
          }
        ]
      },
      {
        "title": "平均响应时间",
        "type": "gauge",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(saba_assessment_duration_seconds_bucket[5m])) * 1000",
            "unit": "ms"
          }
        ]
      },
      {
        "title": "Agent 执行成功率",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(saba_agent_execution_total{status='success'}) / sum(saba_agent_execution_total) * 100"
          }
        ]
      },
      {
        "title": "高风险评估趋势",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(saba_assessment_total{risk_level='high'}[1h]))",
            "legendFormat": "高风险"
          }
        ]
      }
    ]
  }
}
```

## 6. 告警规则

```yaml
# alerting/rules.yml

groups:
  - name: saba_alerts
    rules:
      - alert: HighRiskAssessmentSpike
        expr: sum(rate(saba_assessment_total{risk_level="high"}[5m])) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "高风险评估数量异常增加"
          description: "最近5分钟内高风险评估数量超过5次"

      - alert: AssessmentLatencyHigh
        expr: histogram_quantile(0.95, rate(saba_assessment_duration_seconds_bucket[5m])) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "评估响应时间过长"
          description: "P95响应时间超过2秒"

      - alert: AgentExecutionFailure
        expr: sum(rate(saba_agent_execution_total{status="failed"}[5m])) / sum(rate(saba_agent_execution_total[5m])) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Agent 执行失败率过高"
          description: "Agent 执行失败率超过10%"

      - alert: NotificationDeliveryFailed
        expr: sum(rate(saba_notification_total{status="failed"}[1h])) > 10
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "通知发送失败"
          description: "过去1小时内通知失败数超过10次"
```

## 7. 健康检查

```python
# src/monitoring/health.py

from typing import Dict, Any
from datetime import datetime
import asyncio

class HealthChecker:
    """健康检查器"""
    
    def __init__(self, db, redis, llm_client):
        self.db = db
        self.redis = redis
        self.llm_client = llm_client
    
    async def check_health(self) -> Dict[str, Any]:
        """执行健康检查"""
        
        checks = {}
        all_healthy = True
        
        # 数据库检查
        db_healthy = await self._check_database()
        checks["database"] = {"status": "healthy" if db_healthy else "unhealthy"}
        all_healthy = all_healthy and db_healthy
        
        # Redis 检查
        redis_healthy = await self._check_redis()
        checks["redis"] = {"status": "healthy" if redis_healthy else "unhealthy"}
        all_healthy = all_healthy and redis_healthy
        
        # LLM 服务检查
        llm_healthy = await self._check_llm()
        checks["llm_service"] = {"status": "healthy" if llm_healthy else "degraded"}
        
        return {
            "status": "healthy" if all_healthy else "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "checks": checks
        }
    
    async def _check_database(self) -> bool:
        """检查数据库连接"""
        try:
            await self.db.execute("SELECT 1")
            return True
        except Exception:
            return False
    
    async def _check_redis(self) -> bool:
        """检查 Redis 连接"""
        try:
            await self.redis.ping()
            return True
        except Exception:
            return False
    
    async def _check_llm(self) -> bool:
        """检查 LLM 服务"""
        try:
            # 发送简单请求检查服务可用性
            response = await self.llm_client.messages.create(
                model="claude-opus-4-7",
                max_tokens=1,
                messages=[{"role": "user", "content": "test"}]
            )
            return bool(response)
        except Exception:
            return False
```

---

这个技术设计文档涵盖了 SABA 系统的核心模块。Agent 系统部分是详细设计的重点，包括了完整的 Agent 架构、消息通信、状态管理、工具定义和执行流程。

需要我继续补充其他模块的技术设计吗？比如：
- 前端应用设计
- 部署架构
- 安全设计
- 测试策略
