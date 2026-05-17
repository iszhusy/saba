/**
 * SABA DashScope (Qwen) LLM 客户端
 * 基于阿里云 DashScope OpenAI-compatible API
 */

import OpenAI from 'openai';

let _client: OpenAI | null = null;

/**
 * 初始化 DashScope 客户端
 */
export function getDashScopeClient(apiKey: string): OpenAI {
  if (!_client) {
    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is not configured.');
    }
    _client = new OpenAI({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }
  return _client;
}

/**
 * 重置客户端
 */
export function resetDashScopeClient(): void {
  _client = null;
}

// ============================================================
// 症状解析 - DashScope
// ============================================================

export interface DashScopeSymptomExtraction {
  symptoms: Array<{
    standard_term: string;
    confidence: number;
    severity: 'mild' | 'moderate' | 'severe';
    raw_evidence: string;
  }>;
  duration?: string;
  duration_confidence: number;
  treatment_phase_hints: string[];
  reasoning: string;
}

const SYMPTOM_SYSTEM_PROMPT = `你是一位专门帮助乳腺癌患者识别和管理治疗副作用的医学助手。

你的任务是从患者的自然语言描述中提取症状信息，并标准化为医学术语。

已知症状标准术语（严格使用这些术语，不要自创）:
- nausea_vomiting: 恶心呕吐
- decreased_appetite: 食欲下降
- fatigue: 疲劳/乏力
- pain: 疼痛（需标注部位）
- fever: 发热/发烧
- diarrhea: 腹泻
- rash: 皮疹/皮肤反应
- headache: 头痛/头晕
- shortness_of_breath: 呼吸困难/胸闷
- mouth_sore: 口腔溃疡/口腔疼痛
- bleeding: 出血/瘀斑
- numbness: 麻木/刺痛感
- swelling: 肿胀
- insomnia: 失眠/睡眠障碍
- mood_change: 情绪变化/焦虑/抑郁

严重程度定义:
- mild: 轻微，不影响日常生活
- moderate: 中等，部分影响日常生活
- severe: 严重，明显影响日常生活或需要医疗干预

重要原则:
1. 始终以患者安全为第一优先
2. 当症状描述模糊时，基于保守假设评估
3. 如果描述涉及危及生命的症状（呼吸困难、胸痛、严重出血），务必以最高置信度标记`;

function parseJSON<T>(text: string): T {
  // 尝试提取 JSON 代码块
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]) as T;
  }
  return JSON.parse(text) as T;
}

export async function extractSymptomsWithDashScope(
  client: OpenAI,
  userInput: string,
  context?: {
    treatment_phase?: string;
    treatment_type?: string;
    known_side_effects?: string[];
  },
  model: string = 'qwen3.6-plus',
  maxTokens: number = 1024
): Promise<DashScopeSymptomExtraction> {
  const userContext = context
    ? `患者上下文:\n- 治疗阶段: ${context.treatment_phase || '未知'}\n- 治疗类型: ${context.treatment_type || '未知'}\n- 已知副作用: ${context.known_side_effects?.join(', ') || '无'}`
    : '';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYMPTOM_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `从以下患者描述中提取症状:\n\n"${userInput}"\n\n${userContext}\n\n请以 JSON 格式返回，结构如下:\n{
  "symptoms": [{"standard_term": "xxx", "confidence": 0.9, "severity": "moderate", "raw_evidence": "..."}],
  "duration": "2天",
  "duration_confidence": 0.8,
  "treatment_phase_hints": ["化疗第二周期"],
  "reasoning": "推理过程..."
}`,
      },
    ],
    max_tokens: maxTokens,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || '';
  return parseJSON<DashScopeSymptomExtraction>(content);
}

// ============================================================
// 风险评估 - DashScope
// ============================================================

export interface DashScopeRiskAssessment {
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number; // 0-100
  confidence: number; // 0-1
  reasoning: string;
  triggered_rules: string[];
  rag_context_summary?: string;
}

