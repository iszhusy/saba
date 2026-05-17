# SPEC-1 — Intent Framing Agent

**版本**: v0.2  
**状态**: Draft  
**依赖**: SPEC-0（架构原则）  
**实现优先级**: P0（整个系统的入口）

---

## 1.1 目标

新增一个 Intent Framing Agent（意图框架化代理），用于：

1. 判断用户当前输入的**对话目标**是什么
2. 判断是否疑似**紧急情况**，需要直接升级
3. 判断是否是**药物相关**问题，需要转出到安全边界
4. 判断是否是**已有 episode 的续述/更新**
5. 判断当前信息的 **answerability（可回答性）**
6. 为 Conversation Executive Agent 提供这一轮“该如何与用户交互”的框架

这是整个系统的**入口模块**。它本身不负责最终用户回复，也不直接决定最终文案，只输出一次结构化 framing 结果，由 Conversation Executive Agent 决定下一步交互。

---

## 1.1.1 交互模式

```
用户输入
    │
    ▼
Intent Framing Agent
    │
    ├─ 急症 / 药物 / 非医疗 / 续上轮 → 返回 interaction framing
    │
    └─ 症状评估 → 返回 intake / clarify / assess 建议
                  │
                  ▼
Conversation Executive Agent
    │
    ├─ structured_intake
    ├─ clarify
    ├─ assess
    ├─ escalate
    └─ route_out
```

**核心原则**：
- framing 负责定义这轮对话的形态，而不是直接产出最终回复
- 表单、澄清、评估、升级都由 Executive Agent 决定如何对用户表达
- framing 本身不维护多轮状态，也不自主决定后续流程

---

## 1.2 输入类型

```typescript
interface IntentFramingInput {
  // 身份标识
  user_id: string;
  session_id?: string;
  episode_id?: string;

  // 当前用户输入（必需）
  current_message: string;

  // 对话上下文（可选，有 session 时提供）
  conversation_context?: {
    previous_user_messages: string[];
    previous_assistant_messages: string[];
    last_known_symptoms?: string[];
    last_risk_level?: "high" | "medium" | "low";
    last_response_mode?: "clarify" | "provisional_assessment" | "conclusive_assessment" | "escalation" | "route_out";
    unresolved_uncertainties?: string[];
    pending_question_goals?: string[];
  };

  // 患者治疗上下文（可选，有 context 时提供）
  patient_context?: {
    cancer_type?: string;
    treatment_type?: string;      // e.g., "chemotherapy", "targeted", "immunotherapy"
    treatment_phase?: string;     // e.g., "cycle_1_day_3"
    treatment_day?: number;
    known_medications?: string[];
  };
}
```

---

## 1.3 输出类型

### ConversationGoal（当前轮目标）

```typescript
type ConversationGoal =
  | "symptom_assessment"      // 报告症状，需要评估
  | "emergency_concern"       // 疑似急症
  | "medication_boundary"     // 触及停药/改药/剂量边界
  | "care_team_contact"       // 想联系医疗团队
  | "followup_update"         // 继续/更新上轮评估
  | "general_question"        // 一般性问题
  | "reassurance_seeking"     // 倾向寻求确认/安抚
  | "non_medical"             // 非医疗问题
  | "unclear";                // 无法判断
```

### InteractionMode（推荐交互模式）

```typescript
type InteractionMode =
  | "structured_intake"       // 展示结构化收集入口（表单/UI）
  | "clarify"                // 先追问 1-2 个高信息增益问题
  | "assess"                 // 信息足够，可进入推理评估
  | "escalate"               // 立即升级
  | "route_out";             // 转出到非评估路径
```

### Answerability（可回答性）

```typescript
type Answerability =
  | "insufficient"           // 信息不足，只能澄清或有限安全引导
  | "provisional"            // 可给倾向性判断，但不能下确定性结论
  | "sufficient";            // 足以进入正式评估
```

### MissingInformation（缺失信息）

```typescript
interface MissingInformation {
  field:
    | "primary_symptom"
    | "duration"
    | "severity"
    | "temperature"
    | "oral_intake"
    | "breathing_status"
    | "chest_pain"
    | "bleeding"
    | "mental_status"
    | "treatment_context";
  why_it_matters: string;
  decision_impact: string;
  criticality: "critical" | "important" | "optional";
}
```

### IntentFramingOutput（完整输出）

