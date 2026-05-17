# SABA 服务端架构（Agent 核心模块视角）

> 面向架构阅读的图示化说明 · 实现与 `docs/specs-ai-native/01-architecture.md` 对齐  
> 更新：2026-05-18

**阅读主线**：本文以智能体 **「感知 → 决策 → 执行 → 学习」闭环** 组织说明（§2）；§3 起为八大模块与部署等补充图示。

---

## 2. 感知 – 决策 – 执行 – 学习闭环（核心）

SABA 是 **判断型 Agent（Judgment Agent）**：每一轮用户输入走完整闭环；**学习**不依赖在线训练，而是 **trace + 反馈 + evaluation harness** 驱动规则、提示词与知识的迭代。

### 2.1 闭环总览

```mermaid
flowchart TB
  subgraph Perceive["① 感知 Perceive"]
    direction TB
    P1["接入：AssessRequest + trace"]
    P2["记忆载入：Baseline / Episode"]
    P3["上下文：prepareRequest"]
    P4["意图·分诊·证据：Intent / Triage / RAG"]
  end

  subgraph Decide["② 决策 Decide"]
    direction TB
    D1["Executive 编排"]
    D2["Risk Deliberation · LLM"]
    D3["Safety constraints"]
    D4["Synthesis → mode + 结论资格"]
  end

  subgraph Execute["③ 执行 Execute"]
    direction TB
    E1["对用户：JSON / SSE"]
    E2["对状态：finalize / 澄清挂起"]
    E3["对系统：D1 · KV · 团队 Outbox"]
  end

  subgraph Learn["④ 学习 Learn"]
    direction TB
    L1["trace · surfaces 落库"]
    L2["feedback · events"]
    L3["harness · test:arch"]
    L4["迭代：规则 / 知识 / prompt"]
  end

  Perceive --> Decide --> Execute
  Execute -->|"Episode 回写"| Perceive
  Execute --> Learn
  Learn -.->|"规格与用例反哺"| Perceive
```

| 环节 | 回答的问题 | 对应 Agent 模块 | 闭环中的位置 |
|------|------------|-----------------|--------------|
| **感知** | 用户说了什么？临床上下文是什么？缺什么信息？ | ②记忆 ③上下文 ④工具 ①模型 | 每轮入口 |
| **决策** | 风险多高？能否下结论？对用户采用哪种交互模式？ | ⑦编排 ①模型 ⑤安全 | 核心认知 |
| **执行** | 把判断变成用户可行动作与系统侧持久化 | ⑥人机交互 ②记忆 | 对外生效 |
| **学习** | 如何从真实运行与反馈中改进 | ⑧可追溯 ⑤回归 | 跨轮、离线 |

---

### 2.2 感知（Perceive）

**目标**：把非结构化的患者叙述，变成带临床记忆、可审计的 **结构化认知输入**（非裸 chat log）。

```mermaid
flowchart LR
  U["用户 input"] --> API["⑥ POST /assess"]
  API --> PR["③ prepareRequest"]
  PR --> D1[("② D1<br/>baseline · session · episode")]
  PR --> CTX["ConversationContext"]
  CTX --> IF["① Intent Framing"]
  IF --> CT["④ Clinical Triage"]
  CT --> ER["④ Evidence / RAG"]
  ER --> PACK["ReasoningSurfaces 输入包"]
```

