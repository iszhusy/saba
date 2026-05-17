# Episode State & Session Memory — 行为规格

**版本**: v1.1  
**状态**: Canonical behavior (L4)  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/episode-state/00-goal.md](../modules/episode-state/00-goal.md)  
**相关**: [12-patient-baseline.md](./12-patient-baseline.md)（跨 Session 治疗基线）、[03-intake-and-clarification.md](./03-intake-and-clarification.md)（澄清与记忆分工）  
**代码**: `src/services/conversation-state.ts`、`src/services/assess-pipeline.ts`、`src/types/index.ts`、`src/storage/schema.sql`  
**归档参考**: `docs/specs/_archive/SPEC-7-conversation-state.md`

---

## 1. 职责与边界

### 1.1 本模块负责（Layer E — 临床事件记忆）

1. 维护 **Session**（对话容器）与 **Episode**（单一临床事件）  
2. 追踪**本事件内**：症状、评估历史、工作假设、未决未知、澄清史  
3. 为 follow-up（「更严重了」「还是恶心」）提供可解析上下文  
4. 持久化（D1 / 内存 repo）支持恢复与审计  

### 1.2 本模块不负责

| 不属于 Layer E | 归属 |
|--------------|------|
| 裸 `messages[]` 堆叠进 prompt | 禁止；非真相源 |
| 跨 Session 的治疗方案、手术日、周期锚点 | [12-patient-baseline.md](./12-patient-baseline.md)（Patient Baseline） |
| 单次 assess 结果缓存 | `ASSESSMENTS_KV`（按 `assessment_id`，非对话记忆） |
| 用户可见终稿 | Conversation Executive |

### 1.3 架构硬约束

> **状态单位是 Episode，不是裸聊天记录。**

系统要记住的是：

- 当前在判断哪类**临床事件**
- 上轮未知项、工作假设
- 症状与风险**趋势**
- 澄清史与安全建议相关上下文

**不是**把每轮用户/助手原文逐条堆进 prompt。

### 1.4 三层信息（与 Intake / Baseline 分工）

| 层级 | 名称 | 生命周期 | 主要存储 |
|------|------|----------|----------|
| **A** | Patient Baseline（治疗基线） | 跨 Session，按 `user_id` | Baseline repo（规格见 12；实现进行中） |
| **B** | Episode（本次临床事件） | 一次副作用/症状相关事件 | `episodes` 表 / Episode repo |
| **C** | 当轮澄清回答 | 写入 B；若补档案则写入 A | `clarification_history` 等 |

**规则**：缺 **A** 时不得因 **B** 的部分症状词直接进入 conclusive 分级（见 12、03）。缺 **B** 的 P1 字段时在本 Episode 内澄清。

---

## 2. 两层结构

```text
Session（对话容器，默认 30 分钟 TTL）
  ├── session_id, user_id, status, expires_at
  ├── active_episode_id
  ├── episodes[]          # EpisodeSummaryItem 列表（摘要，非全文）
  └── …
        └── Episode（单一临床事件）
              ├── symptoms { reported[], extracted[] }
              ├── assessments[]
              ├── working_hypotheses
              ├── unresolved_uncertainties
              ├── clarification_state / clarification_history
              └── context_summary
```

| 层级 | 职责 | 状态枚举 |
|------|------|----------|
| **Session** | 用户一次对话会话；指向当前 active Episode | `active` / `clarifying` / `assessing` / `completed` / `expired` |
| **Episode** | 一次副作用/症状相关临床事件 | `active` / `resolved` / `escalated` |

类型真相源：`src/types/index.ts` → `Session`、`Episode`、`ConversationContext`、`SessionHistory`。

> **注**：`Session.status` 含 `assessing`，当前主路径由 Executive 结果推导为 `active` / `clarifying` / `completed` 为主；`assessing` 保留供扩展，实现未强制写入。

---

## 3. Episode 字段（规范 vs 运行时）

### 3.1 运行时 SoT（`src/types/index.ts`）

```typescript
interface Episode {
  episode_id: string;
  session_id: string;
  user_id: string;
  status: "active" | "resolved" | "escalated";
  started_at: string;
  updated_at: string;
  symptoms: {
    reported: string[];
    extracted: EpisodeSymptom[];  // 含 trend?: worsening | improving | stable | unknown
  };
  assessments: EpisodeAssessmentRecord[];
  clarification_state?: ClarificationState;
  clarification_history: ClarificationRound[];
  working_hypotheses: { primary?: string; alternatives: string[] };
  unresolved_uncertainties: { item: string; impact: string; status: "open" | "resolved" }[];
  context_summary: string;
}
```

