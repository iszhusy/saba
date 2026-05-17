import Anthropic from '@anthropic-ai/sdk';
import type {
  AssessRequest,
  DecisionMode,
  EvidenceRetrievalSurface,
  RiskDeliberationSurface,
} from '../types/index.js';
import type { ClinicalTriageOutput } from './clinical-triage.js';
import type { IntentFramingResult } from './intent-framing.js';
import { runLLMToolLoop, type ToolAssessRiskOutput } from '../lib/llm-tools.js';
import { parseRiskAssessmentOutput } from '../lib/structured-output.js';
import { assertLlmConfigured, resolveDeliberationRuntime, type LlmKeyConfig } from '../lib/llm-config.js';

export interface RiskDeliberationConfig extends LlmKeyConfig {
  anthropic_base_url?: string;
  anthropic_model?: string;
  anthropic_max_tokens?: number;
  dashscope_model?: string;
  deliberation_runtime?: 'structured' | 'tool_native';
  anthropic_client_factory?: () => Anthropic;
  tool_loop_runner?: typeof runLLMToolLoop;
}

export interface RiskDeliberationInput {
  request: AssessRequest;
  framing: IntentFramingResult;
  triage: ClinicalTriageOutput;
  evidence: {
    rag_sources: string[];
    knowledge_snippets: { source: string; content: string; relevance: number }[];
    matched_rule_ids: string[];
    surface: EvidenceRetrievalSurface;
  };
}

export interface RiskDeliberationResult {
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number;
  reasoning: string;
  warning_signs: string[];
  immediate_action: string;
  follow_up: string;
  confidence: number;
  decision_mode: DecisionMode;
  visible_uncertainty: string[];
  next_step?: string;
  surface: RiskDeliberationSurface;
}

function deriveDecisionMode(
  riskLevel: 'high' | 'medium' | 'low',
  confidence: number,
  criticalUnknowns: string[],
): DecisionMode {
  if (riskLevel === 'high' && confidence >= 0.7) {
    return 'conclusive';
  }
  if (criticalUnknowns.length > 1 && confidence < 0.6) {
    return 'insufficient';
  }
  if (criticalUnknowns.length > 0 || confidence < 0.75) {
    return 'provisional';
  }
  return 'conclusive';
}

function inferCriticalUnknowns(input: RiskDeliberationInput): string[] {
  const signals = input.triage.assessment.critical_unknowns;
  if (Array.isArray(signals) && signals.length > 0) {
    return signals;
  }
  return input.evidence.surface.critical_unknowns;
}

function buildRiskDeliberationSurface(params: {
  input: RiskDeliberationInput;
  decisionMode: DecisionMode;
  confidence: number;
  reasoning: string;
  riskLevel: 'high' | 'medium' | 'low';
  riskScore: number;
  criticalUnknowns: string[];
}): RiskDeliberationSurface {
  return {
    decision_mode: params.decisionMode,
    confidence: params.confidence,
    rationale: params.reasoning,
    risk_level: params.riskLevel,
    risk_score: params.riskScore,
    supporting_signals: [
      `triage:${params.input.triage.assessment.current_risk_tendency}`,
      `evidence:${params.input.evidence.surface.rag_sources.length}`,
      `framing:${params.input.framing.interaction_mode}`,
    ],
    critical_unknowns: params.criticalUnknowns,
    what_would_change_the_assessment: params.criticalUnknowns.map(
      (item) => `补充 ${item} 可能改变当前风险分层`,
    ),
  };
}

function buildToolNativeUserInput(input: RiskDeliberationInput): string {
  const contextLines = [
    `对话目标: ${input.framing.conversation_goal}`,
    `交互模式: ${input.framing.interaction_mode}`,
    `可回答性: ${input.framing.answerability}`,
    `规则风险倾向: ${input.triage.assessment.current_risk_tendency}`,
    `关键未知项: ${input.triage.assessment.critical_unknowns.join('；') || '无'}`,
    `证据来源: ${input.evidence.rag_sources.join('；') || '无'}`,
  ].join('\n');

  return `${input.request.input}\n\n[deliberation_context]\n${contextLines}`;
}

function mapToolNativeResult(
  input: RiskDeliberationInput,
  result: ToolAssessRiskOutput,
): RiskDeliberationResult {
  const criticalUnknowns = inferCriticalUnknowns(input);

  return {
    risk_level: result.risk_level,
    risk_score: result.risk_score,
    reasoning: result.reasoning,
    warning_signs: result.warning_signs,
    immediate_action: result.immediate_action,
    follow_up: result.follow_up,
    confidence: result.confidence,
    decision_mode: result.decision_mode,
    visible_uncertainty: result.visible_uncertainty,
    next_step: result.next_step,
    surface: buildRiskDeliberationSurface({
      input,
      decisionMode: result.decision_mode,
      confidence: result.confidence,
      reasoning: result.reasoning,
      riskLevel: result.risk_level,
      riskScore: result.risk_score,
      criticalUnknowns,
    }),
  };
}

export class RiskDeliberation {
  constructor(private readonly config: RiskDeliberationConfig) {}

  async deliberate(input: RiskDeliberationInput): Promise<RiskDeliberationResult> {
    assertLlmConfigured(this.config);

    if (resolveDeliberationRuntime(this.config) === 'structured') {
      return this.runStructuredAnthropicOrDashscope(input);
    }

    return this.runToolNative(input);
  }

