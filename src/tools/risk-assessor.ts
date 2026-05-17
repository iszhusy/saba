/**
 * SABA 风险评估 Tool (Risk Assessor Tool)
 *
 * 职责：
 * 1. 基于症状评估风险等级
 * 2. 匹配规则引擎
 * 3. 返回完整决策链
 */

import {
  SymptomParserOutput,
  RiskAssessorOutput,
  RiskLevel,
  TriggeredRule,
  Evidence,
  TreatmentContext,
} from '../types/index.js';

// 高风险规则（HR）
const HIGH_RISK_RULES: Array<{
  id: string;
  name: string;
  trigger_terms: string[];
  action: string;
}> = [
  { id: 'HR-001', name: '呼吸困难/胸痛', trigger_terms: ['呼吸困难', '胸闷', '胸痛', '喘不上气'], action: '立即拨打120或前往急诊' },
  { id: 'HR-002', name: '高热', trigger_terms: ['发烧', '高烧', '发热'], action: '立即联系团队，考虑急诊' },
  { id: 'HR-003', name: '严重过敏', trigger_terms: ['面部肿胀', '喉咙肿胀'], action: '立即就医，可能是过敏性休克前兆' },
  { id: 'HR-004', name: '腿部肿胀', trigger_terms: ['腿部肿胀', '腿肿'], action: '立即就医，排除深静脉血栓' },
  { id: 'HR-005', name: '神经症状', trigger_terms: ['意识模糊', '剧烈头痛', '视力变化'], action: '立即就医，排除脑转移/卒中' },
  { id: 'HR-006', name: '消化道出血', trigger_terms: ['呕血', '黑便', '严重腹痛'], action: '立即就医，消化道出血可能' },
];

// 中风险规则（MR）
const MEDIUM_RISK_RULES: Array<{
  id: string;
  name: string;
  trigger_terms: string[];
  threshold?: { days?: number; severity?: string };
  action: string;
}> = [
  { id: 'MR-001', name: '症状持续无好转', trigger_terms: ['一直', '持续', '好几天', '多天'], threshold: { days: 3 }, action: '联系团队评估是否需要调整治疗方案' },
  { id: 'MR-002', name: '恶心呕吐影响进食', trigger_terms: ['恶心', '想吐', '呕吐'], threshold: { days: 2 }, action: '联系团队考虑止吐方案调整' },
  { id: 'MR-003', name: '口腔溃疡严重', trigger_terms: ['口腔溃疡', '嘴烂', '嘴里疼'], action: '联系团队考虑口腔护理方案' },
  { id: 'MR-004', name: '严重腹泻', trigger_terms: ['腹泻', '拉肚子'], action: '联系团队，考虑补液和止泻方案' },
  { id: 'MR-005', name: '皮疹扩散', trigger_terms: ['皮疹', '红疹'], action: '联系团队评估，可能是药物超敏反应' },
  { id: 'MR-007', name: '手足综合征', trigger_terms: ['手足综合征'], action: '联系团队评估手足综合征，并进行局部护理与症状管理' },
  { id: 'MR-008', name: 'T-DXd相关皮肤反应', trigger_terms: ['皮疹'], action: '联系团队评估 T-DXd 相关皮肤反应' },
  { id: 'MR-006', name: '血小板低迹象', trigger_terms: ['瘀斑', '出血', '牙龈出血'], action: '联系团队查血常规' },
];

// 症状组合升级规则
const COMBO_UPGRADE_RULES: Array<{
  symptoms: string[];
  from_level: RiskLevel;
  to_level: RiskLevel;
  reason: string;
}> = [
  { symptoms: ['发热', '寒战'], from_level: 'low', to_level: 'medium', reason: '疑似感染' },
  { symptoms: ['恶心', '口干'], from_level: 'low', to_level: 'medium', reason: '电解质紊乱风险' },
  { symptoms: ['皮疹', '发热'], from_level: 'low', to_level: 'medium', reason: '药物超敏反应' },
  { symptoms: ['疲劳', '呼吸困难'], from_level: 'low', to_level: 'medium', reason: '贫血或心脏毒性' },
];

