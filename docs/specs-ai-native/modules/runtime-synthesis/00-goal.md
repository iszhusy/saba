# Runtime & Synthesis — 模块目标

**目的**：统一 LLM 调用（reasoning / critique / synthesis）、结构化输出、缓存与 trace；Executive 在 constraints 下生成自然语言终稿。

**成功标准**：所有 agent 调用经同一 runtime；reasoning JSON 与用户可见 draft 分离；synthesis 必须消费 constraints。

**行为规格**：[behavior/08-runtime-and-synthesis.md](../../behavior/08-runtime-and-synthesis.md)
