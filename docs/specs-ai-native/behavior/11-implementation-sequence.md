# 11 — Implementation Sequence to Full AI-Native Completion

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[INDEX.md](../INDEX.md)  
**目标**: 把当前工程从现状推进到“重构完成后确实是一个 AI-native 系统”，而不是长期停留在半旧半新的中间态。

---

## 11.1 这份文档解决什么问题

前面的 spec 已经把架构拆开了，但还缺一个关键东西：

> **怎样按真实工程顺序推进，最后确保系统整体完成 AI-native 转型。**

如果没有这份执行序列，项目很容易变成：
- 新 spec 写了一套
- 旧 orchestrator 还在主路上跑
- 新旧协议同时存在
- safety 还是老的 corrected 模式
- UI 和 API 仍然消费旧结果结构
- 最终系统只是“局部有 AI-native 味道”，但整体不是 AI-native system

所以这份 Implementation Sequence 的核心目标是：

1. 给出**明确阶段**
2. 每阶段限定**改哪些文件**
3. 每阶段定义**完成标志**
4. 每阶段定义**可验证测试**
5. 明确哪些旧结构必须在某个阶段后退出主路径

---

## 11.2 AI-native completion 的判定标准

只有满足下面这些条件，才算“系统重构完成，已经是 AI-native 系统”：

### Completion Criterion A：唯一对外主体成立
- 用户可见响应只由 Executive 路径生成
- 中间模块不再直接承担最终回复 owner 身份

### Completion Criterion B：主路径基于 reasoning surfaces，而不是旧 route/result 拼接
- executive 消费的是 framing / triage / deliberation / constraints
- 不再直接消费旧式 `route_action + rule_assessment + corrected_response`

### Completion Criterion C：Safety 成为 constraint layer
- safety 输出 `constraints`
- 不再是最终文案修正器

### Completion Criterion D：结论资格被显式建模
- 系统明确区分：
  - `clarify`
  - `provisional`
  - `conclusive`
  - `insufficient`
  - `escalation`
  - `route_out`
- 不再只有一个粗糙 risk result

### Completion Criterion E：Episode continuity 成为主流程能力
- follow-up update 不是拼聊天历史
- 系统能消费 `episode_context / unresolved_uncertainties / clarification_history`

### Completion Criterion F：旧 orchestrator-centered 协议退出主路径
以下旧结构不能再作为主路径核心协议：
- `route_action`
- `sufficient_for_triage`
- `corrected.immediate_action`
- “triage 后默认必跑 retrieval”
- “fusion 直接输出最终用户层结果”

只要 F 没完成，就还不算 fully AI-native。

---

## 11.3 总体推进顺序

建议按 6 个 Milestone 推进，而不是并行乱改。

```text
M1 统一入口 framing contract
M2 升级 triage surface
M3 抽出 deliberation layer
M4 把 safety 改造成 constraints layer
M5 建立 executive + synthesis 主路径
M6 让 episode continuity 成为主路径能力，并清退旧协议
```

这里最关键的是：

> **M5 和 M6 完成之前，不能宣称系统已经 AI-native 完成。**

因为前 4 步更多是在“准备认知部件”，真正完成系统转型，要靠 executive 主路径收口和旧协议退出。

---

## 11.4 Milestone 1 — 统一入口 framing contract

### 目标
把当前分散在：
- `src/modules/intent-classifier.ts`
- `src/modules/information-sufficiency.ts`
- `src/agents/orchestrator-llm-first.ts` Step 1

里的入口判断，统一到单一 framing contract。

### 主要改动文件
- 新增：`src/modules/intent-framing.ts`
- 修改：`src/agents/orchestrator-llm-first.ts`
- 可选保留：`src/modules/intent-classifier.ts`
- 可选保留：`src/modules/information-sufficiency.ts`

### 完成标志
- orchestrator Step 1 只消费 `IntentFramingOutput`
- 旧 `route_action` 不再作为主路径决策协议

