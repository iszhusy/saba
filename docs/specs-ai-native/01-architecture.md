# SABA AI-Native 全面架构

**版本**: v1.0  
**状态**: Canonical  
**上游**: [00-goal.md](./00-goal.md)  
**下游**: [02-contracts.md](./02-contracts.md)、`modules/*/00-goal.md`、`behavior/*.md`

---

## 1. 系统定义

SABA 是：

> **面向乳腺癌患者副作用报告场景的、由单一对话执行主体驱动的、具备临床推理能力与安全约束机制的 AI-native 判断系统。**

### 1.1 职责边界（做）

1. 判断输入是否涉及副作用/用药相关风险评估  
2. 识别是否存在紧急升级信号  
3. 判断信息是否足以支撑可靠结论  
4. 以最小轮次获取高价值补充信息  
5. 输出安全、自然、保守、可执行的下一步建议  
6. 维持 Episode 级临床连续性与可审计性  

### 1.2 非目标（不做）

- 疾病诊断、病理解读  
- 医嘱、停药、改剂量、具体用药方案  
- 规则关键词直接定级（规则仅作底线与工具输入）  
- 多个「小客服」式 agent 对用户轮流说话  

---

## 2. 架构总览

```text
                    ┌─────────────────────────────────────┐
                    │   Layer A: Conversation Executive   │
                    │   （唯一对用户的发言主体）              │
                    └──────────────┬──────────────────────┘
                                   │ 调度 / synthesis
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│ Layer B         │    │ Layer C             │    │ Layer D          │
│ Reasoning       │    │ Capability / Tools  │    │ Constraints      │
│ (surfaces)      │    │                     │    │                  │
│ Intent→Triage→  │    │ Intake, Form, RAG,  │    │ Safety, Schema,  │
│ Deliberation    │    │ Terminology, KB     │    │ Policy           │
└────────┬────────┘    └─────────────────────┘    └────────┬─────────┘
         │                                                    │
         └────────────────────┬───────────────────────────────┘
                              ▼
                    ┌─────────────────────────────────────┐
                    │   Layer E: Memory                   │
                    │   Baseline（跨 Session）+ Episode     │
                    │   （临床事件连续性，非裸 chat log）    │
                    └─────────────────────────────────────┘
```

### 2.1 四条不可违反原则

| 原则 | 含义 |
|------|------|
| **单一对外主体** | 仅 Executive 生成用户可见 message |
| **推理产 surface，不产终稿** | Specialist 只输出结构化 reasoning；禁止直接对用户说话 |
| **安全进 synthesis** | Safety 输出 constraints，不是末尾改错别字 |
| **状态是 Episode** | 记住「在判断什么、未知什么、趋势如何」，不是 messages 堆叠 |

---

## 3. 临床推理脊柱（Reasoning Spine）

认知主链（非固定调用顺序，由 Executive 按需组织）：

```text
Intent Framing → [Intake / Clarification] → Clinical Triage → [Evidence Retrieval]
      → Risk Deliberation → Safety Constraints → Constrained Synthesis → 用户响应
```

| 节点 | 回答的问题 | 产出 |
|------|------------|------|
| **Intent Framing** | 用户要解决什么？急症？follow-up？answerability？ | `IntentFramingSurface` |
| **Intake / Clarification** | 缺什么信息？问什么最改风险边界？ | 澄清计划 / 结构化 intake |
| **Clinical Triage** | 临床图景与风险倾向？要不要检索？ | `TriageAssessmentSurface` + 扩展字段 |
| **Evidence Retrieval** | 规则/RAG 支持什么？ | `EvidenceRetrievalSurface` |
| **Risk Deliberation** | 现在能说到 conclusive / provisional / insufficient？ | `RiskDeliberationSurface` |
| **Safety Constraints** | risk floor、必说/禁说？ | `SafetyConstraintSurface` → 目标 `constraints` 对象 |
| **Executive Synthesis** | 自然语言 + mode + UI payload | `AssessResponse` |

详见 [behavior/02-clinical-reasoning-spine.md](./behavior/02-clinical-reasoning-spine.md)。

---

## 4. Conversation Executive

**身份**：统一承接用户问题、组织认知流程、在安全约束下形成最终响应的**执行智能层**（不是简单 orchestrator，也不是模板拼接器）。

### 4.1 交互模式（有限集合）

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

