# Evidence Retrieval — 行为规格

**版本**: v1.0  
**状态**: Canonical behavior (L4)  
**上游**: [01-architecture.md](../01-architecture.md)、[modules/evidence-retrieval/00-goal.md](../modules/evidence-retrieval/00-goal.md)  
**知识库**: `docs/knowledge/`  
**归档参考**: `docs/specs/_archive/SPEC-4-evidence-retrieval-agent.md`

---

## 1. 职责

在 Clinical Triage 的 `retrieval_strategy.should_retrieve === true` 时：

1. 按 **focus** 检索规则库与 RAG 知识  
2. 产出 `EvidenceRetrievalSurface`（片段、规则 ID、适用性说明）  
3. 供 Risk Deliberation 引用，**不**直接拼进用户消息  

**不负责**：定最终 risk level；替代 triage 临床图景。

---

## 2. 触发条件

由 Triage 决定，**非**默认每轮都检索：

- 存在 `critical_unknowns` 且知识库可缩小未知  
- 常见副作用需 CTCAE / 指南支撑  
- 非显然急症且需证据支撑 provisional  

**跳过**：已 `escalation` 且仅需安全动作；信息极度不足且无检索焦点。

---

## 3. 输出契约

```typescript
interface EvidenceRetrievalSurface {
  retrieval_focus: string;
  rag_sources: string[];
  matched_rule_ids: string[];
  snippets: Array<{
    source: string;
    relevance: number;
    applicability: string;
  }>;
}
```

无匹配时：显式空数组 + `retrieval_focus` 说明，禁止编造文献。

---

## 4. 与 Deliberation 的关系

```text
Triage (retrieval_strategy)
  → Evidence Retrieval Tool
  → Risk Deliberation（将 evidence 作为 supporting_signals）
  → Executive synthesis（用户不见 raw snippet，只见融入后的表达）
```

---

## 5. 工程映射

| 组件 | 角色 |
|------|------|
| RAG index / `rag_knowledge_base.json` | 检索语料 |
| `llm-tools` / risk assessor | 规则匹配 |
| orchestrator Step 3 | 迁为按需调用 |

---

## 6. 验证

- 恶心呕吐 + 进食困难：应有检索且 deliberation 引用  
- 纯急症胸闷气短：可少检索或不阻塞 escalation  