export async function assessRiskWithDashScope(
  client: OpenAI,
  userInput: string,
  symptoms: Array<{ standard_term: string; severity: string; confidence: number }>,
  ruleResult: { risk_level: string; triggered_rules: string[] },
  ragContext: string,
  model: string = 'qwen3.6-plus',
  maxTokens: number = 1024
): Promise<DashScopeRiskAssessment> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是一位专门帮助乳腺癌患者评估治疗副作用风险的医学助手。

风险等级定义:
- high: 高风险——需要立即就医或联系医疗团队（危及生命或严重并发症风险）
- medium: 中风险——需要医疗团队关注，可能需要调整治疗方案
- low: 低风险——可在家中管理，持续观察

规则引擎结果仅供参考，最终判断需要综合考虑:
1. 症状的严重程度和持续时间
2. 患者的具体治疗阶段
3. 循证医学指南（CTCAE 标准）
4. 多个低风险症状的组合可能升级风险

重要原则:
- 宁可高估风险，不可漏诊高风险
- 如果描述模糊，保守假设
- 高风险症状（呼吸困难、胸痛、严重出血）必须判定为 high`,
      },
      {
        role: 'user',
        content: `患者自述: "${userInput}"

规则引擎结果:
- 风险等级: ${ruleResult.risk_level}
- 触发规则: ${ruleResult.triggered_rules.join(', ') || '无'}

提取的症状:
${symptoms.map((s) => `- ${s.standard_term} (严重程度: ${s.severity}, 置信度: ${s.confidence})`).join('\n')}

循证上下文:
${ragContext || '无额外上下文'}

请以 JSON 格式返回:
{
  "risk_level": "high|medium|low",
  "risk_score": 0-100,
  "confidence": 0-1,
  "reasoning": "综合推理...",
  "triggered_rules": ["规则ID"],
  "rag_context_summary": "RAG上下文摘要（可选）"
}`,
      },
    ],
    max_tokens: maxTokens,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || '';
  return parseJSON<DashScopeRiskAssessment>(content);
}

// ============================================================
// 建议生成 - DashScope
// ============================================================

export interface DashScopeAdvice {
  immediate_action: string;
  follow_up: string;
  warning_signs: string[];
  reasoning: string;
  references: Array<{ id: string; source: string }>;
}

export async function generateAdviceWithDashScope(
  client: OpenAI,
  riskLevel: string,
  riskScore: number,
  symptoms: Array<{ standard_term: string; severity: string }>,
  triggeredRules: string[],
  context?: {
    treatment_phase?: string;
    treatment_type?: string;
  },
  model: string = 'qwen3.6-plus',
  maxTokens: number = 1024
): Promise<DashScopeAdvice> {
  const contextInfo = context
    ? `患者正在接受 ${context.treatment_type || '未知'} 治疗，当前处于 ${context.treatment_phase || '未知'} 阶段。`
    : '';

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是一位专门帮助乳腺癌患者管理治疗副作用的医学助手。

你的职责是根据风险评估结果，生成清晰、可操作的建议。

建议要求:
1. 即时行动：1-2句，简洁明了，告知患者现在该做什么
2. 警告信号：3-5项，列出需要立即就医的危险信号
3. 后续建议：说明后续如何与医疗团队沟通
4. 语言风格：温暖、支持性，避免过度专业术语

重要原则:
- 即时行动必须与风险等级匹配
- 警告信号要具体、可观察（如"呕吐带血"而非"消化道问题"）
- 始终建议联系医疗团队`,
      },
      {
        role: 'user',
        content: `风险评估结果:
- 风险等级: ${riskLevel}
- 风险评分: ${riskScore}
- 触发规则: ${triggeredRules.join(', ') || '无'}
- 相关症状: ${symptoms.map((s) => `${s.standard_term}(${s.severity})`).join(', ')}

${contextInfo}

请以 JSON 格式返回:
{
  "immediate_action": "立即行动的描述",
  "follow_up": "后续建议",
  "warning_signs": ["危险信号1", "危险信号2", ...],
  "reasoning": "推理过程",
  "references": [{"id": "RULE-001", "source": "高风险规则库"}]
}`,
      },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || '';
  return parseJSON<DashScopeAdvice>(content);
}