  private async runStructuredAnthropicOrDashscope(
    input: RiskDeliberationInput,
  ): Promise<RiskDeliberationResult> {
    const { llm_provider, anthropic_api_key, dashscope_api_key } = this.config;

    if (llm_provider === 'anthropic' && anthropic_api_key) {
      return this.runAnthropic(input);
    }

    if (llm_provider === 'dashscope' && dashscope_api_key) {
      return this.runDashScope(input);
    }

    if (anthropic_api_key) {
      return this.runAnthropic(input);
    }

    if (dashscope_api_key) {
      return this.runDashScope(input);
    }

    throw new Error('Unreachable: LLM provider not configured');
  }

  private createAnthropicClient(): Anthropic {
    if (this.config.anthropic_client_factory) {
      return this.config.anthropic_client_factory();
    }

    return new Anthropic({
      apiKey: this.config.anthropic_api_key!,
      ...(this.config.anthropic_base_url ? { baseURL: this.config.anthropic_base_url } : {}),
    });
  }

  private async runToolNative(input: RiskDeliberationInput): Promise<RiskDeliberationResult> {
    if (!this.config.anthropic_api_key && !this.config.anthropic_client_factory) {
      throw new Error('tool_native deliberation requires Anthropic configuration');
    }

    const toolLoopRunner = this.config.tool_loop_runner ?? runLLMToolLoop;
    const client = this.createAnthropicClient();
    const result = await toolLoopRunner(
      client,
      buildToolNativeUserInput(input),
      {
        treatment_type: input.request.context?.treatment_type,
        treatment_phase: input.request.context?.treatment_phase,
        treatment_day: input.request.context?.treatment_day,
      },
      this.config.anthropic_model ?? 'claude-opus-4-7',
      this.config.anthropic_max_tokens ?? 4096,
    );

    return mapToolNativeResult(input, result);
  }

  private async runAnthropic(input: RiskDeliberationInput): Promise<RiskDeliberationResult> {
    const client = this.createAnthropicClient();
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

    const systemPrompt = `你是一位专业的肿瘤临床决策支持 AI。请综合上述所有信息，做出一个安全的风险审议结果。

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

    const response = await client.messages.create({
      model: this.config.anthropic_model ?? 'claude-opus-4-7',
      max_tokens: this.config.anthropic_max_tokens ?? 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for (const block of response.content) {
      if (block.type !== 'text') {
        continue;
      }

      const parsed = parseRiskAssessmentOutput(block.text as string);
      if (!parsed) {
        continue;
      }

      const criticalUnknowns = inferCriticalUnknowns(input);
      const decisionMode =
        parsed.decision_mode ?? deriveDecisionMode(parsed.risk_level, parsed.confidence, criticalUnknowns);
      const visibleUncertainty =
        parsed.visible_uncertainty ?? criticalUnknowns.map((item) => `仍需确认 ${item}`);

      return {
        ...parsed,
        decision_mode: decisionMode,
        visible_uncertainty: visibleUncertainty,
        surface: buildRiskDeliberationSurface({
          input,
          decisionMode,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          riskLevel: parsed.risk_level,
          riskScore: parsed.risk_score,
          criticalUnknowns,
        }),
      };
    }

    throw new Error('LLM 返回内容无法解析为风险评估结果，请重试');
  }

  private async runDashScope(input: RiskDeliberationInput): Promise<RiskDeliberationResult> {
    const { getDashScopeClient, assessRiskWithDashScope } = await import('../lib/dashscope.js');
    const client = getDashScopeClient(this.config.dashscope_api_key!);

    const assessment = await assessRiskWithDashScope(
      client,
      input.request.input,
      input.triage.findings.map((s) => ({
        standard_term: s.standard_term,
        severity: s.severity,
        confidence: s.confidence,
      })),
      {
        risk_level: input.triage.assessment.current_risk_tendency,
        triggered_rules: (input.triage.assessment.triggered_rules ?? []).map((r) => r.name),
      },
      input.evidence.knowledge_snippets.map((k) => k.content).join('\n'),
      this.config.dashscope_model ?? 'qwen3.6-plus',
    );

    const immediateActionMap: Record<string, string> = {
      high: '请立即就医或前往急诊；如症状明显加重，请拨打120。',
      medium: '请尽快联系您的医疗团队（医生或护士）反馈情况。',
      low: '建议持续观察症状变化，必要时联系医疗团队咨询。',
    };
    const warningMap: Record<string, string[]> = {
      high: ['呼吸困难加重', '意识改变', '症状迅速恶化'],
      medium: [],
      low: [],
    };
    const followUpMap: Record<string, string> = {
      high: '急诊处理后请尽快联系您的医疗团队反馈情况。',
      medium: '如症状加重或持续超过3天，请联系医疗团队。',
      low: '持续观察，如有疑问请随时咨询。',
    };

    const criticalUnknowns = inferCriticalUnknowns(input);
    const decisionMode = deriveDecisionMode(
      assessment.risk_level,
      assessment.confidence,
      criticalUnknowns,
    );

    return {
      risk_level: assessment.risk_level,
      risk_score: assessment.risk_score,
      reasoning: assessment.reasoning,
      warning_signs: warningMap[assessment.risk_level],
      immediate_action: immediateActionMap[assessment.risk_level],
      follow_up: followUpMap[assessment.risk_level],
      confidence: assessment.confidence,
      decision_mode: decisionMode,
      visible_uncertainty: criticalUnknowns.map((item) => `仍需确认 ${item}`),
      surface: buildRiskDeliberationSurface({
        input,
        decisionMode,
        confidence: assessment.confidence,
        reasoning: assessment.reasoning,
        riskLevel: assessment.risk_level,
        riskScore: assessment.risk_score,
        criticalUnknowns,
      }),
    };
  }
}

export function createRiskDeliberation(config: RiskDeliberationConfig): RiskDeliberation {
  return new RiskDeliberation(config);
}
