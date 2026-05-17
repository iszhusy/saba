# SPEC-5 — Risk Deliberation Agent

**版本**: v0.2
**状态**: Draft
**依赖**: SPEC-2（Clinical Triage Agent）、SPEC-4（Evidence Retrieval Tool）、SPEC-7（Conversation State & Episode Memory）
**实现优先级**: P0（最终判断核心）

---

## 5.1 目标

新增一个 Risk Deliberation Agent（风险审议代理），用于：

1. **整合** Triage Agent 的临床初判、RAG 证据、episode 历史与当前更新
2. **形成**主要解释与备选解释
3. **判断**当前是可以给确定性结论、只能给临时结论，还是不足以下结论
4. **输出**风险倾向、置信度、不确定性影响和决策边界
5. **为 Conversation Executive Agent 提供最终回复所需的 reasoning surface**

**关键约束**: 该节点负责“能不能说结论、能说到什么程度”，而不直接生成最终用户回复。

---

## 5.2 输入类型

```typescript
interface RiskDeliberationInput {
  triage_output: TriageAgentOutput;
  evidence_output?: EvidenceRetrievalOutput;
  framing_output: IntentFramingOutput;
  intake_data?: ParsedIntakeData;
  clarification_answers?: { question_id: string; answer: string }[];
  session_history?: {
    previous_risk_levels: ("high" | "medium" | "low")[];
    previous_symptoms: string[];
    symptom_trends: ("worsening" | "improving" | "stable")[];
    unresolved_uncertainties?: string[];
    time_between_assessments?: number;
  };
  user_message: string;
  patient_context?: PatientContext;
}
```

---

## 5.3 输出类型

```typescript
interface RiskDeliberationOutput {
  decision_mode: "conclusive" | "provisional" | "insufficient";

  primary_assessment: {
    risk_level: "high" | "medium" | "low";
    risk_score: number;
    confidence: number;
    reasoning_summary: string;
  };

  alternative_explanations: {
    explanation: string;
    why_not_primary: string;
  }[];

  uncertainty: {
    level: "low" | "medium" | "high";
    reasons: string[];
    impact_on_decision: string;
    critical_unknowns: string[];
    what_would_change_the_assessment: string[];
  };

  response_eligibility: {
    can_give_conclusive_assessment: boolean;
    can_give_provisional_assessment: boolean;
    should_request_more_information: boolean;
    why: string;
  };

  contributing_factors: {
    factor: string;
    direction: "increases" | "decreases" | "neutral";
    weight: number;
    evidence: string;
  }[];

  recommended_actions: {
    immediate: string;
    short_term: string;
    long_term: string;
  };

  warning_signals: {
    text: string;
    source: "triage" | "rag" | "deliberation";
    priority: "critical" | "high" | "medium";
  }[];

  evidence_references: {
    entry_id: string;
    section: string;
    quote?: string;
  }[];

  audit: {
    reasoning_chain: string;
    model_name: string;
    prompt_version: string;
  };
}
```

---

## 5.4 决策原则

- `conclusive`: 关键不确定性已降到可接受范围，可给正式风险评估
- `provisional`: 可以给倾向性判断，但必须显式说明条件和未知项
- `insufficient`: 不能可靠给出风险结论，只能解释当前未知并给安全下一步

### 示例逻辑

```typescript
function determineDecisionMode(input: RiskDeliberationInput): "conclusive" | "provisional" | "insufficient" {
  const hasCriticalUnknowns = input.triage_output.information_gaps.some(g => g.blocking || g.criticality === "critical");
  const hasRedFlags = input.triage_output.clinical_picture.red_flag_signals.length > 0;
  const confidence = input.triage_output.triage_assessment.confidence;

  if (hasRedFlags && confidence >= 0.7) return "conclusive";
  if (hasCriticalUnknowns && confidence < 0.6) return "insufficient";
  if (hasCriticalUnknowns || confidence < 0.75) return "provisional";
  return "conclusive";
}
```

---

## 5.5 Prompt 规约

### System Prompt

```
你是 SABA（乳腺癌患者副作用评估助手）的 Risk Deliberation Agent。

## 你的职责
你不直接面向用户回复。
你的任务是基于 triage、证据、episode 历史和当前信息，输出：
- 当前的主要风险判断
- 当前判断是 conclusive / provisional / insufficient
- 还有哪些关键未知项
- 哪些信息会改变风险分层
- 当前是否允许主对话代理给出正式评估

## 安全原则
- 不确定时倾向更保守
- 红旗症状必须升级
- 历史高风险不轻易降级
- 必须区分“能临时判断”和“不能可靠判断”
```

---

## 5.6 与后续 SPEC 的关系

```
SPEC-5 Risk Deliberation Agent
    │
    ▼
SPEC-6 Safety Critic Constraint Layer
    │
    ▼
SPEC-10 Conversation Executive Agent
```

---

## 5.7 验收标准

### 功能验收
- [ ] 能整合 triage 的临床图景、证据、episode 历史与当前更新
- [ ] 能表达不确定性，不假装确定
- [ ] 能区分 conclusive / provisional / insufficient
- [ ] 能说明什么信息会改变当前判断
- [ ] 推理链可解释

### 安全验收
- [ ] 症状加重时不会轻易降级
- [ ] 红旗症状出现时输出高风险倾向
- [ ] 历史 HIGH 不会轻易降级
- [ ] 高不确定性时不会误给 conclusive

---

## 5.8 实现依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| SPEC-2 | 前置规范 | TriageAgentOutput |
| SPEC-4 | 前置规范 | EvidenceRetrievalOutput |
| SPEC-1 | 前置规范 | IntentFramingOutput |
| SPEC-3 | 前置规范 | ParsedIntakeData |
| SPEC-7 | 前置规范 | Episode history / unresolved uncertainties |
| SPEC-8 | 前置规范 | LLM Runtime |
| SPEC-10 | 前置规范 | 最终由 Executive 消费 |
