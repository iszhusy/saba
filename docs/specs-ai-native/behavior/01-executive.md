# 01 — Conversation Executive

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/executive/00-goal.md](../modules/executive/00-goal.md)  
**目标**: 定义系统中唯一直接面向用户的执行主体，以及它如何组织交互模式、调用 reasoning layers、接收 constraints，并生成最终可见响应。

---

## 1.1 为什么 Executive 必须单独定义

AI-native 架构里，最容易失控的不是某个下游节点，而是：

> **到底谁在对用户说话。**

如果这个问题不先定义清楚，系统很快会退化成：
- intent 像在回复用户
- triage 像在回复用户
- safety 在改用户回复
- retrieval 的话术混进最终答复

最终结果是：
- 用户看到的是拼接痕迹
- 工程上没有明确 owner
- 安全层和判断层相互踩边界

所以必须明确：

> **Conversation Executive 是系统中唯一的对外发言主体。**

所有其他节点，最多只是在为它准备可消费的 reasoning、evidence、constraints 和 state context。

---

## 1.2 Executive 的系统身份

Conversation Executive 不是一个“简单 orchestrator”，也不是一个“负责把模板拼出来的 controller”。

它更准确的身份是：

> **一个统一承接用户问题、组织内部认知流程、并在安全约束下形成最终响应的执行智能层。**

它有三种核心责任：

1. **Interaction ownership**
   - 决定这轮对话该怎么进行
   - intake、clarify、assess、escalate、route_out 哪个最合适

2. **Cognitive coordination**
   - 决定当前需要调用哪些 reasoning layers / tools
   - 决定何时应该停止继续收集信息
   - 决定何时可以进入最终 synthesis

3. **Response ownership**
   - 统一表达当前结论、不确定性、建议和下一步动作
   - 保证用户始终只接触到一个稳定、自然、可信的说话主体

---

## 1.3 Executive 的输入与输出边界

### 输入边界

Executive 不应该直接依赖一大堆松散变量，而应消费几类结构化输入：

1. **当前用户输入**
2. **episode / session context**
3. **reasoning surfaces**
4. **tool results**
5. **safety constraints**

它处理的是“认知级输入”，而不是裸字段拼盘。

### 输出边界

Executive 的唯一职责是产出：
- 当前轮最终交互模式
- 当前轮最终用户可见 message
- 必要时附带 UI payload
- 审计摘要

它不应输出：
- 供别的内部模块继续消费的临床中间推理对象
- 安全规则本身
- 原始知识库 chunk

---

## 1.4 Executive 决定的核心问题

每一轮 Executive 至少要回答这几个问题：

1. 当前输入是在 **继续已有 episode**，还是开启新 episode？
2. 当前输入的目标是：
   - symptom assessment
   - emergency concern
   - medication boundary
   - follow-up update
   - general question
   - non-medical
3. 当前是否需要：
   - 结构化 intake
   - 1-2 个高信息增益澄清问题
   - 直接进入判断
   - 直接升级
   - 转出主评估路径
4. 当前是否已具备：
   - conclusive assessment 的资格
   - provisional assessment 的资格
   - 只能给 insufficient / escalate / route_out
5. 最终用户应该听到什么版本的解释？
   - 多说结论？
   - 多说不确定性？
   - 多说安全下一步？

这意味着 Executive 的核心价值不是“调用谁”，而是：

> **决定用户这一轮究竟应该经历哪种认知与交互路径。**

---

## 1.5 ExecutiveResponseMode

Executive 最终对用户的模式，必须收敛到有限集合：

```typescript
type ExecutiveResponseMode =
  | "structured_intake"
  | "clarify"
  | "provisional_assessment"
  | "conclusive_assessment"
  | "insufficient"
  | "escalation"
  | "route_out";
```

这些模式的意义不是 UI 分类，而是**输出资格分类**。

### structured_intake
适用于：
- 需要一次性收集多个结构化事实
- 自然语言追问会变得碎片化
- 当前核心缺的是“收集面”而不是“推理面”

### clarify
适用于：
- 只缺 1-2 个真正影响判断边界的问题
- 问完这些问题后，判断质量会显著提升

### provisional_assessment
适用于：
- 当前已有较强判断倾向
- 但仍有关键未知项
- 可以说“现在更偏向什么”，但不能假装是最终结论

### conclusive_assessment
适用于：
- 关键未知项已降到可接受范围
- 可给出较完整的风险判断与下一步建议

