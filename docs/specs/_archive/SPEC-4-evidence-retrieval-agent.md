# SPEC-4 — Evidence Retrieval Tool

**版本**: v0.3
**状态**: Draft
**依赖**: SPEC-2（Clinical Triage Agent）、SPEC-7（Conversation State & Episode Memory）、SPEC-8（LLM Runtime）
**实现优先级**: P1（检索增强核心）

---

## 4.1 目标

定义一个 Evidence Retrieval Tool（证据检索工具），作为 Executive 控制下的 **RAG support tool**，用于：

1. 基于 Clinical Triage 的临床图景、deliberation 需要的判别边界与检索目标，生成高价值检索查询
2. 从知识库中检索、重排并裁剪与当前病例最相关的证据
3. 输出**支持判断的依据、警示信号、升级边界与管理信息**
4. 显式说明检索覆盖度与剩余不确定性
5. 为 SPEC-5 Risk Deliberation Agent 提供结构化 evidence surface

**关键约束**：
- Retrieval 是 tool，不是对话主体
- Retrieval 不直接输出最终风险等级
- Retrieval 不替代临床推理，只补充证据与边界
- Retrieval 不产出最终用户回复

---

## 4.2 在整体架构中的位置

```text
Clinical Triage Agent
  └─ if retrieval_strategy.should_retrieve = true
        → Evidence Retrieval Tool
              → Risk Deliberation Agent
                    → Safety Critic Constraint Layer
                    → Conversation Executive Agent
```

---

## 4.3 输入类型

```typescript
interface EvidenceRetrievalInput {
  triage_output: TriageAgentOutput;
  framing_output: IntentFramingOutput;
  episode_context?: {
    unresolved_uncertainties?: string[];
    working_hypotheses?: {
      primary?: string;
      alternatives: string[];
    };
    previous_risk_levels?: ("high" | "medium" | "low")[];
  };

  request: {
    user_message: string;
    patient_context?: {
      cancer_type?: string;
      treatment_type?: string;
      treatment_phase?: string;
      treatment_day?: number;
      known_medications?: string[];
    };
  };

  retrieval_config?: {
    max_entries?: number;
    max_chunks?: number;
    min_relevance_score?: number;
    include_guideline_context?: boolean;
    include_ctcae_mapping?: boolean;
  };
}
```

---

## 4.4 输出类型

```typescript
interface EvidenceRetrievalOutput {
  retrieved_evidence: {
    entry_id: string;
    title: string;
    source: string;
    source_version?: string;
    evidence_level?: "A" | "B" | "C" | "expert";
    relevance_score: number;
    why_relevant: string;
    matched_chunks: {
      chunk_id: string;
      section: string;
      content: string;
      relevance_score: number;
      page_reference?: string;
    }[];
  }[];

  evidence_surface: {
    clinical_takeaways: string[];
    warning_signals: string[];
    escalation_criteria: string[];
    supportive_care_considerations: string[];
    terminology_mappings: {
      user_term: string;
      standard_term?: string;
      framework?: "CTCAE" | "guideline" | "internal_kb";
      note?: string;
    }[];
  };

  retrieval_assessment: {
    coverage: "full" | "partial" | "minimal" | "none";
    answered_objectives: string[];
    remaining_uncertainties: string[];
    retrieval_queries: string[];
    retrieval_depth: "shallow" | "standard" | "deep";
  };

  handoff_to_deliberation: {
    evidence_summary: string;
    evidence_supported_risks: string[];
    evidence_supported_downgrade_conditions: string[];
    evidence_supported_upgrade_triggers: string[];
    evidence_supported_unknown_resolutions: string[];
  };

  audit: {
    retrieval_strategy: string;
    knowledge_base_version: string;
    top_evidence_ids: string[];
    rerank_model?: string;
    prompt_version?: string;
  };
}
```

---

## 4.5 检索触发原则

只有当 Triage 明确认为证据检索能提升判断质量时才触发。典型场景：

1. **需要标准化升级边界**
   - 例如：持续呕吐、发热、腹泻、出血等症状需要 guideline / knowledge base 支持

2. **需要补足 warning signs**
   - 当前临床图景已有风险倾向，但需要更完整的警示信号