```typescript
interface IntentFramingOutput {
  // 核心判断
  conversation_goal: ConversationGoal;
  confidence: number;              // 0-1，模型置信度
  interaction_mode: InteractionMode;
  answerability: Answerability;

  // episode 相关
  starts_new_episode: boolean;
  continues_existing_episode: boolean;

  // 医学相关性
  is_medical_relevant: boolean;
  is_possible_emergency: boolean;
  touches_medication_boundary: boolean;

  // 当前轮对话 framing
  framing: {
    user_goal_summary: string;
    why_this_mode: string;
    response_eligibility:
      | "clarify_only"
      | "provisional_only"
      | "full_assessment_allowed"
      | "escalation_required"
      | "route_out_required";
  };

  // 缺失信息与为什么重要
  missing_information: MissingInformation[];

  // 从输入中提取的临床信号（供 intake / triage 使用）
  extracted_clinical_signals: {
    symptoms: string[];
    duration?: string;
    severity_words: string[];
    body_parts: string[];
    red_flag_mentions: string[];
    uncertainty_markers: string[];
  };

  // 给 Clarification Planning / Executive Agent 的输入，不是最终用户问题文案
  clarification_guidance: {
    question_goals: string[];
    max_questions: number;
    ask_now_vs_skip_reason: string;
  };

  // 审计信息
  audit: {
    reasoning_summary: string;
    model_name: string;
    prompt_version: string;
  };
}
```

---

## 1.4 模型选择

**推荐模型**: `claude-haiku-4-5`（或同等能力的小模型）

**理由**:
- 入口 framing 是结构化判断任务，小模型通常足够
- 需要低延迟（用户每次输入都经过这里）
- 成本敏感，调用频率最高
- 真正复杂的临床推理应延后到 triage / deliberation

**备用模型**: `claude-sonnet-4-6`（如果 haiku 在 follow-up 和不确定性 framing 上效果不佳）

---

## 1.5 Prompt 规约

### System Prompt

```
你是 SABA（乳腺癌患者副作用评估助手）的 Intent Framing Agent。

## 你的职责
你的任务不是诊断疾病，也不是给治疗建议。
你的任务是判断这一轮输入应该如何进入后续对话流程，并告诉主对话代理：
- 当前轮用户想解决什么
- 当前是否可能紧急
- 当前信息是否足够
- 当前只能澄清、只能临时判断，还是可以进入正式评估

## 你必须识别
1. 当前轮的 conversation_goal
2. 是否医疗相关
3. 是否可能紧急（红旗症状）
4. 是否触及药物停改剂量边界
5. 是否是已有 episode 的 follow-up
6. 当前的 answerability
7. 推荐的 interaction_mode
8. 缺失信息为什么重要

## 安全原则
- 如果可能存在呼吸困难、胸痛、高热、出血、意识改变、无法进食饮水等风险，不要给低风险 framing
- 信息不足时，优先输出 clarify 或 provisional，不要假装足以正式评估
- 药物剂量、停药、改药问题必须触发 medication boundary
- 输出必须是有效 JSON

## 澄清原则
- 你不直接输出给用户看的最终问题文案
- 你只输出 question goals 与为什么要问
- 每轮最多建议 1-2 个高价值问题
```

### User Prompt Template

```
当前用户输入：
{{current_message}}

对话上下文：
{{#if conversation_context}}
- 历史消息: {{#each conversation_context.previous_user_messages}}{{this}}{{/each}}
{{#if conversation_context.last_risk_level}}上轮风险等级: {{conversation_context.last_risk_level}}{{/if}}
{{#if conversation_context.last_response_mode}}上轮回复模式: {{conversation_context.last_response_mode}}{{/if}}
{{#if conversation_context.unresolved_uncertainties}}未解决不确定性: {{#each conversation_context.unresolved_uncertainties}}{{this}}{{/each}}{{/if}}
{{else}}
- 无历史上下文（新对话）
{{/if}}

患者治疗上下文：
{{#if patient_context}}
- 治疗类型: {{patient_context.treatment_type}}
- 治疗阶段: {{patient_context.treatment_phase}}
{{else}}
- 无治疗上下文
{{/if}}

请输出 IntentFramingOutput JSON。
```

---

## 1.6 示例

### Case 1：信息不足

**输入**: "我有点不舒服"

