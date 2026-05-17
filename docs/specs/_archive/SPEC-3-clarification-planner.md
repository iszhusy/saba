# SPEC-3 — Clarification Planner (Deprecated Transitional Note)

**版本**: v0.2
**状态**: Deprecated
**依赖**: 无（迁移说明）
**实现优先级**: 不再实现

---

## 3.1 说明

本文件对应的是旧架构中的“精准澄清步骤”设计，保留它仅用于解释迁移历史。

从 AI-native 架构迁移开始，**本文件不再作为主规范使用**。澄清相关能力的唯一权威规范改为：

- `docs/specs/SPEC-3-form-clarification-manager.md`

该主规范已将能力重构为：
- `Structured Intake Manager`
- `Clarification Planning`
- `ParsedIntakeData`
- `ClarificationPlan`
- `IntakeClarificationState`

---

## 3.2 为什么废弃

旧版本存在以下问题：

1. 仍使用旧世界的入口协议，如：
   - `IntentAgentOutput`
   - `ask_clarification`
   - `proceed_with_assessment`
   - `give_conservative_response`

2. 把澄清设计成一个独立步骤，而不是 Executive 控制下的信息增益决策

3. 保留了旧的多轮追问/轮次控制语义，容易和新的：
   - `interaction_mode`
   - `decision_mode`
   - `response_mode`

发生冲突

4. 会误导下游实现继续依赖旧接口，破坏单主代理架构

---

## 3.3 迁移映射

| 旧概念 | 新概念 | 权威文件 |
|------|------|------|
| `Precise Clarification Step` | `Clarification Planning` | `SPEC-3-form-clarification-manager.md` |
| `ClarificationPlannerInput` | `ClarificationPlanningInput` | `SPEC-3-form-clarification-manager.md` |
| `ClarificationPlannerOutput` | `ClarificationPlan` | `SPEC-3-form-clarification-manager.md` |
| `decision: ask_clarification` | `status: clarify_more` | `SPEC-3-form-clarification-manager.md` |
| `decision: proceed_with_assessment` | `status: provisional_assessment` | `SPEC-3-form-clarification-manager.md` |
| `decision: give_conservative_response` | `status: insufficient_for_assessment` | `SPEC-3-form-clarification-manager.md` |
| `IntentAgentOutput` | `IntentFramingOutput` | `SPEC-1-intent-agent.md` |
| `orchestrator` 直接消费旧澄清步骤 | `Conversation Executive Agent` 统一组织 | `SPEC-10-conversation-executive-agent.md` |

---

## 3.4 当前规则

- 若需要实现或修改澄清相关能力，只能修改：
  - `docs/specs/SPEC-3-form-clarification-manager.md`
- 本文件不再被任何新 spec 作为核心依赖引用
- 本文件仅作为迁移说明保留，后续可在架构稳定后删除

---

## 3.5 后续动作

待整套 AI-native spec 稳定后，可选择：

1. 继续保留本文件作为历史备注；或
2. 直接删除本文件，并把本说明并入迁移记录
