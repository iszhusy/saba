/**
 * SABA RAG 检索能力 (RAG Retriever)
 *
 * 职责：
 * 1. 知识库检索
 * 2. 症状与规则的关联匹配
 * 3. 提供上下文支持
 */

import {
  Symptom,
  RiskRule,
  SideEffectEntry,
  TreatmentCategory,
} from '../types/index.js';

// 知识库条目
const KNOWLEDGE_BASE: SideEffectEntry[] = [
  {
    category: 'chemotherapy',
    symptom: '恶心呕吐',
    standard_term: 'nausea_vomiting',
    keywords: ['恶心', '呕吐', '想吐'],
    severity_levels: {
      mild: '偶尔恶心，食欲略下降',
      moderate: '频繁恶心，呕吐影响进食',
      severe: '剧烈呕吐，无法进食进水',
    },
    risk_criteria: {
      high: '持续剧烈呕吐、呕血、脱水',
      medium: '恶心呕吐超过2天影响进食',
      low: '轻微恶心，食欲正常',
    },
    management: {
      immediate: '高风险立即就医；中风险联系团队调整止吐方案',
      follow_up: '记录症状变化，如加重及时反馈',
      warning_signs: ['呕血', '无法进水', '意识模糊'],
    },
    source: 'chemo_guide_v1',
  },
  {
    category: 'chemotherapy',
    symptom: '骨髓抑制',
    standard_term: 'bone_marrow_suppression',
    keywords: ['发热', '感染', '瘀斑', '出血'],
    severity_levels: {
      mild: '轻度疲劳，血常规接近正常',
      moderate: '需要升白治疗，发热',
      severe: '严重感染，需要住院',
    },
    risk_criteria: {
      high: '高热 >38.5°C 持续，严重感染迹象',
      medium: '白细胞低下，发热',
      low: '轻度贫血，轻微疲劳',
    },
    management: {
      immediate: '高风险立即就医/急诊',
      follow_up: '定期监测血常规',
      warning_signs: ['高热', '感染', '出血'],
    },
    source: 'chemo_guide_v1',
  },
  {
    category: 'targeted',
    symptom: '皮疹',
    standard_term: 'skin_rash',
    keywords: ['皮疹', '红疹', '痤疮样皮疹', '皮肤瘙痒'],
    severity_levels: {
      mild: '局部皮疹，<10%体表面积',
      moderate: '扩散性皮疹，>10%体表面积',
      severe: '全身性红斑，水疱',
    },
    risk_criteria: {
      high: '全身性红斑，水疱，疑似Stevens-Johnson综合征',
      medium: '皮疹扩散，影响日常生活',
      low: '局部轻微皮疹',
    },
    management: {
      immediate: '高风险立即就医',
      follow_up: '保持皮肤清洁，避免抓挠',
      warning_signs: ['皮疹加重', '水疱', '粘膜受累'],
    },
    source: 'targeted_guide_v1',
  },
];

// 规则索引
const RULE_INDEX: Record<string, RiskRule> = {
  'HR-001': {
    id: 'HR-001',
    name: '呼吸困难/胸痛',
    trigger_keywords: ['呼吸困难', '胸闷', '胸痛'],
    risk_level: 'high',
    immediate_action: '立即拨打120或前往急诊',
    reasoning: '呼吸困难和胸痛可能是危及生命的情况',
  },
  'HR-002': {
    id: 'HR-002',
    name: '高热',
    trigger_keywords: ['发烧', '高烧', '发热'],
    risk_level: 'high',
    immediate_action: '立即联系团队，考虑急诊',
    reasoning: '高热可能是感染信号',
  },
  'MR-002': {
    id: 'MR-002',
    name: '恶心呕吐影响进食',
    trigger_keywords: ['恶心', '呕吐'],
    risk_level: 'medium',
    immediate_action: '联系团队考虑止吐方案调整',
    duration_threshold: '2天',
  },
};

export interface RetrievalResult {
  entries: SideEffectEntry[];
  matched_rules: RiskRule[];
  relevance_scores: Record<string, number>;
}

export class RAGRetriever {
  /**
   * 检索相关知识库条目
   */
  retrieve(symptoms: Symptom[]): RetrievalResult {
    return this.retrieveBySymptoms(symptoms);
  }

  /**
   * 按症状检索（与 retrieve 相同）
   */
  retrieveBySymptoms(symptoms: Symptom[]): RetrievalResult {
    const matchedEntries: SideEffectEntry[] = [];
    const relevance_scores: Record<string, number> = {};

    for (const symptom of symptoms) {
      for (const entry of KNOWLEDGE_BASE) {
        if (this.isMatch(symptom, entry)) {
          if (!matchedEntries.find(e => e.standard_term === entry.standard_term)) {
            matchedEntries.push(entry);
            relevance_scores[entry.standard_term] = symptom.confidence;
          }
        }
      }
    }

    // 检索匹配的规则
    const matchedRules = this.retrieveRules(symptoms);

    return {
      entries: matchedEntries,
      matched_rules: matchedRules,
      relevance_scores,
    };
  }

  /**
   * 检索规则
   */
  retrieveRules(symptoms: Symptom[]): RiskRule[] {
    const matched: RiskRule[] = [];
    const symptomNames = symptoms.map(s => s.standard_term + s.name);

    for (const rule of Object.values(RULE_INDEX)) {
      const isMatched = rule.trigger_keywords.some(keyword =>
        symptomNames.some(name => name.includes(keyword))
      );
      if (isMatched) {
        matched.push(rule);
      }
    }

    return matched;
  }

  /**
   * 检查症状是否匹配条目
   */
  private isMatch(symptom: Symptom, entry: SideEffectEntry): boolean {
    // 检查标准术语匹配
    if (symptom.standard_term === entry.standard_term) return true;

    // 检查关键词匹配
    for (const keyword of entry.keywords) {
      if (symptom.name.includes(keyword) || symptom.standard_term.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 按类别检索
   */
  retrieveByCategory(category: TreatmentCategory): SideEffectEntry[] {
    return KNOWLEDGE_BASE.filter(entry => entry.category === category);
  }

  /**
   * 获取所有知识库条目
   */
  getAllEntries(): SideEffectEntry[] {
    return KNOWLEDGE_BASE;
  }
}

// 导出工厂函数
export function createRAGRetriever(): RAGRetriever {
  return new RAGRetriever();
}

// 导出工具函数
export async function ragRetrieveTool(symptoms: Symptom[]): Promise<RetrievalResult> {
  const retriever = createRAGRetriever();
  return retriever.retrieve(symptoms);
}

// 兼容方法（被 orchestrator.ts 引用）
export async function ragRetrieveBySymptoms(symptoms: Symptom[]): Promise<RetrievalResult> {
  const retriever = createRAGRetriever();
  return retriever.retrieve(symptoms);
}
