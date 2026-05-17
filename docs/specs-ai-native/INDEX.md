# SABA AI-Native 规格索引

**版本**: v1.0  
**状态**: Canonical  
**旧规格**: `docs/specs/_archive/`（只作历史参考，非设计约束）

---

## 渐进式披露（给人与 AI）

按顺序阅读，**禁止跳层**：

| 层级 | 读什么 | 何时读 |
|------|--------|--------|
| **L0** | [00-goal.md](./00-goal.md) | 任何任务必须先读 |
| **L0+** | [STARTUP-CHECKLIST.md](./STARTUP-CHECKLIST.md) | 开工、PR、Milestone 自检 |
| **L1** | [01-architecture.md](./01-architecture.md) | 需要理解全系统时 |
| **L2** | [02-contracts.md](./02-contracts.md) | 改接口、类型、API、测试门禁时 |
| **L3** | `modules/<模块>/00-goal.md` | 只改某一模块时 |
| **L4** | `behavior/*.md` | 实现细节、迁移映射、walkthrough |
| **L5** | [11-implementation-sequence.md](./behavior/11-implementation-sequence.md) | 排期与里程碑时 |

> 规格越短，理解越深。未读 L0 不得读 L4 边界案例与 walkthrough。

---

## 文档地图

### 架构（L0–L2）

| 文档 | 说明 |
|------|------|
| [00-goal.md](./00-goal.md) | 电梯演讲 + 成功标准 |
| [STARTUP-CHECKLIST.md](./STARTUP-CHECKLIST.md) | **实践清单**（开工/PR/Milestone/harness 命令） |
| [01-architecture.md](./01-architecture.md) | **全面架构**（分层、脊柱、主链路、边界） |
| [02-contracts.md](./02-contracts.md) | 跨模块契约、Runtime SoT、Legacy 退场 |

### 模块目标（L3）

| 模块 | 目标 | 行为规格 |
|------|------|----------|
| Executive | [modules/executive/00-goal.md](./modules/executive/00-goal.md) | [behavior/01-executive.md](./behavior/01-executive.md) |
| Reasoning Spine | [modules/reasoning-spine/00-goal.md](./modules/reasoning-spine/00-goal.md) | [behavior/02-clinical-reasoning-spine.md](./behavior/02-clinical-reasoning-spine.md) |
| Intent Framing | [modules/intent-framing/00-goal.md](./modules/intent-framing/00-goal.md) | [behavior/03-intent-framing.md](./behavior/03-intent-framing.md) |
| Intake & Clarification | [modules/intake-clarification/00-goal.md](./modules/intake-clarification/00-goal.md) | [behavior/03-intake-and-clarification.md](./behavior/03-intake-and-clarification.md) |
| Clinical Triage | [modules/clinical-triage/00-goal.md](./modules/clinical-triage/00-goal.md) | [behavior/04-clinical-triage.md](./behavior/04-clinical-triage.md) |
| Evidence Retrieval | [modules/evidence-retrieval/00-goal.md](./modules/evidence-retrieval/00-goal.md) | [behavior/09-evidence-retrieval.md](./behavior/09-evidence-retrieval.md) |
| Risk Deliberation | [modules/risk-deliberation/00-goal.md](./modules/risk-deliberation/00-goal.md) | [behavior/05-risk-deliberation.md](./behavior/05-risk-deliberation.md) |
| Safety Constraints | [modules/safety-constraints/00-goal.md](./modules/safety-constraints/00-goal.md) | [behavior/06-safety-constraints.md](./behavior/06-safety-constraints.md) |
| Episode State | [modules/episode-state/00-goal.md](./modules/episode-state/00-goal.md) | [behavior/07-episode-state.md](./behavior/07-episode-state.md) |
| Patient Baseline | [modules/patient-baseline/00-goal.md](./modules/patient-baseline/00-goal.md) | [behavior/12-patient-baseline.md](./behavior/12-patient-baseline.md) |
| Runtime & Synthesis | [modules/runtime-synthesis/00-goal.md](./modules/runtime-synthesis/00-goal.md) | [behavior/08-runtime-and-synthesis.md](./behavior/08-runtime-and-synthesis.md) |
| Evaluation | [modules/evaluation/00-goal.md](./modules/evaluation/00-goal.md) | `src/tools/evaluation-harness.ts` |

### 验证与落地（L4–L5）

| 文档 | 说明 |
|------|------|
| [behavior/10-walkthroughs.md](./behavior/10-walkthroughs.md) | 完成度门禁路径 |
| [behavior/11-implementation-sequence.md](./behavior/11-implementation-sequence.md) | M1–M6 迁移顺序 |

---

## 可执行契约（Spec as Code）

不可协商行为以代码为准，Markdown 只解释「为什么」：

- 类型：`src/types/index.ts`
- 回归：`src/tools/evaluation-harness.ts`
- 环境：`src/lib/env.ts`

新增需求流程：**先加 harness case 或 `architecture-invariants` 测试 → 再补 L3/L4 文档 → 再实现**。

```bash
npm run test:arch    # 架构不变量（无 LLM）
npm run harness      # 全量 eval（需 LLM，见 run-harness.ts）
```

---

## 与旧规格的关系

`docs/specs/_archive/SPEC-*.md` 用于对照历史实现与字段名；**新设计与 PR 不得以 archive 为约束来源**。对照表见 [02-contracts.md § 迁移映射](./02-contracts.md#迁移映射)。
