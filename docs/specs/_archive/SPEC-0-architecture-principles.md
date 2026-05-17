# SPEC-0 — SABA AI-Native 判断架构原则

**版本**: v0.2  
**状态**: Draft  
**依赖**: 无（顶层规范）

---

## 0.1 设计目标

SABA 不是"关键词规则系统"，也不是“若干规则节点串起来的流程机”，而是一个：

> **面向乳腺癌患者副作用报告的、由单主对话代理驱动的临床分流系统**

它的职责边界是：

1. 判断是否存在紧急风险（不是诊断疾病）
2. 判断当前信息是否足够支撑一个可靠回答
3. 必要时通过最少轮次澄清获取关键信息
4. 给出安全、可执行、保守且自然的行动建议
5. 对医疗团队可审计、可复盘

---

## 0.2 核心原则（不可违反）

### 原则 A：模型负责判断，规则负责底线

规则只用于：
- 明确的安全底线约束
- 禁止行为（hard guard）
- Schema 校验（输出格式一致性）
- 模型失败时的保守 fallback
- 审计要求（所有高风险必须记录依据）

**错误做法**：
```ts
// ❌ 关键词决定风险
if (input.includes("胸闷")) return HIGH
```

**正确做法**：
```
推理节点负责评估：
- 症状含义（不是关键词）
- 严重程度
- 持续时间
- 上下文语境
- 不确定性
- 是否值得追问

安全层负责约束：
- 如果模型输出 HIGH → 最终答复必须建议立即就医
- 如果模型不确定 + 可能是红旗 → 要么追问，要么保守升级
- 如果内容涉及停药/改药/剂量 → 最终答复必须禁止直接建议
```

**关键约束**：规则不能直接成为最终用户回复。规则只限制系统能说什么，不能替系统说话。

---

### 原则 B：系统对用户只有一个发言主体

SABA 内部可以有多个推理节点，但对用户始终只有一个发言主体：

> **Conversation Executive Agent（主对话代理）**

它负责：
- 理解当前轮的沟通目标
- 决定是否澄清、评估、升级或转出
- 整合各专家节点的 reasoning / uncertainty / constraints
- 生成最终用户可见回复

其他节点只能输出：
- 结构化判断
- 证据
- 不确定性
- 风险倾向
- 约束

它们不能直接输出最终用户回复。

---

### 原则 C：信息不足时，追问优先于判断；仍不足时，不装懂

如果用户只说"我不舒服"，系统不能直接给 LOW。

系统必须优先尝试最少轮次澄清。但如果在受限轮次内仍不足，系统也不能假装确定。

允许的输出模式只有：
- `clarify`：继续追问 1-2 个高信息增益问题
- `provisional_assessment`：给倾向性判断并明确条件
- `insufficient_for_assessment`：明确说明当前无法可靠下结论，但给出安全下一步

**信息不足永远不等于 LOW**。

---

### 原则 D：风险判断必须表达不确定性

所有风险输出必须显式表达：
- 当前知道什么
- 当前不知道什么
- 未知项会如何影响判断
- 为什么当前还能 / 不能继续给结论

```json
{
  "decision_mode": "provisional",
  "risk_level": "medium",
  "confidence": 0.74,
  "uncertainty_reasons": [
    "未提供体温",
    "未说明是否能进食饮水"
  ],
  "critical_unknowns": [
    "temperature",
    "oral_intake"
  ],
  "response_eligibility": "can_provide_provisional_only"
}
```

**系统不知道 = 必须表达不知道**，而不是假装确定。

---

### 原则 E：多轮对话是临床 Episode，不是普通 Chat History

用户的第二轮"现在更严重了"，系统必须知道：
- "更严重"的对象是什么（上轮评估的哪个症状）
- 变化趋势（加重还是缓解）
- 时间线（从什么时候开始变化）
- 上轮未解决的不确定性是什么
- 这次变化是否关闭了某些不确定性或引入了新风险

所以状态单位是 **Episode**（临床事件），不是简单 messages 数组。

---

### 原则 F：采用单主代理 + 专家节点的收敛架构

现阶段不鼓励让多个子 Agent 彼此协商，也不鼓励形成沉重的 agent-to-agent 协议。

