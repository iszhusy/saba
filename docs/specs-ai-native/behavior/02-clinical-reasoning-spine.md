# 02 — Clinical Reasoning Spine

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[01-executive.md](./01-executive.md)  
**目标**: 定义 SABA AI-native 架构中最核心的临床推理脊柱：系统如何从用户输入一路走到可说 / 不可说 / 只能临时说的判断资格。

---

## 2.1 为什么要先定义 Reasoning Spine

在旧式架构里，很多问题都来自一个根源：

> 系统有流程，但没有清晰的推理脊柱。

于是会出现：
- 先跑规则，再找理由
- 先做结论，再补澄清
- 先拼文案，再让安全层擦屁股
- 节点虽然很多，但不知道每个节点到底在“认知上负责什么”

所以在 AI-native 主线下，必须先定义一条稳定的 reasoning spine。

这条 spine 不是技术调用顺序，而是：

> **系统从“理解当前问题”到“获得输出资格”的认知链条。**

---

## 2.2 Reasoning Spine 的四个核心节点

临床推理主链路先收敛为四个核心节点：

1. **Intent Framing**
2. **Clinical Triage**
3. **Risk Deliberation**
4. **Safety Constraints**

这四个节点共同回答四类不同的问题：

### 2.2.1 Intent Framing
回答：
- 用户当前在解决什么问题？
- 这是新问题还是 follow-up？
- 当前是 intake / clarify / assess / escalate / route_out 哪类入口？
- 当前信息的 answerability 大概在哪个层级？

它负责的是：
- **交互框架化**

而不是：
- 临床最终判断

### 2.2.2 Clinical Triage
回答：
- 当前临床图景看起来像什么？
- 风险当前更偏 high / medium / low 哪一侧？
- 哪些事实是已知的，哪些是推断的，哪些还是未知的？
- 是否值得进一步 retrieval？

它负责的是：
- **临床初判 surface**

而不是：
- 最终结论资格裁定

### 2.2.3 Risk Deliberation
回答：
- 当前是否已经足够给出 conclusive judgement？
- 还是只能 provisional？
- 还是其实仍然 insufficient？
- 哪些未知项在真实阻断结论资格？

它负责的是：
- **结论资格审议**

而不是：
- 最终对用户说话

### 2.2.4 Safety Constraints
回答：
- 当前最终表达不能低于哪个 risk floor？
- 哪些动作必须说？
- 哪些说法禁止出现？
- 是否需要 block / revise？

它负责的是：
- **输出安全约束**

而不是：
- 重做整套临床判断

---

## 2.3 四个节点之间的认知关系

可以把它们理解成：

```text
Intent Framing
  定义“这轮是什么问题”

Clinical Triage
  定义“当前临床上看起来像什么”

Risk Deliberation
  定义“现在能说到什么程度”

Safety Constraints
  定义“最终哪些说法必须/不能出现”
```

这四层不是彼此替代关系，而是责任递进关系。

---

## 2.4 Reasoning Spine 的主问题

### 问题 1：这轮要走哪种交互路径？
由 Intent Framing 主导，Executive 决策。

### 问题 2：当前风险图景更像什么？
由 Clinical Triage 主导。

### 问题 3：现在是否具备输出正式结论的资格？
由 Risk Deliberation 主导。

### 问题 4：最终表达能说什么、必须说什么、不能说什么？
由 Safety Constraints 主导。

---

## 2.5 为什么要把 Triage 和 Deliberation 分开

这是整个新架构里非常关键的一刀。

旧系统里最容易混淆的是：
- “看起来像 high risk”
- “已经可以对用户明确说 high risk”

这两件事并不总是同一件事。

### Triage 负责的是：
- 当前风险倾向
- 当前临床图景
- 当前未知项
- 当前值得追问或检索的点

### Deliberation 负责的是：
- 在这些已知 + 未知条件下
- 到底能不能给出 conclusive / provisional / insufficient
- 哪些 unknown 是真阻断项
- 哪些只是在降低 confidence，但不阻止基本建议

如果不拆开，系统就会很容易：
- 一看到 red flag 词就直接给最终结论
- 一有 uncertainty 就机械退回 clarify
- 或者在 triage 阶段就夹带最终表达资格判断