| 实现步骤 | 做什么 | 具体实现 | 技术选型 |
|----------|--------|----------|----------|
| **输入接入** | 接收本轮症状描述与治疗上下文 | `AssessRequest`（`user_id`, `input`, `context`, 可选 `session_id` / `episode_id`） | HTTP JSON；流式走 `POST /api/v1/assess/stream`（SSE） |
| **Trace 注入** | 关联一次用户旅程 | `createTraceContext` / 请求头 `X-Trace-Id`, `X-Span-Id` | `src/lib/trace.ts` |
| **记忆载入** | 恢复临床连续性 | `ConversationStateService.prepareRequest()` 读/建 Session、Episode；`PatientBaselineRepository` | **Cloudflare D1**（`sessions`, `episodes`, `patient_baselines`） |
| **上下文合并** | 治疗档案进入本轮 context | `mergeBaselineIntoContext()`、`isBaselineComplete` | TypeScript 领域逻辑 · `src/lib/patient-baseline.ts` |
| **意图感知** | 是否急症、是否 follow-up、是否可回答 | `createIntentFramer().frame()` → `IntentFramingSurface` | **LLM structured JSON**（Claude / Qwen via `llm-config.ts`） |
| **临床图景** | 症状标准化、规则倾向、关键未知项 | `createClinicalTriage().assess()` | **规则 + 症状解析**（`clinical-triage.ts`）；规则库作底线输入 |
| **证据感知** | 按需检索循证片段 | `createEvidenceRetrievalTool().retrieve()` | **本地 RAG**（`src/rag/retriever.ts`，`docs/knowledge/`，`RAG_ENABLED`） |

**感知产出物**（供决策消费）：

- `PreparedConversationState`（session、episode、合并后的 request）  
- `IntentFramingSurface`、`TriageAssessmentSurface`、`EvidenceRetrievalSurface`  
- 若信息不足：短路为「需澄清」，**不进入完整审议**

**设计要点**：Episode 记录 `symptoms.reported/extracted`、`unresolved_uncertainties`、`clarification_state`，使「更严重了」等 follow-up 有指代对象。

---

### 2.3 决策（Decide）

**目标**：在安全边界内，形成 **可发布的判断**（风险等级 + 结论资格 + 交互模式），且过程可审计。

```mermaid
flowchart TD
  IN["感知产出 surfaces"] --> EX["⑦ ConversationExecutive.execute"]
  EX --> RD["① Risk Deliberation<br/>LLM structured"]
  RD --> DM{"decision_mode"}
  DM -->|insufficient| CL[clarify / intake]
  DM -->|provisional / conclusive| SF["⑤ validateSafety"]
  SF --> SY["synthesis + executive_summary"]
  SY --> OUT["AssessResponse"]
```

| 实现步骤 | 做什么 | 具体实现 | 技术选型 |
|----------|--------|----------|----------|
| **编排调度** | 决定走短路还是完整链 | `conversation-executive.ts`：急症 `escalation`、越界 `route_out`、基线不全强制澄清 | **中心化 DAG**（TypeScript 编排，非 Agent 互聊） |
| **风险审议** | 综合 framing + triage + evidence 定级 | `createRiskDeliberation().deliberate()` → `RiskDeliberationSurface` | **LLM**；runtime：`structured` / `tool_native`（`resolveDeliberationRuntime`） |
| **结论资格** | 区分能说到什么程度 | `decision_mode`: `conclusive` \| `provisional` \| `insufficient`；映射 `ExecutiveResponseMode` | 类型契约 · `src/types/index.ts` |
| **安全约束** | 底线与禁说项 | `validateSafety()` → `constraints`（`risk_floor`, `forbidden_claims`…） | **规则 + 正则**（`safety-validator.ts`），非重做临床推理 |
| **终稿决策** | 用户可见 message 与 status | `synthesizeExecutiveResponse()` + `executive_summary` | 当前以 **模板合成** 为主（`executive-synthesis.ts`）；constraints 注入 synthesis 链 |

**决策原则**（架构级）：

- 规则与 RAG **不单独定级**；LLM 审议 + Safety floor 共同约束。  
- 仅 Executive 路径产生 **对用户可见** 的 `immediate_action` / mode。  
- Runtime SoT：`executive_summary` + `reasoning_surfaces`（`architecture-invariants.ts` 校验）。

---

### 2.4 执行（Execute）

**目标**：让决策 **对患者可用、对系统可延续、对团队可触达**。

```mermaid
flowchart LR
  AR["AssessResponse"] --> HCI["⑥ 返回用户"]
  AR --> PIPE["assess-pipeline 收尾"]
  PIPE --> FA["finalizeAssessment"]
  PIPE --> CL2["markClarificationAwaiting"]
  FA --> EP[("② 更新 Episode")]
  HCI --> KV[("KV 快照")]
  HCI --> DB[("D1 assessments")]
  AR -->|high + team_contact| NTF["team_notifications Outbox"]
```