但这不意味着系统应该退化成纯 if/else 流程机。

推荐形态是：
- **一个主对话代理**：Conversation Executive Agent
- **多个无状态专家节点**：负责单次推理、检索、校验、约束
- **所有复杂性收敛在主代理**：由它决定如何与用户交互

推荐模式：

```ts
executiveResponse = executiveAgent({
  user_input,
  episode_state,
  specialist_outputs,
  safety_constraints,
})
```

而不是：

```ts
subAgentA -> subAgentB -> subAgentC -> 协商 -> 回退 -> 再补问
```

---

### 原则 G：澄清由信息增益驱动，不由字段缺口表驱动

不是缺一个字段就机械地追问一个字段，而是要问：

> 哪个问题最可能改变当前的风险分层、行动建议或升级判断？

因此澄清节点应输出：
- 当前关键不确定性
- 每个候选问题的预期信息增益
- 该问题若回答，会如何改变判断边界

**产品约束**仍然可以是：
- 每次最多 1-2 个问题
- 尽量一次表单完成
- 不制造无限追问

但这属于交互预算约束，不是推理原则本身。

---

### 原则 H：安全审查必须存在，但只输出约束，不直接输出最终答复

Safety Validator / Safety Critic 的职责仍然是：
- 检查是否低估风险
- 检查是否缺少必要建议
- 检查是否有危险建议
- 检查是否有药物剂量/停药建议
- 设定风险下界和强制警示语义

它应输出：
- `required_actions`
- `forbidden_claims`
- `required_warning_signals`
- `risk_floor`
- `rewrite_reason`

它**不负责**：
- 发起复杂多轮流程
- 主导系统状态迁移
- 直接生成最终用户答复

---

### 原则 I：所有判断可审计

每次评估必须记录：
- 使用的模型名称
- Prompt 版本
- 推理摘要
- 引用的证据来源
- 不确定性原因
- 触发的安全约束
- 最终决策链
- 最终回复模式（clarify / provisional / conclusive / escalation / route_out）

---

## 0.3 推荐架构（AI-native 收敛版）

现阶段采用 **single-executive + specialist nodes** 收敛架构：

```
用户输入
  → Conversation Executive Agent
      ├─ Intent Framing Agent
      ├─ Structured Intake Manager（如需要）
      ├─ Clarification Planning Agent（如需要）
      ├─ Clinical Triage Agent
      ├─ Evidence Retrieval（tool）
      ├─ Risk Deliberation Agent
      ├─ Safety Critic（constraint layer）
      └─ Response Composer
  → 最终响应
```

关键约束：
- 子模块之间不直接“对话”
- 子模块不自行触发下游模块
- 所有用户可见回复都由 Executive Agent / Response Composer 统一生成
- Safety 只能约束最终回复，不直接替代最终回复
- 澄清是主代理控制下的决策行为，不是一个裸露的中间产物

---

## 0.4 模块分类：Agent vs Tool vs Function

| 模块 | 当前推荐形态 | 原因 |
|------|-------------|------|
| Conversation Executive Agent | 主代理 | 唯一负责对用户发言 |
| Intent Framing Agent | 轻量 Agent | 负责入口理解与对话框架化 |
| Structured Intake Manager | Tool / UI | 表单生成与解析 |
| Clarification Planning Agent | Tool 或轻量 Agent | 负责高信息增益问题选择 |
| Clinical Triage Agent | Agent | 核心临床推理节点 |
| Evidence Retrieval | Tool | 检索、重排、裁剪 |
| Risk Deliberation Agent | Agent | 综合推理、风险倾向与决策资格 |
| Safety Critic | Tool / constraint node | 输出约束，不应主导流程 |
| Response Composer | Function 或 Executive 子模块 | 最终文案组装 |

---

## 0.5 规则允许范围 vs 禁止范围

### 允许规则（范围窄）

| 类型 | 例子 | 原因 |
|------|------|------|
| 输出安全规则 | HIGH 必须建议就医 | 防止模型漏安全建议 |
| 禁止建议 | 不允许自行停药、改剂量 | 医疗合规 |
| Schema 校验 | risk_level 必须是 high/medium/low | 工程可靠性 |
| 模型失败 fallback | 模型失败时给保守升级/标准化紧急建议 | 可用性 |
| 审计规则 | 所有 HIGH 必须记录 evidence | 可追踪 |
| 回复约束 | 必须包含 warning signal | 安全表达一致性 |

