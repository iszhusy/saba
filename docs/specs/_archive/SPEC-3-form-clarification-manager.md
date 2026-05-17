# SPEC-3 — Structured Intake & Clarification Planning

**版本**: v0.3
**状态**: Draft
**依赖**: SPEC-1（Intent Framing Agent）
**实现优先级**: P1（用户体验核心）

---

## 3.1 目标

Structured Intake & Clarification Planning 是信息收集层，负责：

1. **结构化收集**：根据当前 symptom frame 生成一次性表单或结构化 UI
2. **表单解析**：把用户填写结果转为推理可用的 episode facts
3. **澄清规划**：在仍有关键不确定性时，选择 1-2 个最高信息增益的问题
4. **收集状态维护**：记录已收集信息、已问问题、剩余关键未知项

**核心原则**：
- 表单是主路径（严谨感、一次性收集）
- 澄清是高价值补充，不是碎片化追问
- 规划器输出的是“问什么、为什么问、回答会改变什么”，不是最终用户文案
- 如果最后仍不足，可以停止下结论，而不是硬给确定性结果

---

## 3.2 交互模式

```
用户输入
    │
    ▼
Intent Framing Agent → interaction_mode: "structured_intake" | "clarify" | "assess"
    │
    ├─ structured_intake
    │      ▼
    │   Structured Intake Manager → 生成表单
    │      ▼
    │   用户填写并提交
    │      ▼
    │   Form Parser → 结构化事实 + 缺口摘要
    │
    └─ clarify / assess
           ▼
Conversation Executive Agent
           ▼
Clarification Planner（如仍存在关键未知项）
           ▼
返回 clarification plan / provisional / insufficient_for_assessment
```

---

## 3.3 Structured Intake Manager

### 3.3.1 输入输出

```typescript
interface StructuredIntakeInput {
  framing: IntentFramingOutput;
  episode_context?: EpisodeContext;
}

interface StructuredIntakeOutput {
  intake_mode: "form" | "quick_choices";
  form_id: string;
  title: string;
  description: string;
  sections: FormSection[];
  completion_goal: string;
}
```

### 3.3.2 设计要求

- 基础字段仍包含：体温、持续时间、红旗检查
- 症状字段由 `framing.extracted_clinical_signals.symptoms` 驱动
- 表单描述要强调：
  - 这是为了更准确评估
  - 只需填写一次
  - 不涉及直接治疗建议
- UI 可以按风险优先级排序字段，而不必机械按类别排序

---

## 3.4 Form Parser

```typescript
interface ParsedIntakeData {
  structured_facts: Record<string, string | number | string[]>;
  summary: string;
  critical_unknowns: string[];
  red_flag_values: string[];
  has_red_flags: boolean;
}
```

Parser 的职责：
- 只做结构化转换
- 汇总已知事实
- 标记哪些关键未知仍然存在
- 不直接决定最终风险等级

---

## 3.5 Clarification Planning

### 3.5.1 目标

Clarification Planner 的职责不是“字段缺了就问”，而是：

> 从当前未解决不确定性中，挑出最可能改变风险分层、行动建议或升级判断的 1-2 个问题。

### 3.5.2 输入类型

```typescript
interface ClarificationPlanningInput {
  framing: IntentFramingOutput;
  parsed_intake?: ParsedIntakeData;
  triage_preview?: {
    current_risk_tendency?: "high" | "medium" | "low";
    uncertainty_reasons: string[];
    critical_unknowns: string[];
  };
  episode_context?: EpisodeContext;
}
```

### 3.5.3 输出类型

```typescript
interface ClarificationPlan {
  status: "clarify_more" | "provisional_assessment" | "insufficient_for_assessment";
  question_plans: ClarificationQuestionPlan[];
  why_this_status: string;
  remaining_unknowns: string[];
}

interface ClarificationQuestionPlan {
  id: string;
  question_goal: string;
  question_draft: string;
  answer_type: "free_text" | "single_choice" | "multi_choice" | "number";
  options?: string[];
  expected_information_gain: string;
  decision_impact: string;
  priority: "critical" | "important";
}
```

### 3.5.4 规则

- 最多输出 1-2 个问题
- 问题必须服务于明确的决策边界
- 如果再问也无法显著提升判断质量，应直接输出：
  - `provisional_assessment` 或
  - `insufficient_for_assessment`

---

## 3.6 状态管理

```typescript
interface IntakeClarificationState {
  session_id: string;
  episode_id: string;
  intake_status: "pending" | "filled" | "clarifying" | "completed";
  form_id?: string;
  parsed_intake?: ParsedIntakeData;
  clarification_round: number;
  clarification_plan?: ClarificationPlan;
  clarification_answers?: { question_id: string; answer: string }[];
  remaining_unknowns: string[];
}
```

---

## 3.7 与 Executive 的集成

```typescript
async handleStructuredIntake(request: AssessRequest, framing: IntentFramingOutput) {
  const intake = this.intakeManager.build(framing);
  return this.responseComposer.buildStructuredIntake(intake);
}

async handlePostIntake(request: AssessRequest, parsed: ParsedIntakeData) {
  const plan = this.clarificationPlanner.plan({
    framing: request.framing,
    parsed_intake: parsed,
    episode_context: request.episode_context,
  });

  switch (plan.status) {
    case "clarify_more":
      return this.responseComposer.buildClarification(plan);
    case "provisional_assessment":
      return this.handleAssessment(request, { parsed, clarificationPlan: plan });
    case "insufficient_for_assessment":
      return this.responseComposer.buildInsufficient(plan);
  }
}
```

---

## 3.8 验收标准

### 功能验收
- [ ] 能根据 symptom frame 生成对应结构化 intake
- [ ] 表单解析正确
- [ ] 能标记 critical unknowns
- [ ] 澄清问题精准，最多 2 个
- [ ] 支持 `clarify_more` / `provisional_assessment` / `insufficient_for_assessment`

### 体验验收
- [ ] 表单填写一次完成，不碎片化
- [ ] 澄清问题少且高信息增益
- [ ] 信息仍不足时不假装确定

### 安全验收
- [ ] 红旗选项始终可见
- [ ] 急症信号立即触发升级
- [ ] intake 层不泄露医疗建议

---

## 3.9 实现依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| SPEC-1 | 前置规范 | IntentFramingOutput |
| SPEC-2 | 前置规范 | triage preview（可选） |
| SPEC-7 | 前置规范 | Session / Episode State |
| SPEC-8 | 前置规范 | LLM Runtime（可选，用于复杂澄清规划） |
| SPEC-10 | 前置规范 | 最终响应由 Executive 组织 |