| 实现步骤 | 做什么 | 具体实现 | 技术选型 |
|----------|--------|----------|----------|
| **对用户输出** | 展示结论或追问 | `POST /assess` JSON；或 SSE：`pipeline_step` / `message` / `error` | **REST + SSE**（`assess-stream.ts`）；React 对话 UI |
| **模式落地** | 澄清 / 暂定 / 结论 / 升舱 | `executive_summary.status` + `final_mode`；前端据 status 渲染 | 有限 **state machine**（非自由生成 UI） |
| **Episode 写回** | 症状、评估记录、澄清 TTL | `finalizeAssessment()` / `markClarificationAwaiting()` | **D1**；仅 `ConversationStateService` 写 Session/Episode |
| **评估持久化** | 可查询历史与审计 | `AssessmentRepository.create()`；生产另 `ASSESSMENTS_KV.put` | **D1 + Cloudflare KV**（KV ~30d TTL） |
| **澄清轮** | 不误导为「已评估完成」 | `clarification_required` 时不写完整 assessment 行（`shouldPersistAssessment`） | 派生状态，真相在 `executive_summary.status` |
| **团队侧执行** | 高风险通知入队 | `POST /api/v1/team/notify` → `team_notifications` | D1 **Outbox** 表；dispatch 待完善 |
| **行为埋点** | 产品分析 | `POST /api/v1/events` → `assessment_events` | D1 + `trace_json` |

**执行边界**：输出为「就医 / 联系团队 / 观察」类行动建议，**不包含**诊断、剂量、停药改药（⑤ 在决策阶段已拦截）。

---

### 2.5 学习（Learn）

**目标**：从运行数据 **可追溯地改进** 系统行为；**不做** 模型权重在线更新，采用 **Spec-as-Code + harness 回归**。

```mermaid
flowchart TB
  subgraph Online["线上运行"]
    T["trace_id 贯穿 assess / baseline / events"]
    F["POST /feedback"]
    S["reasoning_surfaces 随响应返回"]
  end

  subgraph Store["沉淀"]
    J["D1 trace_json"]
    Q["GET /debug/trace/:id"]
  end

  subgraph Offline["离线学习循环"]
    R["人工复盘 · 误判标注"]
    C["新增 TestCase"]
    H["npm run harness"]
    A["npm run test:arch"]
    I["改 prompt / 规则 / RAG 知识"]
  end

  Online --> Store --> R --> C --> H & A --> I
  I -.-> Online
```

| 实现步骤 | 做什么 | 具体实现 | 技术选型 |
|----------|--------|----------|----------|
| **全链路追溯** | 一次旅程可聚合 | `TraceContext`；D1 `trace_json`；`TraceRepository.getTraceChain` | `src/lib/trace.ts`、`trace-chain.ts` |
| **推理可复现** | 知悉每步依据 | 响应内 `reasoning_surfaces`；SSE `pipeline_step` | JSON 结构化 surface，非黑盒单字符串 |
| **人类反馈** | 是否有帮助、是否就医 | `feedback` 表 · `POST /api/v1/feedback` | **D1** |
| **场景回归** | P0 场景不退化 | `evaluation-harness.ts`（red_flag、insufficient_info、spec7…） | **Vitest + tsx**（`npm run harness`） |
| **架构门禁** | 契约不被破坏 | `checkAssessResponseArchitecture()` | **Vitest**（`npm run test:arch`） |
| **知识/规则迭代** | 循证与底线更新 | `docs/knowledge/`、`rule_versions` 表（预留） | 静态知识 + 版本化部署 |
| **开发流程** | 先测后码 | 新行为先加 harness case（`AGENTS.md`） | **Spec-driven**，非 RLHF |

**闭环如何闭合**：

```text
执行阶段写入 trace / assessment / Episode
    → 学习阶段：复盘 → 新 harness case → 调 ①提示词 / ④知识 / ⑤规则
    → test:arch + harness 通过 → 部署
    → 下一轮「感知」加载的知识与规则已更新，对患者行为改善
```

