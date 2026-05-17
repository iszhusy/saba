# 06 — Safety Constraints

**版本**: v0.1  
**状态**: Active Draft  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/safety-constraints/00-goal.md](../modules/safety-constraints/00-goal.md)  
**目标**: 基于当前真实工程里的 `safety-validator.ts`，重新定义 Safety 从“结果纠偏器”走向“约束层”的第一阶段落地方式。

---

## 6.1 当前工程现实

当前仓库里安全相关实现主要在：

- `src/tools/safety-validator.ts`
- `src/agents/orchestrator-llm-first.ts` 的 Step 5

当前 Safety 的真实行为是：

1. 接收：
   - `risk_level`
   - `immediate_action`
   - `follow_up`
   - `warning_signs`
2. 检查：
   - 高风险是否有急诊/120
   - 中风险是否有团队联系建议
   - 是否含停药/剂量等危险建议
   - 高风险是否有 warning signs
3. 直接返回：
   - `approved`
   - `violations`
   - `corrected.*`

这个实现非常有价值，因为它已经承担了真实安全底线。

但它的问题也很明确：

- 它还在直接返回 `corrected` 文案字段
- 它更像“结果修正器”，不是约束层
- 它仍然绑定旧结果结构（`immediate_action` / `follow_up`）
- 它没有显式输出 `required_actions / forbidden_claims / risk_floor`

---

## 6.2 在新架构中的职责

Safety Constraints 负责回答：

1. 当前结果最低不能低于哪个 risk floor？
2. 最终回复里哪些动作必须出现？
3. 哪些说法禁止出现？
4. 哪些 warning signals 必须保留？
5. 当前输出是否应该 pass / revise / block？

它不负责：
- 重做临床推理
- 决定 interaction mode
- 直接写最终用户回复

---

## 6.3 与现有代码的映射

### 可直接复用
- `unsafe_medication_advice` 检测
- `missing_emergency_action` 检测
- `missing_team_contact` 检测
- `missing_warning_signs` 检测

### 需要改变的部分
- 从 `corrected` 文本改成 `constraints` 输出
- 从“直接改文案”改成“提供硬性约束给 synthesis”

---

## 6.4 第一阶段目标：保留现有规则资产，但改输出协议

第一阶段最现实的目标是：

> **不推翻当前 `validateSafety()` 的规则逻辑，只先把它的输出从 corrected-response 改为 constraint-object。**

这样既不丢现有工程资产，也能向新架构前进。

---

## 6.5 第一阶段建议接口

```typescript
interface SafetyConstraints {
  verdict: "pass" | "revise" | "block";
  violations: Array<{
    code: string;
    severity: "critical" | "high";
    message: string;
  }>;
  constraints: {
    required_actions: string[];
    forbidden_claims: string[];
    required_warning_signals: string[];
    risk_floor?: "high" | "medium" | "low";
    rewrite_reason?: string;
  };
}
```

---

## 6.6 第一阶段工程任务

### Task SC-1：重构 safety-validator 输出结构

修改：
- `src/tools/safety-validator.ts`

要求：
- 保留现有规则检查逻辑
- 输出新增 `constraints`
- 逐步减少 `corrected.*` 的直接文本修改职责

### Task SC-2：orchestrator Step 5 不再直接拿 corrected 文案出结果

修改：
- `src/agents/orchestrator-llm-first.ts`

要求：
- Step 5 产出 safety constraints
- Step 6 不再直接把 `corrected.immediate_action` 当最终输出
- 即使第一阶段还没引入完整 synthesis，也要在结构上让 Safety 不再是最终文案 owner

### Task SC-3：response-builder 接收 constraints 痕迹

修改：
- `src/lib/response-builder.ts`

最低要求：
- 审计信息中可看到 safety 介入结果
- 不再假设 safety 输出一定是最终改好的 action 文本

---

## 6.7 可验证验收标准

### 代码结构验收
- [ ] `validateSafety()` 输出包含 `constraints`
- [ ] `SafetyConstraints` 类型存在
- [ ] orchestrator Step 5 消费 `constraints` 而非 `corrected` 作为主要协议

### 行为验收
对以下情况验证：

1. **高风险无急诊建议**
   - [ ] 输出 `verdict = revise` 或 `block`
   - [ ] `required_actions` 包含立即就医/急诊/120
   - [ ] `risk_floor = high`

2. **中风险缺联系团队**
   - [ ] `required_actions` 包含联系医疗团队
   - [ ] `risk_floor` 至少为 `medium`

3. **出现停药/剂量建议**
   - [ ] `forbidden_claims` 非空
   - [ ] `verdict` 不应为 pass

### 测试验收
- [ ] 能写一个纯函数级测试，不依赖 LLM
- [ ] 至少覆盖 high / medium / unsafe medication 三类 case

---

## 6.8 为什么这样拆

当前 safety-validator 已经是项目里最真实、最稳定的一层之一。

所以这份 spec 的重点不是推翻它，而是：

> **让它从“最终文案修正器”升级为“可被 executive/synthesis 消费的约束层”。**
