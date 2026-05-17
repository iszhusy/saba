# SABA 架构重构路线图（orchestrator-centered）

**文档状态**: 草稿
**日期**: 2026-05-16
**版本**: v0.2

---

## 1. 核心理念

> **规则是辅助大模型的工具与安全底线，不直接主导最终风险结果。**
> **现阶段采用 orchestrator-centered architecture：子模块尽量无状态、单次调用、协议简单；除核心临床判断外，优先实现为 tool/function。**

这意味着当前阶段不追求“很多会互相协商的 Agent”，而是追求：
- 主流程集中控制
- 子模块边界清晰
- 输入输出简单
- 可调试、可落地、可扩展

---

## 2. 收敛版目标架构

```
用户输入
  → Intent Classifier / Router
  → show form（如需要）
  → form submit
  → Clinical Triage
  → Evidence Retrieval（tool）
  → Risk Fusion（可选，若保留）
  → Safety Validator（tool）
  → Response Builder
  → 响应用户
```

### 关键约束
- 子模块之间不直接“对话”
- 子模块不自主调用其他子模块
- 子模块不维护复杂状态机
- 复杂流程统一由 orchestrator 决定
- 澄清是 orchestrator 控制下的一个步骤，不是自治 agent

---

## 3. 模块分类：Agent vs Tool vs Function

| 模块 | 推荐形态 | 说明 |
|------|----------|------|
| Intent Classifier / Router | 轻量 Agent 或单次 classifier | 一次输入 → 一次输出 |
| Form Collection | UI / Tool | 表单收集不需要自主推理 |
| Form Parser | Tool / Function | 结构化转换能力 |
| Clinical Triage | Agent | 核心临床推理节点 |
| Evidence Retrieval | Tool | 检索 / 重排 / 裁剪能力 |
| Clarification Generator | Tool | 只产出问题，不决定后续流程 |
| Risk Fusion | Agent（可选） | 如果需要独立承担最终融合推理 |
| Safety Validator | Tool | 安全检查与保守修正 |
| Response Builder | Function | 最终文案组装 |

### 当前建议
现阶段真正需要较强推理属性的，最多保留：
- Intent Classifier / Router
- Clinical Triage
- Risk Fusion（可选）

其余能力优先做成 tool / function。

---

## 4. 规则的角色重新定义

旧架构问题：规则引擎直接主导风险判定，LLM 只是辅助。

新架构下规则的地位：

| 规则类型 | 作用 | 位置 |
|----------|------|------|
| Safety Hard Rules | 不可违反的安全约束 | Safety Validator |
| Fallback Rules | LLM 失败时的保守兜底 | LLM Runtime / Orchestrator |
| High-Risk Keyword Guard | LLM 输出明显偏低时的保守升级 | Triage / Fusion 后处理 |
| Schema 校验 | 输出结构一致性 | Runtime / Validator |
| 审计规则 | 高风险必须记录依据 | Orchestrator / Storage |

**规则不是裁判，模型才是判断主体。规则只负责底线。**

---

## 5. 澄清策略：不是自治 Agent，而是一个步骤

主流程：

```
用户输入
  → intent classify
  → show form
  → form submit
  → triage
  → if still one critical ambiguity:
        ask 1 precise clarification
  → final assess
  → safety validate
```

### 约束
- 澄清由 orchestrator 决定是否触发
- 澄清模块只负责产出问题
- 澄清模块不维护复杂多轮协议
- 现阶段最多 **1 次精准澄清，1-2 个问题**
- 信息不足时可保守响应，但不要进入复杂 clarification loop

---

## 6. LLM Runtime（SPEC-8）的定位

当前问题：LLM 调用分散在多个文件，没有统一抽象。

目标统一接口：

```typescript
interface LLMRuntime {
  chat(params: ChatParams): Promise<ChatResponse>;
  structuredOutput<T>(schema: object): Promise<T>;
  withRetry<T>(fn: () => Promise<T>): Promise<T>;
  trace(req: CallTrace): void;
}
```