**当前未做**：基于 feedback 的自动 prompt 优化、在线 A/B 模型路由。

---

### 2.6 闭环与单次评估时序（对照）

将四环节叠在同一时序上，便于与 §4 对照阅读：

```mermaid
sequenceDiagram
  box 感知
    participant U as 用户
    participant S as State·记忆·上下文
    participant T as 工具+Intent
  end
  box 决策
    participant E as Executive
    participant L as LLM审议
    participant F as Safety
  end
  box 执行
    participant H as API·UI
    participant D as D1/KV
  end
  box 学习
    participant TR as trace·harness
  end

  U->>H: input
  H->>S: prepareRequest
  S->>T: Intent·Triage·RAG
  T->>E: surfaces
  E->>L: Deliberation
  L->>F: constraints
  F->>E: synthesis
  E->>H: AssessResponse
  H->>D: persist
  H->>TR: trace_json·surfaces
  Note over TR: 离线 harness 反哺下轮感知/决策
```

---

## 3. 系统上下文（C4 · Context）

```mermaid
flowchart LR
  Patient["患者 / 用户"]
  Team["医疗团队（可选）"]

  subgraph SABA["SABA 系统"]
    Agent["临床判断 Agent<br/>Conversation Executive"]
  end

  subgraph External["外部依赖"]
    LLM["LLM API<br/>Claude / DashScope"]
    CF["Cloudflare<br/>Workers · D1 · KV"]
  end

  Patient <-->|HTTPS 对话·评估| Agent
  Team <-->|通知·反馈| Agent
  Agent --> LLM
  Agent --> CF
```

**边界**：SABA 做副作用风险判断与保守建议；**不**诊断、**不**开药、**不**替医嘱。

---

## 4. 部署与运行时（C4 · Container）

```mermaid
flowchart TB
  subgraph Client["⑥ 人机交互 · 客户端"]
    UI["React + Vite<br/>:5173"]
  end

  subgraph Edge["⑥ 人机交互 · 接入"]
    direction TB
    Dev["dev-api<br/>Vite middleware"]
    Worker["Cloudflare Workers<br/>handler.ts"]
  end

  subgraph Core["⑦ 编排 + ③ 上下文"]
    Pipe["assess-pipeline"]
    State["ConversationStateService"]
    Exec["ConversationExecutive"]
  end

  subgraph Data["② 记忆"]
    D1[("D1 SQLite<br/>sessions · episodes · assessments")]
    KV[("KV<br/>assessment 热缓存")]
  end

  UI --> Dev
  UI --> Worker
  Dev --> Pipe
  Worker --> Pipe
  Pipe --> State
  Pipe --> Exec
  State --> D1
  Worker --> KV
  Worker --> D1
  Dev --> D1
```

| 环境 | 接入路径 | 存储 |
|------|----------|------|
| 本地 | Vite `5173` → dev-api → pipeline | 本地 D1（`npm run d1:local:init`） |
| 生产 | Workers → pipeline | D1 + KV |

---

## 5. Agent 八大模块总图

八大模块在一次评估中的**协作关系**（箭头表示数据/控制流向）：

```mermaid
flowchart TB
  subgraph M8["⑧ 可追溯性"]
    Trace["trace_id · surfaces · harness"]
  end

  subgraph M6["⑥ 人机交互"]
    API["REST / SSE"]
    UI2["Web UI"]
  end

  subgraph M7["⑦ 多 Agent · 编排"]
    Exec["Conversation Executive<br/>唯一对用户发言"]
    IF["Intent"]
    CT["Triage"]
    ER["Evidence"]
    RD["Deliberate"]
  end

  subgraph M3["③ 上下文"]
    Prep["prepareRequest<br/>ConversationContext"]
  end

  subgraph M2["② 记忆"]
    BL["Baseline"]
    SE["Session / Episode"]
  end

  subgraph M4["④ 工具"]
    RAG["RAG"]
    Rule["规则库"]
  end

  subgraph M1["① 模型"]
    LLM["LLM<br/>reasoning · synthesis"]
  end

  subgraph M5["⑤ 安全性"]
    Safe["constraints · 门禁"]
  end

  UI2 --> API
  API --> Prep
  Prep --> M2
  M2 --> Prep
  Prep --> Exec
  Exec --> IF --> CT --> ER --> RD
  CT --> Rule
  ER --> RAG
  IF & RD --> LLM
  RD --> Safe --> Exec
  Exec --> API
  API --> M2
  API --> Trace
  Exec -.->|reasoning_surfaces| Trace
```

