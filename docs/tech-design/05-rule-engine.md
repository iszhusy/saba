# 规则引擎详细设计

> 文档版本：v3.0（2026-05-16）
> 实现状态：已实现（`src/tools/risk-assessor.ts`）

## 1. 规则引擎架构

> 注：当前实现采用**简化版规则引擎**，直接内置于 `RiskAssessor` 类中，无需独立服务。

### 1.1 核心组件

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RiskAssessor (src/tools/risk-assessor.ts)          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐        │
│  │   Rule       │    │    Matcher    │    │   Evaluator  │        │
│  │   Storage    │───▶│   (匹配)     │───▶│   (评估)     │        │
│  │   内置常量   │    │  正则匹配     │    │  风险融合     │        │
│  └───────────────┘    └───────────────┘    └───────────────┘        │
│         │                                           │                  │
│         │              ┌───────────────┐          │                  │
│         └─────────────▶│   Context     │◀─────────┘                  │
│                        │   Manager     │                             │
│                        │  SymptomParser │                             │
│                        └───────────────┘                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 规则结构

```typescript
// src/tools/risk-assessor.ts

// 高风险规则
interface RiskRule {
  id: string;           // 如 "HR-001"
  name: string;         // 如 "呼吸困难/胸痛"
  trigger_terms: string[];  // 触发关键词
  severity: 'high' | 'medium' | 'low';
  action?: string;      // 即时行动建议
}

// 组合规则
interface CombinationRule {
  id: string;
  required_symptoms: string[];  // 必需同时出现的症状
  from_level: RiskLevel;
  to_level: RiskLevel;
  reason: string;
}
```
        
        if field_value is None:
            return False
        
        # 根据操作符评估
        if self.operator == ConditionOperator.CONTAINS:
            if isinstance(field_value, str):
                return (self.value.lower() in field_value.lower()) if not self.case_sensitive else (self.value in field_value)
            elif isinstance(field_value, list):
                return any(self.value.lower() in str(v).lower() for v in field_value)
            return False
        
        elif self.operator == ConditionOperator.EQUALS:
            if self.case_sensitive:
                return field_value == self.value
            return str(field_value).lower() == str(self.value).lower()
        
        elif self.operator == ConditionOperator.GREATER_THAN:
            return float(field_value) > float(self.value)
        
        elif self.operator == ConditionOperator.LESS_THAN:
            return float(field_value) < float(self.value)
        
        elif self.operator == ConditionOperator.BETWEEN:
            return self.value[0] <= float(field_value) <= self.value[1]
        
        elif self.operator == ConditionOperator.REGEX:
            import re
            return bool(re.search(self.value, str(field_value), re.IGNORECASE))
        
        return False
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """获取嵌套字段值"""
        keys = path.split(".")
        value = data
        
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key)
            elif isinstance(value, list) and key.isdigit():
                value = value[int(key)]
            else:
                return None
        
        return value

@dataclass
class RuleAction:
    """规则动作"""
    action_type: str           # 'set_risk_level' | 'set_confidence' | 'add_warning'
    params: Dict[str, Any]     # 动作参数

@dataclass
class Rule:
    """风险评估规则"""
    rule_id: str
    name: str
    description: str
    
    # 条件
    conditions: List[RuleCondition]  # AND 关系
    condition_logic: str = "AND"       # 'AND' | 'OR'
    
    # 结果
    risk_level: RiskLevel
    confidence: float = 0.8           # 置信度 0-1
    priority: int = 0                  # 优先级，数字越小优先级越高
    
    # 动作
    actions: List[RuleAction] = Field(default_factory=list)
    
    # 元数据
    source: str                        # 依据来源
    reasoning_template: str            # 推理模板
    category: str = "default"         # 规则分类
    
    # 状态
    status: RuleStatus = RuleStatus.ACTIVE
    version: str = "1.0"
    
    # 特殊标记
    requires_verification: bool = False  # 高风险规则需要验证
    applicable_phases: List[str] = Field(default_factory=list)  # 适用的治疗阶段
    
    def evaluate(self, context: Dict[str, Any]) -> bool:
        """评估规则是否匹配"""
        if self.status != RuleStatus.ACTIVE:
            return False
        
        # 检查治疗阶段适用性
        if self.applicable_phases:
            current_phase = context.get("treatment_phase", "")
            if current_phase and current_phase not in self.applicable_phases:
                return False
        
        # 评估条件
        if self.condition_logic == "AND":
            return all(c.evaluate(context) for c in self.conditions)
        else:  # OR
            return any(c.evaluate(context) for c in self.conditions)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.rule_id,
            "name": self.name,
            "risk_level": self.risk_level.value,
            "confidence": self.confidence,
            "source": self.source,
            "priority": self.priority
        }

