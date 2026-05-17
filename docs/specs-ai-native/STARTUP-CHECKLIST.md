# AI-native 项目实践清单（SABA）

**版本**: v1.0  
**状态**: Canonical（与 [INDEX.md](./INDEX.md) 同级）  
**用途**: 开工门禁、PR 自检、里程碑收尾；每条应对应 spec 或 harness。

> 完整复盘条目见对话归档；本文只保留**可执行**部分，并绑定本仓库路径。

---

## 开工前四句话（答不清不开模块 PR）

1. **谁拍板？** → [01-architecture.md](./01-architecture.md) — Conversation Executive  
2. **真相存在哪？** → [02-contracts.md](./02-contracts.md) § Runtime SoT + `src/types/index.ts`  
3. **旧逻辑何时退场？** → [02-contracts.md](./02-contracts.md) § Legacy 退场计划  
4. **怎么证明完成？** → [behavior/10-walkthroughs.md](./behavior/10-walkthroughs.md) + `src/tools/evaluation-harness.ts`

---

## 开工必须产出（映射现有 L0–L5）

| # | 产物 | 仓库落点 |
|---|------|----------|
| 1 | 1 页完成态定义 | [00-goal.md](./00-goal.md) |
| 2 | Runtime SoT 说明 | [02-contracts.md](./02-contracts.md) §8 |
| 3 | 模块 owner / non-owner | `modules/<名>/00-goal.md`（模板见 [modules/MODULE-GOAL-TEMPLATE.md](./modules/MODULE-GOAL-TEMPLATE.md)） |
| 4 | Implementation sequence | [behavior/11-implementation-sequence.md](./behavior/11-implementation-sequence.md) |
| 5 | 5 条关键 walkthrough | [behavior/10-walkthroughs.md](./behavior/10-walkthroughs.md) |
| 6 | Legacy 退场计划 | [02-contracts.md](./02-contracts.md) §9 |

**开工门禁**：上述 6 项在对应文件中有实质内容（非占位标题）；`src/types/index.ts` 已分型 executive / surface / constraint；harness 已有可失败 case。

---

## 每个 PR 必勾（复制到 PR 描述）

```markdown
### AI-native PR 自检

- [ ] 已读 L0；若改模块已读对应 L3 + behavior
- [ ] 新行为：先加/改 harness case 或 `architecture-invariants` 测试
- [ ] 主路径未用 legacy 字段做**决策**（仅 derived 展示）
- [ ] response builder / state / API / UI 对同一 SoT 字段一致
- [ ] 若保留兼容字段：已在 02-contracts §9 退场表登记
- [ ] 未把 reasoning 模块输出当作 final owner
```

---

## 每个 Milestone 结束必勾（M1–M6）

见 [behavior/11-implementation-sequence.md](./behavior/11-implementation-sequence.md) 各节「完成标志」+ 下表：

| 检查项 | 验证方式 |
|--------|----------|
| 新 contract 已定义 | `src/types/index.ts` + 02-contracts |
| state 由 executive contract 驱动 | spec7 harness + walkthrough |
| API/UI/persistence 消费新语义 | 02-contracts §8 表无新增 drift |
| walkthrough 通过 | 10-walkthroughs 勾选 |
| legacy 仅 derived | §9 表该 milestone 行 |
| 非固定 pipeline 假装 executive | owner 审计（下节） |

---

## 固定仪式

### Owner 审计（改 orchestrator / response / state / API / UI / harness 时）

1. 谁写了 `executive_summary.status` / `final_mode` / 用户可见终稿？  
2. 是否有模块输出不该输出的终局语义？  
3. 是否「新名字 + 旧逻辑」？→ 记入 02-contracts §10 Known drift  

### Runtime truth 文件清单

`src/agents/orchestrator-llm-first.ts` · `src/lib/response-builder.ts` · `src/services/conversation-state.ts` · `src/services/assess-pipeline.ts` · `src/api/handler.ts` · `src/components/App.tsx` · `src/tools/evaluation-harness.ts`

### 验证命令

```bash
npm run test:arch          # 架构不变量（无 LLM，CI 友好）
npm run harness -- ec      # 边界 + spec7（需 LLM）
npm run harness -- all     # 全量回归（需 LLM）
```

---

## Spec 编写顺序（禁止反写）

**现实 → 目标 → 改造 → 验收**（每份 L3/L4 四段）

每个 spec 须含：文件路径、关键函数、调用点、消费点、要删除/降级的旧结构。  
无文件锚点 = spec 仍飘着（反模式）。

---

## 新需求流程（不可协商）

1. `src/tools/evaluation-harness.ts` 或 `src/lib/architecture-invariants.test.ts` 加断言  
2. 更新 L3/L4（说明为什么）  
3. 实现代码  

架构不变量实现：`src/lib/architecture-invariants.ts`（全量 harness case 自动校验）。

---

## 相关文档

- [02-contracts.md](./02-contracts.md) — SoT、legacy、harness 类别  
- [AGENTS.md](../../AGENTS.md) — Agent 必读顺序  
- [modules/MODULE-GOAL-TEMPLATE.md](./modules/MODULE-GOAL-TEMPLATE.md) — 模块 8 问模板  