### 模块速查

| # | 模块 | 在本系统中的职责 | 关键代码 |
|---|------|------------------|----------|
| ① | **模型** | LLM 结构化推理与合成 | `llm-config.ts`, `intent-framing.ts`, `risk-deliberation.ts`, `executive-synthesis.ts` |
| ② | **记忆** | Baseline + Episode 临床连续性 | `conversation-state.ts`, `conversation-repository.ts`, D1 |
| ③ | **上下文** | 每轮组装可推理上下文包 | `prepareRequest`, `types/index.ts` |
| ④ | **工具** | RAG / 分诊 / 规则（无终审权） | `clinical-triage.ts`, `evidence-retrieval.ts`, `rag/` |
| ⑤ | **安全性** | constraints、基线门禁、架构不变量 | `safety-validator.ts`, `architecture-invariants.ts` |
| ⑥ | **人机交互** | API、SSE、有限 response mode | `handler.ts`, `dev-api/`, `components/` |
| ⑦ | **多 Agent** | 单 Executive 编排，推理单元只产 surface | `conversation-executive.ts`, `modules/` |
| ⑧ | **可追溯性** | trace、落库、评测回归 | `trace.ts`, `evaluation-harness.ts` |

---

## 6. 单轮评估：时序与数据流

```mermaid
sequenceDiagram
  autonumber
  actor U as 用户
  participant H as ⑥ API
  participant P as assess-pipeline
  participant S as ②③ State
  participant E as ⑦ Executive
  participant T as ④ Tools
  participant L as ① LLM
  participant F as ⑤ Safety
  participant D as ② D1/KV

  U->>H: POST /assess (+ trace headers)
  H->>P: runAssessPipeline()
  P->>S: prepareRequest()
  S->>D: 读/写 Session · Episode · Baseline
  S-->>P: PreparedConversationState

  P->>E: execute(request, context)

  E->>L: Intent Framing
  alt 急症 / 越界 / 缺基线 / 需澄清
    E-->>P: AssessResponse (短路)
  else 主路径
    E->>T: Clinical Triage
    E->>T: Evidence Retrieval
    E->>L: Risk Deliberation
    E->>F: validateSafety → constraints
    E->>E: synthesis
    E-->>P: AssessResponse + surfaces
  end

  alt 已出结论（非 clarification）
    P->>S: finalizeAssessment()
    S->>D: 更新 Episode
    H->>D: persist assessment (+ KV 生产)
  else 等待澄清
    P->>S: markClarificationAwaiting()
  end

  H-->>U: JSON 或 SSE
```

**三条架构约束**（图示中应始终成立）：

1. 用户可见文案 **只** 来自 Executive（⑦ → ⑥）。  
2. 推理单元 **只** 写 `reasoning_surfaces`，不写终稿（⑦ 内部）。  
3. Session/Episode **只** 由 `ConversationStateService` 写 D1（②，不经 Executive）。

---

## 7. ⑦ 多 Agent：编排 DAG（非互聊）

逻辑上是「多推理单元」，物理上是 **Executive 中心化 DAG**；单元之间 **不** 用自然语言互相对话。

```mermaid
flowchart TD
  Start([execute]) --> IF["Intent Framing<br/>① LLM"]

  IF -->|route_out| SC1[短路 · 引导官方渠道]
  IF -->|escalation| SC2[短路 · 急诊升舱]
  IF -->|基线不全| SC3[短路 · 建档/澄清]
  IF -->|intake / clarify| SC4[短路 · 追问]

  IF --> CT["Clinical Triage<br/>④ 规则+分诊"]
  CT --> ER["Evidence Retrieval<br/>④ RAG"]
  ER --> RD["Risk Deliberation<br/>① LLM"]

  RD -->|insufficient| SC4
  RD --> SY["Safety → Synthesis<br/>⑤ → ⑦"]

  SY --> End([AssessResponse])
  SC1 & SC2 & SC3 & SC4 --> End

  style Exec fill:#e8f4fc
```