export class RiskAssessor {
  /**
   * 评估风险
   * @param symptoms 解析后的症状列表
   * @param rawInput 原始用户输入（用于辅助规则匹配）
   * @param context 治疗上下文
   */
  assess(
    symptoms: SymptomParserOutput,
    rawInput?: string,
    context?: TreatmentContext
  ): RiskAssessorOutput {
    const decision_chain: Evidence[] = [];
    const triggered_rules: TriggeredRule[] = [];
    let risk_level: RiskLevel = 'low';
    let risk_score = 30;

    // 优先对原始输入做高风险关键词扫描（更直接、更安全）
    if (rawInput) {
      const rawHighMatch = this.matchRulesByText(rawInput, HIGH_RISK_RULES, 'high');
      if (rawHighMatch.length > 0) {
        risk_level = 'high';
        risk_score = 90;
        triggered_rules.push(...rawHighMatch);
        decision_chain.push({
          step: 1,
          type: 'rule_match',
          description: `原始输入命中高风险关键词: ${rawHighMatch.map(r => r.name).join(', ')}`,
          confidence: 0.98,
          source: rawHighMatch[0]?.id,
        });
        return this.buildOutput(risk_level, risk_score, triggered_rules, decision_chain, symptoms);
      }
    }

    // Step 1: 高风险规则匹配
    const highMatch = this.matchRules(symptoms.symptoms, HIGH_RISK_RULES, 'high');
    if (highMatch.matched) {
      risk_level = 'high';
      risk_score = 85;
      triggered_rules.push(...highMatch.rules);
      decision_chain.push({
        step: 1,
        type: 'rule_match',
        description: `匹配高风险规则: ${highMatch.rules.map(r => r.name).join(', ')}`,
        confidence: 0.95,
        source: highMatch.rules[0]?.id,
      });
      return this.buildOutput(risk_level, risk_score, triggered_rules, decision_chain, symptoms);
    }

    // Step 2: 中风险规则匹配
    const mediumMatch = this.matchRules(symptoms.symptoms, MEDIUM_RISK_RULES, 'medium');
    if (mediumMatch.matched) {
      const mediumRuleNames = mediumMatch.rules.map((r) => r.name);
      const shouldBypassDuration = mediumRuleNames.some((name) => ['手足综合征', 'T-DXd相关皮肤反应', '皮疹扩散', '口腔溃疡严重', '严重腹泻', '血小板低迹象'].includes(name));
      const hasDuration = shouldBypassDuration || this.checkDuration(symptoms.duration, mediumMatch.rules);
      if (hasDuration) {
        risk_level = 'medium';
        risk_score = 60;
        triggered_rules.push(...mediumMatch.rules);
        decision_chain.push({
          step: 2,
          type: 'rule_match',
          description: `匹配中风险规则: ${mediumMatch.rules.map(r => r.name).join(', ')}`,
          confidence: 0.85,
          source: mediumMatch.rules[0]?.id,
        });
      }
    }

    // Step 3: 检查症状组合升级
    const comboUpgrade = this.checkComboUpgrade(symptoms.symptoms);
    if (comboUpgrade.upgraded) {
      // 组合升级规则只对低风险生效，中风险已是最终结果
      if (risk_level === 'low') {
        risk_level = comboUpgrade.to_level;
        risk_score = comboUpgrade.to_level === 'medium' ? 55 : risk_score;
      }
      decision_chain.push({
        step: 3,
        type: 'rule_match',
        description: `症状组合升级: ${comboUpgrade.reason}`,
        confidence: 0.8,
        source: 'combo_rule',
      });
    }

    // Step 4: 基于症状严重程度调整
    const severityAdjustment = this.adjustBySeverity(symptoms.symptoms);
    risk_score = Math.min(100, risk_score + severityAdjustment);

    // Step 5: LLM 综合判断（简化版，实际会调用 Claude API）
    decision_chain.push({
      step: 4,
      type: 'llm_reasoning',
      description: `综合评估: 风险等级 ${risk_level}，风险分数 ${risk_score}`,
      confidence: 0.88,
    });

    return this.buildOutput(risk_level, risk_score, triggered_rules, decision_chain, symptoms);
  }

