import type {
  ClarificationQuestion,
  ClarificationState,
  ExecutiveResponseMode,
  IntentFramingSurface,
  SessionHistory,
  TreatmentContext,
} from '../types/index.js';
import { assertLlmConfigured, hasLlmApiKey, type LlmKeyConfig } from '../lib/llm-config.js';
import { getConfig, type SABA_CONFIG } from '../lib/env.js';
import { isBaselineComplete } from '../lib/patient-baseline.js';

export type IntentType =
  | 'symptom_assessment'
  | 'medication_question'
  | 'emergency_help'
  | 'non_medical'
  | 'unclear';

export type ConversationGoal = IntentType | 'followup_update' | 'general_question';

type LegacyFramingDisposition =
  | 'proceed_to_triage'
  | 'needs_clarification'
  | 'emergency_escalation'
  | 'non_medical_redirect';

type MissingField =
  | 'primary_symptom'
  | 'duration'
  | 'severity'
  | 'associated_symptoms';

interface LegacyFramingOutput {
  intent?: IntentType;
  disposition?: LegacyFramingDisposition;
  rationale?: string;
}

interface SufficiencyResult {
  missing_fields: MissingField[];
  clarification_questions: ClarificationQuestion[];
}

export interface IntentFramingInput {
  user_input: string;
  context?: TreatmentContext;
  session_history?: SessionHistory;
  clarification_state?: ClarificationState;
  reported_messages?: string[];
}

export interface IntentFramingResult extends IntentFramingSurface {
  clarification_questions: ClarificationQuestion[];
  clinical_input: string;
  framing_kind: 'llm_primary' | 'rule_fallback';
}

type IntentFramingConfig = Partial<SABA_CONFIG>;

const VALID_INTENTS: IntentType[] = [
  'symptom_assessment',
  'medication_question',
  'emergency_help',
  'non_medical',
  'unclear',
];

const VALID_DISPOSITIONS: LegacyFramingDisposition[] = [
  'proceed_to_triage',
  'needs_clarification',
  'emergency_escalation',
  'non_medical_redirect',
];

const EMERGENCY_PATTERN = /呼吸困难|喘不上气|胸痛|意识模糊|昏迷|抽搐|大出血|呕血|黑便|喉咙发紧|嘴唇肿|舌头肿|单侧腿肿|胸闷|气短/;
const MEDICATION_BOUNDARY_PATTERN = /停药|加药|减药|剂量|药量|能不能.*药|要不要.*药|换药|调药/;
const NON_MEDICAL_PATTERN = /挂号|报销|停车|请假|住院流程|天气|下雨|几点|电影|音乐|股票|新闻/;
const FOLLOW_UP_PATTERN = /更严重|加重|恶化|越来越|还是这样|还没好|依然|继续|现在更|比刚才|比之前/;
const DURATION_MARKERS =
  /(\d+\s*(天|日|小时|周|月|年|礼拜))|((半|一|两|三|四|五|六|七|八|九|十)+[天日周月])|持续|多久|几天|几周|小时|半个月|一周|两周|三天|两天|今早|昨晚|刚才|以来|开始/;
const SEVERITY_MARKERS =
  /(轻微|轻度|中度|中等|严重|剧烈|难忍|加重|好转|缓解|0\s*-\s*10|十分|很疼|有点疼|非常|明显|影响睡眠|影响进食|吃不下|无法进食|受不了)/;
