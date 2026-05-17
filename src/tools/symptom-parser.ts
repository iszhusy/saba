/**
 * SABA 症状解析器 Tool (Symptom Parser Tool)
 *
 * 职责：
 * 1. 接收原始文本输入
 * 2. 提取症状关键词
 * 3. 标准化医学术语
 * 4. 返回结构化症状列表
 */

import {
  Symptom,
  SymptomParserOutput,
  SymptomSeverity,
  TreatmentContext,
} from '../types/index.js';

// 症状关键词映射
const SYMPTOM_PATTERNS: Record<string, {
  standard_term: string;
  keywords: string[];
  default_severity: SymptomSeverity;
}> = {
  nausea_vomiting: {
    standard_term: '恶心呕吐',
    keywords: ['恶心', '想吐', '呕吐', '反胃', '干呕', '胃不舒服', '吐'],
    default_severity: 'moderate',
  },
  decreased_appetite: {
    standard_term: '食欲下降',
    keywords: ['吃不下', '没胃口', '不想吃', '食欲减退', '不想吃东西'],
    default_severity: 'mild',
  },
  fatigue: {
    standard_term: '疲劳',
    keywords: ['没劲', '乏力', '疲劳', '累', '疲倦', '浑身没劲', '没力气'],
    default_severity: 'mild',
  },
  pain: {
    standard_term: '疼痛',
    keywords: ['疼', '痛', '不舒服', '难受', '酸痛', '胀痛', '刺痛', '钝痛'],
    default_severity: 'moderate',
  },
  fever: {
    standard_term: '发热',
    keywords: ['发烧', '发热', '体温高', '高烧'],
    default_severity: 'severe',
  },
  diarrhea: {
    standard_term: '腹泻',
    keywords: ['拉肚子', '腹泻', '大便稀', '水样便', '肠子不舒服'],
    default_severity: 'moderate',
  },
  rash: {
    standard_term: '皮疹',
    keywords: ['皮疹', '红疹', '痒', '皮肤红', '疹子', '过敏'],
    default_severity: 'moderate',
  },
  hand_foot_syndrome: {
    standard_term: '手足综合征',
    keywords: ['手心', '脚心', '脱皮', '手脚发红', '手足发红', '碰东西疼'],
    default_severity: 'moderate',
  },
  headache: {
    standard_term: '头痛',
    keywords: ['头痛', '头疼', '头晕', '头昏'],
    default_severity: 'mild',
  },
  shortness_of_breath: {
    standard_term: '呼吸困难',
    keywords: ['呼吸困难', '气短', '喘不上气', '胸闷', '憋气'],
    default_severity: 'severe',
  },
  mouth_sore: {
    standard_term: '口腔溃疡',
    keywords: ['口腔溃疡', '嘴烂', '口腔疼痛', '嘴里疼', '溃疡'],
    default_severity: 'moderate',
  },
};

// 持续时间模式
const DURATION_PATTERNS: Array<{
  pattern: RegExp;
  duration: string;
}> = [
  { pattern: /(\d+)\s*天/i, duration: 'days' },
  { pattern: /(\d+)\s*小时/i, duration: 'hours' },
  { pattern: /一直|持续|从.*开始/i, duration: 'ongoing' },
  { pattern: /昨天|今天|前天/i, duration: 'recent' },
];

export class SymptomParser {
  /**
   * 解析用户输入，提取症状
   */
  parse(input: string, context?: TreatmentContext): SymptomParserOutput {
    const normalizedInput = this.normalizeInput(input);
    const symptoms: Symptom[] = [];
    const rag_sources: string[] = [];

    // 遍历症状模式进行匹配
    for (const [symptomId, pattern] of Object.entries(SYMPTOM_PATTERNS)) {
      const matchedKeyword = this.findMatchedKeyword(normalizedInput, pattern.keywords);
      if (matchedKeyword) {
        const severity = this.estimateSeverity(input, matchedKeyword, pattern.default_severity);
        symptoms.push({
          name: matchedKeyword,
          standard_term: pattern.standard_term,
          confidence: this.calculateConfidence(normalizedInput, matchedKeyword),
          severity,
        });
        rag_sources.push(`symptom_${symptomId}`);
      }
    }

    // 提取持续时间
    const duration = this.extractDuration(input);

    // 计算总体置信度
    const confidence = symptoms.length > 0
      ? Math.min(0.95, 0.5 + (symptoms.length * 0.15))
      : 0.3;

    return {
      symptoms: this.deduplicateSymptoms(symptoms),
      duration,
      rag_sources,
      confidence,
    };
  }

  /**
   * 标准化输入文本
   */
  private normalizeInput(input: string): string {
    return input
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/，/g, ',')
      .replace(/。/g, '.')
      .trim();
  }

  /**
   * 查找匹配的症状关键词
   */
  private findMatchedKeyword(input: string, keywords: string[]): string | null {
    for (const keyword of keywords) {
      if (input.includes(keyword.toLowerCase()) || input.includes(keyword)) {
        return keyword;
      }
    }
    return null;
  }

  /**
   * 估计症状严重程度
   */
  private estimateSeverity(
    input: string,
    matchedKeyword: string,
    defaultSeverity: SymptomSeverity
  ): SymptomSeverity {
    const severityIndicators: Record<SymptomSeverity, string[]> = {
      severe: ['严重', '很厉害', '受不了', '无法', '剧烈'],
      moderate: ['比较', '挺', '明显', '影响'],
      mild: ['轻微', '有点', '稍微', '一点点'],
    };

    for (const [severity, indicators] of Object.entries(severityIndicators)) {
      for (const indicator of indicators) {
        if (input.includes(indicator)) {
          return severity as SymptomSeverity;
        }
      }
    }
    return defaultSeverity;
  }

  /**
   * 计算症状匹配置信度
   */
  private calculateConfidence(input: string, matchedKeyword: string): number {
    let confidence = 0.7;
    const keywordIndex = input.indexOf(matchedKeyword.toLowerCase());
    if (keywordIndex >= 0 && keywordIndex < input.length / 3) {
      confidence += 0.1;
    }
    if (/\d+/.test(input)) confidence += 0.1;
    if (DURATION_PATTERNS.some(p => p.pattern.test(input))) confidence += 0.1;
    return Math.min(0.99, confidence);
  }

  /**
   * 提取症状持续时间
   */
  private extractDuration(input: string): string | undefined {
    for (const { pattern, duration } of DURATION_PATTERNS) {
      const match = input.match(pattern);
      if (match) return `${match[1] || ''}${duration}`.trim();
    }
    return undefined;
  }

  /**
   * 去重症状列表
   */
  private deduplicateSymptoms(symptoms: Symptom[]): Symptom[] {
    const seen = new Set<string>();
    return symptoms.filter(s => seen.has(s.standard_term) ? false : (seen.add(s.standard_term), true));
  }

  /**
   * 异步解析接口（供编排器使用）
   * 当前为同步实现，保留异步接口以便未来扩展（如接入 LLM）
   */
  async parseAsync(input: string, context?: TreatmentContext): Promise<SymptomParserOutput> {
    return this.parse(input, context);
  }

  /**
   * 获取所有支持的症状类型
   */
  getSupportedSymptoms(): string[] {
    return Object.keys(SYMPTOM_PATTERNS);
  }
}

// 导出工厂函数
export function createSymptomParser(): SymptomParser {
  return new SymptomParser();
}

// 导出工具函数（用于集成到编排器）
export async function symptomParserTool(
  input: string,
  context?: TreatmentContext
): Promise<SymptomParserOutput> {
  const parser = createSymptomParser();
  return parser.parse(input, context);
}
