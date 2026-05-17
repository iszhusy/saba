## Context

SABA 是 AI-native 乳腺癌副作用评估系统：唯一对用户发言的是 Conversation Executive；推理节点产 surface；状态以 Episode 为单位（见 `docs/specs-ai-native/01-architecture.md`）。

**当前状态：**

- `TreatmentContext` 为每次请求可选字段，UI demo 默认注入 `treatment_phase: 'chemotherapy_cycle'`，掩盖无档案场景。
- `intent-framing.ts` 的 `detectMissingFields` 仅分析单条消息文本（症状/时长/程度），不检查治疗基线；有症状词时规则 fallback 常 `proceed_to_triage`。
- Episode 记忆（`conversation-state.ts`）已支持症状、评估史、澄清史，但无跨 Session 的 Profile。
- Evaluation harness 有 `insufficient_info` case（如「我不舒服」），缺少「有症状词但无基线」类 P0 产品场景；且 `evaluate()` 对 `expected.response_mode` 等断言不完整。

**约束：** 不诊断、不开药、不替医嘱；澄清每轮 ≤2 问；P0 红旗不得为补档案延迟升级。

## Goals / Non-Goals

**Goals:**

- 产品三层信息模型落地：**Patient Baseline（A）**、**Episode 事件（B）**、**当轮澄清（C）**。
- 基线缺失时硬门禁：禁止 `conclusive_assessment` 及带具体 risk 分档的用户可见结论。
- 澄清策略可回归：harness + intent-framing 单测覆盖典型 PM 场景。
- 与现有 `executive_summary.status`、`decision_mode`、`IntentFramingSurface.answerability` 对齐，不引入新的对外协议字段除非必要。

**Non-Goals:**

- 完整 EMR / 医院对接、分期病理全量建档。
- 替换 Episode 模型或重写 Executive 编排（仅在门禁点插入检查）。
- 多语言、家属代报账号体系。
- 在本变更中实现复杂 Profile 过期 UI（可留 Open Question，MVP 用字段缺失即澄清）。

## Decisions

### D1: Patient Baseline 作为独立持久实体，而非仅 `AssessRequest.context`

**选择：** 新增 `PatientBaseline`（按 `user_id`），`AssessRequest.context` 作为请求级覆盖/快照；pipeline `prepareRequest` 合并 baseline + request override。

**理由：** 跨 Session 记忆与单次请求 context 职责不同；避免每轮依赖前端传齐字段。

**备选：** 仅扩展 `TreatmentContext` 必填 —  rejected，无法持久化且无法做「档案过期确认」。

### D2: 基线 MVP 必填字段（P1 阻断）

| 字段 | 说明 |
|------|------|
| `treatment_category` | 化疗 / 靶向 / 内分泌 / 免疫 / 放疗 / 术后随访等 |
| `treatment_anchor` | 手术日 **或** 当前周期起算描述（如「化疗 C2D3」） |
| `primary_regimen` | 可选但推荐：关键药名或方案简称（影响规则/RAG） |

缺任一 → `baseline_complete: false` → Intent/Executive 不得进入 conclusive/provisional assess。

### D3: 澄清优先级状态机（Intent Framing 内）

```
输入 → P0 红旗? → escalation（不问档案）
     → 用药边界? → route_out
     → baseline_complete? 否 → structured_intake | clarify（档案问题优先，≤2）
     → episode P1 足够? 否 → clarify（事件问题）
     → proceed → triage → deliberation → eligibility 裁定
```

**理由：** 与 PM「先 A 后 B」一致；红旗例外避免延误急救。

### D4: `detectMissingFields` 拆为 `assessBaselineSufficiency` + `assessEpisodeSufficiency`

Episode 侧保留现有 symptom/duration/severity 逻辑；Baseline 侧检查 `PatientBaseline` 与 `TreatmentContext` 合并结果。

**理由：** 避免「消息里有恶心」掩盖「不知道化疗第几天」。

### D5: Assessment Eligibility 由 Executive 统一裁定

Deliberation 产 `decision_mode` 建议；Executive 在 synthesis 前应用 **eligibility guard**：

| 条件 | 允许的最高模式 |
|------|----------------|
| `!baseline_complete` | `structured_intake` / `clarify` / `escalation` / `route_out` |
| `baseline_complete` && episode P1 缺 | `clarify` / `provisional`（仅当 deliberation 允许且明确标注未知） |
| 关键 unknown 关闭 | `provisional` / `conclusive` |
| P0 | `escalation` |

**理由：** 符合「唯一对用户发言」架构；防止 triage 直接泄露终稿。

### D6: 存储与 Repository

**选择：** `PatientBaselineRepository` 接口 + `MemoryPatientBaselineRepo`（dev/harness）+ 后续 D1/KV 实现，与 `SessionRepository` 同层。

### D7: 前端首访流程

移除 `DEFAULT_CONTEXT` 静默注入；首句症状后若 `clarification_required` 且 `baseline_intake`，展示轻量表单（3 字段）或对话澄清。

### D8: 测试策略

1. **单元：** `intent-framing.test.ts` — 无基线 +「今天开始恶心」→ `needs_clarification`。
2. **Harness：** `ec-006` 类 case；修复 `evaluate()` 对 `response_mode`、`intent_answerability`、`decision_mode` 的严格匹配。
3. **Arch：** 澄清态不得出现 legacy `response_mode` 于顶层；surface 与 executive 一致（已有，保持）。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 过度澄清导致流失 | 每轮 ≤2 问；档案齐后不再重复问方案；structured_intake 一页收集 |
| LLM framing 与规则门禁冲突 | 规则 eligibility guard 覆盖 LLM `proceed_to_triage` |
| 与现有 harness case 冲突（如 cs-004 轻度恶心无 context） | 为测试注入 baseline fixture 或更新 case 前置 `setup_baseline` |
| Profile 隐私与合规 | 仅存评估必需字段；文档注明非诊疗记录 |

## Migration Plan

1. 合并 types + baseline repo（无行为变化）。
2. Intent framing 门禁 + 单测（behind 无 flag，直接行为变更）。
3. Executive eligibility guard。
4. 移除 UI 默认 context；加首访 intake UI。
5. Harness case + 修 evaluate 断言；跑 `test:arch` + `harness -- ec`。
6. 同步 `docs/specs-ai-native/behavior/` 相关章节。

**回滚：** 恢复 `DEFAULT_CONTEXT` 与旧 framing 逻辑；baseline 表可保留不读。

## Open Questions

- 基线「过期」阈值：固定 90 天还是每次 assess 前软确认？（MVP：不做过期，仅缺失触发。）
- `primary_regimen` 是否升为 P1 必填（影响 T-DXd/免疫等特殊规则精度）。
- Profile 是否支持医护预填（院方场景）。
