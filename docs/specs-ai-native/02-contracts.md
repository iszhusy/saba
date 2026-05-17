# 跨模块技术契约

**版本**: v1.0  
**状态**: Canonical  
**上游**: [01-architecture.md](./01-architecture.md)  
**代码真相源**: `src/types/index.ts`、`src/tools/evaluation-harness.ts`

---

## 1. 对外 API（摘要）

主入口：`POST /assess`（见 `src/types/index.ts` 中 `AssessRequest` / `AssessResponse`）。

| 字段 | 说明 |
|------|------|
| `input` | 用户本轮自然语言 |
| `session_id` / `episode_id` | 多轮连续性 |
| `session_history` | 风险趋势、既往症状（follow-up） |
| `context` | 治疗阶段/方案等 |

响应须含可审计 `reasoning_surfaces`（目标形态；逐步对齐实现）。

---

## 2. Executive 输出契约

```typescript
type ExecutiveResponseMode =
  | "structured_intake"
  | "clarify"
  | "provisional_assessment"
  | "conclusive_assessment"
  | "insufficient"
  | "escalation"
  | "route_out";

// 目标：AssessResponse 显式携带
interface ExecutiveOutcome {
  mode: ExecutiveResponseMode;
  message: string;
  ui_payload?: Record<string, unknown>;
  audit_summary?: string;
}
```

---

## 3. Reasoning Surfaces（当前代码）

定义于 `src/types/index.ts`：

| Surface | 接口名 | 生产者（目标） |
|---------|--------|----------------|
| Intent | `IntentFramingSurface` | `intent-framing` |
| Triage | `TriageAssessmentSurface` | `clinical-triage` |
| Evidence | `EvidenceRetrievalSurface` | retrieval tool |
| Deliberation | `RiskDeliberationSurface` | `risk-deliberation` |
| Safety | `SafetyConstraintSurface` | `safety-validator` → constraints |

聚合：`ReasoningSurfaces`。

### 3.1 Intent Framing（目标契约）

```typescript
interface IntentFramingOutput {
  conversation_goal: string;
  interaction_mode: ExecutiveResponseMode;
  is_possible_emergency: boolean;
  is_medication_boundary: boolean;
  is_follow_up: boolean;
  answerability: "ready" | "needs_clarification" | "insufficient" | "non_medical";
  rationale: string;
}
```

**禁止**作为主路径协议：`route_action`、`sufficient_for_triage`（legacy）。

### 3.2 Clinical Triage（目标扩展）

在 `TriageAssessmentSurface` 基础上扩展：

```typescript
interface ClinicalTriageOutput extends TriageAssessmentSurface {
  known_facts: string[];
  inferred_facts: string[];
  critical_unknowns: string[];
  red_flag_signals: string[];
  retrieval_strategy: { should_retrieve: boolean; focus: string };
  clarification_targets: string[];
}
```

### 3.3 Risk Deliberation（目标契约）

```typescript
interface RiskDeliberationOutput {
  decision_mode: "conclusive" | "provisional" | "insufficient";
  response_eligibility: ResponseEligibility;
  risk_level: RiskLevel;
  risk_score: number;
  confidence: number;
  primary_judgment: string;
  critical_unknowns: string[];
  what_would_change_the_assessment: string[];
  rationale: string;
}
```

### 3.4 Safety Constraints（目标契约）

```typescript
interface SafetyConstraints {
  risk_floor: RiskLevel;
  required_actions: string[];
  forbidden_claims: string[];
  required_warning_signals: string[];
  decision: "pass" | "revise" | "block";
  violations: Array<{ code: string; severity: string; message: string }>;
}
```

过渡期允许 `SafetyConstraintSurface.constrained_advice`；新代码应向 `SafetyConstraints` 收敛。

---

## 4. Spec as Code — Evaluation Harness

不可协商行为以 `TestCase` 为准（`src/tools/evaluation-harness.ts`）：

| 类别 | 典型断言 |
|------|----------|
| `red_flag` | `risk_level=high`, 急诊关键词, `escalation_required` |
| `insufficient_info` | 澄清或 insufficient，禁止 conclusive |
| `medication_question` | 无停药/剂量建议 |
| `followup` | Episode 连续、趋势考虑 |
| `spec7` | Session/Episode 状态机 |
| *(全 case)* | `architecture-invariants`（executive SoT、澄清派生一致） |

**流程**：新需求 → 新增/修改 case → 实现 → L4 behavior 文档仅作说明。

---

## 5. 安全底线（契约级）

无论 deliberation 输出如何，最终 synthesis 必须满足：

1. `high` → 含急诊/120/立即就医类 `required_actions`  
2. `medium` → 含团队联系建议（如 `team_contact_required`）  
3. 禁止直接建议停药、改剂量、自行调药  
4. `high` → 保留 `warning_signs`  
5. 不确定 + 可能红旗 → 追问或保守升级（不得装懂 conclusive）  

由 harness `safety_constraints` 与 Safety 模块共同保证。

---

## 6. Runtime Source of Truth（运行时真相）

**原则**：`executive_summary` + `reasoning_surfaces` 驱动主路径；兼容字段只作 derived，不得单独决策。

