# SPEC-10 — Conversation Executive Agent

**版本**: v0.1
**状态**: Draft
**依赖**: SPEC-0、SPEC-1、SPEC-3、SPEC-5、SPEC-6、SPEC-7、SPEC-8
**实现优先级**: P0（用户体验与最终发言核心）

---

## 10.1 目标

定义系统中唯一直接面向用户的主代理：Conversation Executive Agent。

它负责：

1. **理解**当前轮用户真正想解决的问题
2. **读取** Intent Framing、Episode State 与历史未决不确定性
3. **决定**当前是澄清、结构化收集、评估、升级还是转出
4. **调用** specialist nodes 获取 reasoning / evidence / constraints
5. **组织**最终用户可见回复
6. **确保**整个系统始终保持单一发言主体

**关键原则**：
- 用户永远不应直接看到某个中间节点的裸输出
- 所有最终可见文案都必须经过 Executive 的统一组装
- Executive 负责“不装懂但仍然有帮助”的最终表达

---

## 10.2 在整体架构中的位置

```
用户输入
  → Conversation Executive Agent
      ├─ Intent Framing Agent
      ├─ Structured Intake Manager
      ├─ Clarification Planning
      ├─ Clinical Triage Agent
      ├─ Evidence Retrieval
      ├─ Risk Deliberation Agent
      ├─ Safety Critic Constraint Layer
      └─ Response Synthesis
  → 用户可见最终响应
```

Executive 是唯一的“对话 owner”。

---

## 10.3 核心职责

### 10.3.1 决定本轮交互模式

```typescript
type ExecutiveResponseMode =
  | "clarify"
  | "structured_intake"
  | "provisional_assessment"
  | "conclusive_assessment"
  | "escalation"
  | "route_out";
```

Executive 需要根据 framing / deliberation / safety constraints 决定最终 mode。

### 10.3.2 统一发言

Executive 必须把所有中间信息转化成统一的用户表达：
- 不暴露内部术语
- 不暴露 raw route decision
- 不暴露 safety constraint 原文
- 不暴露字段缺口表本身

### 10.3.3 统一不确定性表达

Executive 负责决定如何向用户表达：
- 当前能判断到什么程度
- 为什么还需要澄清
- 为什么只能给 provisional
- 为什么当前不能可靠给结论

---

## 10.4 输入类型

```typescript
interface ExecutiveInput {
  user_message: string;
  framing_output: IntentFramingOutput;
  episode_context?: ConversationContext;
  intake_data?: ParsedIntakeData;
  clarification_plan?: ClarificationPlan;
  triage_output?: TriageAgentOutput;
  evidence_output?: EvidenceRetrievalOutput;
  deliberation_output?: RiskDeliberationOutput;
  safety_constraints?: SafetyCriticOutput["constraints"];
}
```

---

## 10.5 输出类型

```typescript
interface ExecutiveResponse {
  mode: ExecutiveResponseMode;
  message: string;
  why_this_mode: string;
  visible_uncertainty?: string[];
  required_next_step?: string;
  ui_payload?:
    | { type: "form"; form: StructuredIntakeOutput }
    | { type: "clarification"; questions: ClarificationQuestionPlan[] }
    | { type: "actions"; actions: string[] };

  audit: {
    executive_reasoning_summary: string;
    final_mode: ExecutiveResponseMode;
    used_constraints: string[];
  };
}
```

---

## 10.6 决策流程

### 10.6.1 顶层流程

```typescript
async function assess(request: AssessRequest): Promise<ExecutiveResponse> {
  const framing = await intentFramingAgent.classify(request);

  switch (framing.interaction_mode) {
    case "escalate":
      return handleEscalation(framing, request);

    case "route_out":
      return handleRouteOut(framing, request);

    case "structured_intake":
      return handleStructuredIntake(framing, request);

    case "clarify":
      return handleClarification(framing, request);

    case "assess":
      return handleAssessment(framing, request);
  }
}
```