### 禁止规则（会导致漏诊、误判或糟糕体验）

| 类型 | 例子 | 问题 |
|------|------|------|
| 关键词决定风险 | "胸闷"=HIGH | 语境可能完全不同 |
| 单字段决定风险 | 持续 2 天=中风险 | 需要结合程度和类型 |
| Parser 决定最终症状 | 没识别到就当没有 | 漏诊风险 |
| 澄清裸输出 | intent 产出问题后直接给用户看 | 泄露中间层语言 |
| Safety 直接回复用户 | 约束层直接产最终用户文案 | 会重新滑回模板式系统，破坏单一发言主体 |
| RAG 简单关键词匹配 | includes(keyword) | 覆盖差、召回差 |

---

## 0.6 模型选择策略

| 任务 | 推荐模型 | 理由 |
|------|---------|------|
| Intent Framing | haiku-4-5 | 快速、低成本、足够 |
| 对话充分性判断 | haiku-4-5 | 结构化判断、小模型足够 |
| Clarification Planning | haiku-4-5 / sonnet-4-6 | 根据复杂度选，用于信息增益判断 |
| Clinical Triage | sonnet-4-6 | 需要临床推理能力 |
| Risk Deliberation | sonnet-4-6 | 综合判断、复杂推理 |
| Safety Critic | sonnet-4-6 | 需要理解医疗安全边界 |
| Final Response Synthesis | sonnet-4-6 | 需要自然表达、清晰不确定性与约束对齐 |

**原则**：能用小模型解决的判断不用大模型；大模型用于高价值推理和最终综合表达。

---

## 0.7 失败模式与保守降级

| 失败场景 | 降级行为 |
|---------|---------|
| Intent Framing JSON 解析失败 | 返回有限澄清，不进入评估 |
| Clinical Triage 超时 | 进入保守 provisional 或升级 |
| RAG 检索无结果 | 保留 reasoning，但提高 uncertainty |
| Risk Deliberation 输出无效 | 不给 conclusive，改为 clarify / provisional |
| Safety Critic 发现违规 | 注入约束并重写最终回复 |
| 最终重写仍失败 | 返回标准化安全回复 |
| LLM 完全不可用 | 返回标准化紧急建议或保守联系团队建议 |

---

## 0.8 与现有实现的关系

当前实现（`orchestrator.ts`）存在以下问题，将在后续 SPEC 中逐个修复：

| 问题 | 解决 SPEC |
|------|----------|
| symptomParser 是入口，而非 Intent Framing | SPEC-1 |
| 硬编码风险规则驱动判断 | SPEC-2 / SPEC-5 |
| 无法追问，信息不足直接评估 | SPEC-3 |
| 无 Episode 状态管理 | SPEC-7 |
| RAG 简单关键词匹配 | SPEC-4 |
| Safety 直接替系统说话 | SPEC-6 |
| 无 final response synthesis 层 | SPEC-10 |
| 无结构化输出 + trace + constraint injection | SPEC-8 |

---

## 0.9 后续 SPEC 路线图

| SPEC | 名称 | 依赖 |
|------|------|------|
| SPEC-0 | AI-Native 判断架构原则（本文） | — |
| SPEC-1 | Intent Framing Agent | SPEC-0 |
| SPEC-2 | Clinical Triage Agent | SPEC-1 |
| SPEC-3 | Structured Intake & Clarification Planning | SPEC-1 |
| SPEC-4 | Evidence Retrieval Tool | SPEC-2 |
| SPEC-5 | Risk Deliberation Agent | SPEC-4 |
| SPEC-6 | Safety Critic Constraint Layer | SPEC-5 |
| SPEC-7 | Conversation State & Episode Memory | SPEC-1 |
| SPEC-8 | LLM Runtime (cache + structured output + constraint injection) | SPEC-6 |
| SPEC-9 | Evaluation Harness | SPEC-8 |
| SPEC-10 | Conversation Executive Agent | SPEC-0,1,3,5,6,7,8 |