| 语义 | Source of truth | 派生 / 兼容 | 主路径消费者 |
|------|-----------------|-------------|--------------|
| 是否需澄清 | `executive_summary.status === 'clarification_required'` | `clarification_required` | `assess-pipeline.ts`, `handler.ts`, UI（应逐步只读 executive） |
| 会话阶段 | `conversation_context.session.status`（由 state service 根据 executive 推进） | — | `conversation-state.ts`, harness spec7 |
| Episode 生命周期 | `conversation_context.episode.status` | — | `conversation-state.ts` |
| 临床事件记忆 SoT | `Episode`（D1 `episodes` / repo） | 派生 `session_history` | `conversation-state.ts`, reasoning |
| 治疗基线 SoT（目标） | `PatientBaseline` 按 `user_id` | 合并进 `AssessRequest.context` | `prepareRequest`, Intent, Triage（[12-patient-baseline.md](./behavior/12-patient-baseline.md)） |
| 风险展示 | `risk_level` / `risk_score`（synthesis 后） | — | UI、API |
| 安全边界 | `reasoning_surfaces.safety_constraints` → synthesis 注入 | 旧 `corrected.*`（退场中） | orchestrator synthesis |
| 用户可见模式 | `executive_summary.final_mode` | — | UI、审计 |

**架构回归**（每条 assess 响应自动检查）：

- 实现：`src/lib/architecture-invariants.ts`
- 单测：`src/lib/architecture-invariants.test.ts`（`npm run test:arch`）
- 集成：harness 对每个 case 调用 `checkAssessResponseArchitecture`

| 不变量 code | 含义 |
|-------------|------|
| `arch_missing_executive_summary` | 缺少 executive SoT |
| `arch_clarification_derived_mismatch` | `clarification_required` 与 executive 不一致 |
| `arch_clarification_missing_derived` | executive 要澄清但未派生兼容字段 |
| `arch_escalated_risk_mismatch` | escalated 但 risk 非 high |

---

## 7. Legacy 退场计划

无 **删除 phase** 的兼容字段不得合并进 main。更新本表时同步改 `src/types/index.ts` 注释。

| 字段 / 协议 | 类型 | derivedFrom / 说明 | 仍消费方（主路径=粗体） | 删除 phase |
|-------------|------|-------------------|------------------------|------------|
| `clarification_required` | derived boolean | `executive_summary.status` | **assess-pipeline**, **handler**, **App.tsx**, ConversationAssessment | M6 |
| `route_action` / `RouteAction` | legacy 协议 | 旧 intent 路由 | orchestrator（退场中） | M6 |
| `sufficient_for_triage` | legacy 协议 | 旧 sufficiency | information-sufficiency（退场中） | M6 |
| `corrected.immediate_action` | legacy safety 输出 | 文案修正器 | safety-validator（M4 改 constraints） | M4→M6 |
| triage 后默认 RAG | 固定 pipeline | — | orchestrator | M2 |
| fusion 直接终稿 | 固定 pipeline | — | orchestrator Step 4 | M3→M5 |

---

## 8. Known drift（owner 审计登记）

> 发现「新名字旧逻辑」或 SoT 分裂时追加一行；修复后删除。

| 日期 | 描述 | 负责人 | 目标 milestone |
|------|------|--------|----------------|
| 2026-05-17 | UI `App.tsx` / `ConversationAssessment` 仍直接读 `clarification_required` | — | M6 |
| 2026-05-17 | `assess-pipeline` 用 legacy 布尔 OR executive 判断澄清 | — | M6 |

---

## 9. 迁移映射 {#迁移映射}

| 旧（archive SPEC） | 新（canonical） |
|--------------------|----------------|
| SPEC-0 原则 | [01-architecture.md](./01-architecture.md) §2、§9 |
| SPEC-1 Intent Agent | [behavior/03-intent-framing.md](./behavior/03-intent-framing.md) |
| SPEC-2 Triage | [behavior/04-clinical-triage.md](./behavior/04-clinical-triage.md) |
| SPEC-3 Form Clarification | [behavior/03-intake-and-clarification.md](./behavior/03-intake-and-clarification.md) |
| SPEC-4 Evidence | [behavior/09-evidence-retrieval.md](./behavior/09-evidence-retrieval.md) |
| SPEC-5 Risk Fusion | [behavior/05-risk-deliberation.md](./behavior/05-risk-deliberation.md) |
| SPEC-6 Safety Critic | [behavior/06-safety-constraints.md](./behavior/06-safety-constraints.md) |
| SPEC-7 Conversation State | [behavior/07-episode-state.md](./behavior/07-episode-state.md) |
| SPEC-8 LLM Runtime | [behavior/08-runtime-and-synthesis.md](./behavior/08-runtime-and-synthesis.md) |
| SPEC-9 Evaluation | `evaluation-harness.ts` |
| SPEC-10 Executive | [behavior/01-executive.md](./behavior/01-executive.md) |

---

## 10. 退出主路径的遗留协议

以下结构在 **M6 完成前** 可存在于代码，但**不得**作为新 spec 或新 PR 的设计依据：

- `route_action` / `RouteAction` 驱动主流程  
- `sufficient_for_triage` 单独决策  
- `corrected.immediate_action` 作为 Safety 主输出  
- Triage 后**默认**总是 RAG  
- Fusion 直接产出最终用户话术且无 `decision_mode`  
