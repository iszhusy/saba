// SABA RAG Knowledge Base Types
// Generated: 2026-05-15

export interface SideEffectEntry {
  category: 'chemotherapy' | 'endocrine' | 'targeted' | 'immunotherapy' | 'radiation' | 'general';
  symptom: string;
  standard_term: string;
  keywords: string[];
  severity_levels: {
    mild: string;
    moderate: string;
    severe: string;
  };
  risk_criteria: {
    high: string;
    medium: string;
    low: string;
  };
  management: {
    immediate: string;
    follow_up: string;
    warning_signs: string[];
  };
  source: string;
}

export interface RiskRule {
  id: string;
  name: string;
  trigger_keywords: string[];
  risk_level: 'high' | 'medium' | 'low';
  immediate_action: string;
  reasoning?: string;
  duration_threshold?: string;
}

export interface SymptomCategory {
  id: string;
  name: string;
  symptoms: string[];
  common_treatments: string[];
}

export interface RAGKnowledgeBase {
  metadata: {
    name: string;
    version: string;
    created: string;
    source: string;
    description: string;
  };
  symptom_categories: SymptomCategory[];
  side_effect_entries: SideEffectEntry[];
  high_risk_rules: RiskRule[];
  medium_risk_rules: RiskRule[];
  low_risk_rules: RiskRule[];
}

// RAG Index Types
export interface RAGIndex {
  metadata: {
    name: string;
    version: string;
    description: string;
  };
  symptom_to_entry: Record<string, {
    category: string;
    standard_term: string;
    risk_levels: Record<string, string>;
    management: Record<string, any>;
    source: string;
  }>;
  keyword_to_symptoms: Record<string, string[]>;
  rule_index: Record<string, RiskRule>;
}