```mermaid
flowchart LR
  User((用户))

  subgraph Public["对用户可见"]
    Exec["Executive"]
  end

  subgraph Internal["仅内部 surface"]
    IF2[Intent]
    CT2[Triage]
    ER2[Evidence]
    RD2[Deliberation]
    SF[Safety]
  end

  User <-->|唯一 message| Exec
  Exec --> IF2 --> CT2 --> ER2 --> RD2 --> SF --> Exec
  IF2 & CT2 & ER2 & RD2 & SF x--x User
```

| 角色 | 对用户说话 | 产出 |
|------|------------|------|
| Conversation Executive | ✅ | `AssessResponse`, `executive_summary` |
| Intent / Triage / Deliberation | ❌ | 各 `*Surface` |
| Evidence / RAG | ❌ | `EvidenceRetrievalSurface` |
| Safety | ❌ | `SafetyConstraintSurface` |

---

## 8. ② 记忆：分层结构

```mermaid
flowchart TB
  subgraph Long["慢变 · 跨 Session"]
    BL2["Patient Baseline<br/>治疗类型 · 时间锚点 · 已知副作用"]
  end

  subgraph Mid["会话容器 · 30min TTL"]
    SS["Session"]
  end

  subgraph Fast["临床事件 · 可 24h 重开"]
    EP["Episode<br/>症状 · 评估记录 · 澄清 · unknowns"]
  end

  subgraph Snap["评估快照"]
    AS["Assessment 行 / KV 缓存"]
  end

  BL2 -->|merge → context| EP
  SS --> EP
  EP --> AS
```

| 层 | 回答的问题 | D1 表 |
|----|------------|-------|
| Baseline | 这名患者处在什么治疗背景？ | `patient_baselines` |
| Session | 当前对话窗口是否有效？ | `sessions` |
| Episode | 正在判断哪一次临床事件？ | `episodes` |
| Assessment | 哪次评估落库、可审计？ | `assessments` (+ KV) |

---

## 9. ③ 上下文：组装与传递

```mermaid
flowchart LR
  subgraph In["输入"]
    REQ["AssessRequest<br/>input · context · trace"]
  end

  subgraph Build["prepareRequest"]
    LOAD["加载 Baseline / Session / Episode"]
    MERGE["mergeBaselineIntoContext"]
    DERIVE["session_history · 澄清 TTL"]
  end

  subgraph Out["输出"]
    PREP["PreparedConversationState"]
    CTX["ConversationContext"]
  end

  subgraph Runtime["execute 过程中累积"]
    SURF["ReasoningSurfaces<br/>intent · triage · evidence · deliberation · safety"]
  end

  REQ --> LOAD --> MERGE --> DERIVE --> PREP
  PREP --> CTX
  CTX --> SURF
```

模块间 **不** 传递裸 chat history 作为主契约；主契约是 **Episode 字段 + surfaces**。

---

## 10. ① 模型 · ④ 工具 · ⑤ 安全：三角关系

```mermaid
flowchart TB
  subgraph Tools["④ 工具 · 提供事实与证据"]
    T1["Clinical Triage<br/>临床图景 · critical_unknowns"]
    T2["Evidence / RAG<br/>知识片段 · 规则 ID"]
  end

  subgraph Model["① 模型 · 审议与表达"]
    M1["Intent · Deliberation<br/>structured JSON"]
    M2["Synthesis<br/>用户可见文案"]
  end

  subgraph Safe["⑤ 安全 · 约束表达"]
    S1["risk_floor · forbidden_claims"]
    S2["基线门禁 · 急症短路"]
  end

  T1 & T2 --> M1
  M1 --> S1
  S1 --> M2
  S2 -.->|短路| M2
```

