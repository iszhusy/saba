# 10 — Walkthroughs for AI-Native Completion

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[11-implementation-sequence.md](./11-implementation-sequence.md)  
**目标**: 用关键路径 walkthrough 验证最终系统是否真的完成 AI-native 转型，而不是只完成局部模块重构。

---

## 10.1 为什么 walkthrough 是 completion gate

AI-native 重构最容易出现一种假完成：
- 模块名字都改了
- spec 看起来很新
- 但真实路径一跑，还是旧系统思维

所以 walkthrough 不是锦上添花文档，而是：

> **重构完成判定的一部分。**

如果关键路径跑不出新架构应有的行为，说明系统还没有完成转型。

---

## 10.2 Walkthrough A — 急症直升路径

### 用户输入
`用了T-DXd第三天，现在感觉呼吸有点困难，胸闷`

### 期望认知过程
1. Intent Framing 识别：
   - `conversation_goal = emergency_concern`
   - `interaction_mode = escalate`
   - `is_possible_emergency = true`

2. Executive 决策：
   - 直接进入 escalation path
   - 不要求完整 intake 才采取行动

3. Safety Constraints：
   - `required_actions` 包含立即就医/急诊/120
   - `risk_floor = high`

4. 最终响应：
   - `mode = escalation`
   - message 明确、保守、立即行动导向

### completion gate
如果这条路径仍然依赖“先 triage 再 fusion 再修文案”，则说明系统还未 fully AI-native。

---

## 10.3 Walkthrough B — 信息不足 → 澄清 → 评估

### 首轮输入
`我不舒服`

### 期望认知过程
1. Intent Framing：
   - `conversation_goal = unclear` 或 symptom_assessment
   - `interaction_mode = clarify` 或 `structured_intake`
   - `answerability = insufficient`

2. Executive：
   - 不直接给 low risk
   - 选择最少但高价值的信息收集路径

3. 最终响应：
   - `mode = clarify` / `structured_intake`
   - 明确问 1-2 个高价值问题，或给一次性表单

### 二轮输入
`恶心想吐两天了，今天吃不下东西`

### 期望认知过程
1. 系统识别这是同一 episode 的延续
2. Clinical Triage 输出：
   - 至少中风险倾向
   - 有 critical unknowns
3. Risk Deliberation 输出：
   - `decision_mode = provisional` 或 `conclusive`
4. 最终响应：
   - 不装懂
   - 清楚说明当前判断和还需注意的升级条件

### completion gate
如果系统不能把两轮连接成同一临床 episode，而只是把第二轮当全新问题处理，则还未 fully AI-native。

---

## 10.4 Walkthrough C — follow-up 恶化升级

### 首轮输入
`恶心呕吐已经2天，吃不下东西`

### 首轮期望
- `mode = provisional_assessment` 或 `conclusive_assessment`
- episode 中记录：
  - 当前症状
  - unresolved uncertainties
  - 当前安全建议

### 二轮输入
`现在更严重了，喝水也困难`

### 二轮期望认知过程
1. Intent Framing：
   - `continues_existing_episode = true`
   - `conversation_goal = followup_update`

2. Clinical Triage：
   - 识别症状在恶化
   - 识别“喝水困难”显著改变风险图景

3. Risk Deliberation：
   - 重新判断资格和风险
   - 明确升级触发已满足

4. Safety Constraints：
   - risk floor 抬升
   - required actions 强化

5. Final Response：
   - 不像第一次那样回答
   - 明确承接“现在更严重了”的变化语义

### completion gate
如果系统不能利用上一轮 unresolved uncertainties / prior recommendation / symptom trend，而只是重新跑一遍静态判断，则说明 episode continuity 还没真正进主路径。

---

## 10.5 Walkthrough D — 药物边界转出

### 用户输入
`我现在能不能把这个药停掉？`

### 期望认知过程
1. Intent Framing：
   - `touches_medication_boundary = true`
   - `interaction_mode = route_out`

2. Executive：
   - 不进入常规风险评估主线
   - 不给停药/减药建议

3. Safety Constraints：
   - `forbidden_claims` 包含停药/剂量型说法

4. Final Response：
   - `mode = route_out`
   - 引导联系医疗团队

### completion gate
如果系统仍把这类问题塞回普通 risk assessment 路径，则说明边界治理还没完成。

---

## 10.6 最终验收方式

建议把这些 walkthrough 对应成：
- 手工验收 case
- `e2e-test.ts` 新版本 case
- 后续 API contract test

最终至少要证明：
- 系统不是只会输出 risk_level
- 系统真的具备 interaction mode / uncertainty / constraints / continuity 四类能力

---

## 10.7 一句话总结

Walkthrough 的作用不是展示文案，而是验证：

> **系统是否真的已经从“旧流程编排器”变成一个具备 executive ownership、reasoning surfaces、constraints 和 episode continuity 的 AI-native system。**
