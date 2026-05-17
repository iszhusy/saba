# Patient Baseline — 行为规格

**版本**: v1.0  
**状态**: Canonical behavior (L4) — **实现进行中**（OpenSpec: `patient-baseline-clarification-gates`）  
**上游**: [01-architecture.md](../01-architecture.md)、[07-episode-state.md](./07-episode-state.md)  
**相关**: [03-intake-and-clarification.md](./03-intake-and-clarification.md)、[01-executive.md](./01-executive.md)  
**代码（目标）**: `src/types/index.ts`、`PatientBaselineRepository`（待建）、`conversation-state.prepareRequest` 合并逻辑

---

## 1. 职责与边界

### 1.1 负责

跨 **Session**、跨 **Episode** 持久化**相对稳定**的治疗上下文，供副作用风险评估使用：

- 当前治疗类型（化疗 / 靶向 / 内分泌 / 免疫 / 放疗 / 术后随访等）
- **时间锚点**：手术日，或当前周期描述（如「化疗 C2D3」）
- （推荐）关键方案或药物简称（影响规则与检索）

### 1.2 不负责

| 不归属 Baseline | 归属 |
|-----------------|------|
| 单次恶心/发热的主诉与趋势 | Episode（[07-episode-state.md](./07-episode-state.md)） |
| 澄清轮次与问题文本 | Episode.clarification_* |
| 当次 risk 结论 | Episode.assessments[] + AssessResponse |
| 疾病诊断、完整 EMR | 非目标 |

### 1.3 与 `TreatmentContext` 的关系

| 对象 | 生命周期 | 说明 |
|------|----------|------|
| **PatientBaseline** | 按 `user_id` 持久 | 真相源（目标） |
| **`AssessRequest.context`** | 单次请求 | 可覆盖 baseline 中字段，**不**默认删除已存 baseline |

合并规则（目标）：`prepareRequest` 产出 `merged_context = { ...baseline, ...request.context }`，供 Intent Framing / Triage 消费。

> **Known drift**：当前仅存在可选 `TreatmentContext`；UI demo 曾默认 `treatment_phase: 'chemotherapy_cycle'`，掩盖无档案场景——实现须移除该默认并走澄清/建档。

---

## 2. MVP 字段与完整性

### 2.1 字段

```typescript
interface PatientBaseline {
  user_id: string;
  treatment_category: string;   // 必填：治疗大类
  treatment_anchor: string;     // 必填：手术日或周期锚点（自然语言或结构化）
  primary_regimen?: string;     // 推荐：方案/关键药名
  known_side_effects?: string[];
  updated_at: string;
}
```

与现有 `TreatmentContext` 对齐扩展：`treatment_type` / `treatment_phase` / `treatment_day` 可映射自 baseline 或请求覆盖。

### 2.2 `baseline_complete`

当且仅当 **`treatment_category` 与 `treatment_anchor` 均非空** 时，`baseline_complete === true`。

`primary_regimen` 在 MVP **不**阻断完整性（但影响 triage 精度，澄清策略可 P2 推荐填写）。

---

## 3. 与澄清、输出资格的关系

### 3.1 澄清优先级（相对 Episode）

```text
P0 红旗 → escalation（不先收集档案）
用药边界 → route_out
baseline_complete === false → 档案澄清 / structured_intake（≤2 问/轮）
Episode P1 不足 → 事件澄清（≤2 问/轮）
→ assess 路径
```

档案澄清示例：「您目前主要在做什么治疗？化疗大概在第几天？」  
事件澄清示例：「恶心从什么时候开始的？是否影响进食？」

详见 [03-intake-and-clarification.md](./03-intake-and-clarification.md) §「三层信息」。

### 3.2 输出资格（硬门禁）

| 条件 | 允许的最高用户可见模式 |
|------|------------------------|
| `!baseline_complete` | `structured_intake` / `clarify` / `escalation` / `route_out` |
| `baseline_complete` && Episode P1 不足 | `clarify`；或 `provisional`（须标明未知） |
| 关键 unknown 关闭 + deliberation 允许 | `provisional` / `conclusive` |

**禁止**：在 `!baseline_complete` 时输出带明确 **risk_level 分档** 的 conclusive 结论（例：用户仅说「今天开始恶心」）。

**允许**：通用安全底线（「若出现呼吸困难请立即就医」），不替代分级 assess。

### 3.3 写入路径

- 首访 **structured intake** 表单  
- 澄清回答解析后 **upsert** baseline  
- （未来）医护预填 / 导入  

写入后同一 `user_id` 的后续 Session **必须**读到已更新 baseline。

---

## 4. 持久化（目标）

| 环境 | 存储 |
|------|------|
| 生产 | D1 表 `patient_baselines`（或 JSON 列，与 sessions 同库） |
| dev / harness | `MemoryPatientBaselineRepository` |

**不是** `ASSESSMENTS_KV`；**不是** Episode 行内字段（Episode 不得作为跨 Session 基线 SoT）。

---

## 5. 验证

### 5.1 场景（须 harness / 单测覆盖）

| 场景 | 期望 |
|------|------|
| 无 baseline +「今天开始恶心」 | `executive_summary.status === clarification_required`；无 conclusive risk 定级 |
| baseline 齐 + 恶心两天 + 吃不下 | 可进入 provisional/conclusive（依 deliberation） |
| 无 baseline + 呼吸困难 | `escalation`，不阻塞于档案 |
| baseline 齐 +「能不能停药」 | `route_out`，不评级 |

OpenSpec 细则：`openspec/changes/patient-baseline-clarification-gates/specs/*/spec.md`。

### 5.2 命令

```bash
npm run test:arch
npm run harness -- ec
```

---

## 6. 与 Layer E 架构图关系

```text
Layer E′: Patient Baseline（user_id，跨 Session）
       ↓ 合并注入每轮 context
Layer E:  Session → Episode（单次临床事件）
       ↓ conversation_context
Conversation Executive + Reasoning Spine
```

**原则**：Episode 记住「这次病况怎么变」；Baseline 记住「这位患者处在什么治疗阶段」。二者不可互相替代。
