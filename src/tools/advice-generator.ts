/**
 * SABA 建议生成 Tool (Advice Generator Tool)
 *
 * 职责：
 * 1. 基于风险评估结果生成建议
 * 2. 确保建议的具体性和可执行性
 * 3. 生成完整的推理过程说明
 */

import {
  RiskAssessorOutput,
  AdviceGeneratorOutput,
  RiskLevel,
  TreatmentContext,
} from '../types/index.js';

// 风险级别配置
const RISK_CONFIG: Record<RiskLevel, {
  immediate_action: string;
  default_follow_up: string;
  default_warning_signs: string[];
  team_contact_required: boolean;
}> = {
  high: {
    immediate_action: '请立即就医或拨打急救电话！您的症状可能需要紧急医疗干预。',
    default_follow_up: '急诊后请将就诊结果告知您的医疗团队。',
    default_warning_signs: ['症状加重', '意识模糊', '呼吸困难加重'],
    team_contact_required: true,
  },
  medium: {
    immediate_action: '建议您今天联系您的医疗团队，他们可能需要评估您的症状并调整治疗方案。',
    default_follow_up: '如果症状加重或出现新的症状，请立即就医。',
    default_warning_signs: ['症状加重', '出现高烧', '无法进食或进水'],
    team_contact_required: true,
  },
  low: {
    immediate_action: '您的症状目前可以继续观察。请记录症状变化，如有加重请联系团队。',
    default_follow_up: '继续观察，如症状持续超过一周或加重，请联系您的医疗团队。',
    default_warning_signs: ['症状加重', '出现新的症状'],
    team_contact_required: false,
  },
};

// 基于规则的警告信号
const RULE_WARNING_SIGNALS: Record<string, string[]> = {
  'HR-001': ['呼吸困难加重', '意识模糊', '嘴唇发紫'],
  'HR-002': ['高烧持续', '意识模糊', '出现皮疹'],
  'MR-002': ['呕吐带血', '无法进水超过12小时', '出现高烧'],
  'MR-004': ['便血', '严重腹痛', '脱水症状'],
};

export class AdviceGenerator {
  /**
   * 生成建议
   */
  generate(riskResult: RiskAssessorOutput, context?: TreatmentContext): AdviceGeneratorOutput {
    const config = RISK_CONFIG[riskResult.risk_level];
    const reasoning_chain: string[] = [];

    // Step 1: 基于触发规则生成推理链
    if (riskResult.triggered_rules.length > 0) {
      const ruleNames = riskResult.triggered_rules.map(r => r.name).join('、');
      reasoning_chain.push(`您的症状匹配以下规则：${ruleNames}`);

      // 添加规则特定的警告信号
      for (const rule of riskResult.triggered_rules) {
        const signals = RULE_WARNING_SIGNALS[rule.id];
        if (signals) {
          reasoning_chain.push(`${rule.id} 规则提示注意：${signals.join('、')}`);
        }
      }
    }

    // Step 2: 基于症状持续时间
    if (riskResult.rag_references.length > 0) {
      const sources = riskResult.rag_references.map(r => r.source).join('、');
      reasoning_chain.push(`参考医学指南：${sources}`);
    }

    // Step 3: 综合判断
    const riskScoreText = riskResult.risk_score >= 80 ? '较高' : riskResult.risk_score >= 50 ? '中等' : '较低';
    reasoning_chain.push(`综合评估您的风险分数为 ${riskResult.risk_score}（${riskScoreText}），建议如下：`);

    // Step 4: 基于治疗阶段的个性化建议
    if (context?.treatment_phase) {
      const phaseAdvice = this.getPhaseAdvice(context.treatment_phase, riskResult.risk_level);
      if (phaseAdvice) {
        reasoning_chain.push(phaseAdvice);
      }
    }

    // 生成参考列表
    const references = [
      ...riskResult.triggered_rules.map(r => ({ id: r.id, source: 'treatment_guideline' })),
      ...riskResult.rag_references.map(r => ({ id: r.source, source: 'medical_guide' })),
    ];

    // 获取警告信号
    const warning_signs = this.getWarningSigns(riskResult);

    return {
      immediate_action: config.immediate_action,
      follow_up: config.default_follow_up,
      warning_signs,
      reasoning_chain,
      references,
      team_contact_required: config.team_contact_required,
    };
  }

  /**
   * 获取警告信号
   */
  private getWarningSigns(riskResult: RiskAssessorOutput): string[] {
    const config = RISK_CONFIG[riskResult.risk_level];
    const signals = [...config.default_warning_signs];

    // 添加规则特定的警告信号
    for (const rule of riskResult.triggered_rules) {
      const ruleSignals = RULE_WARNING_SIGNALS[rule.id];
      if (ruleSignals) {
        signals.push(...ruleSignals);
      }
    }

    // 去重
    return [...new Set(signals)];
  }

  /**
   * 基于治疗阶段获取个性化建议
   */
  private getPhaseAdvice(phase: string, riskLevel: RiskLevel): string | null {
    const phaseLower = phase.toLowerCase();

    if (phaseLower.includes('chemotherapy') || phaseLower.includes('化疗')) {
      if (riskLevel === 'medium' || riskLevel === 'high') {
        return '根据化疗副作用管理指南，化疗后1-7天是骨髓抑制高发期，需密切监测感染和出血迹象。';
      }
    }

    if (phaseLower.includes('targeted') || phaseLower.includes('靶向')) {
      if (riskLevel === 'medium') {
        return '靶向治疗期间，皮疹和腹泻是常见副作用，请注意皮疹严重程度和排便情况。';
      }
    }

    return null;
  }
}

// 导出工厂函数
export function createAdviceGenerator(): AdviceGenerator {
  return new AdviceGenerator();
}

// 导出工具函数
export async function adviceGeneratorTool(
  riskResult: RiskAssessorOutput,
  context?: TreatmentContext
): Promise<AdviceGeneratorOutput> {
  const generator = createAdviceGenerator();
  return generator.generate(riskResult, context);
}
