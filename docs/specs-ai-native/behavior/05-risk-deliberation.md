# 05 — Risk Deliberation

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/risk-deliberation/00-goal.md](../modules/risk-deliberation/00-goal.md)  
**目标**: 基于当前真实工程里“LLM Risk Fusion”的存在方式，重新定义 Risk Deliberation，并给出第一阶段可验证改造目标。

---

## 5.1 当前工程现实

当前仓库里没有一个独立的 `risk-deliberation.ts`。

实际承担这部分职责的是：
- `src/agents/orchestrator-llm-first.ts` 中的 Step 4 `runLLMRiskFusion()`
- `src/lib/structured-output.ts` 中的解析能力
- `src/lib/response-builder.ts` 对 LLM 输出的消费

当前 Step 4 的真实行为是：

1. 收集：
   - 用户原始输入
   - `parsed_symptoms`
   - 规则评估结果
   - RAG 检索结果
   - intent 分类结果
2. 拼成 prompt
3. 调用 Anthropic / DashScope
4. 输出：
   - `risk_level`
   - `risk_score`
   - `reasoning`
   - `warning_signs`
   - `immediate_action`
   - `follow_up`
   - `confidence`

这说明当前系统已经有一个“融合判断点”，但它存在三个明显问题：

- **融合判断和最终用户话术耦合在一起**
- 缺少显式的 `conclusive / provisional / insufficient` 资格判断
- 缺少结构化 uncertainty / what would change assessment 输出

也就是说：

> 当前代码里有“结论”，但还没有“结论资格层”。

---

## 5.2 在新架构中的职责

Risk Deliberation 负责回答：

1. 当前是否已经具备正式判断资格？
2. 如果不够，当前属于：
   - `provisional`
   - `insufficient`
3. 当前主要判断是什么？
4. 还存在哪些关键未知项？
5. 哪些信息会真正改变结论？
6. 当前是否允许 executive 给出正式评估、临时评估，还是只能说限制和下一步？

它不负责：
- 最终面向用户的完整文案
- safety hard guard
- UI payload 组织

---

## 5.3 与现有代码的映射

### 可直接复用
- `runLLMRiskFusion()` 作为现有融合判断入口
- `parseRiskAssessmentOutput()` 作为结构化解析基础
- `triage + evidence + intent` 拼 prompt 的工程路径

### 需要拆出的新层
- `decision_mode`
- `uncertainty`
- `response_eligibility`
- `what_would_change_the_assessment`

---

## 5.4 第一阶段目标：先把“融合结论”拆成“判断 + 资格”

第一阶段不要求立即把 orchestrator 中的 Step 4 完全抽成独立模块。

更现实的目标是：

> **先让当前 LLM Risk Fusion 输出从“直接给用户用的结果”升级为“executive 可消费的 deliberation object”。**

---

## 5.5 第一阶段建议接口

```typescript
type DecisionMode = "conclusive" | "provisional" | "insufficient";

interface RiskDeliberationOutput {
  decision_mode: DecisionMode;
  primary_assessment: {
    risk_level: "high" | "medium" | "low";
    risk_score: number;
    confidence: number;
    reasoning_summary: string;
  };
  uncertainty: {
    reasons: string[];
    critical_unknowns: string[];
    impact_on_decision: string;
    what_would_change_the_assessment: string[];
  };
  response_eligibility: {
    can_give_conclusive_assessment: boolean;
    can_give_provisional_assessment: boolean;
    should_request_more_information: boolean;
  };
  recommended_actions: {
    immediate: string;
    follow_up: string;
  };
  warning_signals: string[];
}
```

---

## 5.6 第一阶段工程任务

### Task RD-1：抽出独立模块文件

新增：
- `src/modules/risk-deliberation.ts`

先不一定要把所有逻辑移干净，但要把“融合后的标准输出协议”固定下来。

### Task RD-2：orchestrator Step 4 改为返回 deliberation object

修改：
- `src/agents/orchestrator-llm-first.ts`

要求：
- Step 4 不再直接返回最终 `LLMDecisionResult` 给 response builder
- 先返回 `RiskDeliberationOutput`

### Task RD-3：Prompt 增加资格判断输出

修改当前 prompt，让模型显式输出：
- `decision_mode`
- `uncertainty.reasons`
- `critical_unknowns`
- `what_would_change_the_assessment`

### Task RD-4：response-builder 不再直接吃 raw fusion output

`response-builder.ts` 后续只应消费：
- deliberation
- safety constraints
- executive synthesis 结果

第一阶段至少先做到：
- 不再让 response builder 假设 Step 4 已经是最终用户层结果

---

## 5.7 可验证验收标准

### 代码结构验收
- [ ] 存在 `src/modules/risk-deliberation.ts`
- [ ] orchestrator Step 4 输出包含 `decision_mode`
- [ ] `structured-output.ts` 能解析 deliberation 新结构

### 行为验收
对以下输入验证：

1. `恶心呕吐两天，吃不下东西`
   - [ ] 输出 `risk_level = medium` 或更高
   - [ ] `decision_mode` 不应盲目固定为 `conclusive`
   - [ ] `uncertainty.reasons` 非空

2. `我不舒服`
   - [ ] 不应进入 conclusive
   - [ ] `decision_mode = insufficient` 或前置已 clarify

3. `呼吸困难、胸闷`
   - [ ] `risk_level = high`
   - [ ] `decision_mode` 可为 `conclusive` 或强升级路径

### 测试验收
- [ ] `e2e-test.ts` 或新脚本中可打印 `decision_mode`
- [ ] 至少有一个 case 能展示 `what_would_change_the_assessment`

---

## 5.8 为什么这样拆

当前工程里 Step 4 已经是整个系统真正的判断核心。

所以这份 spec 不会假装它不存在，而是直接承认：

> **现在最重要的，不是另起炉灶重写一套融合逻辑，而是先把现有融合点提升成“结论资格层”。**
