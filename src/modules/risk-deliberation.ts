import Anthropic from '@anthropic-ai/sdk';
import type {
  AssessRequest,
  DecisionMode,
  EvidenceRetrievalSurface,
  RiskDeliberationSurface,
} from '../types/index.js';
import type { ClinicalTriageOutput } from './clinical-triage.js';
import type { IntentFramingResult } from './intent-framing.js';
import type { AssessStreamSink } from '../lib/assess-stream.js';
import { runLLMToolLoop, type ToolAssessRiskOutput } from '../lib/llm-tools.js';
import { parseRiskAssessmentOutput } from '../lib/structured-output.js';
import { assertLlmConfigured, resolveDeliberationRuntime, type LlmKeyConfig } from '../lib/llm-config.js';
import {
  buildRiskDeliberationUserPrompt,
  RISK_DELIBERATION_SYSTEM_PROMPT,
} from './risk-deliberation-prompt.js';
import { streamStructuredDeliberation } from './risk-deliberation-stream.js';

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

export function deriveDecisionMode(
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

export function inferCriticalUnknowns(input: RiskDeliberationInput): string[] {
  const signals = input.triage.assessment.critical_unknowns;
  if (Array.isArray(signals) && signals.length > 0) {
    return signals;
  }
  return input.evidence.surface.critical_unknowns;
}

export function buildRiskDeliberationSurface(params: {
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

  async deliberate(
    input: RiskDeliberationInput,
    sink?: AssessStreamSink,
  ): Promise<RiskDeliberationResult> {
    assertLlmConfigured(this.config);

    if (sink) {
      if (resolveDeliberationRuntime(this.config) === 'tool_native') {
        sink.emit({
          type: 'thinking',
          delta: '正在通过工具链检索症状、规则与循证知识…\n',
        });
        return this.runToolNative(input);
      }
      return streamStructuredDeliberation(input, this.config, sink);
    }

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
    const userPrompt = buildRiskDeliberationUserPrompt(input);

    const response = await client.messages.create({
      model: this.config.anthropic_model ?? 'claude-opus-4-7',
      max_tokens: this.config.anthropic_max_tokens ?? 1024,
      system: RISK_DELIBERATION_SYSTEM_PROMPT,
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
