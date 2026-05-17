# Episode State — 模块目标

**目的**：以 Episode 为单位维护**单次临床事件**内的症状、评估历史、工作假设、未决未知与澄清史，支撑 follow-up 与审计。

**边界**：跨 Session 的治疗基线（方案、周期锚点）属 [Patient Baseline](../patient-baseline/00-goal.md)，不以 Episode 为 SoT。

**成功标准**：「更严重了」可解析到具体症状与上轮判断；状态持久化可恢复；非 messages 数组堆砌。

**行为规格**：[behavior/07-episode-state.md](../../behavior/07-episode-state.md)
