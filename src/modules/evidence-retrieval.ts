import type {
  AssessRequest,
  EvidenceRetrievalSurface,
  Symptom,
} from '../types/index.js';
import { createRAGRetriever } from '../rag/retriever.js';

export interface EvidenceRetrievalInput {
  parsed_symptoms: Array<{ standard_term: string; severity: string }>;
  context?: AssessRequest['context'];
  critical_unknowns?: string[];
  should_retrieve?: boolean;
}

export interface EvidenceRetrievalOutput {
  rag_sources: string[];
  knowledge_snippets: Array<{ source: string; content: string; relevance: number }>;
  matched_rule_ids: string[];
  surface: EvidenceRetrievalSurface;
}

export class EvidenceRetrievalTool {
  retrieve(input: EvidenceRetrievalInput): EvidenceRetrievalOutput {
    const shouldRetrieve = input.should_retrieve ?? input.parsed_symptoms.length > 0;
    if (!shouldRetrieve) {
      return {
        rag_sources: [],
        knowledge_snippets: [],
        matched_rule_ids: [],
        surface: {
          retrieval_focus: '当前无需触发证据检索',
          should_retrieve: false,
          coverage: 'none',
          rag_sources: [],
          matched_rule_ids: [],
          critical_unknowns: input.critical_unknowns ?? [],
          snippets: [],
        },
      };
    }

    const retriever = createRAGRetriever();

    const symptoms: Symptom[] = input.parsed_symptoms.map((symptom) => ({
      name: symptom.standard_term,
      standard_term: symptom.standard_term,
      confidence: 0.8,
      severity: symptom.severity as 'mild' | 'moderate' | 'severe',
    }));

    const result = retriever.retrieveBySymptoms(symptoms);
    const knowledgeSnippets = result.entries.map((entry) => ({
      source: entry.source,
      content: `${entry.symptom}｜${entry.risk_criteria.high}｜${entry.management.immediate}`,
      relevance: result.relevance_scores[entry.standard_term] ?? 0.5,
    }));

    return {
      rag_sources: result.entries.map((entry) => entry.source),
      knowledge_snippets: knowledgeSnippets,
      matched_rule_ids: result.matched_rules.map((rule) => rule.id),
      surface: {
        retrieval_focus: input.context?.treatment_type
          ? `${input.context.treatment_type} 治疗背景下的症状风险与处置证据`
          : '症状风险与处置证据',
        should_retrieve: true,
        coverage: result.entries.length > 0 ? 'partial' : 'none',
        rag_sources: result.entries.map((entry) => entry.source),
        matched_rule_ids: result.matched_rules.map((rule) => rule.id),
        critical_unknowns: input.critical_unknowns ?? [],
        snippets: knowledgeSnippets.map((snippet) => ({
          source: snippet.source,
          relevance: snippet.relevance,
          applicability: snippet.content,
        })),
      },
    };
  }
}

export function createEvidenceRetrievalTool(): EvidenceRetrievalTool {
  return new EvidenceRetrievalTool();
}