有限 mode 把「系统能怎么回复」从无限文案空间收敛为**交互资格空间**。

### 4.2 Executive 消费与产出

**消费**：用户输入、Episode/Session context、各 reasoning surfaces、tool results、safety constraints。  

**产出**：`executive_status` / mode、用户可见 message、可选 UI payload、审计摘要。

详见 [behavior/01-executive.md](./behavior/01-executive.md)。

---

## 5. 分层职责详表

### Layer A — Executive

- 决定本轮 interaction mode  
- 选择调用哪些 reasoning / tools  
- 何时停止收集信息、进入 synthesis  
- 唯一用户可见文案 owner  

### Layer B — Reasoning

| 模块 | 文件 |
|------|------|
| Intent Framing | [behavior/03-intent-framing.md](./behavior/03-intent-framing.md) |
| Intake & Clarification | [behavior/03-intake-and-clarification.md](./behavior/03-intake-and-clarification.md) |
| Clinical Triage | [behavior/04-clinical-triage.md](./behavior/04-clinical-triage.md) |
| Risk Deliberation | [behavior/05-risk-deliberation.md](./behavior/05-risk-deliberation.md) |

### Layer C — Capability / Tools

| 能力 | 文件 |
|------|------|
| Evidence Retrieval | [behavior/09-evidence-retrieval.md](./behavior/09-evidence-retrieval.md) |
| Structured Intake / Form Parser | intake behavior 文档 |
| Knowledge / CTCAE / RAG | `docs/knowledge/` |

工具**不拥有**最终判断资格；只为 Executive 或 reasoning 节点提供能力结果。

### Layer D — Constraints

| 模块 | 文件 |
|------|------|
| Safety Constraints | [behavior/06-safety-constraints.md](./behavior/06-safety-constraints.md) |
| Output Schema | [behavior/08-runtime-and-synthesis.md](./behavior/08-runtime-and-synthesis.md) |

目标 constraint 形状：

```typescript
interface SafetyConstraints {
  risk_floor: RiskLevel;
  required_actions: string[];
  forbidden_claims: string[];
  required_warning_signals: string[];
  rewrite_reason?: string;
  decision: "pass" | "revise" | "block";
}
```

### Layer E — State / Memory

| 模块 | 文件 |
|------|------|
| Episode & Session（临床事件连续性） | [behavior/07-episode-state.md](./behavior/07-episode-state.md) |
| Patient Baseline（跨 Session 治疗基线） | [behavior/12-patient-baseline.md](./behavior/12-patient-baseline.md) |

**分工**：

- **Episode** 须能回答：延续哪一临床事件、上轮未知项、本轮是否关闭关键 unknown、症状趋势、上次评估记录。  
- **Baseline** 须能回答：该用户当前治疗阶段与时间锚点，供分诊与规则/RAG 使用。  

**不是**裸 `messages[]`；**不是**把治疗档案塞进 Episode 替代 Profile（实现见 OpenSpec `patient-baseline-clarification-gates`）。

---

## 6. 主链路与路径变体

### 6.1 典型主链路

```text
用户输入
  → Executive
      → Intent Framing
      → (Intake / Clarification，按需)
      → Clinical Triage
      → (Evidence Retrieval，由 triage 策略决定)
      → Risk Deliberation
      → Safety Constraints
      → Constrained Synthesis
  → 用户可见响应
```

**要点**：顺序由 Executive 动态决定，不是固定 stage pipeline。

### 6.2 路径变体

| 路径 | 触发 | Executive 行为 |
|------|------|----------------|
| **A 急症** | framing 识别 emergency | 可跳过部分下游，直接 `escalation` |
| **B 信息不足** | answerability 低 | `structured_intake` 或 `clarify`，再进入 triage |
| **C 信息充分** | triage + deliberation 就绪 | 完整 deliberation → constraints → synthesis |
| **D 非医疗/越界** | 停药剂量、非医疗闲聊 | `route_out` + 保守话术 |

Walkthrough 见 [behavior/10-walkthroughs.md](./behavior/10-walkthroughs.md)。

---

## 7. 核心对象模型

### 7.1 Reasoning Surface

每个 specialist 输出 **reasoning surface**，至少覆盖部分维度：

- 当前判断 / 已知事实 / 推断 / 未知  
- 不确定性原因、决策边界、升级触发  
- 可审计摘要（`rationale`）