const SYMPTOM_KEYWORDS = ['痛', '疼', '烧', '发热', '恶心', '吐', '咳', '疹', '麻', '拉肚子', '腹泻', '胸闷', '气短', '没劲', '不舒服', '溃疡', '晕', '乏'];
const STRUCTURED_INTAKE_QUESTION: ClarificationQuestion = {
  question_id: 'intake_overview',
  text: '请按顺序补充：当前最主要的不适、持续多久、严重程度，以及是否还有其他症状。',
};
const BASELINE_INTAKE_QUESTION: ClarificationQuestion = {
  question_id: 'baseline_intake',
  text: '在判断之前，请先告诉我您当前的治疗类型（例如化疗、靶向、内分泌等），以及最近一次手术或本周期治疗大概是在什么时候。',
};
const BASELINE_CATEGORY_QUESTION: ClarificationQuestion = {
  question_id: 'baseline_treatment_category',
  text: '您目前主要在做什么治疗？例如化疗、靶向、内分泌、免疫、放疗或术后随访。',
};
const BASELINE_ANCHOR_QUESTION: ClarificationQuestion = {
  question_id: 'baseline_treatment_anchor',
  text: '最近一次手术或当前治疗周期大概是什么时候？例如「上周三手术」或「化疗第2周期第3天」。',
};
const QUESTION_TEMPLATES: Record<MissingField, ClarificationQuestion> = {
  primary_symptom: {
    question_id: 'primary_symptom',
    text: '主要是哪种不适？例如恶心、疼痛、发热、皮疹、腹泻或呼吸不畅等。',
  },
  duration: {
    question_id: 'duration_detail',
    text: '这种情况持续了多久？是在加重、稳定，还是有好转？',
  },
  severity: {
    question_id: 'severity_detail',
    text: '目前不适的严重程度如何？是否影响进食、睡眠或日常活动？',
  },
  associated_symptoms: {
    question_id: 'associated_symptoms',
    text: '除了已提到的不适，是否还有发热、呕吐、乏力、出血或其他症状？',
  },
};

function normalizeIntent(value: unknown): IntentType | null {
  return typeof value === 'string' && VALID_INTENTS.includes(value as IntentType)
    ? (value as IntentType)
    : null;
}

function normalizeDisposition(value: unknown): LegacyFramingDisposition | null {
  return typeof value === 'string' && VALID_DISPOSITIONS.includes(value as LegacyFramingDisposition)
    ? (value as LegacyFramingDisposition)
    : null;
}

function extractJSONObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }

  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function mergeClinicalUserInput(input: IntentFramingInput): string {
  const trimmed = input.user_input.trim();
  const reported = input.reported_messages ?? [];
  if (reported.length === 0) {
    return trimmed;
  }

  const previous = reported.filter((message) => message.trim() && message.trim() !== trimmed);
  if (previous.length === 0) {
    return trimmed;
  }

  return `${previous.join('；')}。补充：${trimmed}`;
}