  /**
   * 匹配规则
   */
  private matchRules(
    symptoms: SymptomParserOutput['symptoms'],
    rules: Array<{ id: string; name: string; trigger_terms: string[] }>,
    riskLevel: RiskLevel
  ): { matched: boolean; rules: TriggeredRule[] } {
    const matchedRules: TriggeredRule[] = [];
    const symptomNames = symptoms.map(s => s.standard_term + s.name);

    for (const rule of rules) {
      const isMatched = rule.trigger_terms.some(term =>
        symptomNames.some(name => name.includes(term))
      );
      if (isMatched) {
        matchedRules.push({
          id: rule.id,
          name: rule.name,
          confidence: 0.9,
          source: 'treatment_guideline',
        });
      }
    }

    return { matched: matchedRules.length > 0, rules: matchedRules };
  }

  /**
   * 对原始文本直接匹配高风险关键词
   * 比症状列表匹配更快、更直接，用于安全优先的快速路径
   */
  private matchRulesByText(
    rawInput: string,
    rules: Array<{ id: string; name: string; trigger_terms: string[] }>,
    riskLevel: RiskLevel
  ): TriggeredRule[] {
    const matchedRules: TriggeredRule[] = [];
    const normalizedInput = rawInput.toLowerCase();

    for (const rule of rules) {
      const isMatched = rule.trigger_terms.some(term =>
        normalizedInput.includes(term)
      );
      if (isMatched) {
        matchedRules.push({
          id: rule.id,
          name: rule.name,
          confidence: 0.98,
          source: 'treatment_guideline',
        });
      }
    }

    return matchedRules;
  }

  /**
   * 检查持续时间阈值
   */
  private checkDuration(
    duration: string | undefined,
    rules: TriggeredRule[]
  ): boolean {
    if (!duration) return false;
    for (const rule of rules) {
      const days = parseInt(duration.match(/\d+/)?.[0] || '0');
      if (days >= 2) return true;
    }
    return false;
  }

  /**
   * 检查症状组合升级
   */
  private checkComboUpgrade(
    symptoms: SymptomParserOutput['symptoms']
  ): { upgraded: boolean; to_level: RiskLevel; reason: string } {
    const symptomNames = symptoms.map(s => s.standard_term);
    for (const rule of COMBO_UPGRADE_RULES) {
      const hasAll = rule.symptoms.every(s => symptomNames.includes(s));
      if (hasAll) {
        return { upgraded: true, to_level: rule.to_level, reason: rule.reason };
      }
    }
    return { upgraded: false, to_level: 'low', reason: '' };
  }

  /**
   * 基于严重程度调整分数
   */
  private adjustBySeverity(symptoms: SymptomParserOutput['symptoms']): number {
    let adjustment = 0;
    for (const symptom of symptoms) {
      switch (symptom.severity) {
        case 'severe': adjustment += 15; break;
        case 'moderate': adjustment += 8; break;
        case 'mild': adjustment += 3; break;
      }
    }
    return adjustment;
  }

  /**
   * 构建输出
   */
  private buildOutput(
    risk_level: RiskLevel,
    risk_score: number,
    triggered_rules: TriggeredRule[],
    decision_chain: Evidence[],
    symptoms: SymptomParserOutput
  ): RiskAssessorOutput {
    const rag_references = symptoms.rag_sources.map(source => ({
      source,
      relevance: 0.9,
    }));

    return {
      risk_level,
      risk_score,
      triggered_rules,
      rag_references,
      decision_chain,
    };
  }
}

// 导出工厂函数
export function createRiskAssessor(): RiskAssessor {
  return new RiskAssessor();
}

// 导出工具函数
export async function riskAssessorTool(
  symptoms: SymptomParserOutput,
  rawInput?: string,
  context?: TreatmentContext
): Promise<RiskAssessorOutput> {
  const assessor = createRiskAssessor();
  return assessor.assess(symptoms, rawInput, context);
}