### 10.6.2 评估路径

```typescript
async function handleAssessment(framing: IntentFramingOutput, request: AssessRequest) {
  const triage = await triageAgent.assess(buildTriageInput(framing, request));
  const evidence = triage.retrieval_strategy.should_retrieve
    ? await evidenceRetrieval.run(buildEvidenceQuery(triage, request))
    : undefined;

  const deliberation = await riskDeliberation.run({
    triage_output: triage,
    evidence_output: evidence,
    framing_output: framing,
    user_message: request.input,
    session_history: request.session_history,
  });

  const draft = responseComposer.compose(deliberation);
  const critique = await safetyCritic.review({
    deliberation_output: deliberation,
    framing_output: framing,
    draft_response: draft,
  });

  return responseComposer.composeWithConstraints(draft, critique.constraints);
}
```

---

## 10.7 响应模式规范

### clarify
用于：
- 当前信息不足
- 但问 1-2 个问题有明显信息增益

要求：
- 先承接用户
- 再问最高价值问题
- 不列一长串表单字段式问题

### structured_intake
用于：
- 适合一次性收集多项结构化信息
- 比自然语言追问更稳妥

要求：
- 解释为什么请用户填写
- 告知这是为了更准确判断

### provisional_assessment
用于：
- 当前有较强倾向
- 但仍存在关键未知项

要求：
- 必须显式说明这是临时判断
- 必须说明哪些情况会升级或改变结论

### conclusive_assessment
用于：
- 关键不确定性已降到可接受范围
- 可给正式风险判断与下一步建议

### escalation
用于：
- 疑似急症
- 安全优先级高于进一步收集信息

### route_out
用于：
- 药物边界
- 非医疗问题
- 不适合走当前评估主线的问题

---

## 10.8 与 Safety Critic 的关系

Executive 必须遵守 Safety Critic 输出的：
- `required_actions`
- `forbidden_claims`
- `required_warning_signals`
- `risk_floor`
- `rewrite_reason`

但 Executive 仍然负责：
- 如何自然表达这些约束
- 如何让回复保持完整和可信
- 如何避免模板感

**关键约束**：
Safety Critic 可以 veto，但不能直接替代 Executive 发言。

---

## 10.9 与 Episode State 的关系

Executive 每轮都应：
- 更新 `current_response_mode`
- 记录 `last_decision_mode`
- 写入新的 `working_hypotheses`
- 关闭或新增 `unresolved_uncertainties`
- 记录 `clarification_history`
- 更新 `last_safe_action_recommendation`

这样 follow-up 输入如“现在更严重了”才能建立在前一轮真正判断过的对象上。

---

## 10.10 Prompt 规约

### System Prompt

```
你是 SABA 的 Conversation Executive Agent。

你是系统里唯一直接面向用户说话的主体。
你的职责不是重复中间节点的结构化输出，而是：
- 决定当前最合适的对话模式
- 整合判断、不确定性与安全约束
- 用自然、清晰、克制但有帮助的方式对用户表达

你必须遵守：
- 不能假装确定
- 不能泄露内部规则语言
- 不能给停药/改药/剂量建议
- 如果 Safety Critic 给出必需动作，必须保留
- 如果当前只能 provisional，就必须明确说明条件
```

---

## 10.11 验收标准

### 功能验收
- [ ] 所有用户可见回复都经由 Executive 生成
- [ ] 支持 6 种 response mode
- [ ] 能消费 framing / deliberation / safety constraints
- [ ] 能在受约束下生成自然答复

### 体验验收
- [ ] 用户看不到裸露的 route decision / validator output
- [ ] 澄清问题短、准、自然
- [ ] provisional 回复不会伪装成正式结论
- [ ] 命中规则时回复仍完整可信，不像模板拒答

### 安全验收
- [ ] Executive 不会绕过 Safety Critic 约束
- [ ] HIGH 风险仍包含立即就医建议
- [ ] 药物边界问题不会给出违规建议