### insufficient
适用于：
- 当前信息仍不足以可靠判断
- 且继续追问也不一定值得或可行
- 需要诚实说明限制，同时给出安全下一步

### escalation
适用于：
- 当前存在疑似急症或高优先级安全风险
- 安全优先于继续收集信息

### route_out
适用于：
- 非医疗问题
- 药物停改剂量边界问题
- 不适合走当前主评估路径的问题

---

## 1.6 Executive 的工作流

Executive 的工作流不是固定流水线，而是一个由交互资格驱动的选择过程。

### Step 1：读取当前轮与 episode context

Executive 先理解：
- 当前用户说了什么
- 这句话在不在延续上一个 clinical episode
- 上轮遗留了哪些 unresolved uncertainties
- 这轮是在补信息、更新病情，还是另起话题

### Step 2：获取初始 framing

Executive 通常先调用 Intent Framing，获得：
- conversation goal
- answerability
- 是否可能 emergency
- 是否涉及 medication boundary
- 推荐 interaction mode 倾向

但 Executive 不必机械服从 framing；它可以在读取 episode context 后进行更高层决策。

### Step 3：决定当前路径

Executive 决定进入哪条路径：
- escalation
- route_out
- structured_intake
- clarify
- assess

这里的 assess 仍然是内部路径，不一定最终落到 conclusive；也可能是 provisional 或 insufficient。

### Step 4：按需调用 reasoning / tools

如果进入 assess path，Executive 决定是否调用：
- Clinical Triage
- Evidence Retrieval
- Risk Deliberation

如果进入 information collection path，Executive 决定是否调用：
- Structured Intake Builder
- Form Parser
- Clarification Planning

### Step 5：接收 constraints

无论最终路径为何，只要存在用户可见输出，Executive 都应在需要时接收：
- required_actions
- forbidden_claims
- required_warning_signals
- risk_floor

### Step 6：Constrained Synthesis

最终响应必须由 Executive 在约束下完成 synthesis，而不是直接把某个 specialist 输出原样返回。

---

## 1.7 Executive 的最小输入模型

```typescript
interface ExecutiveRequest {
  user_message: string;
  session_id?: string;
  episode_id?: string;
  patient_context?: {
    cancer_type?: string;
    treatment_type?: string;
    treatment_phase?: string;
    treatment_day?: number;
    known_medications?: string[];
  };
  episode_context?: EpisodeContext;
}

interface ExecutiveContextBundle {
  framing_output?: IntentFramingOutput;
  intake_data?: ParsedIntakeData;
  clarification_plan?: ClarificationPlan;
  triage_output?: TriageAgentOutput;
  evidence_output?: EvidenceRetrievalOutput;
  deliberation_output?: RiskDeliberationOutput;
  safety_constraints?: SafetyConstraints;
}
```

这个结构强调：
- request 是当前轮的原始上下文
- bundle 是本轮逐步收集到的内部认知结果

---

## 1.8 Executive 的输出模型

```typescript
interface ExecutiveResponse {
  mode: ExecutiveResponseMode;
  message: string;
  visible_uncertainty?: string[];
  next_step?: string;
  ui_payload?:
    | { type: "form"; form: StructuredIntakeOutput }
    | { type: "clarification"; questions: ClarificationQuestionPlan[] }
    | { type: "actions"; actions: string[] };
  audit: {
    executive_summary: string;
    final_mode: ExecutiveResponseMode;
    used_reasoning_sources: string[];
    used_constraints: string[];
  };
}
```

关键点：
- 用户可见内容和内部 reasoning surface 必须分离
- audit 必须保留 executive 为什么这样决策

---

## 1.9 Executive 与各层的关系

### 与 Intent Framing
Executive 依赖 framing 来快速理解“这轮像什么问题”，但 framing 不是最终 owner。

### 与 Clinical Triage
Executive 依赖 triage 获取临床图景与风险倾向，但 triage 不决定最终怎么对用户表达。

### 与 Risk Deliberation
Executive 依赖 deliberation 判断当前能不能说结论、能说到什么程度。

### 与 Safety Constraints
Executive 必须服从 safety constraints 的底线要求，但仍负责把这些底线自然地表达出来。

### 与 Episode State
Executive 每轮都应读写 episode state，因为它才是 continuity 的最终 owner。

---

## 1.10 Executive 的关键设计原则