### 3.2 目标字段（M6，尚未全部落地）

| 字段 | 用途 | 运行时 |
|------|------|--------|
| `current_response_mode` | 上轮 Executive `final_mode`，供 follow-up | **未持久化**（`conversation-state.test.ts` 显式断言） |
| `last_safe_action_recommendation` | 连贯安全建议 | **未持久化** |
| `last_decision_mode` | 上轮 `decision_mode` | **未持久化** |

M6 完成标准：主路径以 Episode 为 SoT 时，上述字段要么写入 Episode，要么从 `assessments[]` 可推导，并在 spec 中单一标注。

### 3.3 `context_summary` 语义

| | 规格目标 | 当前实现（Known drift） |
|--|----------|-------------------------|
| **意图** | 供 follow-up 快速恢复的**临床事件摘要**（主诉、趋势、最近判断要点） | `finalizeAssessment` 中多为 `request.input.slice(0, 120)`，易被最后一句话覆盖 |
| **要求** | 应随事件演进累积或重写为摘要，而非仅截断最后一轮输入 | 待 M6 与 `conversation-state.ts` 对齐 |

Follow-up 解析除 `context_summary` 外，**必须**同时依赖 `symptoms.reported`、`assessments[]`、`unresolved_uncertainties`，不得只信 summary 字符串。

---

## 4. 运行时流转

主路径：`src/services/assess-pipeline.ts`

```text
prepareRequest
  → 解析/创建 Session（TTL、过期、terminal 则新建）
  → 解析/复用或新建 Episode（见 §5）
  → 注入 session_id、episode_id、session_history
  → 构建 conversation_context
        ↓
ConversationExecutive.execute(conversation_context, …)
        ↓
clarification_required ?
  → markClarificationAwaiting（澄清 TTL 10 分钟，Session→clarifying）
  : finalizeAssessment（合并症状、assessment、假设、未知项，更新 Session/Episode 状态）
```

**写入口**：仅 `ConversationStateService`；Executive 与 reasoning 节点**不得**直接写 D1。

**读入口**：`PreparedConversationState.conversation_context` + 派生 `session_history`（见 §6）。

---

## 5. Episode 生命周期与复用

### 5.1 何时新建 Episode

`prepareRequest` 在以下情况 **创建新 Episode**：

- 无 active Episode  
- 现有 Episode **不可复用**（`shouldReuseEpisode` 为 false）

### 5.2 `shouldReuseEpisode` 规则（`conversation-state.ts`）

| Episode.status | 行为 |
|----------------|------|
| `active` | **复用** |
| `resolved` | **新建**（新临床事件） |
| `escalated` | 若同时满足：① 距上次 assessment ≤ **24h**；② 症状与 `reported`/`extracted` 有重叠 **或** 输入命中 follow-up 话术；③ （可选）`session_history.previous_risk_levels` 含 `medium` 且为 follow-up 话术 → **复用**；否则新建 |

Follow-up 话术（示例）：`更严重`、`加重`、`恶化`、`还是这样`、`还没好`、`比刚才` 等（与代码内正则一致）。

### 5.3 Session 与 Episode 状态映射（Executive 驱动）

| `executive_summary.status` | Episode.status | Session.status（典型） |
|----------------------------|----------------|-------------------------|
| `clarification_required` | `active` | `clarifying` |
| `completed` / `redirected` | `resolved` | `completed` |
| `escalated` | `escalated` | `active` |
| 其他 assess 完成 | `active` 或按上表 | `active` |

真相源：`executive_summary.status`（见 [02-contracts.md](../02-contracts.md)）；`clarification_required` 为 derived 展示，不以裸字段为 SoT。

### 5.4 澄清过期

`clarification_state.status === awaiting` 且超过 `expires_at`（默认自 `asked_at` 起 **10 分钟**）→ 标记 expired，Session/Episode 回到可继续 assess 的路径（harness `s7-005`）。

### 5.5 Session TTL

Session `expires_at` 默认自活动起 **30 分钟** 滑动续期；过期后会话不可用，**不**等同于 Episode resolved（跨 Session 续聊靠新 Session + Baseline + 可选新 Episode）。

