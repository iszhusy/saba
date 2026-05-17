# Patient Baseline — 模块目标

**目的**：按 `user_id` 跨 Session 持久化治疗基线（方案大类、时间锚点等），与 Episode 事件记忆分离；在基线不完整时阻断 conclusive 分级评估。

**成功标准**：无基线用户首句症状 → 澄清/建档而非 risk 定级；有基线 + 事件信息足够 → 可 assess；红旗不因缺档案延迟升级。

**行为规格**：[behavior/12-patient-baseline.md](../../behavior/12-patient-baseline.md)  
**实现跟踪**：`openspec/changes/patient-baseline-clarification-gates/`