类型锚点：`src/types/index.ts` → `ReasoningSurfaces`。

### 7.2 结论资格（Deliberation）

```typescript
type DecisionMode = "conclusive" | "provisional" | "insufficient";
type ResponseEligibility =
  | "conclusive_assessment"
  | "provisional_assessment"
  | "clarify_more"
  | "insufficient_for_assessment"
  | "escalation";
```

系统必须显式区分「临床图景像什么」与「现在能说到什么程度」。

### 7.3 Episode（摘要）

```typescript
interface Episode {
  episode_id: string;
  session_id: string;
  status: "active" | "resolved" | "escalated";
  symptoms: { reported: string[]; extracted: ExtractedSymptom[] };
  assessments: AssessmentRecord[];
  working_hypotheses: { primary?: string; alternatives: string[] };
  unresolved_uncertainties: { item: string; impact: string; status: "open" | "resolved" }[];
  clarification_history: ClarificationRound[];
  current_response_mode?: ExecutiveResponseMode;
  context_summary: string;
}
```

完整字段见 [behavior/07-episode-state.md](./behavior/07-episode-state.md)。

---

## 8. LLM Runtime 三阶段

所有模型调用经统一 Runtime（见 [behavior/08-runtime-and-synthesis.md](./behavior/08-runtime-and-synthesis.md)）：

| 阶段 | 用途 | 典型消费者 |
|------|------|------------|
| **reasoning** | 结构化推理 JSON | Intent, Triage, Deliberation, Clarification |
| **critique** | Safety / 合规检查 | Safety Critic |
| **synthesis** | 自然语言终稿（带 constraints 注入） | Executive |

要求：Structured Output、重试降级、trace、区分 reasoning 与 user-visible draft。

---

## 9. 反模式 vs 鼓励做法

### 9.1 不鼓励

1. 子模块互相对话、私自推进流程  
2. Specialist 直接生成用户终稿  
3. Safety 接管整段回复或替代临床判断  
4. 关键词 if/else 定 risk level  
5. 旧字段（`route_action`、`corrected.*`）作为新架构锚点  
6. 澄清 = 机械字段补全  

### 9.2 鼓励

1. Executive 为唯一对外 owner  
2. Reasoning 只产 surface  
3. Safety 只产 constraints  
4. Tools 只产能力结果  
5. Episode 驱动 follow-up（「更严重了」知道指什么）  
6. 每步显式 uncertainty  

---

## 10. 完成度判定（AI-Native Done）

系统在 **M5 Executive 主路径 + M6 旧协议退出** 之前不得宣称完成。条件摘要：

| 代号 | 条件 |
|------|------|
| **A** | 用户可见响应仅来自 Executive 路径 |
| **B** | 主路径消费 reasoning surfaces，非 `route_action + rule_assessment + corrected` |
| **C** | Safety 为 constraint layer |
| **D** | 显式 conclusive / provisional / insufficient / escalation |
| **E** | Episode continuity 在主路径生效 |
| **F** | 旧 orchestrator 核心协议退出主路径 |

里程碑与文件级改动：[behavior/11-implementation-sequence.md](./behavior/11-implementation-sequence.md)。

---

## 11. 工程映射（当前）

| 架构角色 | 当前主要代码 | 目标状态 |
|----------|--------------|----------|
| Executive | `orchestrator-llm-first.ts` | 收口 synthesis，单一发言 |
| Intent | `intent-classifier.ts`, `information-sufficiency.ts` | `intent-framing.ts` 统一 contract |
| Triage | `clinical-triage.ts`, `llm-tools.ts` | clinical picture surface |
| Deliberation | orchestrator Step 4 fusion | `risk-deliberation.ts` |
| Safety | `safety-validator.ts` | constraints 非 corrected |
| State | `conversation-state.ts` | Episode 一等公民 |
| Evaluation | `evaluation-harness.ts` | P0 回归门禁 |

---

## 12. 一句话总结

> **SABA 是由 Executive 统一调度、以 reasoning surfaces 承载判断、以 constraints 守住底线、以 Episode memory 保持连续性的 AI-native clinical judgment system——不是「规则引擎 + LLM 文案层」。**

下一步：按任务读 [INDEX.md](./INDEX.md) 中对应 `modules/*/00-goal.md` 与 `behavior/*.md`；改契约时同步 [02-contracts.md](./02-contracts.md) 与 harness。
