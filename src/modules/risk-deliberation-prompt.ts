import type { RiskDeliberationInput } from './risk-deliberation.js';

export function buildRiskDeliberationUserPrompt(input: RiskDeliberationInput): string {
  const ctx = input.request.context ?? {};
  const { treatment_type, treatment_phase, treatment_day } = ctx;

  let userPrompt = `请基于以下信息，评估该乳腺癌患者的风险等级、结论资格和下一步处理建议。

## 患者描述
"${input.request.input}"
${treatment_type ? `治疗类型: ${treatment_type}` : ''}
${treatment_phase ? `治疗阶段: ${treatment_phase}` : ''}
${treatment_day ? `治疗第${treatment_day}天` : ''}`;

  if (input.triage.findings.length > 0) {
    userPrompt += `\n\n## 已解析症状（标准化）\n${input.triage.findings.map((s) => `- ${s.standard_term}（${s.severity}）`).join('\n')}`;
  }

  userPrompt += `\n\n## 规则引擎评估（仅供参考)
- 风险等级: ${input.triage.assessment.current_risk_tendency}
- 风险分数: ${input.triage.assessment.risk_score ?? '未提供'}
- 触发规则: ${input.triage.assessment.triggered_rules?.map((r) => r.name).join(', ') || '无'}
- 规则置信度: ${input.triage.assessment.confidence}`;

  userPrompt += `\n\n## Triage reasoning surface
- 风险倾向: ${input.triage.assessment.current_risk_tendency}
- 紧急度: ${input.triage.assessment.urgency}
- 已知事实: ${input.triage.assessment.basis.known_facts.join('；') || '无'}
- 推断事实: ${input.triage.assessment.basis.inferred_facts.join('；') || '无'}
- 关键未知项: ${input.triage.assessment.critical_unknowns.join('；') || '无'}
- 不确定性原因: ${input.triage.assessment.uncertainty_reasons.join('；') || '无'}`;

  if (input.evidence.knowledge_snippets.length > 0) {
    userPrompt += `\n\n## 参考医学知识\n${input.evidence.knowledge_snippets.map((k) => `[来源: ${k.source}]\n${k.content}`).join('\n\n')}`;
  }

  userPrompt += `\n\n## 意图 framing 结果
- 对话目标: ${input.framing.conversation_goal}
- 当前交互模式: ${input.framing.interaction_mode}
- 可回答性: ${input.framing.answerability}
- 可能急症: ${input.framing.is_possible_emergency ? '是' : '否'}
- 药物边界: ${input.framing.is_medication_boundary ? '是' : '否'}
- follow-up: ${input.framing.is_follow_up ? '是' : '否'}
- 分类依据: ${input.framing.rationale}`;

  return userPrompt;
}

export const RISK_DELIBERATION_SYSTEM_PROMPT = `你是一位专业的肿瘤临床决策支持 AI。请综合上述所有信息，做出一个安全的风险审议结果。

你不直接面向患者回复，你的职责是输出：
1. 当前风险等级与分数
2. 当前是 conclusive / provisional / insufficient
3. 当前仍需向用户显式说明哪些不确定性
4. 当前的下一步应该是什么

输出要求（JSON 格式）：
{
  "risk_level": "high" | "medium" | "low",
  "risk_score": 0-100,
  "reasoning": "你的临床推理过程",
  "warning_signs": ["警示信号1", "警示信号2"],
  "immediate_action": "立即行动建议",
  "follow_up": "后续跟进建议",
  "confidence": 0.0-1.0,
  "decision_mode": "conclusive" | "provisional" | "insufficient",
  "visible_uncertainty": ["需要向用户显式说明的未知项"],
  "next_step": "主对话代理应引导用户做的下一步"
}

安全原则：
- 如果有任何危及生命的症状（如呼吸困难、胸痛、意识改变），必须输出 high，并且 decision_mode 不得为 insufficient
- 不要给出任何药物剂量建议或停药建议
- high 风险必须对应 escalation 或 conclusive_assessment
- medium 风险必须包含联系医疗团队
- 如果关键未知项仍明显影响判断，优先输出 provisional 或 insufficient，而不是假装 conclusive`;
