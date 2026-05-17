/**
 * SABA 批量测试脚本
 * 从真实乳腺癌患者症状数据构建测试集
 * 评估 RAG 召回和 LLM 打分的可解释性
 *
 * 运行: DASHSCOPE_API_KEY=xxx LLM_PROVIDER=dashscope node test-cases.ts
 */

import { Saba } from './index.js';

// ============================================================
// 真实感测试集（50 cases，按场景分组）
// ============================================================

interface TestCase {
  id: string;
  category: string;
  input: string;
  context?: {
    treatment_phase?: string;
    treatment_type?: string;
    treatment_day?: number;
  };
  expected_risk: 'high' | 'medium' | 'low';
  expected_keywords: string[];
  rag_expect: string[]; // 期望召回的知识库关键词
}

const TEST_CASES: TestCase[] = [
  // ===== 化疗相关（化疗后常见副作用，真实描述风格） =====
  // Group A: 消化道反应
  { id: 'C-A01', category: '化疗-消化道', input: '化疗完第三天开始恶心想吐，吃什么吐什么，喝水都困难，整个人很虚', context: { treatment_phase: '化疗后', treatment_type: 'AC-T', treatment_day: 3 }, expected_risk: 'medium', expected_keywords: ['恶心呕吐', '食欲下降'], rag_expect: ['nausea_vomiting', 'chemotherapy_side_effects'] },
  { id: 'C-A02', category: '化疗-消化道', input: '打完化疗第五天开始拉肚子，一天跑了七八趟厕所，人都快虚脱了', context: { treatment_phase: '化疗后', treatment_type: 'TC', treatment_day: 5 }, expected_risk: 'medium', expected_keywords: ['腹泻'], rag_expect: ['diarrhea', 'chemotherapy_side_effects'] },
  { id: 'C-A03', category: '化疗-消化道', input: '嘴里全是口腔溃疡，舌头也烂了，吃东西像在割肉，太痛了', context: { treatment_phase: '化疗期间', treatment_type: 'AC-T', treatment_day: 8 }, expected_risk: 'medium', expected_keywords: ['口腔溃疡'], rag_expect: ['mouth_sore', 'chemotherapy_side_effects'] },
  { id: 'C-A04', category: '化疗-消化道', input: '最近几天胃口很差，看见什么都不想吃，强制自己吃点也会恶心', context: { treatment_phase: '化疗后', treatment_type: 'AC', treatment_day: 4 }, expected_risk: 'low', expected_keywords: ['食欲下降'], rag_expect: ['decreased_appetite'] },
  { id: 'C-A05', category: '化疗-消化道', input: '便秘好几天了，肚子胀得很难受，想拉拉不出来', context: { treatment_phase: '化疗后', treatment_type: 'AC-T', treatment_day: 6 }, expected_risk: 'low', expected_keywords: ['便秘', '腹胀'], rag_expect: ['chemotherapy_side_effects'] },

  // Group B: 骨髓抑制相关
  { id: 'C-B01', category: '化疗-骨髓抑制', input: '化疗后一周开始发烧，38度5，整个人没力气，嘴巴有点溃疡', context: { treatment_phase: '化疗后', treatment_type: 'TC', treatment_day: 10 }, expected_risk: 'medium', expected_keywords: ['发热', '口腔溃疡'], rag_expect: ['fever', 'neutropenia', 'chemotherapy_side_effects'] },
  { id: 'C-B02', category: '化疗-骨髓抑制', input: '身上突然出现好多小红点，刷牙的时候牙龈也出血了，这是怎么回事', context: { treatment_phase: '化疗后', treatment_type: 'AC-T', treatment_day: 9 }, expected_risk: 'medium', expected_keywords: ['出血', '皮疹'], rag_expect: ['bleeding', 'thrombocytopenia', 'chemotherapy_side_effects'] },
  { id: 'C-B03', category: '化疗-骨髓抑制', input: '化疗打完一周了还是觉得很累，爬个楼梯都喘，躺下就不想起来', context: { treatment_phase: '化疗后', treatment_type: 'AC', treatment_day: 7 }, expected_risk: 'low', expected_keywords: ['疲劳', '呼吸困难'], rag_expect: ['fatigue', 'anemia'] },
  { id: 'C-B04', category: '化疗-骨髓抑制', input: '白细胞检查结果很低，医生说要打升白针，但这几天我一直反复发烧', context: { treatment_phase: '化疗后', treatment_type: 'TC', treatment_day: 12 }, expected_risk: 'medium', expected_keywords: ['发热'], rag_expect: ['neutropenia', 'fever'] },
  { id: 'C-B05', category: '化疗-骨髓抑制', input: '腿上出现一大块紫癜，手臂上也有，不知道是不是血小板低', context: { treatment_phase: '化疗后', treatment_type: 'AC', treatment_day: 11 }, expected_risk: 'medium', expected_keywords: ['出血', '瘀斑'], rag_expect: ['bleeding', 'thrombocytopenia'] },

  // Group C: 神经毒性
  { id: 'C-C01', category: '化疗-神经毒性', input: '手指尖一直发麻，拿东西都没感觉，脚趾头也是，走路像踩棉花', context: { treatment_phase: '化疗期间', treatment_type: 'AC-T', treatment_day: 14 }, expected_risk: 'low', expected_keywords: ['麻木', '感觉异常'], rag_expect: ['peripheral_neuropathy', 'numbness'] },
  { id: 'C-C02', category: '化疗-神经毒性', input: '化疗后手指脚趾发麻越来越严重了，有时候拿筷子都拿不稳', context: { treatment_phase: '化疗期间', treatment_type: 'TC', treatment_day: 20 }, expected_risk: 'low', expected_keywords: ['麻木', '疼痛'], rag_expect: ['peripheral_neuropathy'] },
  { id: 'C-C03', category: '化疗-神经毒性', input: '手和脚的麻木感影响了睡眠，有时候半夜会被麻醒', context: { treatment_phase: '化疗期间', treatment_type: 'AC-T', treatment_day: 18 }, expected_risk: 'low', expected_keywords: ['麻木', '失眠'], rag_expect: ['peripheral_neuropathy', 'insomnia'] },

  // Group D: 过敏/输液反应
  { id: 'C-D01', category: '化疗-过敏反应', input: '输液的时候突然脸红心跳加速，喉咙有点发紧，护士马上把药停了', context: { treatment_phase: '化疗输液中', treatment_type: '紫杉醇', treatment_day: 1 }, expected_risk: 'high', expected_keywords: ['过敏'], rag_expect: ['allergic_reaction', 'hypersensitivity'] },
  { id: 'C-D02', category: '化疗-过敏反应', input: '打完化疗脸上脖子上起了很多红疹子，特别痒，胳膊上也有', context: { treatment_phase: '化疗后', treatment_type: 'AC-T', treatment_day: 2 }, expected_risk: 'medium', expected_keywords: ['皮疹'], rag_expect: ['rash', 'hypersensitivity'] },

  // Group E: 其他化疗副作用
  { id: 'C-E01', category: '化疗-全身反应', input: '化疗后整个人昏昏沉沉的，注意力不集中，反应也变慢了', context: { treatment_phase: '化疗后', treatment_type: 'AC', treatment_day: 4 }, expected_risk: 'low', expected_keywords: ['疲劳', '认知障碍'], rag_expect: ['fatigue', 'chemobrain'] },
  { id: 'C-E02', category: '化疗-全身反应', input: '化疗期间体重掉了七八斤，衣服都大了一圈，胃口也不行', context: { treatment_phase: '化疗期间', treatment_type: 'AC-T', treatment_day: 21 }, expected_risk: 'low', expected_keywords: ['体重下降', '食欲下降'], rag_expect: ['decreased_appetite', 'weight_loss'] },
  { id: 'C-E03', category: '化疗-全身反应', input: '头发掉得很厉害，一抓一大把，枕头上一堆，都快秃了', context: { treatment_phase: '化疗期间', treatment_type: 'AC', treatment_day: 15 }, expected_risk: 'low', expected_keywords: ['脱发'], rag_expect: ['alopecia'] },
  { id: 'C-E04', category: '化疗-全身反应', input: '晚上睡不着觉，化疗后就开始失眠，好不容易睡着了也容易醒', context: { treatment_phase: '化疗后', treatment_type: 'TC', treatment_day: 8 }, expected_risk: 'low', expected_keywords: ['失眠', '焦虑'], rag_expect: ['insomnia', 'mood_change'] },
  { id: 'C-E05', category: '化疗-全身反应', input: '情绪很低落，对什么都提不起兴趣，有时候还会无缘无故想哭', context: { treatment_phase: '化疗期间', treatment_type: 'AC-T', treatment_day: 16 }, expected_risk: 'low', expected_keywords: ['情绪变化', '抑郁'], rag_expect: ['mood_change', 'fatigue'] },

  // ===== 内分泌治疗相关 =====
  // Group F: 内分泌治疗副作用
  { id: 'E-F01', category: '内分泌治疗', input: '吃内分泌药三个月了，最近总是潮热出汗，一阵一阵的，晚上更明显', context: { treatment_phase: '内分泌治疗中', treatment_type: '他莫昔芬', treatment_day: 90 }, expected_risk: 'low', expected_keywords: ['潮热', '出汗'], rag_expect: ['hot_flash', 'endocrine_therapy_side_effects'] },
  { id: 'E-F02', category: '内分泌治疗', input: '吃了内分泌药之后关节很僵硬，特别是早上起来动都动不了，手指关节也疼', context: { treatment_phase: '内分泌治疗中', treatment_type: '来曲唑', treatment_day: 60 }, expected_risk: 'low', expected_keywords: ['关节疼痛', '僵硬'], rag_expect: ['arthralgia', 'endocrine_therapy_side_effects'] },
  { id: 'E-F03', category: '内分泌治疗', input: '吃他莫昔芬期间白带很多，有时候会有点血，不知道是不是正常', context: { treatment_phase: '内分泌治疗中', treatment_type: '他莫昔芬', treatment_day: 45 }, expected_risk: 'medium', expected_keywords: ['出血', '白带异常'], rag_expect: ['bleeding', 'tamoxifen_side_effects'] },
  { id: 'E-F04', category: '内分泌治疗', input: '吃了内分泌药后性欲明显下降，阴道也比较干涩，性交时会痛', context: { treatment_phase: '内分泌治疗中', treatment_type: '来曲唑', treatment_day: 120 }, expected_risk: 'low', expected_keywords: ['性功能障碍', '阴道干涩'], rag_expect: ['vaginal_dryness', 'endocrine_therapy_side_effects'] },
  { id: 'E-F05', category: '内分泌治疗', input: '吃内分泌药之后手臂有点肿，腿也肿，脚踝按下去有坑', context: { treatment_phase: '内分泌治疗中', treatment_type: '他莫昔芬', treatment_day: 75 }, expected_risk: 'medium', expected_keywords: ['肿胀', '水肿'], rag_expect: ['swelling', 'lymphedema'] },

  // ===== 靶向治疗相关 =====
  // Group G: 靶向治疗副作用
  { id: 'T-G01', category: '靶向治疗', input: '打赫赛汀第三次后开始腹泻，一天四五次，水样便，肚子咕噜咕噜叫', context: { treatment_phase: '靶向治疗中', treatment_type: '曲妥珠单抗', treatment_day: 21 }, expected_risk: 'low', expected_keywords: ['腹泻'], rag_expect: ['diarrhea', 'targeted_therapy_side_effects'] },
  { id: 'T-G02', category: '靶向治疗', input: '服用CDK4/6抑制剂后肝功能指标升高，转氨酶高了一倍多', context: { treatment_phase: '靶向治疗中', treatment_type: '哌柏西利', treatment_day: 28 }, expected_risk: 'medium', expected_keywords: ['肝功能异常'], rag_expect: ['hepatotoxicity', 'targeted_therapy_side_effects'] },
  { id: 'T-G03', category: '靶向治疗', input: '打了靶向药之后皮疹很严重，脸上脖子上都有，红红的还脱皮', context: { treatment_phase: '靶向治疗中', treatment_type: '帕妥珠单抗', treatment_day: 14 }, expected_risk: 'low', expected_keywords: ['皮疹'], rag_expect: ['rash', 'acneiform_eruption', 'targeted_therapy_side_effects'] },
  { id: 'T-G04', category: '靶向治疗', input: '吃靶向药期间一直很疲惫，白细胞也有点低，打了升白针', context: { treatment_phase: '靶向治疗中', treatment_type: '阿贝西利', treatment_day: 35 }, expected_risk: 'low', expected_keywords: ['疲劳', '骨髓抑制'], rag_expect: ['fatigue', 'neutropenia'] },
  { id: 'T-G05', category: '靶向治疗', input: '服用T-DXd后出现了间质性肺炎，呼吸有点困难，干咳无痰', context: { treatment_phase: '靶向治疗中', treatment_type: 'T-DXd', treatment_day: 42 }, expected_risk: 'high', expected_keywords: ['呼吸困难', '肺炎'], rag_expect: ['pneumonitis', 'ILD', 'targeted_therapy_side_effects'] },

  // ===== 放疗相关 =====
  // Group H: 放疗副作用
  { id: 'R-H01', category: '放疗', input: '放疗做了十次，皮肤开始发红发黑，像晒伤一样，还有点刺痛', context: { treatment_phase: '放疗中', treatment_type: '乳房放疗', treatment_day: 10 }, expected_risk: 'low', expected_keywords: ['皮疹', '皮肤反应'], rag_expect: ['radiation_dermatitis', 'radiation_side_effects'] },
  { id: 'R-H02', category: '放疗', input: '放疗后喉咙特别疼，吃东西吞不下去，喝水都痛，像有东西卡住一样', context: { treatment_phase: '放疗中', treatment_type: '锁骨区放疗', treatment_day: 15 }, expected_risk: 'low', expected_keywords: ['口腔溃疡', '吞咽困难'], rag_expect: ['radiation_mucositis', 'radiation_side_effects'] },
  { id: 'R-H03', category: '放疗', input: '放疗期间感到非常疲惫，每天只想躺着，什么都不想做', context: { treatment_phase: '放疗中', treatment_type: '乳房放疗', treatment_day: 12 }, expected_risk: 'low', expected_keywords: ['疲劳'], rag_expect: ['fatigue', 'radiation_side_effects'] },
  { id: 'R-H04', category: '放疗', input: '放疗后手臂开始肿起来了，整个胳膊都比另一边粗，是淋巴水肿吗', context: { treatment_phase: '放疗后', treatment_type: '腋窝放疗', treatment_day: 30 }, expected_risk: 'medium', expected_keywords: ['肿胀', '水肿'], rag_expect: ['lymphedema', 'radiation_side_effects'] },
  { id: 'R-H05', category: '放疗', input: '胸部放疗后出现放射性肺炎，低烧咳嗽，呼吸有点急促', context: { treatment_phase: '放疗后', treatment_type: '胸部放疗', treatment_day: 45 }, expected_risk: 'high', expected_keywords: ['肺炎', '呼吸困难'], rag_expect: ['radiation_pneumonitis', 'ILD'] },

  // ===== 免疫治疗相关 =====
  // Group I: 免疫治疗副作用
  { id: 'I-I01', category: '免疫治疗', input: '打了免疫药后开始起疹子，全身都有，还很痒，越来越多', context: { treatment_phase: '免疫治疗中', treatment_type: '帕博利珠单抗', treatment_day: 14 }, expected_risk: 'medium', expected_keywords: ['皮疹'], rag_expect: ['immune_related_rash', 'immunotherapy_side_effects'] },
  { id: 'I-I02', category: '免疫治疗', input: '免疫治疗后出现免疫性肺炎，呼吸困难，干咳，胸闷', context: { treatment_phase: '免疫治疗中', treatment_type: '阿替利珠单抗', treatment_day: 28 }, expected_risk: 'high', expected_keywords: ['肺炎', '呼吸困难'], rag_expect: ['immune_related_pneumonitis', 'ILD'] },
  { id: 'I-I03', category: '免疫治疗', input: '免疫治疗期间肝功能异常，转氨酶升高到两百多', context: { treatment_phase: '免疫治疗中', treatment_type: '帕博利珠单抗', treatment_day: 21 }, expected_risk: 'medium', expected_keywords: ['肝功能异常'], rag_expect: ['immune_related_hepatitis', 'hepatotoxicity'] },
  { id: 'I-I04', category: '免疫治疗', input: '免疫治疗后甲减了，tsh很高，人很疲惫，浮肿，怕冷', context: { treatment_phase: '免疫治疗后', treatment_type: '帕博利珠单抗', treatment_day: 56 }, expected_risk: 'low', expected_keywords: ['甲状腺功能减退', '疲劳'], rag_expect: ['thyroid_dysfunction', 'hypothyroidism'] },
  { id: 'I-I05', category: '免疫治疗', input: '免疫治疗后出现结肠炎，腹泻带血，腹痛，发烧', context: { treatment_phase: '免疫治疗中', treatment_type: '阿替利珠单抗', treatment_day: 18 }, expected_risk: 'high', expected_keywords: ['腹泻', '出血'], rag_expect: ['immune_related_colitis', 'diarrhea'] },

  // ===== 高风险边界 case =====
  // Group J: 高风险边界场景
  { id: 'U-J01', category: '高风险边界', input: '突然胸闷喘不上气，感觉喉咙被什么东西堵住了', context: { treatment_phase: '化疗后', treatment_type: 'AC-T', treatment_day: 5 }, expected_risk: 'high', expected_keywords: ['呼吸困难', '胸闷'], rag_expect: ['HR-001', 'dyspnea'] },
  { id: 'U-J02', category: '高风险边界', input: '发烧到40度，浑身上下都在发抖，意识都有点模糊了', context: { treatment_phase: '化疗后', treatment_type: 'TC', treatment_day: 10 }, expected_risk: 'high', expected_keywords: ['发热', '意识障碍'], rag_expect: ['HR-002', 'febrile_neutropenia'] },
  { id: 'U-J03', category: '高风险边界', input: '腿部突然肿得厉害，比另一边粗了很多，不疼但很紧张', context: { treatment_phase: '化疗后', treatment_type: 'AC', treatment_day: 8 }, expected_risk: 'high', expected_keywords: ['肿胀', '水肿'], rag_expect: ['HR-004', 'DVT', 'lymphedema'] },
  { id: 'U-J04', category: '高风险边界', input: '呕血了，吐出来的东西是红的，肚子也剧痛', context: { treatment_phase: '化疗期间', treatment_type: 'AC-T', treatment_day: 6 }, expected_risk: 'high', expected_keywords: ['出血', '呕血'], rag_expect: ['HR-006', 'GI_bleeding'] },
  { id: 'U-J05', category: '高风险边界', input: '头痛欲裂，像爆炸一样，还伴有恶心呕吐和视力模糊', context: { treatment_phase: '化疗后', treatment_type: '靶向治疗', treatment_day: 30 }, expected_risk: 'high', expected_keywords: ['头痛', '神经系统'], rag_expect: ['HR-005', 'neurological'] },
  { id: 'U-J06', category: '高风险边界', input: '口腔里突然肿起来，舌头也大了，喉咙发紧说不了话', context: { treatment_phase: '化疗输液中', treatment_type: '紫杉醇', treatment_day: 1 }, expected_risk: 'high', expected_keywords: ['过敏', '肿胀'], rag_expect: ['HR-003', 'anaphylaxis'] },

  // ===== 低风险边界 =====
  // Group K: 低风险边界
  { id: 'N-K01', category: '低风险边界', input: '就是有点累，没什么力气，其他都还好', context: { treatment_phase: '化疗后', treatment_type: 'AC', treatment_day: 5 }, expected_risk: 'low', expected_keywords: ['疲劳'], rag_expect: ['fatigue'] },
  { id: 'N-K02', category: '低风险边界', input: '最近睡眠不太好，老是半夜醒来，不知道是不是太焦虑了', context: { treatment_phase: '内分泌治疗中', treatment_type: '他莫昔芬', treatment_day: 30 }, expected_risk: 'low', expected_keywords: ['失眠', '焦虑'], rag_expect: ['insomnia', 'mood_change'] },
  { id: 'N-K03', category: '低风险边界', input: '手有点干，起皮，不知道是不是药物反应', context: { treatment_phase: '靶向治疗中', treatment_type: '曲妥珠单抗', treatment_day: 7 }, expected_risk: 'low', expected_keywords: ['皮肤干燥'], rag_expect: ['skin_dryness'] },
  { id: 'N-K04', category: '低风险边界', input: '感觉吃东西嘴巴有点金属味，其他没什么不舒服', context: { treatment_phase: '化疗后', treatment_type: 'AC-T', treatment_day: 4 }, expected_risk: 'low', expected_keywords: ['味觉改变'], rag_expect: ['dysgeusia'] },
  { id: 'N-K05', category: '低风险边界', input: '指甲有点变色，变脆了，轻轻磕一下就断了', context: { treatment_phase: '化疗期间', treatment_type: 'TC', treatment_day: 25 }, expected_risk: 'low', expected_keywords: ['指甲变化'], rag_expect: ['nail_changes'] },
];