### 验证方法
- Case 1: `呼吸困难，胸闷` → `interaction_mode = escalate`
- Case 2: `我不舒服` → `clarify` / `structured_intake`
- Case 3: `能不能停药` → `route_out`
- Case 4: `恶心呕吐两天，吃不下东西` → `assess`

### 阶段结束后的系统状态
- 入口已经开始 AI-native 化
- 但整体仍未完成 AI-native 转型

---

## 11.5 Milestone 2 — 升级 triage surface

### 目标
把 `src/modules/clinical-triage.ts` 从 parse/rule wrapper 升级为临床图景输出层。

### 主要改动文件
- 修改：`src/modules/clinical-triage.ts`
- 修改：`src/agents/orchestrator-llm-first.ts`
- 参考：`src/lib/llm-tools.ts`

### 完成标志
- triage 输出包含：
  - `triage_assessment`
  - `red_flag_signals`
  - `retrieval_strategy`
  - `clarification_targets`
- retrieval 不再默认总执行，而由 triage 决定

### 验证方法
- `恶心呕吐两天，吃不下东西`：
  - `current_risk_tendency >= medium`
  - `critical_unknowns` 非空
  - `retrieval_strategy.should_retrieve = true`
- `胸闷，呼吸困难`：
  - `red_flag_signals` 非空
  - `current_risk_tendency = high`

### 阶段结束后的系统状态
- 系统已经有 clinical picture layer
- 但 עדיין没有正式的结论资格层

---

## 11.6 Milestone 3 — 抽出 deliberation layer

### 目标
把当前 orchestrator Step 4 的 LLM fusion，从“直接出结果”改造成“输出资格层”。

### 主要改动文件
- 新增：`src/modules/risk-deliberation.ts`
- 修改：`src/agents/orchestrator-llm-first.ts`
- 修改：`src/lib/structured-output.ts`

### 完成标志
- Step 4 输出 `RiskDeliberationOutput`
- 明确包含：
  - `decision_mode`
  - `uncertainty`
  - `response_eligibility`
  - `what_would_change_the_assessment`

### 验证方法
- `恶心呕吐两天，吃不下东西`：不应一律 `conclusive`
- `我不舒服`：不应进入 conclusive
- `呼吸困难、胸闷`：high + 强升级路径

### 阶段结束后的系统状态
- 系统开始显式区分“看起来像什么”和“现在能说到什么程度”
- 但 safety 和最终表达还没 fully AI-native

---

## 11.7 Milestone 4 — Safety 改造成 constraints layer

### 目标
保留现有规则资产，但把 `safety-validator.ts` 从 corrected-response 模式改造成 constraint-output 模式。

### 主要改动文件
- 修改：`src/tools/safety-validator.ts`
- 修改：`src/agents/orchestrator-llm-first.ts`
- 修改：`src/lib/response-builder.ts`

### 完成标志
- safety 输出 `constraints`
- `corrected.*` 不再作为主协议
- orchestrator 不再直接把 safety 当最终文案修正器使用

### 验证方法
- high risk 缺急诊建议 → `required_actions` 包含急诊/120
- medium risk 缺团队联系 → `required_actions` 包含联系医疗团队
- 含停药/剂量建议 → `forbidden_claims` 非空

### 阶段结束后的系统状态
- 安全层已经 AI-native 化
- 但 executive 还没正式成为唯一响应 owner

---

## 11.8 Milestone 5 — 建立 Executive + Synthesis 主路径

### 目标
这是整个重构里最关键的一步。

要把现在的 `orchestrator-llm-first.ts`，从“编排 + 直接产最终结果”的旧混合体，收敛成：

- Executive 决定 interaction mode
- reasoning layers 提供 surface
- safety 提供 constraints
- synthesis 统一生成最终用户响应

### 主要改动文件
- 新增：`src/agents/conversation-executive.ts`
- 新增：`src/lib/response-synthesis.ts`（或同等模块）
- 修改：`src/services/assess-pipeline.ts`
- 修改：`src/api/handler.ts`
- 修改：`src/lib/response-builder.ts`
- 逐步降级：`src/agents/orchestrator-llm-first.ts`

