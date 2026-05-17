/**
 * SABA LLM 客户端
 * 基于 Anthropic Claude API 的推理能力
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SABA_CONFIG } from './env.js';

// 全局 SDK 实例
let _client: Anthropic | null = null;

/**
 * 初始化 Anthropic 客户端
 */
export function getAnthropicClient(config: SABA_CONFIG): Anthropic {
  if (!_client) {
    if (!config.anthropic_api_key) {
      throw new Error('ANTHROPIC_API_KEY is not configured. Please set your API key.');
    }
    const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
      apiKey: config.anthropic_api_key,
    };
    if (config.anthropic_base_url) {
      clientOptions.baseURL = config.anthropic_base_url;
    }
    _client = new Anthropic(clientOptions);
  }
  return _client;
}

/**
 * 重置客户端（用于切换配置或测试）
 */
export function resetClient(): void {
  _client = null;
}

// ============================================================
// 症状解析 - LLM 调用
// ============================================================

export interface LLMSymptomExtraction {
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

/**
 * 使用 LLM 提取症状
 * 适用于规则引擎无法处理的复杂/模糊输入
 */
export async function extractSymptomsWithLLM(
  client: Anthropic,
  userInput: string,
  context?: {
    treatment_phase?: string;
    treatment_type?: string;
    known_side_effects?: string[];
  },
  model: string = 'claude-sonnet-4-20250514',
  maxTokens: number = 1024
): Promise<LLMSymptomExtraction> {
  const systemPrompt = `你是一位专门帮助乳腺癌患者识别和管理治疗副作用的医学助手。

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

  const userContext = context
    ? `
患者上下文:
- 治疗阶段: ${context.treatment_phase || '未知'}
- 治疗类型: ${context.treatment_type || '未知'}
- 已知副作用: ${context.known_side_effects?.join(', ') || '无'}`
    : '';

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `请从以下患者描述中提取症状信息:

"${userInput}"
${userContext}

请以 JSON 格式返回结果，包含:
- symptoms: 识别到的症状列表，每项包含 standard_term, confidence(0-1), severity, raw_evidence
- duration: 症状持续时间（如"2天"），如未提及则为 undefined
- duration_confidence: 持续时间信息的置信度
- treatment_phase_hints: 从描述中推断的治疗相关信息
- reasoning: 你的分析推理过程（1-2句话）`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  // 解析 JSON 响应
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as LLMSymptomExtraction;
    } catch {
      // JSON 解析失败，返回原始文本
      return {
        symptoms: [],
        reasoning: text,
        duration_confidence: 0,
        treatment_phase_hints: [],
      };
    }
  }

  return {
    symptoms: [],
    reasoning: text,
    duration_confidence: 0,
    treatment_phase_hints: [],
  };
}

// ============================================================
// 风险评估 - LLM 调用
// ============================================================

export interface LLMRiskAssessment {
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number; // 0-100
  reasoning: string;
  triggered_rules: string[];
  immediate_action: string;
  warning_signs: string[];
  follow_up_suggestion: string;
  confidence: number; // 对这个评估结论的确信程度
}

/**
 * 使用 LLM 进行风险评估
 * 在规则引擎匹配后，作为第二层智能推理
 */
export async function assessRiskWithLLM(
  client: Anthropic,
  userInput: string,
  parsedSymptoms: Array<{ standard_term: string; confidence: number; severity: string }>,
  ruleMatches: string[],
  context?: {
    treatment_phase?: string;
    treatment_type?: string;
  },
  ragContext?: string,
  model: string = 'claude-sonnet-4-20250514',
  maxTokens: number = 1024
): Promise<LLMRiskAssessment> {
  const systemPrompt = `你是一位专注于乳腺癌患者副作用管理的临床决策支持 AI。

## 风险分级标准（含分数量化）

🔴 高风险 (high) → 分数量程: 71-100，必须立即就医:
- 呼吸困难、胸闷、喘息、气促（任何呼吸困难描述）
- 高热(>39°C)或持续发热不退（退烧药无效）→ **注意**：化疗后骨髓抑制期发热38-38.9°C通常为 MEDIUM，不是 HIGH
- 面部/喉咙肿胀（过敏反应）、嘴唇/舌头肿胀
- 输液/输注反应：脸红+心跳加速+喉咙发紧 → **已经是 HIGH**，即使护士立即停药也建议急诊评估
- 单侧腿部肿胀+疼痛（深静脉血栓 DVT 典型表现）
- 意识模糊、剧烈头痛、视力变化、言语不清
- 呕血、黑色粪便、严重持续腹痛
- **靶向/免疫治疗相关肺炎**：T-DXd、CDK4/6抑制剂、免疫治疗后出现呼吸困难+干咳+胸闷 → HIGH
- **免疫相关严重不良反应**：免疫治疗后出现呼吸困难、全身皮疹蔓延（超过50%体表面积）、腹泻带血

🟡 中风险 (medium) → 分数量程: 41-70，24小时内联系团队:
- 恶心呕吐"吃什么吐什么"/"喝水都困难"/"喝水都吐"/"快虚脱"（脱水风险）→ 即使不是高热，也是 MEDIUM
- 口腔溃疡严重："舌头烂了"/"吃东西像在割肉"/"无法进食" → MEDIUM（积极联系团队）
- 瘀斑/紫癜（皮肤小红点）+牙龈出血 → MEDIUM（血小板减少体征）
- 化疗后皮疹扩散（胳膊/脖子/全身）+特别痒 → MEDIUM（可能药物超敏）
- 腹泻>4次/天或"虚脱"/"快撑不住" → MEDIUM
- 腿部/手臂水肿按坑（淋巴水肿）→ MEDIUM
- 免疫治疗后全身疹子蔓延、越来越多 → MEDIUM（免疫相关皮疹）
- CDK4/6抑制剂治疗期间转氨酶升高→即使无明显症状也是 MEDIUM（需查血调整剂量）
- 内分泌治疗期间异常出血（他莫昔芬相关）→ MEDIUM
- 骨髓抑制期发热（化疗后7-14天，白细胞低时发热）：38度以上 → MEDIUM（**不是** HIGH，除非出现呼吸困难/意识障碍）

🟢 低风险 (low) → 分数量程: 0-40，可继续观察或对症处理:
- 轻微恶心，食欲略下降（不影响进食）
- 轻度疲劳/乏力，不影响日常生活（**注意**："累但能爬楼梯"/"躺下就不想起来"≠HIGH，除非合并呼吸困难/发热才是 HIGH）
- 局部轻微皮疹（面积小、无扩散）
- 轻微头痛（偶发）
- 手脚麻木/刺痛感（周围神经病变，已知副反应）
- 潮热出汗（内分泌治疗常见）
- 关节僵硬/酸痛（AI类药物常见）
- 睡眠不好、轻度焦虑
- 赫赛汀等靶向药已知轻度腹泻（≤4次/天，水样便，无脱水）→ LOW（可观察）

## 关键安全决策原则

1. **高风险优先（宁高勿低）**：患者描述中出现任何高风险关键词，立即返回 HIGH，不降级
2. **靶向/免疫治疗特殊关注**：T-DXd、CDK4/6抑制剂、免疫检查点抑制剂治疗期间出现呼吸道症状，优先考虑肺炎/免疫相关肺炎
3. **输液/过敏前兆识别**：脸红+心跳加速+喉咙发紧，即使没有明显肿胀，也可能是过敏性休克前兆，建议 HIGH
4. **治疗阶段判断**：化疗后1-7天（骨髓抑制期）出现发热，无论体温高低，中风险优先
5. **具体优先于模糊**：患者说"呼吸困难"即使只有轻微，也必须 HIGH；说"有点累"通常是 LOW

## 分数量化指南（严格执行）

| 分数范围 | 风险等级 | 含义 |
|---------|---------|------|
| 71-100 | HIGH | 立即就医，不能等待 |
| 41-70 | MEDIUM | 今天内联系团队 |
| 0-40 | LOW | 继续观察，对症处理 |

## 参考示例（评分时请严格遵守）

**示例1 - 紫癜+出血 = MEDIUM**
输入: "身上突然出现好多小红点，刷牙的时候牙龈也出血了"
分析: "小红点"=瘀点/紫癜（血小板减少体征）+牙龈出血 → MEDIUM，评分52
理由: 化疗后血小板减少导致的皮肤出血点+口腔出血，是骨髓抑制的明确信号，需24小时内验血评估
输出: {"risk_level":"medium","risk_score":52}

**示例2 - 输液脸红心跳喉咙紧 = HIGH**
输入: "输液的时候突然脸红心跳加速，喉咙有点发紧，护士马上把药停了"
分析: 脸红+心跳+喉咙紧 → HIGH，即使护士已停药，也需要急诊评估
理由: 这是典型的输液/过敏反应前兆，即使干预及时也需要排除进一步风险
输出: {"risk_level":"high","risk_score":85}

**示例3 - 免疫治疗后全身疹子 = MEDIUM**
输入: "打了免疫药后开始起疹子，全身都有，还很痒，越来越多"
分析: 免疫治疗背景+全身疹子+越来越多 → MEDIUM
理由: 免疫检查点抑制剂相关皮疹，遍布全身且加重，需评估是否irAE（免疫相关不良反应）
输出: {"risk_level":"medium","risk_score":55}

**示例4 - 化疗后单纯疲劳 = LOW**
输入: "化疗打完一周了还是觉得很累，爬个楼梯都喘，躺下就不想起来"
分析: 只有疲劳+乏力（无发热、无呼吸困难、无胸痛） → LOW
理由: 化疗后骨髓抑制期疲劳常见，单纯乏力不影响呼吸功能，"喘"在这里是疲劳导致而非呼吸道问题
输出: {"risk_level":"low","risk_score":30}

**示例5 - 免疫治疗转氨酶升高 = MEDIUM**
输入: "免疫治疗期间肝功能异常，转氨酶升高到两百多"
分析: 免疫治疗背景+ALT/AST 200+（>5倍ULN）→ MEDIUM
理由: CDK4/6抑制剂或免疫治疗可导致免疫相关肝炎（irAE），转氨酶>5倍需药物减量或暂停治疗，需24小时内评估
输出: {"risk_level":"medium","risk_score":60}

## 输出要求

返回 JSON 格式（可直接 JSON.parse 解析，不要包含任何 JSON 之外的内容）:
\`\`\`json
{
  "risk_level": "high|medium|low",
  "risk_score": 0-100,
  "reasoning": "判断理由（1-3句，解释为什么是这个等级）",
  "triggered_rules": ["触发的规则ID列表"],
  "immediate_action": "1-2句，立即行动",
  "warning_signs": ["危险信号1", "危险信号2"],
  "follow_up_suggestion": "后续建议",
  "confidence": 0.0-1.0
}
\`\`\``;

  const ragSection = ragContext ? `\n\n## 参考医学知识\n${ragContext}` : '';
  const rulesSection = ruleMatches.length > 0 ? `\n\n## 规则引擎已匹配的规则\n${ruleMatches.join('\n')}` : '';
  const symptomsSection = parsedSymptoms.length > 0
    ? `\n\n## 已识别的症状\n${parsedSymptoms.map(s => `- ${s.standard_term} (置信度: ${s.confidence}, 严重程度: ${s.severity})`).join('\n')}`
    : '\n\n## 已识别的症状\n无明确症状匹配';

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `请评估以下乳腺癌患者描述的风险等级:

患者描述: "${userInput}"
${symptomsSection}${rulesSection}${ragSection}
${context ? `\n治疗阶段: ${context.treatment_phase || '未知'}\n治疗类型: ${context.treatment_type || '未知'}` : ''}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as LLMRiskAssessment;
    } catch {
      return {
        risk_level: 'medium',
        risk_score: 50,
        reasoning: text.substring(0, 200),
        triggered_rules: [],
        immediate_action: '请联系您的医疗团队',
        warning_signs: [],
        follow_up_suggestion: '持续观察症状变化',
        confidence: 0.3,
      };
    }
  }

  return {
    risk_level: 'medium',
    risk_score: 50,
    reasoning: '无法解析 LLM 响应',
    triggered_rules: [],
    immediate_action: '请联系您的医疗团队',
    warning_signs: [],
    follow_up_suggestion: '持续观察症状变化',
    confidence: 0.1,
  };
}

// ============================================================
// 建议生成 - LLM 调用
// ============================================================

export interface LLMAdviceGeneration {
  immediate_action: string;
  follow_up_suggestion: string;
  warning_signs: string[];
  reasoning_chain: string[];
}

/**
 * 使用 LLM 生成个性化建议
 */
export async function generateAdviceWithLLM(
  client: Anthropic,
  userInput: string,
  riskLevel: 'high' | 'medium' | 'low',
  riskScore: number,
  triggeredRules: string[],
  symptoms: string[],
  context?: {
    treatment_phase?: string;
    treatment_type?: string;
  },
  model: string = 'claude-sonnet-4-20250514',
  maxTokens: number = 1024
): Promise<LLMAdviceGeneration> {
  const systemPrompt = `你是一位专注于乳腺癌患者副作用管理的医学建议助手。

你的任务是基于风险评估结果，生成清晰、可执行的建议。

## 建议原则

1. **具体性**: 建议必须具体可执行，不说空话
2. **人文关怀**: 语气温和但专业，给患者信心
3. **安全第一**: 高风险必须强调立即就医
4. **可理解性**: 避免过度专业术语，用患者能理解的语言

## 症状列表
${symptoms.join(', ') || '未明确识别'}

## 触发的规则
${triggeredRules.join(', ') || '无'}

## 输出要求

返回 JSON 格式，包含:
- immediate_action: 立即行动建议（1-2句，具体明确）
- follow_up_suggestion: 后续跟进建议（1-2句）
- warning_signs: 需要特别注意的危险信号列表（3-5项）
- reasoning_chain: 推理过程，每一步1句话

JSON 必须可以直接解析，不要输出其他内容。`;

  const treatmentInfo = context
    ? `\n患者正在接受 ${context.treatment_type || '未知'} 治疗，阶段: ${context.treatment_phase || '未知'}`
    : '';

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `患者描述: "${userInput}"${treatmentInfo}

风险等级: ${riskLevel.toUpperCase()} (${riskScore}/100)

请生成建议。`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as LLMAdviceGeneration;
    } catch {
      return {
        immediate_action: riskLevel === 'high'
          ? '请立即就医或拨打急救电话'
          : riskLevel === 'medium'
          ? '请今天联系您的医疗团队'
          : '请继续观察症状变化',
        follow_up_suggestion: '如有加重请及时就医',
        warning_signs: ['症状加重', '出现新的症状'],
        reasoning_chain: [text.substring(0, 100)],
      };
    }
  }

  return {
    immediate_action: '请联系您的医疗团队',
    follow_up_suggestion: '持续观察',
    warning_signs: [],
    reasoning_chain: [],
  };
}