---

## 6. 给推理层的派生视图

不将整颗 Episode JSON 默认塞给所有节点，而是：

### 6.1 `SessionHistory`（派生）

来源：`buildSessionHistory(episode)`，在 `prepareRequest` 中若请求未带 `session_history` 则自动注入。

| 字段 | 含义 |
|------|------|
| `previous_risk_levels` | 本 Episode 内历次 assessment |
| `previous_symptoms` | extracted 标准词 |
| `symptom_trends` | 每条症状的 trend |
| `time_between_assessments` | 最近两次 assessment 时间差（ms） |

趋势推断（实现）：对用户输入做规则匹配 → `worsening` / `improving` / `stable` / `unknown`，写入 `EpisodeSymptom.trend`。

### 6.2 `ConversationContext`（派生）

```typescript
interface ConversationContext {
  session?: Session;
  episode?: Episode;
  clarification_state?: ClarificationState;  // 通常来自 episode
  session_history?: SessionHistory;
  executive_message?: string;
}
```

### 6.3 `session_history` 双源约定

| 来源 | 用途 |
|------|------|
| **默认（生产）** | 由当前 Episode 派生，SoT 为 Episode |
| **请求显式传入** | harness / 测试夹具；不得与 Episode 事实长期分叉 |

### 6.4 与 Reasoning 的消费关系

| 消费者 | 使用方式 |
|--------|----------|
| Intent Framing | `session_history`、`clarification_state` → `is_follow_up`、answerability |
| Clinical Triage | 症状列表、趋势、既往 risk |
| Clarification | `clarification_history` → 避免重复问题 |
| Risk Deliberation | assessments、unknowns |
| Executive | 连贯话术；**不**向用户暴露 episode_id |

**TreatmentContext / Baseline**：经 `AssessRequest.context` 与（未来）合并后的 baseline 注入 Intent/Triage，**不**存入 Episode 字段（Episode 可存当次 assess 快照到 assessment 元数据，但跨 Session 基线不以 Episode 为 SoT）。

---

## 7. Follow-up 解析要求

用户说「现在更严重了」时，系统须能关联：

1. **哪个症状/事件**在恶化（`symptoms` + `session_history.symptom_trends`）  
2. **相对哪次** `assessments` 记录（至少最近一条）  
3. 是否触发 **risk floor 上调** 或 `escalation`（Executive + Safety，非 Episode 单独决定）

输入来源优先级：`symptoms.reported` / `extracted` > `assessments[]` > `unresolved_uncertainties` > `context_summary`。

---

## 8. 持久化

| 环境 | Session | Episode | 单次 assess 缓存 |
|------|---------|---------|------------------|
| 生产 API | D1 `sessions`（`episodes_json` 摘要） | D1 `episodes`（JSON 列） | `ASSESSMENTS_KV` |
| 开发 / harness | `MemorySessionRepository` | `MemoryEpisodeRepository` | 可选 KV mock |

Schema：`src/storage/schema.sql` → `sessions`、`episodes`。

**原则**：对话记忆 = Session 容器 + Episode 临床连续性；KV 仅按 `assessment_id` 查历史评估详情，**不**替代 Episode。

---

## 9. 完成标准与验证

### 9.1 M6（Episode 为主路径 SoT）

- orchestrator/assess 主路径读取 `conversation_context.episode`，非仅请求内扁平 `session_history`  
- `context_summary` 行为与 §3.3 目标一致  
- 目标字段（§3.2）落地或明确由 `assessments[]` 推导  

### 9.2 回归

```bash
npm run test:arch
npm run harness -- ec    # spec7、followup、insufficient_info
```

| Harness 类别 | 验证点 |
|--------------|--------|
| `spec7` | clarifying / escalated 续报 / session 过期 / 新 episode |
| `followup` | 趋势、加重话术、episode 复用 |
| `insufficient_info` | 澄清态，非 conclusive |

---

## 10. 一句话总结

**记忆（Layer E）= Session 管对话容器 + Episode 管单次临床事件的连续性与审计；每轮经 `ConversationStateService` 读写持久层，Executive 读 `conversation_context` 做 follow-up，刻意不做全量 chat log 记忆。跨 Session 的治疗基线见 [12-patient-baseline.md](./12-patient-baseline.md)。**
