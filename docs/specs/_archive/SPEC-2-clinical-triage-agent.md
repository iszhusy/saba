# SPEC-2 — Clinical Triage Agent

**版本**: v0.3
**状态**: Draft
**依赖**: SPEC-1（Intent Framing Agent）、SPEC-3（Structured Intake & Clarification Planning）、SPEC-7（Conversation State & Episode Memory）
**实现优先级**: P0（核心临床推理节点）

---

## 2.1 目标

定义一个 Clinical Triage Agent（临床分诊代理），作为 Conversation Executive Agent 下游的**首个临床 reasoning 节点**，用于：

1. 基于当前用户输入、episode 上下文与 intake / clarification 已收集事实，形成**临床图景**
2. 给出**风险倾向**（risk tendency），而不是最终对用户宣布的正式结论
3. 显式识别**关键未知项**、这些未知项如何影响判断，以及当前是否还能继续推进
4. 判断是否值得触发 **Evidence Retrieval**
5. 为 SPEC-5 Risk Deliberation Agent 提供结构化 reasoning surface

**关键约束**：
- Triage 负责“临床初判与问题收敛”，不负责最终用户回复
- Triage 可以表达 high / medium / low 的**倾向**，但不单独决定 conclusive / provisional / insufficient 的最终资格
- Triage 必须显式区分：已知事实、推断、未知项

---

## 2.2 在整体架构中的位置

```text
用户输入 / intake / clarification
  → Conversation Executive Agent
      → Intent Framing Agent
      → Clinical Triage Agent
      → Evidence Retrieval Tool（如需要）
      → Risk Deliberation Agent
      → Safety Critic Constraint Layer
      → 最终用户响应
```

Triage 是 **reasoning node**，不是用户可见发言主体。

---

## 2.3 输入类型

```typescript
interface TriageAgentInput {
  framing_output: IntentFramingOutput;

  request: {
    user_id: string;
    session_id?: string;
    episode_id?: string;
    current_message: string;
  };

  patient_context?: {
    cancer_type?: string;
    treatment_type?: string;
    treatment_phase?: string;
    treatment_day?: number;
    known_medications?: string[];
  };

  intake_data?: ParsedIntakeData;

  clarification_context?: {
    answers?: { question_id: string; answer: string }[];
    clarification_history?: {
      round: number;
      question_goal: string;
      answer?: string;
    }[];
  };

  episode_context?: {
    previous_symptoms?: string[];
    previous_risk_levels?: ("high" | "medium" | "low")[];
    previous_decision_modes?: ("conclusive" | "provisional" | "insufficient")[];
    unresolved_uncertainties?: string[];
    working_hypotheses?: {
      primary?: string;
      alternatives: string[];
    };
    symptom_trends?: ("worsening" | "improving" | "stable" | "unknown")[];
    time_since_last_assessment_hours?: number;
  };
}
```

---

## 2.4 输出类型

```typescript
interface TriageAgentOutput {
  triage_assessment: {
    current_risk_tendency: "high" | "medium" | "low";
    urgency: "immediate" | "same_day" | "within_24_48h" | "observe_with_guardrails";
    confidence: number;
    reasoning_summary: string;
    basis: {
      known_facts: string[];
      inferred_facts: string[];
      unknowns: string[];
    };
    uncertainty_reasons: string[];
    critical_unknowns: string[];
    can_proceed_without_more_info: boolean;
  };

  clinical_picture: {
    recognized_symptoms: {
      term: string;
      standard_term?: string;
      category: string;
      severity_estimate: "mild" | "moderate" | "severe" | "unknown";
      source: "message" | "intake" | "clarification" | "history" | "inferred";
    }[];
    progression_signals: {
      signal: string;
      direction: "worsening" | "improving" | "stable" | "unknown";
      confidence: number;
    }[];
    red_flag_signals: string[];
    treatment_related_considerations: {
      symptom: string;
      relation_to_treatment: "likely" | "possible" | "unclear";
      rationale: string;
    }[];
  };

  information_gaps: {
    item: string;
    why_it_matters: string;
    decision_impact: string;
    criticality: "critical" | "important" | "optional";
    blocking: boolean;
  }[];

  retrieval_strategy: {
    should_retrieve: boolean;
    retrieval_objective: string;
    retrieval_queries: string[];
    retrieval_depth: "shallow" | "standard" | "deep";
    expected_value: string;
  };

  clarification_targets: {
    question_goal: string;
    why_now: string;
    expected_information_gain: string;
    priority: "critical" | "important";
  }[];

  handoff_to_deliberation: {
    primary_hypothesis?: string;
    alternative_hypotheses: string[];
    risk_drivers: string[];
    downgrade_risks: string[];
    upgrade_triggers: string[];
  };

  audit: {
    reasoning_summary: string;
    model_name: string;
    prompt_version: string;
  };
}
```

