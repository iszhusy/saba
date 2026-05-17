# SABA AI-Native 重构说明

**状态**: 已收敛至 canonical 规格树 v1.0

本次重构的**权威入口**：

→ **[docs/specs-ai-native/INDEX.md](./specs-ai-native/INDEX.md)**

推荐阅读顺序：

1. [00-goal.md](./specs-ai-native/00-goal.md)  
2. [01-architecture.md](./specs-ai-native/01-architecture.md) — **全面架构**  
3. [02-contracts.md](./specs-ai-native/02-contracts.md)  
4. 单模块 [modules/*/00-goal.md](./specs-ai-native/INDEX.md)  
5. 实现与迁移 [behavior/11-implementation-sequence.md](./specs-ai-native/behavior/11-implementation-sequence.md)  

历史 `docs/specs/SPEC-*.md` 已归档至 `docs/specs/_archive/`，**不得**作为新设计约束。

Agent 加载规则见仓库根目录 [AGENTS.md](../AGENTS.md)。

---

## 决策摘要（保留）

> 从旧 spec 修补式演进，转为 **Executive 驱动的 AI-native 判断架构**；旧 spec 仅作问题来源与迁移对照。

核心原则见 [01-architecture.md §2](./specs-ai-native/01-architecture.md)。