3. **需要术语映射或框架映射**
   - 用户表述与 CTCAE / guideline 标准术语之间存在差异

4. **需要在相似解释之间补证据**
   - 如“化疗副作用” vs “感染线索” vs “脱水风险”

不建议触发检索的场景：
- 已是明显急症，应该直接升级
- 问题本质是非医疗或药物边界转出
- 当前信息极度不足，先澄清比检索更有价值

---

## 4.6 知识库条目类型

```typescript
interface KnowledgeEntry {
  id: string;
  title: string;
  symptom?: string;
  standard_term?: string;
  category: string;
  keywords: string[];

  severity_framework?: {
    mild?: string;
    moderate?: string;
    severe?: string;
  };

  management?: {
    immediate?: string;
    short_term?: string;
    when_to_contact_team?: string;
    when_to_escalate?: string;
    warning_signs?: string[];
  };

  metadata: {
    source: string;
    source_version: string;
    source_url?: string;
    last_updated: string;
    evidence_level: "A" | "B" | "C" | "expert";
  };

  chunks: KnowledgeChunk[];
}

interface KnowledgeChunk {
  id: string;
  section: string;
  content: string;
  page_reference?: string;
  relevance_tags: string[];
}
```

---

## 4.7 检索流程

### Step 1：生成查询

```typescript
function generateRetrievalQueries(triage: TriageAgentOutput): string[] {
  const queries = new Set<string>();

  for (const symptom of triage.clinical_picture.recognized_symptoms) {
    queries.add(symptom.term);
    if (symptom.standard_term) queries.add(symptom.standard_term);
    queries.add(`${symptom.category} ${symptom.term}`);
  }

  for (const redFlag of triage.clinical_picture.red_flag_signals) {
    queries.add(`${redFlag} 升级标准`);
    queries.add(`${redFlag} 立即就医`);
  }

  for (const q of triage.retrieval_strategy.retrieval_queries) {
    queries.add(q);
  }

  return [...queries].slice(0, 8);
}
```

### Step 2：候选检索

```typescript
async function retrieveCandidates(
  queries: string[],
  knowledgeBase: KnowledgeEntry[]
): Promise<SearchResult[]> {
  const vectorResults = await vectorSearch(queries, knowledgeBase, 20);
  const lexicalResults = await bm25Search(queries, knowledgeBase, 20);
  return mergeResults(vectorResults, lexicalResults, { vector: 0.7, lexical: 0.3 });
}
```

### Step 3：相关性重排

```typescript
async function rerankEvidence(
  candidates: SearchResult[],
  triage: TriageAgentOutput,
  userMessage: string
): Promise<RerankedResult[]> {
  return runtime.callReasoning("evidence_rerank", {
    user_message: userMessage,
    triage_summary: triage.triage_assessment.reasoning_summary,
    retrieval_objective: triage.retrieval_strategy.retrieval_objective,
    candidates,
  });
}
```

### Step 4：裁剪与摘要

```typescript
function selectChunks(entry: KnowledgeEntry, triage: TriageAgentOutput): KnowledgeChunk[] {
  const symptomTerms = triage.clinical_picture.recognized_symptoms.map(s => s.term);
  const selected = entry.chunks.filter(chunk =>
    symptomTerms.some(term => chunk.content.includes(term) || chunk.relevance_tags.includes(term))
  );

  return (selected.length ? selected : entry.chunks).slice(0, 4);
}
```

---

## 4.8 证据摘要原则

Evidence Retrieval 不直接说“风险等级是多少”，而应输出：
- 哪些证据与当前病例最相关
- 哪些 warning signs 被证据支持
- 哪些升级边界被证据支持
- 哪些 supportive care 信息可以帮助 Deliberation / Executive 组织建议
- 证据还没覆盖到什么

重点是给 Deliberation 补“判别边界”，而不是代替 Deliberation 得出最终判断。

---

## 4.9 示例

### Case：恶心呕吐 + 摄入下降

