# LLM Runtime & Response Synthesis — 行为规格

**版本**: v1.0  
**状态**: Canonical behavior (L4)  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/runtime-synthesis/00-goal.md](../modules/runtime-synthesis/00-goal.md)  
**归档参考**: `docs/specs/_archive/SPEC-8-llm-runtime.md`

---

## 1. 职责

1. **统一**所有 LLM 调用（provider、重试、降级、trace）  
2. 强制 **Structured Output**（JSON Schema）用于 reasoning 阶段  
3. 支持 **Prompt Cache** 与成本统计  
4. **Synthesis** 阶段：在 `SafetyConstraints` 注入下生成用户可见自然语言  

**约束**：reasoning 输出 ≠ 用户终稿；终稿仅由 Executive synthesis 产出。

---

## 2. 三阶段调用

| 阶段 | `metadata.phase` | 用途 |
|------|------------------|------|
| `reasoning` | reasoning | Intent, Triage, Deliberation, Clarification |
| `critique` | critique | Safety 检查、schema 校验 |
| `synthesis` | synthesis | Executive 终稿（注入 constraints） |

```typescript
interface ChatParams {
  model: string;
  messages: Message[];
  system?: string;
  response_format?: { type: "json_schema"; json_schema: object };
  metadata?: { agent_name?: string; phase?: "reasoning" | "critique" | "synthesis"; trace_id?: string };
}
```

---

## 3. Synthesis 输入

Executive synthesis **必须**消费：

- `ExecutiveResponseMode`（来自 framing + deliberation）  
- `RiskDeliberationOutput`（含 `decision_mode`）  
- `SafetyConstraints`（`required_actions`, `forbidden_claims`, `risk_floor`）  
- `Episode` 摘要（连贯性）  

**禁止**：忽略 `forbidden_claims`；低于 `risk_floor` 的安抚性降级。

---

## 4. 配置（摘要）

按 agent 映射 model（见 `src/lib/env.ts`）：`intent_framing`, `triage`, `deliberation`, `critic`, `synthesis`, `clarification`。

重试：指数退避；失败时保守 fallback（偏 `insufficient` 或 `escalation`，视场景）。

---

## 5. 工程现状与目标

| 现状 | 目标 |
|------|------|
| orchestrator 内联 prompt + fusion 出话术 | deliberation JSON + 独立 synthesis |
| `structured-output.ts` 解析 fusion | 分 agent schema |
| Safety `corrected` 直接改文案 | constraints → synthesis |

---

## 6. 验证

- 高风险 case：synthesis 含急诊动作且无害停药表述  
- JSON 解析失败：可审计 fallback，不 silent 默认 low risk  
