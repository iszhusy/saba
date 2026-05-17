# 04 — Clinical Triage

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/clinical-triage/00-goal.md](../modules/clinical-triage/00-goal.md)  
**目标**: 基于当前真实代码里的 triage 能力，定义新架构下的 Clinical Triage surface，以及第一阶段可验证改造目标。

---

## 4.1 当前工程现实

当前仓库里最接近 Clinical Triage 的实现是：

- `src/modules/clinical-triage.ts`
- `src/lib/llm-tools.ts`
  - `toolParseSymptoms`
  - `toolRiskAssess`
- `src/tools/symptom-parser.ts`
- `src/tools/risk-assessor.ts`

当前 triage 做的事情是：

1. 调用 `toolParseSymptoms()` 解析症状
2. 调用 `toolRiskAssess()` 获取规则风险评估
3. 输出：
   - `parsed_symptoms`
   - `rule_assessment`
   - `decision_notes`
   - `tool_calls`

这说明当前 triage 的工程基础是存在的，但它仍然明显偏旧：

- triage 仍是“症状解析 + 规则评估”的薄封装
- 它没有显式输出 known / inferred / unknown
- 没有 clinical picture
- 没有 clarification targets
- 没有 retrieval strategy
- 没有把 follow-up / episode continuity 纳入判断 surface

---

## 4.2 在新架构中的职责

Clinical Triage 负责回答：

1. 当前临床图景更像什么？
2. 当前风险更偏 high / medium / low 哪一侧？
3. 当前哪些事实是已知的？哪些是推断的？哪些是未知的？
4. 哪些未知项真正影响风险边界？
5. 是否值得调用 Evidence Retrieval？
6. 如果继续澄清，最该问什么方向？

它不负责：
- 最终 conclusive / provisional / insufficient 资格裁定
- 最终用户回复生成
- 安全重写

---

## 4.3 与现有代码的映射

### 可直接复用
- `parsed_symptoms`
- `rule_assessment`
- `tool_calls`
- `toolParseSymptoms()`
- `toolRiskAssess()`

### 需要补出的新 surface
- `triage_assessment.current_risk_tendency`
- `basis.known_facts / inferred_facts / unknowns`
- `critical_unknowns`
- `clinical_picture.red_flag_signals`
- `retrieval_strategy`
- `clarification_targets`

---

## 4.4 第一阶段目标：把 triage 从“工具聚合器”提升为“临床图景 surface”

第一阶段不要求 triage 一步到位拥有完整临床 reasoning model。

更现实的目标是：

> **保留现有 parse + rule 工程资产，但在其上层补出 executive / deliberation 真正可消费的 triage surface。**

---

## 4.5 第一阶段建议接口

```typescript
interface TriageAssessment {
  current_risk_tendency: "high" | "medium" | "low";
  confidence: number;
  reasoning_summary: string;
  known_facts: string[];
  inferred_facts: string[];
  unknowns: string[];
  critical_unknowns: string[];
}

interface RetrievalStrategy {
  should_retrieve: boolean;
  objective: string;
  queries: string[];
}

interface ClarificationTarget {
  goal: string;
  why_it_matters: string;
  priority: "critical" | "important";
}

interface ClinicalTriageOutputV2 {
  parsed_symptoms: Array<{ standard_term: string; severity: string }>;
  rule_assessment: {
    risk_level: "low" | "medium" | "high";
    risk_score: number;
    triggered_rules: Array<{ id: string; name: string }>;
    confidence: number;
  };
  triage_assessment: TriageAssessment;
  red_flag_signals: string[];
  retrieval_strategy: RetrievalStrategy;
  clarification_targets: ClarificationTarget[];
  tool_calls: LLMToolResult[];
}
```

---

## 4.6 第一阶段工程任务

### Task CT-1：扩展现有 clinical-triage.ts 输出

修改：
- `src/modules/clinical-triage.ts`

在保留现有 `parsed_symptoms` / `rule_assessment` 的基础上，新增：
- `triage_assessment`
- `red_flag_signals`
- `retrieval_strategy`
- `clarification_targets`

### Task CT-2：引入最小 unknowns 推导

先不做复杂模型推断，可先基于：
- 原始输入
- parse 结果
- rule 结果
- treatment context

推导最小集合：
- 是否缺 duration
- 是否缺 severity impact
- 是否缺 temperature / oral intake / breathing status 等关键字段

### Task CT-3：让 orchestrator 消费 triage surface，而不是只拿 rule result

修改：
- `src/agents/orchestrator-llm-first.ts`

要求：
- Step 3 Retrieval 是否触发，由 `triage.retrieval_strategy.should_retrieve` 决定
- Step 4 LLM 融合 prompt 中加入 `known / inferred / unknown`

---

## 4.7 可验证验收标准

### 代码结构验收
- [ ] `src/modules/clinical-triage.ts` 输出包含 `triage_assessment`
- [ ] orchestrator 不再默认总是执行 retrieval，而是受 `retrieval_strategy` 控制

### 行为验收
对以下输入做验证：

1. `恶心呕吐两天，吃不下东西`
   - [ ] `current_risk_tendency` 至少为 `medium`
   - [ ] `critical_unknowns` 包含摄入/体温相关项之一
   - [ ] `retrieval_strategy.should_retrieve = true`

2. `我不舒服`
   - [ ] triage 不应被直接调用，或输出应明显标记 unknowns 过多

3. `胸闷，呼吸困难`
   - [ ] `red_flag_signals` 非空
   - [ ] `current_risk_tendency = high`

### 测试验收
- [ ] 可在 `phase2-test.ts` 或新 triage 测试脚本中打印新增 surface
- [ ] 不要求第一阶段引入新模型调用即可跑通

---

## 4.8 为什么这样拆

当前代码里 triage 已经有一个不错的工程起点，但它的输出太“工具导向”了。

这份 spec 的重点不是推翻它，而是：

> **把现有 triage 从 parse/rule wrapper，提升成真正的临床图景输出层。**
