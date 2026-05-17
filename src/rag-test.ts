/**
 * RAG 知识库测试脚本
 * 使用真实 RAG 数据进行评估测试
 */

import { createRAGRetriever, ragRetrieveTool } from './rag/retriever.js';
import { createSymptomParser } from './tools/symptom-parser.js';
import { createRiskAssessor } from './tools/risk-assessor.js';
import { createAdviceGenerator } from './tools/advice-generator.js';
import type { Symptom, SymptomParserOutput, RiskAssessorOutput } from './types/index.js';

// 初始化工具
const ragRetriever = createRAGRetriever();
const symptomParser = createSymptomParser();
const riskAssessor = createRiskAssessor();
const adviceGenerator = createAdviceGenerator();

// 完整评估测试
async function testFullAssessment(input: string, description: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${description}`);
  console.log(`输入: "${input}"`);
  console.log('='.repeat(60));
  
  // 1. 症状解析
  const symptomResult = symptomParser.parse(input);
  console.log(`\n📋 症状解析:`);
  console.log(`   识别症状: ${symptomResult.symptoms.map(s => `${s.standard_term}(${s.severity})`).join(', ') || '无'}`);
  console.log(`   持续时间: ${symptomResult.duration || '未指定'}`);
  console.log(`   置信度: ${(symptomResult.confidence * 100).toFixed(0)}%`);
  
  // 2. RAG 检索
  let ragEntries: any[] = [];
  let ragRules: any[] = [];
  if (symptomResult.symptoms.length > 0) {
    const ragResult = await ragRetrieveTool(symptomResult.symptoms);
    ragEntries = ragResult.entries;
    ragRules = ragResult.matched_rules;
    console.log(`\n📚 RAG 检索:`);
    console.log(`   匹配知识库: ${ragEntries.map(e => e.symptom).join(', ') || '无'}`);
    console.log(`   匹配规则: ${ragRules.map(r => `${r.id}(${r.name})`).join(', ') || '无'}`);
  }
  
  // 3. 风险评估
  const riskResult = riskAssessor.assess(symptomResult, input);
  console.log(`\n⚠️ 风险评估:`);
  console.log(`   风险等级: ${riskResult.risk_level.toUpperCase()}`);
  console.log(`   风险分数: ${riskResult.risk_score}`);
  console.log(`   触发规则: ${riskResult.triggered_rules.map(r => `${r.id}(${r.name})`).join(', ') || '无'}`);
  
  // 4. 建议生成
  const adviceResult = adviceGenerator.generate(riskResult);
  console.log(`\n💡 建议生成:`);
  console.log(`   立即行动: ${adviceResult.immediate_action.substring(0, 50)}...`);
  console.log(`   需要联系团队: ${adviceResult.team_contact_required ? '是' : '否'}`);
  console.log(`   警告信号: ${adviceResult.warning_signs.join(', ')}`);
  
  return { symptomResult, riskResult, adviceResult, ragEntries, ragRules };
}

// 主测试
async function main() {
  console.log('🔬 SABA RAG 知识库测试');
  console.log('='.repeat(60));
  
  // 显示知识库内容
  console.log('\n📖 RAG 知识库内容:');
  const retriever = createRAGRetriever();
  const entries = retriever.getAllEntries();
  entries.forEach(entry => {
    console.log(`\n  【${entry.category}】${entry.symptom} (${entry.standard_term})`);
    console.log(`     关键词: ${entry.keywords.join(', ')}`);
    console.log(`     风险分级:`);
    console.log(`       高: ${entry.risk_criteria.high}`);
    console.log(`       中: ${entry.risk_criteria.medium}`);
    console.log(`       低: ${entry.risk_criteria.low}`);
  });
  
  // 显示规则索引
  console.log('\n\n🚨 规则索引 (来自 risk-assessor.ts):');
  console.log('   高风险规则 (HR-*):');
  const highRules = [
    { id: 'HR-001', name: '呼吸困难/胸痛', terms: '呼吸困难, 胸闷, 胸痛, 喘不上气' },
    { id: 'HR-002', name: '高热', terms: '发烧, 高烧, 发热' },
    { id: 'HR-003', name: '严重过敏', terms: '面部肿胀, 喉咙肿胀' },
    { id: 'HR-004', name: '腿部肿胀', terms: '腿部肿胀, 腿肿' },
    { id: 'HR-005', name: '神经症状', terms: '意识模糊, 剧烈头痛, 视力变化' },
    { id: 'HR-006', name: '消化道出血', terms: '呕血, 黑便, 严重腹痛' },
  ];
  highRules.forEach(r => console.log(`     ${r.id}: ${r.name} [${r.terms}]`));
  
  console.log('   中风险规则 (MR-*):');
  const mediumRules = [
    { id: 'MR-001', name: '症状持续无好转', threshold: '3天+' },
    { id: 'MR-002', name: '恶心呕吐影响进食', threshold: '2天+' },
    { id: 'MR-003', name: '口腔溃疡严重', threshold: '无' },
    { id: 'MR-004', name: '严重腹泻', threshold: '无' },
    { id: 'MR-005', name: '皮疹扩散', threshold: '无' },
    { id: 'MR-006', name: '血小板低迹象', threshold: '无' },
  ];
  mediumRules.forEach(r => console.log(`     ${r.id}: ${r.name} ${r.threshold ? `[持续${r.threshold}]` : ''}`));
  
  // 测试各种场景
  console.log('\n\n' + '🔬'.repeat(20));
  console.log('开始评估测试...\n');
  
  const testCases = [
    { input: '恶心想吐已经2天了，吃不下东西', desc: '恶心呕吐持续2天' },
    { input: '发烧3天了，身上还有瘀斑', desc: '骨髓抑制风险' },
    { input: '脸上和脖子上都有皮疹，有点痒', desc: '靶向治疗皮疹' },
    { input: '突然感觉胸闷，呼吸困难', desc: '高风险-呼吸困难' },
    { input: '发高烧了，38.5度', desc: '高风险-高热' },
    { input: '有点累，想睡觉', desc: '低风险-轻微疲劳' },
    { input: '头疼头晕1天了', desc: '中风险-头痛' },
    { input: '口腔溃疡，嘴里疼', desc: '中风险-口腔溃疡' },
    { input: '腹泻拉肚子2天', desc: '中风险-腹泻' },
    { input: '腿部有点肿胀', desc: '高风险-腿部肿胀' },
  ];
  
  const results = [];
  for (const tc of testCases) {
    const result = await testFullAssessment(tc.input, tc.desc);
    results.push({ ...tc, ...result });
  }
  
  // 输出 Q&A 格式总结
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 测试结果 Q&A 总结');
  console.log('═'.repeat(60));
  
  results.forEach((r, i) => {
    console.log(`\n【Q${i + 1}】输入"${r.input}"的评估结果是什么？`);
    console.log(`\n【A${i + 1}】`);
    console.log(`   风险等级: ${r.riskResult.risk_level.toUpperCase()} (${r.riskResult.risk_score}分)`);
    console.log(`   识别症状: ${r.symptomResult.symptoms.map(s => s.standard_term).join(', ') || '无'}`);
    console.log(`   触发规则: ${r.riskResult.triggered_rules.map(t => t.id).join(', ') || '无'}`);
    console.log(`   匹配知识库: ${r.ragEntries.map(e => e.symptom).join(', ') || '无'}`);
    console.log(`   建议: ${r.adviceResult.immediate_action}`);
    console.log(`   需要联系团队: ${r.adviceResult.team_contact_required ? '是' : '否'}`);
  });
}

main().catch(console.error);