**输出**:
```json
{
  "conversation_goal": "unclear",
  "confidence": 0.72,
  "interaction_mode": "clarify",
  "answerability": "insufficient",
  "starts_new_episode": true,
  "continues_existing_episode": false,
  "is_medical_relevant": true,
  "is_possible_emergency": false,
  "touches_medication_boundary": false,
  "framing": {
    "user_goal_summary": "用户似乎在报告身体不适，但尚未给出可评估的症状信息",
    "why_this_mode": "当前缺少主要症状、持续时间和红旗信息，不能直接进入评估",
    "response_eligibility": "clarify_only"
  },
  "missing_information": [
    {
      "field": "primary_symptom",
      "why_it_matters": "不知道主要症状就无法判断属于哪类副作用",
      "decision_impact": "决定是否需要表单、评估还是升级",
      "criticality": "critical"
    },
    {
      "field": "duration",
      "why_it_matters": "持续时间影响风险等级判断",
      "decision_impact": "影响是否属于可观察还是需更快处理",
      "criticality": "important"
    }
  ],
  "extracted_clinical_signals": {
    "symptoms": [],
    "severity_words": ["有点"],
    "body_parts": [],
    "red_flag_mentions": [],
    "uncertainty_markers": ["不舒服"]
  },
  "clarification_guidance": {
    "question_goals": [
      "确认主要症状类别",
      "快速排除红旗症状"
    ],
    "max_questions": 2,
    "ask_now_vs_skip_reason": "这两项信息能显著缩小风险判断范围"
  },
  "audit": {
    "reasoning_summary": "输入过于笼统，只适合先做高信息增益澄清",
    "model_name": "claude-haiku-4-5",
    "prompt_version": "intent-framing-v2"
  }
}
```

---

### Case 2：信息足够，可进入评估

**输入**: "恶心想吐两天了，今天吃不下东西"

**输出**:
```json
{
  "conversation_goal": "symptom_assessment",
  "confidence": 0.93,
  "interaction_mode": "assess",
  "answerability": "sufficient",
  "starts_new_episode": true,
  "continues_existing_episode": false,
  "is_medical_relevant": true,
  "is_possible_emergency": false,
  "touches_medication_boundary": false,
  "framing": {
    "user_goal_summary": "用户在报告恶心呕吐及进食受影响，希望判断严重程度和下一步",
    "why_this_mode": "已有主要症状、持续时间和严重程度线索，可进入正式评估",
    "response_eligibility": "full_assessment_allowed"
  },
  "missing_information": [],
  "extracted_clinical_signals": {
    "symptoms": ["恶心", "呕吐", "食欲减退"],
    "duration": "两天",
    "severity_words": ["吃不下"],
    "body_parts": [],
    "red_flag_mentions": [],
    "uncertainty_markers": []
  },
  "clarification_guidance": {
    "question_goals": [],
    "max_questions": 0,
    "ask_now_vs_skip_reason": "当前信息已足以进入 triage"
  },
  "audit": {
    "reasoning_summary": "信息足以进入副作用风险评估",
    "model_name": "claude-haiku-4-5",
    "prompt_version": "intent-framing-v2"
  }
}
```

---

### Case 3：疑似急症

**输入**: "喘不上气，胸口很闷"

**输出**:
```json
{
  "conversation_goal": "emergency_concern",
  "confidence": 0.89,
  "interaction_mode": "escalate",
  "answerability": "insufficient",
  "starts_new_episode": true,
  "continues_existing_episode": false,
  "is_medical_relevant": true,
  "is_possible_emergency": true,
  "touches_medication_boundary": false,
  "framing": {
    "user_goal_summary": "用户报告呼吸困难和胸闷，疑似急症",
    "why_this_mode": "急症风险高于信息收集优先级，应直接升级",
    "response_eligibility": "escalation_required"
  },
  "missing_information": [],
  "extracted_clinical_signals": {
    "symptoms": ["呼吸困难", "胸闷"],
    "severity_words": ["喘不上气", "很闷"],
    "body_parts": ["胸部"],
    "red_flag_mentions": ["喘不上气", "胸闷"],
    "uncertainty_markers": []
  },
  "clarification_guidance": {
    "question_goals": [],
    "max_questions": 0,
    "ask_now_vs_skip_reason": "紧急风险高，不应等待进一步澄清"
  },
  "audit": {
    "reasoning_summary": "疑似急症，应优先升级而不是继续收集信息",
    "model_name": "claude-haiku-4-5",
    "prompt_version": "intent-framing-v2"
  }
}
```

---

### Case 4：药物边界问题

**输入**: "我能不能把药停一天？"

**输出**:
```json
{
  "conversation_goal": "medication_boundary",
  "confidence": 0.95,
  "interaction_mode": "route_out",
  "answerability": "insufficient",
  "starts_new_episode": false,
  "continues_existing_episode": false,
  "is_medical_relevant": true,
  "is_possible_emergency": false,
  "touches_medication_boundary": true,
  "framing": {
    "user_goal_summary": "用户在寻求停药建议",
    "why_this_mode": "涉及停药/改药边界，系统不能直接给出建议",
    "response_eligibility": "route_out_required"
  },
  "missing_information": [],
  "extracted_clinical_signals": {
    "symptoms": [],
    "severity_words": [],
    "body_parts": [],
    "red_flag_mentions": [],
    "uncertainty_markers": []
  },
  "clarification_guidance": {
    "question_goals": [],
    "max_questions": 0,
    "ask_now_vs_skip_reason": "优先处理边界而不是继续评估"
  },
  "audit": {
    "reasoning_summary": "触及停药边界，应转出到安全路径",
    "model_name": "claude-haiku-4-5",
    "prompt_version": "intent-framing-v2"
  }
}
```