@dataclass
class RuleSet:
    """规则集"""
    rules: List[Rule]
    version: str
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def get_active_rules(self) -> List[Rule]:
        """获取所有活跃规则"""
        return [r for r in self.rules if r.status == RuleStatus.ACTIVE]
    
    def get_rules_by_level(self, level: RiskLevel) -> List[Rule]:
        """获取指定风险等级的规则"""
        return [r for r in self.get_active_rules() if r.risk_level == level]
```

## 2. 规则引擎实现

```python
# src/services/rule_engine/engine.py

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
import logging

from .models import Rule, RuleSet, RiskLevel, RuleCondition, RuleAction
from .storage import RuleStorage

logger = logging.getLogger(__name__)

@dataclass
class EvaluationResult:
    """评估结果"""
    triggered_rules: List[Dict[str, Any]]
    final_risk_level: RiskLevel
    final_risk_score: float
    reasoning: str
    context: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "triggered_rules": self.triggered_rules,
            "risk_level": self.final_risk_level.value,
            "risk_score": self.final_risk_score,
            "reasoning": self.reasoning,
            "symptoms": [r["name"] for r in self.triggered_rules]
        }

class RuleEngine:
    """
    规则引擎
    
    功能:
    1. 规则加载和缓存
    2. 规则匹配和评估
    3. 风险等级计算
    4. 推理过程生成
    5. 规则版本管理
    """

    def __init__(self, storage: RuleStorage):
        self.storage = storage
        self._rules_cache: Optional[RuleSet] = None
        self._cache_version: Optional[str] = None
    
    async def load_rules(self, version: Optional[str] = None) -> RuleSet:
        """加载规则"""
        if version is None:
            version = await self.storage.get_active_version()
        
        # 检查缓存
        if self._rules_cache and self._cache_version == version:
            return self._rules_cache
        
        # 从存储加载
        rules_data = await self.storage.get_rules(version)
        
        # 解析规则
        rules = [self._parse_rule(r) for r in rules_data.get("rules", [])]
        
        rule_set = RuleSet(
            rules=rules,
            version=version,
            description=rules_data.get("description", "")
        )
        
        # 更新缓存
        self._rules_cache = rule_set
        self._cache_version = version
        
        logger.info(f"Loaded {len(rules)} rules, version {version}")
        
        return rule_set
    
    async def evaluate(
        self,
        input_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> EvaluationResult:
        """
        评估输入数据
        
        输入格式:
        {
            "input": "恶心想吐，已经2天了",
            "symptoms": [{"name": "恶心呕吐", "confidence": 0.95}],
            "treatment_phase": "chemotherapy_cycle_2"
        }
        
        评估策略:
        1. 高风险规则优先匹配
        2. 遇到高风险规则直接返回
        3. 中风险规则累计
        4. 组合规则最后检查
        """
        
        context = context or {}
        
        # 合并输入和上下文
        evaluation_context = {**input_data, **context}
        
        # 加载规则
        rule_set = await self.load_rules()
        
        # 获取活跃规则
        active_rules = rule_set.get_active_rules()
        
        # 按优先级排序（高优先级先匹配）
        sorted_rules = sorted(active_rules, key=lambda r: r.priority)
        
        triggered_rules = []
        risk_indicators = {"high": [], "medium": [], "low": []}
        
        # 阶段 1: 高风险规则匹配
        high_risk_rules = [r for r in sorted_rules if r.risk_level == RiskLevel.HIGH]
        for rule in high_risk_rules:
            if rule.evaluate(evaluation_context):
                triggered_rules.append(rule)
                risk_indicators["high"].append(rule)
                
                logger.info(f"High risk rule triggered: {rule.rule_id}")
                
                # 高风险规则触发后直接返回
                return self._build_result(
                    triggered_rules=[r.to_dict() for r in triggered_rules],
                    final_level=RiskLevel.HIGH,
                    evaluation_context=evaluation_context
                )
        
        # 阶段 2: 中风险规则匹配
        medium_risk_rules = [r for r in sorted_rules if r.risk_level == RiskLevel.MEDIUM]
        for rule in medium_risk_rules:
            if rule.evaluate(evaluation_context):
                triggered_rules.append(rule)
                risk_indicators["medium"].append(rule)
        
        # 阶段 3: 低风险规则匹配（如果没有中风险匹配）
        if not triggered_rules:
            low_risk_rules = [r for r in sorted_rules if r.risk_level == RiskLevel.LOW]
            for rule in low_risk_rules:
                if rule.evaluate(evaluation_context):
                    triggered_rules.append(rule)
                    risk_indicators["low"].append(rule)
        
        # 阶段 4: 确定最终风险等级
        if risk_indicators["medium"]:
            final_level = RiskLevel.MEDIUM
        elif risk_indicators["low"]:
            final_level = RiskLevel.LOW
        else:
            # 无规则匹配时的默认处理
            final_level = RiskLevel.LOW
        
        return self._build_result(
            triggered_rules=[r.to_dict() for r in triggered_rules],
            final_level=final_level,
            evaluation_context=evaluation_context
        )
    
    async def evaluate_with_context_adjustment(
        self,
        input_data: Dict[str, Any],
        user_context: Optional[Dict[str, Any]] = None
    ) -> EvaluationResult:
        """
        带上下文调整的评估
        
        上下文可能调整风险等级:
        - 化疗后1-7天：发热/出血风险升级
        - 手术后：伤口相关症状风险升级
        """
        
        base_result = await self.evaluate(input_data, user_context)
        
        # 应用上下文调整
        adjusted_result = self._apply_context_adjustments(
            base_result,
            user_context or {}
        )
        
        return adjusted_result
    
    def _apply_context_adjustments(
        self,
        base_result: EvaluationResult,
        user_context: Dict[str, Any]
    ) -> EvaluationResult:
        """应用上下文调整规则"""
        
        treatment_phase = user_context.get("treatment_phase", "")
        
        # 上下文调整映射
        context_adjustments = {
            "chemotherapy_day_1_to_7": {
                "symptoms": ["发热", "出血", "口腔溃疡"],
                "upgrade_from": "low",
                "upgrade_to": "medium"
            },
            "post_surgery_week_1": {
                "symptoms": ["伤口疼痛", "红肿", "发热"],
                "upgrade_from": "low",
                "upgrade_to": "medium"
            }
        }
        
        # 检查是否需要调整
        for phase, adjustment in context_adjustments.items():
            if phase in treatment_phase:
                for rule in base_result.triggered_rules:
                    rule_name = rule.get("name", "").lower()
                    
                    for target_symptom in adjustment["symptoms"]:
                        if target_symptom.lower() in rule_name:
                            if rule.get("risk_level") == adjustment["upgrade_from"]:
                                # 升级风险等级
                                rule["risk_level"] = adjustment["upgrade_to"]
                                rule["context_adjusted"] = True
                                rule["adjustment_reason"] = f"治疗阶段 {phase} 需要更谨慎"
                                
                                logger.info(
                                    f"Context adjustment: {rule['id']} upgraded from "
                                    f"{adjustment['upgrade_from']} to {adjustment['upgrade_to']}"
                                )
        
        # 重新计算最终等级
        risk_levels = {"high": 3, "medium": 2, "low": 1}
        max_level = max(
            risk_levels.get(r.get("risk_level", "low"), 1)
            for r in base_result.triggered_rules
        ) if base_result.triggered_rules else 1
        
        final_level = RiskLevel.HIGH if max_level >= 3 else (
            RiskLevel.MEDIUM if max_level >= 2 else RiskLevel.LOW
        )
        
        # 重新计算分数
        risk_score = self._calculate_risk_score(base_result.triggered_rules, final_level)
        
        return EvaluationResult(
            triggered_rules=base_result.triggered_rules,
            final_risk_level=final_level,
            final_risk_score=risk_score,
            reasoning=base_result.reasoning,
            context=base_result.context
        )
    
    def _build_result(
        self,
        triggered_rules: List[Dict[str, Any]],
        final_level: RiskLevel,
        evaluation_context: Dict[str, Any]
    ) -> EvaluationResult:
        """构建评估结果"""
        
        # 计算风险分数
        risk_score = self._calculate_risk_score(triggered_rules, final_level)
        
        # 生成推理过程
        reasoning = self._generate_reasoning(triggered_rules, evaluation_context)
        
        return EvaluationResult(
            triggered_rules=triggered_rules,
            final_risk_level=final_level,
            final_risk_score=risk_score,
            reasoning=reasoning,
            context=evaluation_context
        )
    
    def _calculate_risk_score(
        self,
        triggered_rules: List[Dict[str, Any]],
        final_level: RiskLevel
    ) -> float:
        """计算风险分数"""
        
        # 基础分数
        base_scores = {
            RiskLevel.HIGH: 85,
            RiskLevel.MEDIUM: 55,
            RiskLevel.LOW: 25
        }
        
        base_score = base_scores.get(final_level, 25)
        
        # 根据规则匹配情况调整
        if triggered_rules:
            avg_confidence = sum(
                r.get("confidence", 0.8) for r in triggered_rules
            ) / len(triggered_rules)
            
            score_adjustment = avg_confidence * 10
            final_score = min(base_score + score_adjustment, 100)
        else:
            final_score = base_score
        
        return round(final_score, 1)
    
    def _generate_reasoning(
        self,
        triggered_rules: List[Dict[str, Any]],
        context: Dict[str, Any]
    ) -> str:
        """生成推理过程"""
        
        if not triggered_rules:
            return "未匹配到特定规则，根据整体情况评估为低风险。"
        
        reasoning_parts = []
        
        for rule in triggered_rules:
            template = rule.get("reasoning_template", "根据{症状}判断{风险等级}")
            
            symptom = rule.get("name", "")
            risk_level = {
                "high": "高风险",
                "medium": "中风险", 
                "low": "低风险"
            }.get(rule.get("risk_level", "low"), "风险")
            
            reasoning_parts.append(
                template.format(
                    症状=symptom,
                    风险等级=risk_level,
                    来源=rule.get("source", "")
                )
            )
        
        return "；".join(reasoning_parts)
    
    def _parse_rule(self, rule_data: Dict[str, Any]) -> Rule:
        """解析规则数据"""
        
        conditions = [
            RuleCondition(
                field=c["field"],
                operator=c["operator"],
                value=c["value"],
                case_sensitive=c.get("case_sensitive", False)
            )
            for c in rule_data.get("conditions", [])
        ]
        
        actions = [
            RuleAction(
                action_type=a["type"],
                params=a.get("params", {})
            )
            for a in rule_data.get("actions", [])
        ]
        
        return Rule(
            rule_id=rule_data["id"],
            name=rule_data["name"],
            description=rule_data.get("description", ""),
            conditions=conditions,
            condition_logic=rule_data.get("condition_logic", "AND"),
            risk_level=RiskLevel(rule_data["risk_level"]),
            confidence=rule_data.get("confidence", 0.8),
            priority=rule_data.get("priority", 0),
            actions=actions,
            source=rule_data.get("source", ""),
            reasoning_template=rule_data.get("reasoning_template", ""),
            category=rule_data.get("category", "default"),
            status=rule_data.get("status", "active"),
            version=rule_data.get("version", "1.0"),
            requires_verification=rule_data.get("requires_verification", False),
            applicable_phases=rule_data.get("applicable_phases", [])
        )
    
    async def invalidate_cache(self):
        """使缓存失效（规则更新后调用）"""
        self._rules_cache = None
        self._cache_version = None
        logger.info("Rule cache invalidated")
```

## 3. 规则存储

```python
# src/services/rule_engine/storage.py

from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import logging

from ...core.database import AsyncSessionLocal
from ..models import RuleVersion

logger = logging.getLogger(__name__)

class RuleStorage:
    """
    规则存储
    
    支持:
    1. PostgreSQL 存储（生产环境）
    2. JSON 文件存储（开发/测试环境）
    3. Redis 缓存
    """

    def __init__(self, db_session=None):
        self.db = db_session
        self._redis = None  # 可选：Redis 缓存
    
    async def get_active_version(self) -> str:
        """获取当前活跃的规则版本"""
        if self.db:
            # 从数据库获取
            result = await self.db.execute(
                "SELECT version FROM rule_versions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
            )
            row = result.fetchone()
            return row[0] if row else "v1.0.0"
        
        # 默认版本
        return "v1.0.0"
    
    async def get_rules(self, version: str) -> Dict[str, Any]:
        """获取指定版本的规则"""
        
        # 尝试 Redis 缓存
        if self._redis:
            cached = await self._redis.get(f"rules:{version}")
            if cached:
                return json.loads(cached)
        
        if self.db:
            # 从数据库获取
            result = await self.db.execute(
                "SELECT rules, description FROM rule_versions WHERE version = %s",
                (version,)
            )
            row = result.fetchone()
            
            if row:
                rules_data = {
                    "rules": row[0],
                    "description": row[1]
                }
                
                # 缓存到 Redis
                if self._redis:
                    await self._redis.setex(
                        f"rules:{version}",
                        3600,  # 1小时过期
                        json.dumps(rules_data)
                    )
                
                return rules_data
        
        # 返回默认规则
        return self._get_default_rules()
    
    async def save_rules(
        self,
        version: str,
        rules: List[Dict[str, Any]],
        description: str = "",
        status: str = "draft"
    ) -> bool:
        """保存规则版本"""
        
        if not self.db:
            logger.warning("No database connection, rules not persisted")
            return False
        
        # 统计数据
        total = len(rules)
        high_count = sum(1 for r in rules if r.get("risk_level") == "high")
        medium_count = sum(1 for r in rules if r.get("risk_level") == "medium")
        low_count = sum(1 for r in rules if r.get("risk_level") == "low")
        
        # 插入/更新记录
        await self.db.execute("""
            INSERT INTO rule_versions (version, rules, description, status, total_rules, high_risk_rules, medium_risk_rules, low_risk_rules, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (version) DO UPDATE SET
                rules = EXCLUDED.rules,
                description = EXCLUDED.description,
                status = EXCLUDED.status,
                updated_at = NOW()
        """, (version, json.dumps(rules), description, status, total, high_count, medium_count, low_count, datetime.utcnow()))
        
        # 使缓存失效
        if self._redis:
            await self._redis.delete(f"rules:{version}")
        
        logger.info(f"Saved rules version {version}")
        
        return True
    
    async def activate_version(self, version: str, activated_by: str) -> bool:
        """激活规则版本"""
        
        if not self.db:
            return False
        
        # 停用所有版本
        await self.db.execute(
            "UPDATE rule_versions SET status = 'deprecated' WHERE status = 'active'"
        )
        
        # 激活指定版本
        await self.db.execute(
            "UPDATE rule_versions SET status = 'active', deployed_at = %s, deployed_by = %s WHERE version = %s",
            (datetime.utcnow(), activated_by, version)
        )
        
        # 使缓存失效
        if self._redis:
            await self._redis.delete_pattern("rules:*")
        
        logger.info(f"Activated rules version {version} by {activated_by}")
        
        return True
    
    def _get_default_rules(self) -> Dict[str, Any]:
        """获取默认规则"""
        
        return {
            "version": "v1.0.0",
            "description": "初始规则集",
            "rules": [
                # 高风险规则
                {
                    "id": "HR-001",
                    "name": "呼吸困难/胸痛",
                    "conditions": [
                        {"field": "input", "operator": "contains", "value": "呼吸困难"},
                        {"field": "input", "operator": "contains", "value": "胸闷"},
                        {"field": "input", "operator": "contains", "value": "胸痛"}
                    ],
                    "condition_logic": "OR",
                    "risk_level": "high",
                    "confidence": 0.95,
                    "priority": 1,
                    "source": "NCI 炎症性乳腺癌症状指南",
                    "reasoning_template": "您描述的{症状}属于危急症状，需要立即就医",
                    "requires_verification": True
                },
                {
                    "id": "HR-002",
                    "name": "高热持续",
                    "conditions": [
                        {"field": "input", "operator": "contains", "value": "发烧"},
                        {"field": "input", "operator": "contains", "value": "发热"}
                    ],
                    "condition_logic": "AND",
                    "risk_level": "high",
                    "confidence": 0.90,
                    "priority": 1,
                    "source": "化疗副作用管理指南",
                    "reasoning_template": "您描述的高热可能表示感染，需要紧急评估"
                },
                # 中风险规则
                {
                    "id": "MR-001",
                    "name": "症状持续不缓解",
                    "conditions": [
                        {"field": "input", "operator": "contains", "value": "持续"},
                        {"field": "input", "operator": "contains", "value": "几天"}
                    ],
                    "condition_logic": "AND",
                    "risk_level": "medium",
                    "confidence": 0.75,
                    "priority": 2,
                    "source": "常见不良反应监测指南"
                },
                {
                    "id": "MR-002",
                    "name": "恶心呕吐影响进食",
                    "conditions": [
                        {"field": "input", "operator": "contains", "value": "恶心"},
                        {"field": "input", "operator": "contains", "value": "吃不下"}
                    ],
                    "condition_logic": "AND",
                    "risk_level": "medium",
                    "confidence": 0.85,
                    "priority": 2,
                    "source": "化疗副作用管理指南"
                },
                # 低风险规则
                {
                    "id": "LR-001",
                    "name": "轻微恶心",
                    "conditions": [
                        {"field": "input", "operator": "contains", "value": "轻微恶心"}
                    ],
                    "risk_level": "low",
                    "confidence": 0.80,
                    "priority": 3,
                    "source": "化疗常见副作用"
                },
                {
                    "id": "LR-002",
                    "name": "疲劳",
                    "conditions": [
                        {"field": "input", "operator": "contains", "value": "疲劳"},
                        {"field": "input", "operator": "contains", "value": "乏力"}
                    ],
                    "risk_level": "low",
                    "confidence": 0.85,
                    "priority": 3,
                    "source": "治疗常见副作用"
                }
            ]
        }
```

## 4. 规则版本管理

```python
# src/services/rule_engine/version_manager.py

from typing import Dict, Any, List, Optional
from datetime import datetime
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class VersionChange:
    """版本变更"""
    change_type: str  # 'added' | 'removed' | 'modified'
    rule_id: str
    before: Optional[Dict] = None
    after: Optional[Dict] = None
    reason: str = ""

class VersionManager:
    """规则版本管理器"""
    
    def __init__(self, storage: RuleStorage):
        self.storage = storage
    
    async def create_new_version(
        self,
        base_version: str,
        changes: List[VersionChange],
        description: str = "",
        reason: str = ""
    ) -> str:
        """创建新版本"""
        
        # 获取基础版本
        base_rules = await self.storage.get_rules(base_version)
        rules = base_rules.get("rules", [])
        
        # 应用变更
        for change in changes:
            if change.change_type == "added":
                rules.append(change.after)
            elif change.change_type == "removed":
                rules = [r for r in rules if r.get("id") != change.rule_id]
            elif change.change_type == "modified":
                for i, r in enumerate(rules):
                    if r.get("id") == change.rule_id:
                        rules[i] = change.after
                        break
        
        # 生成新版本号
        new_version = self._increment_version(base_version)
        
        # 保存新版本
        await self.storage.save_rules(
            version=new_version,
            rules=rules,
            description=description,
            status="draft"
        )
        
        # 记录变更日志
        await self._log_changes(base_version, new_version, changes)
        
        logger.info(f"Created new rule version {new_version}")
        
        return new_version
    
    async def rollback_version(self, target_version: str) -> bool:
        """回滚到指定版本"""
        
        current_version = await self.storage.get_active_version()
        
        # 停用当前版本
        await self.storage.activate_version(
            current_version,
            activated_by="system_rollback"
        )
        
        # 激活目标版本
        await self.storage.activate_version(
            target_version,
            activated_by="system_rollback"
        )
        
        logger.info(f"Rolled back from {current_version} to {target_version}")
        
        return True
    
    async def get_version_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """获取版本历史"""
        
        # 从数据库获取
        # 返回版本列表，包含创建时间、状态、变更摘要等
        
        return []
    
    def _increment_version(self, version: str) -> str:
        """递增版本号"""
        
        parts = version.lstrip("v").split(".")
        
        if len(parts) >= 2:
            # 递增次版本号
            parts[-1] = str(int(parts[-1]) + 1)
        else:
            parts.append("1")
        
        return "v" + ".".join(parts)
    
    async def _log_changes(
        self,
        old_version: str,
        new_version: str,
        changes: List[VersionChange]
    ):
        """记录变更日志"""
        
        # 保存到数据库
        # rule_audit_logs 表
        
        logger.info(
            f"Version change: {old_version} -> {new_version}, "
            f"{len(changes)} rules changed"
        )
```

## 5. 规则更新流程

```python
# src/services/rule_engine/update_workflow.py

from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class UpdateStatus(str, Enum):
    """更新状态"""
    PROPOSED = "proposed"
    REVIEWING = "reviewing"
    APPROVED = "approved"
    REJECTED = "rejected"
    TESTING = "testing"
    DEPLOYED = "deployed"

@dataclass
class RuleUpdate:
    """规则更新"""
    update_id: str
    rule_id: str
    change_type: str  # 'add' | 'modify' | 'remove'
    new_rule: Optional[Dict] = None
    old_rule: Optional[Dict] = None
    reason: str
    source: str  # 'ai_suggestion' | 'human' | 'feedback_analysis'
    status: UpdateStatus = UpdateStatus.PROPOSED
    proposed_by: str = "system"
    proposed_at: datetime = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    test_results: Optional[Dict] = None

class RuleUpdateWorkflow:
    """规则更新工作流"""
    
    def __init__(
        self,
        storage: RuleStorage,
        version_manager: VersionManager
    ):
        self.storage = storage
        self.version_manager = version_manager
        self.pending_updates: List[RuleUpdate] = []
    
    async def propose_update(self, update: RuleUpdate) -> str:
        """提议规则更新"""
        
        update.proposed_at = datetime.utcnow()
        self.pending_updates.append(update)
        
        logger.info(f"Rule update proposed: {update.rule_id}")
        
        return update.update_id
    
    async def submit_for_review(self, update_id: str) -> bool:
        """提交审核"""
        
        update = self._find_update(update_id)
        if not update:
            return False
        
        update.status = UpdateStatus.REVIEWING
        
        logger.info(f"Rule update submitted for review: {update_id}")
        
        return True
    
    async def approve_update(
        self,
        update_id: str,
        reviewed_by: str,
        comment: Optional[str] = None
    ) -> bool:
        """批准更新"""
        
        update = self._find_update(update_id)
        if not update:
            return False
        
        update.status = UpdateStatus.APPROVED
        update.reviewed_by = reviewed_by
        update.reviewed_at = datetime.utcnow()
        
        logger.info(f"Rule update approved: {update_id} by {reviewed_by}")
        
        return True
    
    async def test_update(self, update_id: str) -> Dict[str, Any]:
        """测试更新"""
        
        update = self._find_update(update_id)
        if not update:
            return {"status": "error", "message": "Update not found"}
        
        # 执行离线测试
        test_results = await self._run_offline_tests(update)
        
        update.test_results = test_results
        update.status = UpdateStatus.TESTING
        
        return test_results
    
    async def deploy_update(self, update_id: str) -> bool:
        """部署更新"""
        
        update = self._find_update(update_id)
        if not update or update.status != UpdateStatus.APPROVED:
            return False
        
        # 获取当前活跃版本
        current_version = await self.storage.get_active_version()
        
        # 创建变更列表
        changes = [self._update_to_change(update)]
        
        # 创建新版本
        new_version = await self.version_manager.create_new_version(
            base_version=current_version,
            changes=changes,
            description=f"Rule update: {update.rule_id}",
            reason=update.reason
        )
        
        # 激活新版本
        await self.storage.activate_version(
            version=new_version,
            activated_by=update.proposed_by
        )
        
        update.status = UpdateStatus.DEPLOYED
        
        logger.info(f"Rule update deployed: {update_id}, version {new_version}")
        
        return True
    
    async def batch_deploy(self, update_ids: List[str]) -> Dict[str, Any]:
        """批量部署"""
        
        results = {"success": [], "failed": []}
        
        for update_id in update_ids:
            success = await self.deploy_update(update_id)
            if success:
                results["success"].append(update_id)
            else:
                results["failed"].append(update_id)
        
        return results
    
    async def auto_approve_feedback_driven_update(
        self,
        feedback_analysis: Dict[str, Any]
    ) -> Optional[str]:
        """
        自动批准由反馈驱动的更新
        
        适用于:
        - 高置信度的规则修正
        - 低风险规则的轻微调整
        """
        
        confidence = feedback_analysis.get("confidence", 0)
        change_type = feedback_analysis.get("change_type", "modify")
        
        # 仅自动批准高置信度、低风险变更
        if confidence < 0.9:
            return None
        
        if change_type == "modify":
            # 只自动批准低风险规则修改
            if feedback_analysis.get("risk_level") != "low":
                return None
        
        update = RuleUpdate(
            update_id=self._generate_id(),
            rule_id=feedback_analysis.get("rule_id"),
            change_type=change_type,
            new_rule=feedback_analysis.get("new_rule"),
            old_rule=feedback_analysis.get("old_rule"),
            reason=f"Auto-approved: {feedback_analysis.get('reason', 'Feedback driven')}",
            source="feedback_analysis"
        )
        
        # 直接提交审核并批准
        await self.propose_update(update)
        await self.submit_for_review(update.update_id)
        await self.approve_update(update.update_id, "system")
        
        # 自动部署
        await self.deploy_update(update.update_id)
        
        return update.update_id
    
    def _find_update(self, update_id: str) -> Optional[RuleUpdate]:
        """查找更新"""
        for update in self.pending_updates:
            if update.update_id == update_id:
                return update
        return None
    
    def _update_to_change(self, update: RuleUpdate) -> VersionChange:
        """将更新转换为变更"""
        return VersionChange(
            change_type=update.change_type,
            rule_id=update.rule_id,
            before=update.old_rule,
            after=update.new_rule,
            reason=update.reason
        )
    
    def _run_offline_tests(self, update: RuleUpdate) -> Dict[str, Any]:
        """运行离线测试"""
        
        # 简化实现：模拟测试结果
        return {
            "passed": True,
            "test_cases_run": 10,
            "test_cases_passed": 9,
            "accuracy": 0.90,
            "coverage": 0.85
        }
    
    def _generate_id(self) -> str:
        """生成唯一ID"""
        import uuid
        return str(uuid.uuid4())
```
