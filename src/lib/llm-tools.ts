/**
 * SABA Tool 定义与工具调用循环
 * 
 * 核心思想（参考 Claude Code）：
 * - 工具是 LLM 的外部能力扩展
 * - LLM 自主决定是否调用工具、调用哪个
 * - 没有固定顺序，LLM 决定推理路径
 * - max_turns=3 避免无限循环
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SABA_CONFIG } from './env.js';
import { getAnthropicClient } from './llm.js';
import { parseRiskAssessmentOutput, type ParsedRiskAssessmentOutput } from './structured-output.js';
import { SymptomParser } from '../tools/symptom-parser.js';
import { RiskAssessor } from '../tools/risk-assessor.js';
import { AdviceGenerator } from '../tools/advice-generator.js';
import { createRAGRetriever } from '../rag/retriever.js';
import type { AssessRequest, DecisionMode } from '../types/index.js';

// ============================================================
// 1. Tool 输入/输出类型
// ============================================================

export interface ToolParseSymptomsInput {
  user_input: string;
  treatment_type?: string;
  treatment_phase?: string;
}
export interface ToolParseSymptomsOutput {
  symptoms: Array<{ standard_term: string; confidence: number; severity: string }>;
  duration?: string;
}

export interface ToolRiskAssessInput {
  symptoms: Array<{ standard_term: string; severity: string }>;
  raw_input: string;
  treatment_type?: string;
  treatment_phase?: string;
  treatment_day?: number;
}
export interface ToolRiskAssessOutput {
  risk_level: 'low' | 'medium' | 'high';
  risk_score: number;
  triggered_rules: Array<{ id: string; name: string; reason: string }>;
  confidence: number; // 规则置信度：0-1，LLM 用作参考而非决策
}

export interface ToolRetrieveInput {
  symptoms: string[];
  treatment_type?: string;
  question?: string;
}
export interface ToolRetrieveOutput {
  sources: Array<{ content: string; relevance: number; source: string }>;
}

export interface ToolAssessRiskInput {
  user_input: string;
  parsed_symptoms?: Array<{ standard_term: string; severity: string }>;
  rule_assessment?: {
    risk_level: string;
    risk_score: number;
    triggered_rules: string[];
    confidence: number;
  };
  medical_knowledge?: string;
  treatment_type?: string;
  treatment_phase?: string;
  treatment_day?: number;
}
export interface ToolAssessRiskOutput {
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
}

// ============================================================
// 2. Tool 实现（同步函数，供 LLM 循环调用）
// ============================================================

let _symptomParser: SymptomParser | null = null;
let _riskAssessor: RiskAssessor | null = null;
let _adviceGenerator: AdviceGenerator | null = null;

function getTools() {
  _symptomParser ??= new SymptomParser();
  _riskAssessor ??= new RiskAssessor();
  _adviceGenerator ??= new AdviceGenerator();
  return { _symptomParser, _riskAssessor, _adviceGenerator };
}

export async function toolParseSymptoms(
  args: ToolParseSymptomsInput
): Promise<ToolParseSymptomsOutput> {
  const { _symptomParser } = getTools();
  const result = await _symptomParser.parse(args.user_input, {
    treatment_type: args.treatment_type,
    treatment_phase: args.treatment_phase,
  } as AssessRequest['context']);
  return {
    symptoms: result.symptoms.map(s => ({
      standard_term: s.standard_term,
      confidence: s.confidence,
      severity: s.severity,
    })),
    duration: result.duration,
  };
}

export async function toolRiskAssess(
  args: ToolRiskAssessInput
): Promise<ToolRiskAssessOutput> {
  const { _riskAssessor } = getTools();
  const symptomOutput = {
    symptoms: args.symptoms.map(s => ({
      name: s.standard_term,
      standard_term: s.standard_term,
      confidence: 1.0,
      severity: s.severity as 'mild' | 'moderate' | 'severe',
    })),
    duration: undefined,
    rag_sources: [],
    confidence: 1.0,
  };
  const result = await _riskAssessor.assess(symptomOutput, args.raw_input, {
    treatment_type: args.treatment_type,
    treatment_phase: args.treatment_phase,
    treatment_day: args.treatment_day,
  } as AssessRequest['context']);
  return {
    risk_level: result.risk_level,
    risk_score: result.risk_score,
    triggered_rules: result.triggered_rules.map(r => ({
      id: r.id,
      name: r.name,
      reason: r.source || 'rule_matched',
    })),
    confidence: result.confidence ?? 0.8,
  };
}

export async function toolRetrieve(
  args: ToolRetrieveInput
): Promise<ToolRetrieveOutput> {
  const retriever = await createRAGRetriever();
  const result = await retriever.retrieveBySymptoms(
    args.symptoms.map(s => ({ name: s, standard_term: s, confidence: 1.0, severity: 'moderate' as const }))
  );
  // Handle different return types from retriever
  const items = ('results' in result && Array.isArray(result.results))
    ? result.results
    : Array.isArray(result)
    ? result
    : [];
  return {
    sources: (items as any[]).map((r) => ({
      content: (r.content ?? '').slice(0, 500),
      relevance: r.metadata?.relevance ?? 0.5,
      source: r.metadata?.source ?? 'ctcae_v5',
    })),
  };
}

export async function toolAssessRisk(
  args: ToolAssessRiskInput
): Promise<ToolAssessRiskOutput> {
  // 这是 LLM 自身的决策函数，实际上在 tool_calls 循环中不会调用自身
  // 这里提供的是一个"直接评估"的快速路径（无 tool 调用）
  throw new Error('assess_risk should not call itself recursively');
}

function deriveDecisionMode(
  riskLevel: 'high' | 'medium' | 'low',
  confidence: number,
  visibleUncertainty: string[]
): DecisionMode {
  if (riskLevel === 'high' && confidence >= 0.7) {
    return 'conclusive';
  }
  if (visibleUncertainty.length > 1 && confidence < 0.6) {
    return 'insufficient';
  }
  if (visibleUncertainty.length > 0 || confidence < 0.75) {
    return 'provisional';
  }
  return 'conclusive';
}

function normalizeToolAssessmentOutput(parsed: ParsedRiskAssessmentOutput): ToolAssessRiskOutput {
  const visibleUncertainty = parsed.visible_uncertainty ?? [];
  const decisionMode = parsed.decision_mode ?? deriveDecisionMode(parsed.risk_level, parsed.confidence, visibleUncertainty);

  return {
    risk_level: parsed.risk_level,
    risk_score: parsed.risk_score,
    reasoning: parsed.reasoning,
    warning_signs: parsed.warning_signs,
    immediate_action: parsed.immediate_action,
    follow_up: parsed.follow_up,
    confidence: parsed.confidence,
    decision_mode: decisionMode,
    visible_uncertainty: visibleUncertainty,
    next_step: parsed.next_step,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ANTHROPIC_TOOLS: any[] = [
  {
    name: 'parse_symptoms',
    description: '将患者自然语言描述解析为标准化症状列表。用于理解患者在说什么。',
    input_schema: {
      type: 'object',
      properties: {
        user_input: { type: 'string', description: '患者的原始描述' },
        treatment_type: { type: 'string', description: '当前治疗类型（如：AC-T、紫杉醇、曲妥珠单抗）' },
        treatment_phase: { type: 'string', description: '治疗阶段（如：化疗后、靶向治疗中）' },
      },
      required: ['user_input'],
    },
  },
  {
    name: 'risk_assessor_tool',
    description: '使用规则引擎对症状进行快速风险评估。返回结果仅作参考，LLM 有最终决策权。适合需要快速获取已知风险规则匹配时使用。',
    input_schema: {
      type: 'object',
      properties: {
        symptoms: {
          type: 'array',
          description: '已识别的症状列表',
          items: {
            type: 'object',
            properties: {
              standard_term: { type: 'string', description: '症状标准术语（如：恶心呕吐、腹泻、发热）' },
              severity: { type: 'string', description: '严重程度：mild/moderate/severe' },
            },
          },
        },
        raw_input: { type: 'string', description: '患者原始描述（用于关键词匹配）' },
        treatment_type: { type: 'string', description: '治疗类型' },
        treatment_phase: { type: 'string', description: '治疗阶段' },
        treatment_day: { type: 'number', description: '治疗第几天' },
      },
      required: ['raw_input'],
    },
  },
  {
    name: 'retrieve_medical_knowledge',
    description: '检索乳腺癌治疗副作用相关的循证医学知识。包括CTCAE分级、指南推荐、药物相互作用等。用于需要循证依据支持决策时。',
    input_schema: {
      type: 'object',
      properties: {
        symptoms: { type: 'array', description: '要检索的症状关键词', items: { type: 'string' } },
        treatment_type: { type: 'string', description: '治疗类型（可精确检索特定药物的副作用）' },
        question: { type: 'string', description: '具体问题（如"间质性肺炎的处理"）' },
      },
      required: ['symptoms'],
    },
  },
  {
    name: 'assess_risk',
    description: '【最终评估】基于所有可用信息（症状、规则评估、医学知识）给出风险等级评估。这是最终的决策工具，必须在完成推理后调用。',
    input_schema: {
      type: 'object',
      properties: {
        user_input: { type: 'string', description: '患者原始描述' },
        parsed_symptoms: {
          type: 'array',
          description: '已解析的标准化症状',
          items: {
            type: 'object',
            properties: {
              standard_term: { type: 'string' },
              severity: { type: 'string' },
            },
          },
        },
        rule_assessment: {
          type: 'object',
          description: '规则引擎评估结果（可选，作为参考）',
          properties: {
            risk_level: { type: 'string' },
            risk_score: { type: 'number' },
            triggered_rules: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
          },
        },
        medical_knowledge: { type: 'string', description: '检索到的医学知识（可选）' },
        treatment_type: { type: 'string' },
        treatment_phase: { type: 'string' },
        treatment_day: { type: 'number' },
      },
      required: ['user_input'],
    },
  },
];

// ============================================================
// 4. Tool 调用循环（LLM-First 核心）
// ============================================================

export interface LLMToolResult {
  tool: string;
  tool_input: unknown;
  tool_output: unknown;
}

/**
 * LLM 工具调用循环
 * 
 * 流程：
 * 1. LLM 收到请求，决定是否调用工具
 * 2. 执行工具，返回结果
 * 3. 将结果注入 context，LLM 继续
 * 4. 重复直到 LLM 返回最终评估结果
 * 5. 最多 3 轮，避免无限循环
 */