---

## 2.5 设计原则

### 原则 A：输出“风险倾向”，不是最终定论

Triage 可以说：
- 当前更偏向 `medium`
- 若温度升高或无法进水则可能升级 `high`
- 当前仍有关键未知项

Triage 不应单独说：
- “已经可以对用户给正式结论”
- “最终回复必须怎么写”

这些属于 Deliberation + Safety + Executive 的职责。

### 原则 B：未知项必须结构化表达

信息不足时，Triage 不能把未知项藏在 reasoning 里。
必须显式给出：
- `uncertainty_reasons`
- `critical_unknowns`
- `can_proceed_without_more_info`
- `clarification_targets`

### 原则 C：历史 episode 会改变当前判断

如果上轮是中风险，这轮用户说“现在更严重了”，Triage 必须把：
- 变化趋势
- 之前未解 uncertainty
- 是否出现升级 trigger

纳入当前临床图景，而不是只看本轮一句话。

### 原则 D：RAG 由临床推理驱动，而不是默认总开

只有当证据检索能真实提升判断质量时才触发 Retrieval，例如：
- 症状可能对应多个解释，需要标准化管理依据
- 需要补充 warning signs / escalation criteria
- 需要做术语标准化映射（如 CTCAE）

---

## 2.6 Prompt 规约

### System Prompt

```text
你是 SABA（乳腺癌患者副作用评估助手）的 Clinical Triage Agent。

## 你的职责
你要基于当前消息、已收集结构化信息、澄清回答和 episode 历史，输出：
- 当前临床风险倾向
- 当前知道什么、不知道什么
- 哪些未知项真正影响风险分层
- 是否值得调用证据检索
- 给风险审议节点的结构化 handoff

## 你不负责
- 不直接对用户说话
- 不生成最终回复文案
- 不单独决定 conclusive / provisional / insufficient 的最终资格

## 关键原则
1. 依据症状含义、严重程度、时间线和变化趋势判断，不做关键词匹配
2. 明确区分已知、推断和未知
3. 信息不足时，不把 unknown 伪装成 low risk
4. 如存在红旗信号，必须显式标记为 red_flag_signals
5. Retrieval 只在能提升判断质量时触发
6. 输出必须是结构化 JSON
```

---

## claude 评估准则

### 高风险倾向（high tendency）
常见触发特征：
- 呼吸困难、胸痛、意识改变
- 高热/寒颤、明显感染线索
- 持续呕吐且无法进水、明显脱水
- 出血、黑便、呕血
- 快速恶化、严重全身状态变化

### 中风险倾向（medium tendency）
常见触发特征：
- 持续症状影响进食、睡眠、活动
- 中度发热或感染疑点待排
- 需要 24-48h 内联系团队确认
- 当前无明确红旗，但有升级边界需要交代

### 低风险倾向（low tendency）
常见触发特征：
- 轻度常见副作用
- 无红旗、无明显恶化
- 当前信息虽不完美，但无关键未知项阻断基本判断

**注意**：如果关键信息缺失，允许输出低风险倾向，但必须同时说明其只是当前倾向，且哪些未知项会推翻该倾向。

---

## 2.8 示例

### Case：恶心呕吐 + 进食下降

**输入**：用户说“恶心想吐两天了，今天吃不下东西”