---

### Case 5：续上轮评估

**输入**: "现在更严重了，吐得更厉害了"

**上下文**: 上轮评估了"恶心想吐"，风险等级 medium

**输出**:
```json
{
  "conversation_goal": "followup_update",
  "confidence": 0.91,
  "interaction_mode": "assess",
  "answerability": "provisional",
  "starts_new_episode": false,
  "continues_existing_episode": true,
  "is_medical_relevant": true,
  "is_possible_emergency": false,
  "touches_medication_boundary": false,
  "framing": {
    "user_goal_summary": "用户在更新上轮恶心呕吐症状，并强调已加重",
    "why_this_mode": "这是已有 episode 的风险变化更新，应重新评估",
    "response_eligibility": "provisional_only"
  },
  "missing_information": [
    {
      "field": "oral_intake",
      "why_it_matters": "决定是否达到高风险阈值",
      "decision_impact": "影响是否升级为立即处理",
      "criticality": "critical"
    }
  ],
  "extracted_clinical_signals": {
    "symptoms": ["恶心", "呕吐（加重）"],
    "severity_words": ["更严重", "更厉害"],
    "body_parts": [],
    "red_flag_mentions": [],
    "uncertainty_markers": []
  },
  "clarification_guidance": {
    "question_goals": ["确认是否已无法进食进水"],
    "max_questions": 1,
    "ask_now_vs_skip_reason": "这一个信息点最可能决定是否立即升级"
  },
  "audit": {
    "reasoning_summary": "明确属于既有 episode 加重，但仍存在关键升级阈值信息缺口",
    "model_name": "claude-haiku-4-5",
    "prompt_version": "intent-framing-v2"
  }
}
```

---

## 1.7 集成点

### 在 Conversation Executive Agent 中的位置

```typescript
async assess(request: AssessRequest): Promise<SystemResponse> {
  // 1. Intent Framing（入口，永远第一步）
  const framing = await this.intentFramingAgent.classify({
    user_id: request.user_id,
    session_id: request.session_id,
    episode_id: request.episode_id,
    current_message: request.input,
    conversation_context: request.conversation_context,
    patient_context: request.context,
  });

  // 2. Executive 根据 interaction_mode 决定下一步
  switch (framing.interaction_mode) {
    case "clarify":
      return this.handleClarification(framing, request);

    case "structured_intake":
      return this.handleStructuredIntake(framing, request);

    case "escalate":
      return this.handleEscalation(framing, request);

    case "route_out":
      return this.handleRouteOut(framing, request);

    case "assess":
      return this.handleAssessment(framing, request);
  }
}
```

**关键约束**: Intent Framing 永远在 SymptomParser 或 Triage 之前执行。

---

## 1.8 验收标准

### 功能验收

| 输入 | 预期 interaction_mode |
|------|-----------------------|
| "我不舒服" | clarify |
| "恶心两天，吃不下" | assess |
| "喘不上气" | escalate |
| "我能不能停药" | route_out |
| "现在更严重了" + 有 session | assess |
| "谢谢" | route_out |
| "今天天气怎么样" | route_out |

### 安全验收

- [ ] 信息不足不能输出 `full_assessment_allowed`
- [ ] 药物停改问题不能输出 `assess`
- [ ] 疑似急症不能输出 `clarify` 或 `structured_intake`
- [ ] 每次输出必须包含 `audit.reasoning_summary`
- [ ] JSON 解析失败必须 fallback 到 `clarify` 或 `route_out`，不能默认进入评估

### 性能验收

- [ ] P50 延迟 < 500ms（使用 haiku 模型）
- [ ] P99 延迟 < 2000ms

---

## 1.9 实现依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| SPEC-0 | 顶层规范 | 架构原则定义 |
| LLM Runtime | SPEC-8 | 需要统一的模型调用封装 |
| Episode 类型 | SPEC-7 | 对 follow-up framing 有帮助 |
| Conversation Executive Agent | SPEC-10 | framing 输出由主代理消费 |

**注意**: SPEC-7 在完整实现前，framing 可使用可选的 `conversation_context` 字段降级运行。

---

## 1.10 与后续 SPEC 的关系

```
SPEC-1 Intent Framing Agent
   ├── SPEC-2 Clinical Triage Agent
   ├── SPEC-3 Structured Intake & Clarification Planning
   ├── SPEC-6 Safety Critic Constraint Layer
   ├── SPEC-7 Conversation State
   └── SPEC-10 Conversation Executive Agent
```

**关键**: 如果 SPEC-1 没有正确区分 clarify / provisional / assess / escalate，后续所有推理都会建立在错误的交互模式上。