### 原则 A：不暴露内部结构
用户不应该看到：
- “triage 认为……”
- “根据 safety critic……”
- “retrieval 显示……”

这些都是内部结构，不应成为用户体验的一部分。

### 原则 B：不装懂，但也不甩锅
Executive 不能在信息不足时假装确定。
但它也不能只是说“信息不足”。
它必须继续有帮助，比如：
- 说明还差什么
- 为什么差这个
- 现在最安全的下一步是什么

### 原则 C：优先减少用户的认知负担
Executive 应优先选择：
- 最少但高价值的问题
- 最自然的说明方式
- 最明确的下一步动作

而不是把内部字段缺口暴露给用户。

### 原则 D：最终表达要统一、完整、可信
即便内部经历了多层 reasoning / critique / retrieval，用户最终看到的仍应是一段统一、完整的回复，而不是模块拼接。

---

## 1.11 Executive 当前最需要回答的问题

后续细化 Executive spec 时，需要继续回答：

1. Executive 如何判断 intake vs clarify 的边界？
2. Executive 在 follow-up update 中如何识别“这是对上轮哪个判断的更新”？
3. Executive 如何在 provisional / insufficient 之间做最终选择？
4. Executive 如何消费 safety constraints 而不让回复模板化？
5. Executive 如何把 episode state 更新成对下一轮真正有帮助的形式？

这些问题会在后续 Clinical Triage、Episode State、Runtime & Synthesis spec 中进一步闭环。

---

## 1.12 一句话总结

Conversation Executive 不是一个薄薄的 orchestrator，而是：

> **系统唯一的对话 owner、交互资格裁决者、内部认知协调者，以及最终用户响应的统一生成者。**

---

## 1.13 输出资格表（Eligibility Matrix）

Executive 不能根据 reasoning surfaces 自由决定 mode，必须先通过下面的资格闸门。
真相源：`isBaselineComplete(context)` + `ConversationContext.baseline_complete`。

| 条件 | 允许的 `final_mode` | 不允许 | 来源 |
|------|---------------------|--------|------|
| 急症红旗（呼吸困难/胸痛/昏迷/大出血等） | `escalation` | 其它任何 mode | Intent Framing emergency 检测 |
| 用药边界（停药 / 加药 / 改剂量） | `route_out` | 任何 assessment | Intent Framing medication boundary |
| 非医疗问题 | `route_out` | 任何 assessment | Intent Framing non-medical |
| **`baseline_complete = false`** 且 非急症 / 非边界 | `structured_intake` \| `clarify` | `provisional_assessment` / `conclusive_assessment` / 带 `risk` 终稿 | [12-patient-baseline.md](./12-patient-baseline.md) §3.2 |
| 有未解决 `unresolved_uncertainties` + `clarification_state.status === 'awaiting'` | `clarify` | `conclusive_assessment` | [07-episode-state.md](./07-episode-state.md) §3 |
| Episode 信息可达基础判断、仍有关键未知 | `provisional_assessment` | `conclusive_assessment` | Risk Deliberation `decision_mode='provisional'` |
| Episode 信息完整、无 critical unknown | `conclusive_assessment` | — | Risk Deliberation `decision_mode='conclusive'` |
| Deliberation 显式判定不足 | `insufficient` \| `clarify` | conclusive | Risk Deliberation `decision_mode='insufficient'` |

> 实现位置：`src/agents/conversation-executive.ts` 在 framing 之后、triage/deliberation 之前有一段
> **defensive eligibility guard**，即使 framing 给出 `provisional_assessment`，只要 `baseline_complete=false`
> 且非急症/非边界，Executive 仍强制短路到 `clarify`（或 `structured_intake`）。

### 与下游层的交互不变量

- Executive 不得在 `baseline_complete=false` 时调用 Risk Deliberation。
- Executive 不得在没有 conclusive 资格时发布 `risk_level` 非 `low` 的最终消息。
- 当 Executive 进入 `clarify` 时，`executive_summary.status` 必须为 `clarification_required`，且 `decision_mode='insufficient'`。

### 验证

- 单测：`src/agents/conversation-executive.test.ts` `baseline-gate-*` cases。
- Harness：`evaluation-harness.ts` 中 `ec-006` / `ec-007` + `evaluation-harness.test.ts > baseline gate`。
- 架构不变量：`checkAssessResponseArchitecture` 校验 `final_mode` 与 `intent_framing.interaction_mode` 一致。