export async function runLLMToolLoop(
  client: Anthropic,
  userInput: string,
  context: {
    treatment_type?: string;
    treatment_phase?: string;
    treatment_day?: number;
  },
  model: string,
  maxTokens: number = 4096,
  maxTurns: number = 3
): Promise<ToolAssessRiskOutput & { tool_calls: LLMToolResult[] }> {
  // Tool registry（函数名 → 实现）
  const toolRegistry: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    parse_symptoms: (args) => toolParseSymptoms(args as unknown as ToolParseSymptomsInput),
    risk_assessor_tool: (args) => toolRiskAssess(args as unknown as ToolRiskAssessInput),
    retrieve_medical_knowledge: (args) => toolRetrieve(args as unknown as ToolRetrieveInput),
    assess_risk: (_args) => Promise.reject(new Error('assess_risk should not be called in loop')),
  };

  // System prompt（LLM-First 角色定义）
  const systemPrompt = `你是一位专注于乳腺癌患者副作用管理的临床决策支持 AI。

## 核心角色
你是唯一的决策者。工具是你的外部能力扩展，帮你获取准确信息。你有最终决策权。

## 风险分级标准（严格按分数量化）

🔴 HIGH (71-100) - 必须立即就医：
- 呼吸困难、胸闷、喘息、气促（任何呼吸困难描述）
- 高热(>39°C)或退烧药无效的持续发热
- 面部/喉咙/嘴唇/舌头肿胀（血管性水肿）
- 输液时脸红+心跳+喉咙紧 → HIGH（即使护士已停药）
- 单侧腿部肿胀+疼痛（DVT）
- 意识模糊、剧烈头痛、视力变化、言语不清
- 呕血、黑便
- **靶向/免疫治疗后出现呼吸困难+干咳+胸闷** → 考虑肺炎 → HIGH

🟡 MEDIUM (41-70) - 24小时内联系团队：
- 恶心呕吐"吃什么吐什么"/"喝水都吐"（脱水风险）
- 口腔溃疡严重，无法进食
- 瘀斑/紫癜 + 牙龈出血（血小板减少）
- 皮疹扩散至全身，或越来越多
- 免疫治疗后全身疹子蔓延（irAE）
- CDK4/6抑制剂/免疫治疗后转氨酶升高（>5倍需处理）
- 化疗后骨髓抑制期（化疗后7-14天）发热
- 内分泌治疗期间异常出血

🟢 LOW (0-40) - 继续观察/对症处理：
- 轻微恶心，食欲略下降（不影响进食）
- 轻度疲劳，不影响日常生活
- 局部轻微皮疹（无扩散）
- 手脚麻木/刺痛感（已知神经毒性）
- 潮热出汗、关节酸痛、失眠等内分泌/AI类药物常见反应
- 赫赛汀等靶向药已知轻度腹泻（≤4次/天，无脱水）

## 决策原则（按优先级）

1. **高风险关键词直接 HIGH**（医疗安全优先）：
   呼吸困难、间质性肺炎、免疫性肺炎、输液反应、过敏、血管性水肿、DVT

2. **靶向/免疫特殊关注**：
   - T-DXd治疗中出现呼吸困难/干咳 → 考虑间质性肺炎 → HIGH
   - 免疫检查点抑制剂治疗中出现呼吸困难 → 考虑免疫性肺炎 → HIGH
   - CDK4/6抑制剂治疗中出现转氨酶升高 → MEDIUM

3. **骨髓抑制期（化疗后7-14天）特殊判断**：
   - 发热（38°C以上）+ 口腔溃疡 → HIGH（感染风险）
   - 发热 + 无其他严重症状 → MEDIUM（不是 HIGH，除非体温>39或呼吸困难）
   - 单纯疲劳+乏力 → LOW

4. **规则评估仅供参考**：
   规则引擎匹配的结果只是参考，你有最终决策权。如果规则结果明显不合理，以临床判断为准。

## 可用工具

- **parse_symptoms**：解析症状（自然语言 → 标准术语）
- **risk_assessor_tool**：规则快速评估（匹配已知风险规则，结果仅供参考）
- **retrieve_medical_knowledge**：检索循证医学知识（指南/CTCAE分级）
- **assess_risk**：给出最终风险评估（必须调用此工具返回结果）

## 推理策略

**第一轮优先**：先快速判断是否包含明确的高风险关键词（见上述"决策原则1"）。有则直接 HIGH，跳过其他工具调用。

**复杂/模糊情况**：调用 parse_symptoms 解析症状 → 如需循证依据则调用 retrieve_medical_knowledge → 如需规则参考则调用 risk_assessor_tool → 最终调用 assess_risk。

**简单情况**：症状明确、无需检索时，可直接调用 assess_risk。

## 输出要求

最终必须调用 assess_risk 工具并提供完整参数。`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `请评估以下乳腺癌患者描述的风险等级。

患者描述: "${userInput}"
${context.treatment_type ? `治疗类型: ${context.treatment_type}` : ''}
${context.treatment_phase ? `治疗阶段: ${context.treatment_phase}` : ''}
${context.treatment_day ? `治疗第${context.treatment_day}天` : ''}`,
    },
  ];

  const allToolResults: LLMToolResult[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools: ANTHROPIC_TOOLS,
    });

    // 提取内容块
    const contentBlocks = response.content;
    let finalAssessment: ToolAssessRiskOutput | null = null;

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        messages.push({ role: 'assistant', content: block.text });
      } else if (block.type === 'tool_use') {
        const toolName = block.name;
        const toolArgs = block.input as Record<string, unknown>;
        const toolId = block.id;

        // 防止 assess_risk 递归调用
        if (toolName === 'assess_risk') {
          finalAssessment = normalizeToolAssessmentOutput(
            parseRiskAssessmentOutput(JSON.stringify(toolArgs)) ?? {
              risk_level: 'medium',
              risk_score: 50,
              reasoning: 'assess_risk tool returned an invalid payload',
              warning_signs: [],
              immediate_action: '请尽快联系您的医疗团队。',
              follow_up: '如症状加重请及时就医。',
              confidence: 0.2,
              visible_uncertainty: ['最终评估工具返回结果格式异常'],
            },
          );
        } else {
          // 执行工具
          const executor = toolRegistry[toolName];
          if (executor) {
            try {
              const toolOutput = await executor(toolArgs);
              const outputText = JSON.stringify(toolOutput, null, 2);
              messages.push({
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    id: toolId,
                    name: toolName,
                    input: toolArgs,
                  } as Anthropic.ContentBlockParam,
                ],
              });
              messages.push({
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolId,
                    content: outputText,
                  } as Anthropic.ContentBlockParam,
                ],
              });
              allToolResults.push({ tool: toolName, tool_input: toolArgs, tool_output: toolOutput });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              messages.push({
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolId,
                    content: `Error: ${errMsg}`,
                  } as Anthropic.ContentBlockParam,
                ],
              });
            }
          }
        }
      }
    }

    // 如果 LLM 返回了最终评估，结束循环
    if (finalAssessment) {
      return {
        ...finalAssessment,
        tool_calls: allToolResults,
      };
    }

    // 检查是否 LLM 直接返回了文本（没有调用 tool），尝试从文本中解析
    for (const block of contentBlocks) {
      if (block.type === 'text') {
        const parsed = parseRiskAssessmentOutput(block.text as string);
        if (parsed) {
          return {
            ...normalizeToolAssessmentOutput(parsed),
            tool_calls: allToolResults,
          };
        }
      }
    }
  }

  // 兜底：超过 maxTurns 未返回结果
  throw new Error(`LLM tool loop exceeded ${maxTurns} turns without final assessment`);
}

// ============================================================
// 5. 便利入口函数
// ============================================================

export async function assessRiskWithLLMToolLoop(
  config: SABA_CONFIG,
  userInput: string,
  context?: {
    treatment_type?: string;
    treatment_phase?: string;
    treatment_day?: number;
  },
  model?: string,
  maxTokens?: number
): Promise<ToolAssessRiskOutput & { tool_calls: LLMToolResult[] }> {
  const client = getAnthropicClient(config);
  return runLLMToolLoop(
    client,
    userInput,
    context ?? {},
    model ?? config.anthropic_model,
    maxTokens ?? 4096
  );
}