// ============================================================
// 评估函数
// ============================================================

interface EvaluationResult {
  case: TestCase;
  actual: {
    risk_level: string;
    risk_score: number;
    triggered_rules: string[];
    reasoning_chain: string[];
    rag_sources: string[];
    model_version: string;
    processing_time_ms: number;
  };
  eval: {
    risk_correct: boolean;
    rag_recall: string[]; // RAG 实际召回的关键词
    rag_quality: 'good' | 'partial' | 'miss';
    explainability_score: number; // 0-10
    explainability_notes: string;
  };
}

async function runEvaluation() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   SABA 批量评估 - RAG召回 & LLM可解释性测试         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`配置: provider=${Saba.config.llm_provider} model=${Saba.config.llm_provider === 'dashscope' ? Saba.config.dashscope_model : Saba.config.anthropic_model}\n`);

  const results: EvaluationResult[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/50] ${tc.id} ${tc.category} ... `);

    try {
      const result = await Saba.executive.execute({
        user_id: 'eval-user',
        input: tc.input,
        context: tc.context,
      });

      // 评估 RAG 召回
      const ragSources = result.evidence?.map((e) => e.source).filter(Boolean) as string[] || [];
      const ragRecall = ragSources.length > 0 ? ragSources : [];
      const ragExpectedHits = tc.rag_expect.filter(kw =>
        ragRecall.some(r => r.toLowerCase().includes(kw.toLowerCase()))
      );
      const ragQuality = ragExpectedHits.length === tc.rag_expect.length ? 'good'
        : ragExpectedHits.length > 0 ? 'partial' : 'miss';

      // 评估可解释性
      const reasoningText = (result.reasoning || '').replace(/\s+/g, '');
      const hasReasoning = reasoningText.length > 20;
      const hasWarningSigns = (result.warning_signs || []).length > 0;
      const hasAction = !!result.immediate_action && result.immediate_action.length > 10;
      const explainabilityScore = (hasReasoning ? 3 : 0) + (hasWarningSigns ? 3 : 0) + (hasAction ? 4 : 0);

      const explainabilityNotes = [
        hasReasoning ? `✓ 推理链清晰 (${reasoningText.length}字)` : '✗ 推理链缺失或过短',
        hasWarningSigns ? `✓ 警告信号完整 (${(result.warning_signs || []).length}项)` : '△ 警告信号缺失',
        hasAction ? `✓ 即时行动明确` : '✗ 即时行动缺失',
        ragQuality === 'good' ? `✓ RAG召回良好 (命中:${ragExpectedHits.join(',')})` :
        ragQuality === 'partial' ? `△ RAG部分召回 (命中:${ragExpectedHits.join(',')})` :
        `✗ RAG未命中`,
      ].join(' | ');

      const riskCorrect = result.risk_level === tc.expected_risk;

      results.push({
        case: tc,
        actual: {
          risk_level: result.risk_level,
          risk_score: result.risk_score,
          triggered_rules: result.triggered_rules?.map(r => r.id) || [],
          reasoning_chain: result.reasoning?.split('；').filter(Boolean) || [],
          rag_sources: ragSources,
          model_version: result.metadata?.model_version || 'unknown',
          processing_time_ms: result.metadata?.processing_time_ms || 0,
        },
        eval: {
          risk_correct: riskCorrect,
          rag_recall: ragExpectedHits,
          rag_quality: ragQuality,
          explainability_score: explainabilityScore,
          explainability_notes: explainabilityNotes,
        },
      });

      const status = riskCorrect ? '✅' : '❌';
      console.log(`${status} ${result.risk_level.toUpperCase()}(${result.risk_score}) [${result.metadata?.processing_time_ms || 0}ms]`);

    } catch (err) {
      console.log(`❌ ERROR: ${err}`);
    }
  }

  // ============================================================
  // 输出 QA 对（10个一批）
  // ============================================================
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                   QA 对输出（每批10条）                   ');
  console.log('═══════════════════════════════════════════════════════════');

  for (let batch = 0; batch < 5; batch++) {
    const start = batch * 10;
    const end = start + 10;
    const batchResults = results.slice(start, end);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(` 批次 ${batch + 1}（Case #${start + 1} - #${end}）`);
    console.log(`${'─'.repeat(60)}`);

    for (const r of batchResults) {
      const tc = r.case;
      const ac = r.actual;

      console.log(`\n【Q】${tc.input}`);
      console.log(`    背景: ${tc.context?.treatment_type || '未知'} | ${tc.context?.treatment_phase || '未知'} | 治疗第${tc.context?.treatment_day || '?'}天`);
      console.log(`\n【A - 评估结果】`);
      console.log(`    风险等级: ${ac.risk_level.toUpperCase()}（期望: ${tc.expected_risk.toUpperCase()}）${r.eval.risk_correct ? '✅' : '❌'}`);
      console.log(`    风险分数: ${ac.risk_score}/100`);
      console.log(`    触发规则: ${ac.triggered_rules.join(', ') || '无'}`);
      console.log(`    即时行动: ${ac.reasoning_chain[0] || '无'}`);
      if (ac.rag_sources.length > 0) {
        console.log(`    RAG召回: ${ac.rag_sources.join(', ')}`);
      }
      console.log(`    警告信号: ${r.case.category.includes('高风险') || ac.risk_level === 'high' ? (r.case.id.startsWith('U-J') ? '⚠️ 高危场景' : '—') : '—'}`);

      console.log(`\n【A - 可解释性评估】`);
      console.log(`    可解释性得分: ${r.eval.explainability_score}/10`);
      console.log(`    ${r.eval.explainability_notes}`);
    }
  }

  // ============================================================
  // 汇总统计
  // ============================================================
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      汇总统计                           ');
  console.log('═══════════════════════════════════════════════════════════');

  const riskCorrect = results.filter(r => r.eval.risk_correct).length;
  const ragGood = results.filter(r => r.eval.rag_quality === 'good').length;
  const ragPartial = results.filter(r => r.eval.rag_quality === 'partial').length;
  const ragMiss = results.filter(r => r.eval.rag_quality === 'miss').length;
  const avgExplScore = results.reduce((s, r) => s + r.eval.explainability_score, 0) / results.length;
  const avgTime = results.reduce((s, r) => s + r.actual.processing_time_ms, 0) / results.length;

  // 按风险等级统计准确率
  const byLevel = { high: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, low: { correct: 0, total: 0 } };
  for (const r of results) {
    const lvl = r.case.expected_risk;
    byLevel[lvl].total++;
    if (r.eval.risk_correct) byLevel[lvl].correct++;
  }

  // 按场景类别统计
  const categories = [...new Set(results.map(r => r.case.category))];
  const byCategory: Record<string, { correct: number; total: number }> = {};
  for (const cat of categories) {
    const catResults = results.filter(r => r.case.category === cat);
    byCategory[cat] = { correct: catResults.filter(r => r.eval.risk_correct).length, total: catResults.length };
  }

  console.log(`\n总准确率: ${riskCorrect}/50 (${(riskCorrect / 50 * 100).toFixed(1)}%)`);
  console.log(`  ├─ High风险:  ${byLevel.high.correct}/${byLevel.high.total} (${byLevel.high.total > 0 ? (byLevel.high.correct / byLevel.high.total * 100).toFixed(0) : 0}%)`);
  console.log(`  ├─ Medium风险: ${byLevel.medium.correct}/${byLevel.medium.total} (${byLevel.medium.total > 0 ? (byLevel.medium.correct / byLevel.medium.total * 100).toFixed(0) : 0}%)`);
  console.log(`  └─ Low风险:   ${byLevel.low.correct}/${byLevel.low.total} (${byLevel.low.total > 0 ? (byLevel.low.correct / byLevel.low.total * 100).toFixed(0) : 0}%)`);

  console.log(`\nRAG召回质量:`);
  console.log(`  ├─ 良好 (good):    ${ragGood}/50`);
  console.log(`  ├─ 部分 (partial): ${ragPartial}/50`);
  console.log(`  └─ 未命中 (miss):  ${ragMiss}/50`);

  console.log(`\nLLM可解释性: 平均 ${avgExplScore.toFixed(1)}/10`);
  console.log(`平均响应时间: ${avgTime.toFixed(0)}ms`);

  console.log(`\n按场景类别准确率:`);
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = (stats.correct / stats.total * 100).toFixed(0);
    console.log(`  ${cat.padEnd(16)} ${stats.correct}/${stats.total} (${pct}%)`);
  }

  // 错误案例
  const errors = results.filter(r => !r.eval.risk_correct);
  if (errors.length > 0) {
    console.log(`\n错误案例分析 (${errors.length}条):`);
    for (const e of errors) {
      console.log(`  ${e.case.id} | 输入: "${e.case.input.slice(0, 30)}..." | 期望: ${e.case.expected_risk} 实际: ${e.actual.risk_level}`);
    }
  }
}

runEvaluation().catch(console.error);