### 最小必需能力
1. provider 抽象（anthropic / dashscope）
2. structured output（JSON Schema）
3. retry / fallback
4. trace / usage logging
5. 可选 cache（后续再加）

注意：runtime 是基础设施，不应引入业务流程复杂度。

---

## 7. 分阶段落地建议

### Phase 1：先稳定主流程
- [ ] 修复 `callAnthropicForDecision()` 的 JSON 解析鲁棒性
- [ ] 建立统一 structured output 解析层
- [ ] 保持 orchestrator 单点控制流程

### Phase 2：提取轻量模块
- [ ] 提取 `intent-classifier.ts`
- [ ] 提取 `clinical-triage.ts`
- [ ] 提取 `evidence-retrieval.ts`（tool）
- [ ] 提取 `safety-validator.ts`（tool）
- [ ] 提取 `response-builder.ts`

### Phase 3：必要时保留 Risk Fusion
- [ ] 评估 triage 是否已足够承担最终判断
- [ ] 若确实需要单独融合层，再提取 `risk-fusion.ts`
- [ ] 但仍保持单次调用，不引入 agent-to-agent 协商

### Phase 4：再考虑会话状态
- [ ] 引入 episode/session
- [ ] 仅支持 orchestrator 管理的简化状态
- [ ] 不让子模块各自持有复杂状态机

---

## 8. 当前代码迁移映射

| 当前文件 | 迁移目标 |
|----------|----------|
| `src/agents/orchestrator-llm-first.ts` | 保持主控；逐步拆出轻量模块 |
| `src/lib/llm.ts` | 收敛到 `src/lib/llm-runtime.ts` |
| `src/lib/dashscope.ts` | 作为 runtime provider |
| `src/lib/llm-tools.ts` | 按需拆分为 runtime + business tools |
| `src/lib/retriever.ts` | → `src/tools/evidence-retrieval.ts` |
| Safety rules (分散) | → `src/tools/safety-validator.ts` |
| response assemble logic | → `src/lib/response-builder.ts` |

---

## 9. Spec 调整方向

### SPEC-0
- 明确 orchestrator-centered architecture
- 加入“子 Agent 简化原则”
- 区分 agent / tool / function

### SPEC-1
- 从 “Intent Agent” 调整为 “Intent Classifier / Router”
- 强调单次分类输出，不承担多轮交互

### SPEC-3
- 从 “Clarification Planner” 调整为 “Precise Clarification Step”
- 明确是 orchestrator 控制下的一步，而不是自治 agent

### SPEC-4
- 从 “Evidence Retrieval Agent” 调整为 “Evidence Retrieval Tool”
- 明确是能力模块，不是独立交互主体

### SPEC-6
- 从 “Safety Critic Agent” 调整为 “Safety Validator”
- 明确是安全检查步骤/tool，不是流程主导者

---

## 10. 关键约束清单

```
✅ orchestrator 是唯一流程控制者
✅ 子模块尽量单次调用、单次输出、无状态
✅ 子模块不自主调用其他子模块
✅ 除核心临床判断外，优先实现为 tool/function
✅ 信息不足 → 优先表单 / 一次精准澄清，不默认 LOW
✅ HIGH 风险 → 必须包含就医/急诊/120 等急救指引
✅ 禁止药物剂量建议
✅ 禁止停药/改药建议
✅ 所有判断必须可审计
```

---

## 11. 当前最务实的下一步

如果按这个架构决策继续推进，最合理的实现顺序是：

1. **先修稳定性**：统一 JSON structured output / parsing
2. **再收敛模块边界**：intent / triage / retrieval / validator / builder
3. **最后再判断是否需要独立 Risk Fusion**

我的判断：
- 现在最该避免的是“设计上看起来很高级，但实现上很重”的 pseudo multi-agent 架构
- 先把系统做成 **强 orchestrator + 轻模块**，后面再演化，成本最低