```json
{
  "retrieved_evidence": [
    {
      "entry_id": "gi-001",
      "title": "化疗相关恶心呕吐（CINV）",
      "source": "internal_kb",
      "source_version": "v1.2",
      "evidence_level": "B",
      "relevance_score": 0.95,
      "why_relevant": "与持续恶心呕吐、进食下降高度相关",
      "matched_chunks": [
        {
          "chunk_id": "gi-001-mgmt",
          "section": "management",
          "content": "化疗相关恶心呕吐可持续 24h-5 天；若影响进食饮水，应联系团队评估。",
          "relevance_score": 0.91
        },
        {
          "chunk_id": "gi-001-warning",
          "section": "warning",
          "content": "若出现无法进水、明显脱水、呕血或伴发热，应立即升级处理。",
          "relevance_score": 0.9
        }
      ]
    }
  ],
  "evidence_surface": {
    "clinical_takeaways": [
      "持续恶心呕吐且影响摄入属于需要进一步关注的胃肠道副作用场景",
      "无法进水、脱水迹象、发热会显著提高升级优先级"
    ],
    "warning_signals": ["无法进水", "脱水", "发热", "呕血"],
    "escalation_criteria": ["持续呕吐导致无法进水", "伴随发热或寒颤", "症状快速加重"],
    "supportive_care_considerations": ["需补充摄入情况评估", "需确认是否已有止吐方案及其效果"],
    "terminology_mappings": [
      {
        "user_term": "恶心想吐",
        "standard_term": "Nausea/Vomiting",
        "framework": "CTCAE"
      }
    ]
  },
  "retrieval_assessment": {
    "coverage": "full",
    "answered_objectives": ["补充恶心呕吐升级边界", "补充 warning signs"],
    "remaining_uncertainties": ["是否发热", "是否还能进水"],
    "retrieval_queries": ["化疗相关恶心呕吐 管理", "恶心呕吐 无法进水 升级标准"],
    "retrieval_depth": "standard"
  },
  "handoff_to_deliberation": {
    "evidence_summary": "证据支持当前至少为需要进一步评估的胃肠道副作用场景；若存在发热、无法进水或脱水迹象，应升级处理。",
    "evidence_supported_risks": ["持续恶心呕吐影响摄入", "脱水风险"],
    "evidence_supported_downgrade_conditions": ["无发热且仍能进水时，可先维持非立即升级路径"],
    "evidence_supported_upgrade_triggers": ["发热", "无法进水", "呕血", "脱水迹象"],
    "evidence_supported_unknown_resolutions": ["体温可决定是否偏向感染风险", "饮水能力可决定是否达到立即升级边界"]
  },
  "audit": {
    "retrieval_strategy": "向量检索 + BM25 + 小模型重排",
    "knowledge_base_version": "v1.2",
    "top_evidence_ids": ["gi-001"],
    "rerank_model": "claude-haiku-4-5",
    "prompt_version": "evidence-v3"
  }
}
```

---

## 4.10 与后续 SPEC 的关系

```text
SPEC-2 Clinical Triage Agent
    │
    ▼ (retrieval_strategy.should_retrieve = true)
SPEC-4 Evidence Retrieval Tool
    │
    ▼
SPEC-5 Risk Deliberation Agent
```

---

## 4.11 验收标准

### 功能验收
- [ ] 能从 triage 输出生成高质量检索查询
- [ ] 能输出 evidence_surface，而不只是原始 chunk
- [ ] 能补充 warning_signals / escalation_criteria
- [ ] 能显式声明 coverage 与 remaining_uncertainties
- [ ] 能为 deliberation 提供结构化 handoff

### 质量验收
- [ ] 检索结果可回溯到知识库条目
- [ ] 术语映射清晰
- [ ] 证据摘要不越权替代临床判断
- [ ] 检索不到时能返回 `coverage: none` 而不是编造

### 性能验收
- [ ] P50 检索延迟 < 500ms（不含可选重排）
- [ ] P99 检索延迟 < 2s
- [ ] 支持并发请求

---

## 4.12 实现依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| SPEC-2 | 前置规范 | TriageAgentOutput |
| SPEC-7 | 前置规范 | Episode context / unresolved uncertainties |
| SPEC-8 | 前置规范 | Runtime / rerank model 接入 |
| docs/knowledge | 知识源 | 症状知识库与 guideline 摘要 |
| embedding / vector index | 基础设施 | 向量检索 |
| SPEC-5 | 下游模块 | 消费 EvidenceRetrievalOutput |
