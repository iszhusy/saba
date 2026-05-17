# 03 — Intent Framing

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/intent-framing/00-goal.md](../modules/intent-framing/00-goal.md)  
**目标**: 基于当前真实工程状态，重新定义 Intent Framing 的职责、输入输出和第一阶段可落地改造范围。

---

## 3.1 当前工程现实

当前仓库里最接近 Intent Framing 的实现是：

- `src/modules/intent-classifier.ts`
- `src/modules/information-sufficiency.ts`
- `src/agents/orchestrator-llm-first.ts` 中的 Step 1 路由逻辑

当前它实际上做了三类事：

1. **意图分类**
   - `symptom_assessment`
   - `medication_question`
   - `emergency_help`
   - `non_medical`
   - `unclear`

2. **快速路由**
   - `continue_to_triage`
   - `return_emergency_guidance`
   - `ask_precise_clarification`
   - `return_non_medical_redirect`

3. **信息充分性判断**
   - `sufficient_for_triage`
   - 澄清问题生成

但它目前的主要问题也很明确：

- 仍然以 **关键词规则** 为主，而不是 framing reasoning
- `intent-classifier.ts` 和 `information-sufficiency.ts` 的职责边界分裂
- 输出是旧式 route action，而不是 executive 可消费的 interaction framing
- follow-up / episode continuity 支持较弱，只做了少量模式匹配
- 澄清问题是模板式的，不是信息增益驱动的

---

## 3.2 在新架构中的职责

Intent Framing 负责回答：

1. 这轮用户输入**想解决什么问题**？
2. 这轮是否可能是**急症/升级**？
3. 这轮是否触及**药物停改剂量边界**？
4. 这是一个**新问题**，还是已有 episode 的 **follow-up**？
5. 当前信息的 **answerability** 在什么层级？
6. Executive 当前更适合走：
   - `structured_intake`
   - `clarify`
   - `assess`
   - `escalate`
   - `route_out`

它不负责：
- 给最终风险等级
- 生成最终用户回复
- 直接维护复杂状态机

---

## 3.3 与现有代码的映射

### 现有可复用部分

- `IntentType` / `RouteAction` 的问题域判断
- `assessInformationSufficiency()` 中对信息不足的检测思路
- `session_history` / `clarification_state` / `reported_messages` 的输入来源
- orchestrator 中 Step 1 的快速短路逻辑

### 当前不应直接继承的部分

- `EMERGENCY_KEYWORDS` 直接决定急症结论
- `route_action` 作为最终输出协议
- `sufficient_for_triage` 这种过窄的资格判断
- 机械型 clarification question 模板

---

## 3.4 第一阶段目标：先做“统一 framing 层”，不是先做更强模型

第一阶段不要求立刻把 Intent Framing 全改成 LLM 节点。

更现实的目标是：

> **先把当前散落在 `intent-classifier.ts` + `information-sufficiency.ts` + orchestrator Step 1 里的逻辑，收敛成一个统一的 framing contract。**

这样后面无论继续规则增强，还是替换成模型推理，executive 消费面都不会再乱。

---

## 3.5 第一阶段建议接口

```typescript
type ConversationGoal =
  | "symptom_assessment"
  | "emergency_concern"
  | "medication_boundary"
  | "followup_update"
  | "general_question"
  | "non_medical"
  | "unclear";

type InteractionMode =
  | "structured_intake"
  | "clarify"
  | "assess"
  | "escalate"
  | "route_out";

type Answerability =
  | "insufficient"
  | "provisional"
  | "sufficient";

interface IntentFramingOutput {
  conversation_goal: ConversationGoal;
  interaction_mode: InteractionMode;
  answerability: Answerability;
  is_possible_emergency: boolean;
  touches_medication_boundary: boolean;
  continues_existing_episode: boolean;
  missing_information: {
    item: string;
    why_it_matters: string;
    criticality: "critical" | "important" | "optional";
  }[];
  clarification_goals: string[];
  reasoning_summary: string;
}
```

这个接口可以先用规则/启发式生成，但它的消费面必须先稳定。

---

## 3.6 第一阶段工程任务

### Task IF-1：新建 framing module

新增：
- `src/modules/intent-framing.ts`

职责：
- 吸收 `intent-classifier.ts`
- 吸收 `information-sufficiency.ts` 的核心输出
- 统一返回 `IntentFramingOutput`

### Task IF-2：orchestrator 改为消费 framing output

修改：
- `src/agents/orchestrator-llm-first.ts`

把当前基于：
- `route_action`
- `sufficient_for_triage`
- `clarification_questions`

的判断，切换成基于：
- `interaction_mode`
- `answerability`
- `clarification_goals`

### Task IF-3：保留旧模块但降级为兼容层

暂时不必立刻删：
- `src/modules/intent-classifier.ts`
- `src/modules/information-sufficiency.ts`

但要明确：
- 它们只能作为 `intent-framing.ts` 的内部依赖或迁移参考
- 不再由 orchestrator 直接消费

---

## 3.7 可验证验收标准

### 代码结构验收
- [ ] 存在 `src/modules/intent-framing.ts`
- [ ] `orchestrator-llm-first.ts` 不再直接 import `information-sufficiency.ts`
- [ ] orchestrator Step 1 只消费 `IntentFramingOutput`

### 行为验收
用现有脚本可验证以下 4 类输入：

1. **明显急症**
   - 输入：`呼吸困难，胸闷`
   - 期望：`interaction_mode = "escalate"`

2. **信息不足**
   - 输入：`我不舒服`
   - 期望：`interaction_mode = "clarify"` 或 `structured_intake`

3. **药物边界**
   - 输入：`我能不能停药`
   - 期望：`interaction_mode = "route_out"`

4. **可直接评估**
   - 输入：`恶心呕吐两天，吃不下东西`
   - 期望：`interaction_mode = "assess"`

### 测试验收
- [ ] `phase2-test.ts` 或新测试脚本可输出 framing 结果
- [ ] 不需要真实 LLM 即可跑通第一阶段 framing 验证

---

## 3.8 为什么这样拆

这份 spec 不把 Intent Framing 拆成“全新智能体项目”，而是先卡住一个更现实的问题：

> **先让系统入口只产生一种统一 framing 协议。**

只有这样，下一步 Executive、Triage、Clarification 才能真的清晰对接。
