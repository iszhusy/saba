# SPEC-6 — Safety Critic Constraint Layer

**版本**: v0.2
**状态**: Draft
**依赖**: SPEC-5（Risk Deliberation Agent）
**实现优先级**: P0（安全底线）

---

## 6.1 目标

定义一个 Safety Critic（安全约束层），用于：

1. **审查** Risk Deliberation 或 Triage 输出
2. **检查**是否有低估风险的情况
3. **验证**必要建议是否完整
4. **阻止**危险建议（如药物剂量、停药）
5. **向最终回复层输出约束，而不是直接替系统回复**

**关键约束**：这是 Executive 流程中的安全约束步骤 / tool，不重新做完整临床判断，不发起复杂交互，不维护独立状态机。它输出的是 constraints，不是最终用户答复。

---

## 6.2 输入类型

```typescript
interface SafetyCriticInput {
  deliberation_output: RiskDeliberationOutput;
  user_message: string;
  framing_output: IntentFramingOutput;
  draft_response?: {
    mode: "clarify" | "provisional_assessment" | "conclusive_assessment" | "escalation" | "route_out";
    message: string;
  };
  context?: {
    is_followup: boolean;
    previous_risk_level?: "high" | "medium" | "low";
    is_possible_emergency: boolean;
  };
}
```

---

## 6.3 输出类型

```typescript
interface SafetyCriticOutput {
  verdict: "pass" | "revise" | "block";
  violations: SafetyViolation[];

  constraints: {
    required_actions: string[];
    forbidden_claims: string[];
    required_warning_signals: string[];
    risk_floor?: "high" | "medium" | "low";
    rewrite_reason?: string;
  };

  audit: {
    checks_performed: string[];
    violations_found: number;
    model_name: string;
    prompt_version: string;
  };
}

interface SafetyViolation {
  type:
    | "risk_downgrade"
    | "missing_emergency_action"
    | "missing_team_contact"
    | "unsafe_medication_advice"
    | "incomplete_warning_signals"
    | "confidence_mismatch"
    | "emergency_keywords_missing";
  severity: "critical" | "high" | "medium";
  description: string;
  location: string;
  required_correction?: string;
}
```

---

## 6.4 审查规则（硬性约束）

```typescript
const SAFETY_RULES: SafetyRule[] = [
  "HIGH risk must include immediate emergency action",
  "HIGH risk must include emergency keywords",
  "MEDIUM risk must include care-team contact",
  "No medication dosage advice",
  "No stop/change medication advice",
  "HIGH risk must include warning signals"
];
```

规则执行后的产物示例：

```json
{
  "verdict": "revise",
  "violations": [
    {
      "type": "missing_emergency_action",
      "severity": "critical",
      "description": "高风险必须建议立即就医或拨打急救电话",
      "location": "draft_response.message",
      "required_correction": "加入立即就医或拨打 120 的行动建议"
    }
  ],
  "constraints": {
    "required_actions": ["立即就医或拨打120"],
    "forbidden_claims": [],
    "required_warning_signals": ["如呼吸困难加重或意识改变，立即就医"],
    "risk_floor": "high",
    "rewrite_reason": "当前草稿缺少高风险必须动作"
  }
}
```

---

## 6.5 Prompt 规约

```
你是 SABA 的 Safety Critic。

## 你的职责
你不是最终回复者。
你的任务是审查当前判断和回复草稿，并输出必须满足的安全约束。

## 你的输出
1. verdict: pass / revise / block
2. violations: 发现的问题列表
3. constraints.required_actions
4. constraints.forbidden_claims
5. constraints.required_warning_signals
6. constraints.risk_floor
7. constraints.rewrite_reason

## 关键要求
- 不直接写最终给用户的话
- 只告诉主对话代理必须保留什么、不能说什么、最低风险层级是什么
```

---

## 6.6 验收标准

### 安全验收
- [ ] 所有 critical violation 被阻止或强制重写
- [ ] HIGH 响应一定包含就医建议
- [ ] 药物建议被完全阻止

### 功能验收
- [ ] 能输出 required_actions / forbidden_claims / risk_floor
- [ ] 不再由安全层直接产最终用户文案
- [ ] 能与 Executive 的 constrained synthesis 配合

---

## 6.7 与 Executive 的协作

```typescript
const deliberation = await riskDeliberation.run(input);
const draft = responseComposer.compose(deliberation);
const critique = await safetyCritic.review({ deliberation_output: deliberation, draft_response: draft });
const final = responseComposer.composeWithConstraints(draft, critique.constraints);
```

核心目标：
- Safety 仍然拥有 hard veto
- 但最终用户体验仍然保持单一、自然、完整的发言主体
