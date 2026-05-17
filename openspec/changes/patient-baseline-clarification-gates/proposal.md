## Why

SABA 当前在信息不足时仍可能直接进入风险评估（例如用户仅说「今天开始恶心」即得到分级建议），原因是可选的 `TreatmentContext`、按消息文本判断的信息充分性、以及 Episode 记忆三者未在产品层形成清晰分工。乳腺癌副作用场景下，**治疗基线（档案）**与**本次不适（事件）**对风险边界的影响不同，必须分开管理：缺档案时应先建档或澄清，缺事件细节时应在本 Episode 内追问，只有满足输出资格后才允许 provisional / conclusive 建议。

## What Changes

- 引入 **Patient Baseline（病人基线）** 概念：跨 Session 持久的治疗上下文，与 Episode 事件记忆分离。
- 定义 **澄清策略（Clarification Policy）**：按 P0 红旗 / P1 阻断 / P2 可选 分层；每轮最多 1–2 个问题；区分「补档案」与「补本事件」。
- 定义 **评估输出资格（Assessment Eligibility）**：在基线与事件信息满足前，禁止 `conclusive_assessment` 及带具体 `risk_level` 的分级话术；允许澄清、临时判断、急症升级、用药边界转出。
- 扩展 Intent Framing / Executive 门禁：基线缺失时不得 `proceed_to_triage` 直达 assess（即使消息含症状词）。
- 新增 evaluation harness 与架构回归用例（如「无基线 + 恶心」必须 `clarification_required`）。
- **BREAKING**：前端/demo 不得再静默注入默认 `treatment_phase`；无基线用户首句将走澄清/建档路径而非直接评估。
- 对齐并补充 `docs/specs-ai-native` 中 Intake、Episode、Executive 相关 behavior（实现阶段同步 L3/L4，本变更以 OpenSpec 为交付契约）。

## Capabilities

### New Capabilities

- `patient-baseline`: 病人治疗基线的字段、存储、读取、过期确认；与 `AssessRequest.context` 及未来 Profile API 的映射。
- `clarification-policy`: 什么必须澄清、什么写入 Episode、每轮问法与优先级；与 `ClarificationPlan` / `structured_intake` 的关系。
- `assessment-eligibility`: 何时可 `clarify` / `provisional_assessment` / `conclusive_assessment` / `escalation` / `route_out`；与 `executive_summary.status` 及 `decision_mode` 的硬规则。

### Modified Capabilities

- （无）`openspec/specs/` 尚无既有 capability；本变更为首批基线能力规格。

## Impact

- **类型与契约**：`src/types/index.ts`（`TreatmentContext` 扩展或 `PatientBaseline`）、`AssessRequest` / `AssessResponse`。
- **推理入口**：`src/modules/intent-framing.ts`（`detectMissingFields`、disposition 与基线门禁）。
- **执行层**：`src/agents/conversation-executive.ts`、`src/lib/executive-synthesis.ts`。
- **状态**：`src/services/conversation-state.ts`、存储层（Profile 持久化，可与 Session/Episode 同库）。
- **前端**：`src/components/chat/ConversationAssessment.tsx`（移除默认 context；首访建档/确认 UI）。
- **回归**：`src/tools/evaluation-harness.ts`（新 case + 强化 `response_mode` / `answerability` 断言）。
- **规格文档**：`docs/specs-ai-native/behavior/03-intake-and-clarification.md`、`07-episode-state.md`、`01-executive.md`（实现时同步）。
- **依赖**：无新外部服务；需 Profile 存储抽象（内存/KV/D1 与现有 conversation repo 一致）。