function hasSymptomSignal(text: string): boolean {
  return SYMPTOM_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasConcreteDuration(text: string): boolean {
  return DURATION_MARKERS.test(text);
}

function detectMissingFields(text: string, followUp: boolean): MissingField[] {
  const missing: MissingField[] = [];
  const compact = text.replace(/\s+/g, '');

  if (!hasSymptomSignal(text)) {
    missing.push('primary_symptom');
  }
  if (!hasConcreteDuration(text)) {
    missing.push('duration');
  }
  if (!SEVERITY_MARKERS.test(text)) {
    missing.push('severity');
  }
  if (!followUp && compact.length < 32 && !/[、,，]|还有|同时|伴有|以及|没有|无|未见/.test(text)) {
    missing.push('associated_symptoms');
  }

  return missing;
}

function buildQuestions(missing: MissingField[]): ClarificationQuestion[] {
  const priority: MissingField[] = ['primary_symptom', 'duration', 'severity', 'associated_symptoms'];
  return priority
    .filter((field) => missing.includes(field))
    .slice(0, 3)
    .map((field) => QUESTION_TEMPLATES[field]);
}

function assessInformationSufficiency(text: string, followUp: boolean): SufficiencyResult {
  const missingFields = detectMissingFields(text, followUp);
  return {
    missing_fields: missingFields,
    clarification_questions: buildQuestions(missingFields),
  };
}

async function runAnthropicFraming(
  input: IntentFramingInput,
  config: IntentFramingConfig,
): Promise<LegacyFramingOutput | null> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({
    apiKey: config.anthropic_api_key!,
    ...(config.anthropic_base_url ? { baseURL: config.anthropic_base_url } : {}),
  });

  const response = await client.messages.create({
    model: config.anthropic_model ?? 'claude-opus-4-7',
    max_tokens: Math.min(config.anthropic_max_tokens ?? 1024, 512),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: `你是乳腺癌副作用评估系统的 intent framing 节点。你的职责不是给最终建议，而是判断：\n1. 当前输入属于什么意图\n2. 当前应该继续分诊、先澄清、直接急诊升级，还是非医疗重定向\n\n允许输出：\n- intent: symptom_assessment | medication_question | emergency_help | non_medical | unclear\n- disposition: proceed_to_triage | needs_clarification | emergency_escalation | non_medical_redirect\n- rationale: 简短中文理由\n\n规则：\n- 出现呼吸困难、胸痛、意识改变、严重出血等危急信号，必须 emergency_escalation\n- 单纯挂号/报销/停车/天气等问题应 non_medical_redirect\n- 仅有“我不舒服”“不太舒服”等过于笼统描述，应 needs_clarification\n- 如已有补充信息足以支持继续临床分诊，应 proceed_to_triage\n\n只输出 JSON。`,
    messages: [
      {
        role: 'user',
        content: `用户输入: ${input.user_input}\n治疗上下文: ${JSON.stringify(input.context ?? {}, null, 2)}\n历史: ${JSON.stringify(input.session_history ?? {}, null, 2)}\n澄清: ${JSON.stringify(input.clarification_state ?? {}, null, 2)}`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type !== 'text') {
      continue;
    }
    const parsed = extractJSONObject(block.text);
    if (!parsed) {
      continue;
    }

    return {
      intent: normalizeIntent(parsed.intent) ?? undefined,
      disposition: normalizeDisposition(parsed.disposition) ?? undefined,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : undefined,
    };
  }

  return null;
}

async function runDashScopeFraming(
  input: IntentFramingInput,
  config: IntentFramingConfig,
): Promise<LegacyFramingOutput | null> {
  const { getDashScopeClient } = await import('../lib/dashscope.js');
  const client = getDashScopeClient(config.dashscope_api_key!);

  const response = await client.chat.completions.create({
    model: config.dashscope_model ?? 'qwen3.6-plus',
    temperature: 0,
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: `你是乳腺癌副作用评估系统的 intent framing 节点。请判断 intent / disposition，并只输出 JSON。\nintent 可取 symptom_assessment|medication_question|emergency_help|non_medical|unclear\ndisposition 可取 proceed_to_triage|needs_clarification|emergency_escalation|non_medical_redirect。`,
      },
      {
        role: 'user',
        content: `用户输入: ${input.user_input}\n治疗上下文: ${JSON.stringify(input.context ?? {}, null, 2)}\n历史: ${JSON.stringify(input.session_history ?? {}, null, 2)}\n澄清: ${JSON.stringify(input.clarification_state ?? {}, null, 2)}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '';
  const parsed = extractJSONObject(content);
  if (!parsed) {
    return null;
  }

  return {
    intent: normalizeIntent(parsed.intent) ?? undefined,
    disposition: normalizeDisposition(parsed.disposition) ?? undefined,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : undefined,
  };
}

function isMedicationBoundary(input: IntentFramingInput, intent: IntentType): boolean {
  return intent === 'medication_question' || MEDICATION_BOUNDARY_PATTERN.test(input.user_input);
}

function isFollowUp(input: IntentFramingInput): boolean {
  const hasHistory = Array.isArray(input.session_history?.previous_symptoms) && input.session_history.previous_symptoms.length > 0;
  return hasHistory || input.clarification_state != null || FOLLOW_UP_PATTERN.test(input.user_input);
}

function resolveConversationGoal(
  input: IntentFramingInput,
  intent: IntentType,
  medicationBoundary: boolean,
  followUp: boolean,
): ConversationGoal {
  if (medicationBoundary) {
    return 'medication_question';
  }
  if (followUp && intent !== 'non_medical') {
    return 'followup_update';
  }
  if (intent === 'unclear' && !hasSymptomSignal(input.user_input)) {
    return 'general_question';
  }
  return intent;
}

function shouldUseStructuredIntake(
  input: IntentFramingInput,
  missingFields: MissingField[],
  conversationGoal: ConversationGoal,
  followUp: boolean,
): boolean {
  if (conversationGoal === 'unclear' || conversationGoal === 'general_question') {
    return true;
  }
  if (missingFields.includes('primary_symptom')) {
    return true;
  }
  if (!followUp && missingFields.length >= 3) {
    return true;
  }
  return /^我不舒服$|^有点不舒服$|^不太舒服$/.test(input.user_input.trim());
}

function deriveInteractionMode(params: {
  input: IntentFramingInput;
  disposition: LegacyFramingDisposition;
  missingFields: MissingField[];
  conversationGoal: ConversationGoal;
  followUp: boolean;
  medicationBoundary: boolean;
  baselineComplete: boolean;
}): ExecutiveResponseMode {
  if (params.medicationBoundary) {
    return 'route_out';
  }

  if (params.disposition === 'emergency_escalation') {
    return 'escalation';
  }

  if (params.disposition === 'non_medical_redirect') {
    return 'route_out';
  }

  if (!params.baselineComplete) {
    return params.disposition === 'proceed_to_triage'
      ? 'clarify'
      : (shouldUseStructuredIntake(
          params.input,
          params.missingFields,
          params.conversationGoal,
          params.followUp,
        )
          ? 'structured_intake'
          : 'clarify');
  }

  switch (params.disposition) {
    case 'proceed_to_triage':
      return 'provisional_assessment';
    case 'needs_clarification':
    default:
      return shouldUseStructuredIntake(
        params.input,
        params.missingFields,
        params.conversationGoal,
        params.followUp,
      )
        ? 'structured_intake'
        : 'clarify';
  }
}

function deriveAnswerability(
  interactionMode: ExecutiveResponseMode,
  medicationBoundary: boolean,
): IntentFramingSurface['answerability'] {
  switch (interactionMode) {
    case 'route_out':
      return medicationBoundary ? 'insufficient' : 'non_medical';
    case 'structured_intake':
    case 'clarify':
      return 'needs_clarification';
    case 'escalation':
    case 'provisional_assessment':
    case 'conclusive_assessment':
      return 'ready';
    case 'insufficient':
    default:
      return 'insufficient';
  }
}

function deriveBaselineGapQuestions(input: IntentFramingInput): ClarificationQuestion[] {
  const ctx = input.context;
  const missingCategory = !ctx?.treatment_category?.trim();
  const missingAnchor = !ctx?.treatment_anchor?.trim();

  if (missingCategory && missingAnchor) {
    return [BASELINE_CATEGORY_QUESTION, BASELINE_ANCHOR_QUESTION];
  }
  if (missingCategory) return [BASELINE_CATEGORY_QUESTION];
  if (missingAnchor) return [BASELINE_ANCHOR_QUESTION];
  return [BASELINE_INTAKE_QUESTION];
}

function deriveClarificationQuestions(params: {
  input: IntentFramingInput;
  interactionMode: ExecutiveResponseMode;
  answerability: IntentFramingSurface['answerability'];
  clarificationQuestions: ClarificationQuestion[];
  baselineComplete: boolean;
}): ClarificationQuestion[] {
  if (params.answerability !== 'needs_clarification') {
    return [];
  }
  if (!params.baselineComplete) {
    return deriveBaselineGapQuestions(params.input);
  }
  if (params.interactionMode === 'structured_intake') {
    return [STRUCTURED_INTAKE_QUESTION];
  }
  if (params.clarificationQuestions.length > 0) {
    return params.clarificationQuestions;
  }
  return [QUESTION_TEMPLATES.primary_symptom];
}

function deriveRuleFallback(input: IntentFramingInput): LegacyFramingOutput {
  const text = input.user_input.trim();

  if (!text || /^我不舒服$|^有点不舒服$|^不太舒服$/.test(text)) {
    return {
      intent: 'unclear',
      disposition: 'needs_clarification',
      rationale: '描述过于笼统，需要先收集更具体的症状信息。',
    };
  }

  if (EMERGENCY_PATTERN.test(text)) {
    return {
      intent: 'emergency_help',
      disposition: 'emergency_escalation',
      rationale: '命中急症红旗信号，需要立即升级处理。',
    };
  }

  if (NON_MEDICAL_PATTERN.test(text) && !hasSymptomSignal(text)) {
    return {
      intent: 'non_medical',
      disposition: 'non_medical_redirect',
      rationale: '问题不属于临床评估路径。',
    };
  }

  if (MEDICATION_BOUNDARY_PATTERN.test(text)) {
    return {
      intent: 'medication_question',
      disposition: 'needs_clarification',
      rationale: '涉及药物停改剂量边界，不进入直接临床判断。',
    };
  }

  if (hasSymptomSignal(text)) {
    return {
      intent: 'symptom_assessment',
      disposition: 'proceed_to_triage',
      rationale: '存在明确症状描述，可进入临床评估。',
    };
  }

  return {
    intent: 'unclear',
    disposition: 'needs_clarification',
    rationale: '缺少稳定的临床意图信号，需要继续澄清。',
  };
}

export class IntentFramer {
  constructor(private readonly config: IntentFramingConfig = getConfig()) {}

  private deriveResult(
    input: IntentFramingInput,
    legacy: {
      intent: IntentType;
      disposition: LegacyFramingDisposition;
      rationale: string;
    },
    framingKind: IntentFramingResult['framing_kind'],
  ): IntentFramingResult {
    const clinicalInput = mergeClinicalUserInput(input);
    const followUp = isFollowUp(input);
    const sufficiency = assessInformationSufficiency(clinicalInput, followUp);
    const medicationBoundary = isMedicationBoundary(input, legacy.intent);
    const conversationGoal = resolveConversationGoal(input, legacy.intent, medicationBoundary, followUp);
    const baselineComplete = isBaselineComplete(input.context);
    const interactionMode = deriveInteractionMode({
      input,
      disposition: legacy.disposition,
      missingFields: sufficiency.missing_fields,
      conversationGoal,
      followUp,
      medicationBoundary,
      baselineComplete,
    });
    const answerability = deriveAnswerability(interactionMode, medicationBoundary);
    const clarificationQuestions = deriveClarificationQuestions({
      input,
      interactionMode,
      answerability,
      clarificationQuestions: sufficiency.clarification_questions,
      baselineComplete,
    });

    const rationale = !baselineComplete && answerability === 'needs_clarification'
      ? `${legacy.rationale}（先补充治疗基线再进入临床判断）`
      : legacy.rationale;

    return {
      conversation_goal: conversationGoal,
      interaction_mode: interactionMode,
      answerability,
      is_possible_emergency: interactionMode === 'escalation' || legacy.intent === 'emergency_help',
      is_medication_boundary: medicationBoundary,
      is_follow_up: followUp,
      rationale,
      clarification_questions: clarificationQuestions,
      clinical_input: clinicalInput,
      framing_kind: framingKind,
    };
  }

  async frame(input: IntentFramingInput): Promise<IntentFramingResult> {
    if (hasLlmApiKey(this.config as Partial<LlmKeyConfig>)) {
      assertLlmConfigured(this.config as Partial<LlmKeyConfig>);
      const parsed = this.config.llm_provider === 'anthropic'
        ? await runAnthropicFraming(input, this.config)
        : await runDashScopeFraming(input, this.config);

      if (parsed?.intent && parsed.disposition && parsed.rationale) {
        return this.deriveResult(
          input,
          {
            intent: parsed.intent,
            disposition: parsed.disposition,
            rationale: parsed.rationale,
          },
          'llm_primary',
        );
      }
    }

    const fallback = deriveRuleFallback(input);
    return this.deriveResult(
      input,
      {
        intent: fallback.intent ?? 'unclear',
        disposition: fallback.disposition ?? 'needs_clarification',
        rationale: fallback.rationale ?? '需继续澄清。',
      },
      'rule_fallback',
    );
  }
}

export function createIntentFramer(config?: IntentFramingConfig): IntentFramer {
  return new IntentFramer(config);
}