---

## 2.6 为什么 Safety 必须在主 spine 里，而不是边上挂个 validator

很多系统把 Safety 看成边车：
- 最后审一下
- 不行就加一句“建议就医”

但医疗场景里这不够。

原因是：
- 输出资格本身就受 safety 影响
- 某些情况下即使 deliberation 倾向 medium，也可能被 safety 提高 risk floor
- 某些说法即使语义上听起来合理，也可能越过 medication / diagnosis 边界

所以 Safety 不是“旁路插件”，而是 reasoning spine 的最后一环。

---

## 2.7 Reasoning Spine 的输入输出契约

### Intent Framing 输出
应重点包含：
- conversation goal
- answerability
- possible emergency / medication boundary
- interaction mode 倾向
- missing information 的方向

### Clinical Triage 输出
应重点包含：
- current risk tendency
- known / inferred / unknown
- critical unknowns
- red flags
- retrieval strategy
- clarification targets

### Risk Deliberation 输出
应重点包含：
- decision mode: conclusive / provisional / insufficient
- primary assessment
- uncertainty impact
- what would change the assessment
- response eligibility

### Safety Constraints 输出
应重点包含：
- required actions
- forbidden claims
- required warning signals
- risk floor
- verdict: pass / revise / block

这样 Executive 才能消费的是：
- 框架
- 图景
- 资格
- 约束

而不是一堆混合文案。

---

## 2.8 Reasoning Spine 的典型路径

### Path A：急症路径

```text
用户输入
  → Intent Framing: possible emergency
  → Executive: escalate path
  → (可选) Minimal Triage for context sharpening
  → Safety Constraints
  → Final escalation response
```

关键特征：
- 安全优先于信息收集
- 不要求获得完整临床图景再行动

### Path B：信息不足路径

```text
用户输入
  → Intent Framing: answerability insufficient
  → Executive: intake / clarify
  → 补充信息
  → Clinical Triage
  → Risk Deliberation
  → Safety Constraints
  → Final provisional / conclusive / insufficient response
```

关键特征：
- 先补高价值信息
- 不机械追完整字段

### Path C：信息足够路径

```text
用户输入
  → Intent Framing: assessable
  → Clinical Triage
  → (如有价值) Evidence Retrieval
  → Risk Deliberation
  → Safety Constraints
  → Final conclusive or provisional response
```

关键特征：
- Retrieval 是按需调用
- Deliberation 决定是否真的能 conclusive

### Path D：边界转出路径

```text
用户输入
  → Intent Framing: medication boundary / non-medical
  → Executive: route_out
  → Safety Constraints (如需要)
  → Final route_out response
```

关键特征：
- 不误把所有问题都塞进风险评估主线

---

## 2.9 Reasoning Spine 的设计原则

### 原则 A：每个节点只回答一种类型的问题
- framing 不做最终临床定论
- triage 不做最终输出资格裁定
- deliberation 不直接对用户说话
- safety 不重做临床推理

### 原则 B：每个节点都必须显式表达 uncertainty
在医疗场景里，隐含的不确定性比显式的不确定性更危险。

### 原则 C：资格判断晚于图景判断
先搞清楚“看起来像什么”，再决定“能说到什么程度”。

### 原则 D：最终回复必须经过 executive synthesis
reasoning spine 的终点不是某个中间对象，而是为 executive 提供最终可合成的认知结构。

---

## 2.10 这条 spine 当前要继续往下细化什么

下一步应分别细化：

1. `02-intent-framing.md`
   - 早期入口如何定义 interaction frame
2. `04-clinical-triage.md`
   - triage surface 如何定义
3. `06-risk-deliberation.md`
   - 决策资格如何定义
4. `07-safety-constraints.md`
   - risk floor / required actions / forbidden claims 如何定义

这几个文档会把 spine 从概念层推进到接口层。

---

## 2.11 一句话总结

Clinical Reasoning Spine 定义的不是“模块调用顺序”，而是：

> **系统从“这轮是什么问题”到“现在能说到什么程度、最终又必须怎么安全地说”的核心认知链条。**