**输出**：
```json
{
  "triage_assessment": {
    "current_risk_tendency": "medium",
    "urgency": "within_24_48h",
    "confidence": 0.79,
    "reasoning_summary": "当前表现更像化疗相关胃肠道副作用，已持续两天并影响进食，风险倾向至少为中等；但尚缺体温、呕吐频次与能否进水等关键信息，仍需防止低估感染或脱水风险。",
    "basis": {
      "known_facts": ["恶心", "想吐", "持续两天", "今天吃不下东西"],
      "inferred_facts": ["症状已影响口服摄入"],
      "unknowns": ["是否发热", "呕吐频次", "能否进水"]
    },
    "uncertainty_reasons": ["未提供体温", "未说明是否还能进水", "未提供呕吐频次"],
    "critical_unknowns": ["temperature", "oral_intake"],
    "can_proceed_without_more_info": true
  },
  "clinical_picture": {
    "recognized_symptoms": [
      {
        "term": "恶心",
        "standard_term": "Nausea",
        "category": "gastrointestinal",
        "severity_estimate": "moderate",
        "source": "message"
      },
      {
        "term": "呕吐",
        "standard_term": "Vomiting",
        "category": "gastrointestinal",
        "severity_estimate": "moderate",
        "source": "message"
      }
    ],
    "progression_signals": [
      {
        "signal": "影响进食",
        "direction": "worsening",
        "confidence": 0.84
      }
    ],
    "red_flag_signals": [],
    "treatment_related_considerations": [
      {
        "symptom": "恶心呕吐",
        "relation_to_treatment": "likely",
        "rationale": "化疗后常见胃肠道副作用，且时间线相符"
      }
    ]
  },
  "information_gaps": [
    {
      "item": "temperature",
      "why_it_matters": "发热会显著提高感染风险",
      "decision_impact": "可能将风险倾向升级为 high",
      "criticality": "critical",
      "blocking": false
    },
    {
      "item": "oral_intake",
      "why_it_matters": "完全无法进水提示脱水和高风险",
      "decision_impact": "影响是否需要立即就医",
      "criticality": "critical",
      "blocking": false
    }
  ],
  "retrieval_strategy": {
    "should_retrieve": true,
    "retrieval_objective": "补充化疗相关恶心呕吐的管理依据与升级边界",
    "retrieval_queries": ["化疗相关恶心呕吐 管理", "恶心呕吐 无法进水 升级标准"],
    "retrieval_depth": "standard",
    "expected_value": "帮助补足 warning signs 和标准化行动建议"
  },
  "clarification_targets": [
    {
      "question_goal": "确认是否发热",
      "why_now": "这会显著影响是否需要警惕感染",
      "expected_information_gain": "帮助区分中风险与高风险",
      "priority": "critical"
    },
    {
      "question_goal": "确认能否进水",
      "why_now": "无法进水是立即升级的重要边界",
      "expected_information_gain": "帮助判断是否需要立即就医",
      "priority": "critical"
    }
  ],
  "handoff_to_deliberation": {
    "primary_hypothesis": "化疗相关恶心呕吐并影响摄入",
    "alternative_hypotheses": ["感染相关胃肠道不适", "脱水进展"],
    "risk_drivers": ["症状持续两天", "影响进食"],
    "downgrade_risks": ["若无发热且仍可进水，可能维持 medium 而非升级"],
    "upgrade_triggers": ["发热", "无法进水", "症状快速加重"]
  },
  "audit": {
    "reasoning_summary": "当前更偏中风险，但需防低估感染/脱水",
    "model_name": "claude-sonnet-4-6",
    "prompt_version": "triage-v2"
  }
}
```

---

## 2.9 与后续 SPEC 的关系

```text
SPEC-1 Intent Framing Agent
    │
    ▼
SPEC-2 Clinical Triage Agent
    │
    ├─ retrieval_strategy.should_retrieve = true → SPEC-4 Evidence Retrieval Tool
    ▼
SPEC-5 Risk Deliberation Agent
    ▼
SPEC-6 Safety Critic Constraint Layer
    ▼
SPEC-10 Conversation Executive Agent
```

---

## 2.10 验收标准

### 功能验收
- [ ] 能形成结构化 triage_assessment，而不是只给分数
- [ ] 能显式区分 known / inferred / unknown
- [ ] 能识别红旗信号和变化趋势
- [ ] 能输出 retrieval_strategy 与 clarification_targets
- [ ] 能为 Deliberation 提供 primary / alternative hypotheses

### 安全验收
- [ ] 信息不足时不会把 unknown 伪装成 low risk
- [ ] 出现红旗时不会输出低风险倾向
- [ ] episode 中“加重/恶化”会被纳入判断
- [ ] 输出包含 uncertainty_reasons 与 critical_unknowns

### 性能验收
- [ ] P50 延迟 < 2s（主模型）
- [ ] P99 延迟 < 5s

---

## 2.11 实现依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| SPEC-1 | 前置规范 | IntentFramingOutput |
| SPEC-3 | 前置规范 | ParsedIntakeData / clarification context |
| SPEC-7 | 前置规范 | Episode context |
| SPEC-8 | 前置规范 | LLM Runtime |
| SPEC-4 | 并行模块 | Evidence Retrieval Tool |
| SPEC-5 | 下游模块 | 消费 TriageAgentOutput |
