# Intake & Clarification — 行为规格

**版本**: v1.0  
**状态**: Canonical behavior (L4)  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/intake-clarification/00-goal.md](../modules/intake-clarification/00-goal.md)  
**归档参考**: `docs/specs/_archive/SPEC-3-form-clarification-manager.md`

---

## 1. 职责

当 Intent Framing 判定 `answerability` 为 `needs_clarification` 或 Executive 选择 `structured_intake` / `clarify` 时：

1. 从 `unresolved_uncertainties` 与 triage `critical_unknowns` 中选取 **1–2 个** 最高信息增益问题  
2. 问题须可能改变：风险分层、升级判断、或 conclusive 资格  
3. 记录 `clarification_history` 供 Episode 与审计  

**不负责**：最终风险定级、用户终稿、替代 Deliberation。

### 1.1 三层信息：澄清记什么、记在哪

| 层级 | 澄清目标 | 写入位置 |
|------|----------|----------|
| **A. Patient Baseline** | 治疗大类、时间锚点（手术日/周期）、关键方案 | Baseline repo（见 [12-patient-baseline.md](./12-patient-baseline.md)） |
| **B. Episode（本事件）** | 主诉、起始/趋势、功能影响、伴随症状 | `Episode` + `clarification_history`（见 [07-episode-state.md](./07-episode-state.md)） |
| **C. 当轮** | 最多 **1–2** 个问题，对应一个 unknown | 回答落入 A 或 B |

**优先级**：P0 红旗 → 用药边界 → **A 缺失** → **B 缺失** → P2 细化。不得为补档案延迟 P0 升级。

**与记忆分工**：澄清不是「多聊几句」；每一问须能改变升级、风险边界或 [12-patient-baseline.md](./12-patient-baseline.md) §3.2 的输出资格。

---

## 2. 与 Executive 的关系

```text
IntentFraming (needs_clarification)
  → Executive 选择 clarify | structured_intake
  → Clarification Planner 产出 ClarificationPlan
  → Executive 将 plan 转为自然语言问句（单一发言主体）
  → 用户回答 → 更新 Episode → 重新 framing / triage
```

---

## 3. 目标契约

```typescript
interface ClarificationPlan {
  status: "clarify_more" | "provisional_assessment" | "insufficient_for_assessment";
  questions: Array<{
    goal: string;           // 要改变哪个 unknown
    question_text: string;
    expected_impact: "risk_level" | "escalation" | "eligibility";
  }>;
  stop_reason?: string;     // 为何不再问
}
```

**禁止**：一次抛出 >2 个问题；与当前 episode 无关的通用问卷。

---

## 4. 信息增益原则

优先澄清：

| 优先级 | 类型 | 示例 |
|--------|------|------|
| P0 | 红旗相关 | 呼吸困难程度、意识、出血量 |
| P1 | 结论资格阻断 | 持续时间、是否加重、能否进食/饮水 |
| P2 | 细化分级 | 程度描述（不影响是否升级时降级） |

---

## 5. 工程映射

| 现状 | 目标 |
|------|------|
| `information-sufficiency.ts` 模板问句 | 信息增益驱动 + `ClarificationPlan` |
| orchestrator Step 1 混合澄清 | Executive 统一出口 |

---

## 6. 验证（harness）

- `我不舒服` → 澄清或 insufficient，非 conclusive  
- 澄清后症状明确 → 可进入 assess 路径  
- 见 `evaluation-harness.ts` 中 `insufficient_info` / `followup` 类别  
