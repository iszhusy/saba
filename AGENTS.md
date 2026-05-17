# Agent 工作指引 — SABA

## 规格（必读顺序）

实现或修改本仓库前，按 **渐进式披露** 读规格：

1. [`docs/specs-ai-native/00-goal.md`](docs/specs-ai-native/00-goal.md)
2. [`docs/specs-ai-native/01-architecture.md`](docs/specs-ai-native/01-architecture.md) — 全系统 AI-native 架构
3. 改接口/PR/里程碑时：[`docs/specs-ai-native/STARTUP-CHECKLIST.md`](docs/specs-ai-native/STARTUP-CHECKLIST.md)
4. 仅改单模块时：[`docs/specs-ai-native/modules/<模块>/00-goal.md`](docs/specs-ai-native/INDEX.md)（新建模块用 [`MODULE-GOAL-TEMPLATE.md`](docs/specs-ai-native/modules/MODULE-GOAL-TEMPLATE.md)）
5. 实现细节：[`docs/specs-ai-native/behavior/`](docs/specs-ai-native/INDEX.md)

**禁止**在未读 L0 前读取 walkthroughs 或 `docs/specs/_archive/`。

## 契约真相源

- 类型：`src/types/index.ts`
- Runtime SoT / Legacy 退场：`docs/specs-ai-native/02-contracts.md` §6–§8
- 架构不变量：`src/lib/architecture-invariants.ts`
- 回归：`src/tools/evaluation-harness.ts`（每条 case 自动跑架构检查）
- 新需求：**先加 harness case 或 `test:arch`，再写代码**

## 架构要点

- 唯一对用户发言：**Conversation Executive**
- Reasoning 节点只产 **surface**，不产终稿
- Safety 产 **constraints**，在 synthesis 注入
- 状态单位：**Episode**，非裸 messages
- `clarification_required` 为 **derived**，真相是 `executive_summary.status`

## 验证

```bash
npm run test:arch
npm run harness -- ec
```