### 完成标志
- API 主路径调用 Executive，而不是旧 orchestrator 直接产最终结果
- `response-builder.ts` 不再承担旧式最终组装中心角色，或者被降级为 payload helper
- 最终 message 来自 synthesis，而不是来自 fusion/advice/safety 的拼装

### 验证方法
- 端到端 case 中，返回结构包含明确 `mode`
- clarify / escalation / route_out / provisional / conclusive 路径都可区分
- UI 至少能消费 `mode + message + optional ui_payload`

### 这是 AI-native completion 的必要条件
**如果 M5 没完成，系统还不是完整 AI-native，只是若干 AI-native 部件。**

---

## 11.9 Milestone 6 — Episode continuity 成为主路径能力，并清退旧协议

### 目标
把 `conversation-state.ts` 从“旁路增强”变成 executive 主路径的正式依赖，并清理旧协议残留。

### 主要改动文件
- 修改：`src/services/conversation-state.ts`
- 修改：`src/services/assess-pipeline.ts`
- 修改：`src/types/index.ts`
- 修改：`src/api/handler.ts`
- 修改：前端 chat 展示相关组件（按返回结构更新）

### 完成标志
- Executive 每轮显式读写 episode state
- follow-up update 可消费 unresolved uncertainties / clarification history
- 旧主路径协议退出：
  - `route_action`
  - `sufficient_for_triage`
  - `corrected.*`
  - 旧 final result assumption

### 验证方法
至少验证 3 条关键路径：

1. **急症直升路径**
   - 输入：`呼吸困难，胸闷`
   - 输出：`mode = escalation`
   - 不依赖后续多余流程

2. **信息不足 → 澄清 → provisional/conclusive**
   - 首轮：`我不舒服`
   - 二轮补充后：进入 assess
   - 系统能识别这是同一 episode 延续

3. **follow-up 恶化升级**
   - 首轮：中风险恶心呕吐
   - 二轮：`现在更严重了，喝水也困难`
   - 系统识别为 follow-up update，并提高风险/升级动作

### 这是 AI-native completion 的最终条件
**M6 完成后，系统才算完成从旧 orchestrator-centered 架构向 AI-native system 的整体转型。**

---

## 11.10 迁移期间的约束

为了避免长期停在半旧半新状态，必须加两个约束：

### Constraint 1：每完成一个 Milestone，就切主消费面
比如：
- M1 完成后，主路由必须切到 `IntentFramingOutput`
- M4 完成后，主安全协议必须切到 `constraints`

不能只“新增不切换”。

### Constraint 2：M5 开始后，旧 orchestrator 不再继续堆功能
`src/agents/orchestrator-llm-first.ts` 在 M5 之后应进入：
- 兼容层
- 过渡层
- 待退役层

不能再继续把新逻辑往里面堆，否则永远不会完成转型。

---

## 11.11 最终 Done Definition

只有当下面这些问题都回答为“是”，这次重构才算真正完成：

- [ ] 用户看到的最终响应是否只来自 Executive + Synthesis？
- [ ] intent / triage / deliberation / safety 是否都以结构化 surface/constraints 形式被消费？
- [ ] 是否已明确区分 clarify / provisional / conclusive / insufficient / escalation / route_out？
- [ ] safety 是否已经不再是 corrected 文案修正器？
- [ ] follow-up 是否基于 episode continuity，而不是简单消息拼接？
- [ ] 旧 orchestrator-centered 主协议是否已退出主路径？

只要有一项不是，系统就还没有 fully AI-native completion。

---

## 11.12 一句话总结

这份执行序列的目标不是“把几个模块改漂亮”，而是：

> **确保重构结束时，SABA 整体上已经变成一个真正由 Executive 驱动、以 reasoning surfaces 和 constraints 为核心协议、具备 episode continuity 的 AI-native system。**
