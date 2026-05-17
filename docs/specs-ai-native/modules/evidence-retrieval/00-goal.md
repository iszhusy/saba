# Evidence Retrieval — 模块目标

**目的**：按 triage 策略提供规则匹配与 RAG 证据 surface，供 Deliberation 使用；不直接对用户说话。

**成功标准**：`EvidenceRetrievalSurface` 含 focus、snippets、matched rules；无证据时显式空结果而非幻觉引用。

**行为规格**：[behavior/09-evidence-retrieval.md](../../behavior/09-evidence-retrieval.md)