| 阶段 | 模块 | 说明 |
|------|------|------|
| reasoning | ① | Intent、Deliberation 调 LLM，输出 surface |
| — | ④ | 不调 LLM 或轻量；为审议提供输入 |
| critique | ⑤ | `validateSafety` → constraints |
| synthesis | ①+⑦ | constraints 注入后生成 message |

---

## 11. ⑥ 人机交互：协议与模式

### 11.1 API 面

```mermaid
flowchart LR
  UI["Web"] --> A1["POST /assess"]
  UI --> A2["POST /assess/stream SSE"]
  UI --> A3["GET /assessments"]
  UI --> A4["POST /baseline"]
  UI --> A5["POST /feedback · /events"]
```

### 11.2 用户可见模式（有限集合）

```mermaid
stateDiagram-v2
  [*] --> Clarify: 信息不足 / 缺基线
  [*] --> Assess: 可审议
  Clarify --> Assess: 用户补充
  Assess --> Provisional: decision_mode
  Assess --> Conclusive: decision_mode
  Assess --> Escalation: 急症 / high
  Assess --> RouteOut: 非医疗
  Provisional --> [*]
  Conclusive --> [*]
  Escalation --> [*]
  RouteOut --> [*]
```

状态 **真相源**：`executive_summary.status` + `final_mode`（非独立 `clarification_required` 字段）。

### 11.3 流式事件（SSE）

| 事件 | 含义 |
|------|------|
| `pipeline_step` | intent / triage / deliberation / safety 进度 |
| `thinking` | 审议中间态 |
| `message` | 面向用户的片段 |
| `error` | 失败 |

---

## 12. ⑧ 可追溯性（支撑学习环节）

与 §2.5 衔接：trace 落库、harness 回归、debug 聚合。命令：`npm run test:arch`、`npm run harness`。

---

## 13. 八大模块说明（简表）

### ① 模型

- **职责**：结构化推理（Intent、Deliberation）与 synthesis。  
- **Provider**：`anthropic` / `dashscope`（`env.ts`）。  
- **原则**：审议定 `decision_mode` / `risk_level`；不用关键词 alone 定级。

### ② 记忆

- **职责**：Baseline（慢）+ Episode（快）+ Assessment 持久化。  
- **写入口**：仅 `ConversationStateService`。  
- **本地**：`npm run d1:local:init`。

### ③ 上下文

- **职责**：`prepareRequest` 产出 `PreparedConversationState`；轮内累积 `ReasoningSurfaces`。

### ④ 工具

- **职责**：分诊、RAG、规则匹配；**无**最终风险裁决权。  
- **调用序**：Triage → Evidence → Deliberation 消费。

### ⑤ 安全性

- **职责**：constraints、产品边界、基线门禁、arch/harness 门禁。  
- **原则**：安全在 synthesis **之前**，非事后改错别字。

### ⑥ 人机交互

- **职责**：API/SSE/UI、有限 mode、反馈与团队通知。  
- **端口**：本地固定 `5173`（`strictPort`）。

### ⑦ 多 Agent

- **职责**：单 Executive 编排；推理单元 surface-only。  
- **见**：§7 编排 DAG。

### ⑧ 可追溯性

- **职责**：trace 传播、D1 `trace_json`、harness 回归。  
- **命令**：`npm run test:arch`、`npm run harness`.

---

## 14. 相关文档

| 文档 | 内容 |
|------|------|
| [specs-ai-native/01-architecture.md](specs-ai-native/01-architecture.md) | 分层规格（Layer A–E） |
| [specs-ai-native/02-contracts.md](specs-ai-native/02-contracts.md) | 类型与 API 契约 |
| [src/storage/schema.sql](../src/storage/schema.sql) | D1 表结构 |

---

## 一句话

> **感知**（D1 记忆 + Intent/Triage/RAG）→ **决策**（Executive + LLM 审议 + Safety）→ **执行**（SSE/API + Episode 落库）→ **学习**（trace + harness 反哺）；构成 SABA 临床判断 Agent 的完整闭环。
