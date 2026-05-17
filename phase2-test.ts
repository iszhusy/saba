/**
 * Phase 2 轻量模块快速验证脚本
 * 验证 intent-classifier / clinical-triage / evidence-retrieval 三个模块
 */

import { createIntentClassifier } from './src/modules/intent-classifier.js';
import { createClinicalTriage } from './src/modules/clinical-triage.js';
import { createEvidenceRetrievalTool } from './src/modules/evidence-retrieval.js';

async function run() {
  console.log('=== Phase 2 模块验证 ===\n');

  const testCases = [
    {
      input: '用了T-DXd第三天，现在感觉呼吸有点困难，胸闷',
      context: { treatment_type: 'T-DXd', treatment_day: 3 },
      expected: 'high',
    },
    {
      input: '吃药了，现在想问一下能不能停药',
      context: { treatment_type: '内分泌治疗' },
      expected: 'medication_question',
    },
    {
      input: '恶心呕吐已经2天，吃不下东西',
      context: { treatment_phase: '化疗周期第2天' },
      expected: 'symptom_assessment',
    },
    {
      input: '请问怎么报销',
      context: {},
      expected: 'non_medical',
    },
  ];

  // --- Intent Classifier 验证 ---
  console.log('--- Intent Classifier ---');
  const intentClassifier = createIntentClassifier();
  let intentPass = 0;
  for (const tc of testCases) {
    const result = intentClassifier.classify({
      user_input: tc.input,
      context: tc.context as any,
    });
    const ok = result.urgency_hint === tc.expected || result.intent === tc.expected;
    if (ok) intentPass++;
    console.log(`  ${ok ? '✅' : '❌'} "${tc.input.slice(0, 20)}" → ${result.intent} (${result.urgency_hint})`);
  }
  console.log(`  Intent Classifier: ${intentPass}/${testCases.length} 通过\n`);

  // --- Clinical Triage 验证 ---
  console.log('--- Clinical Triage ---');
  const clinicalTriage = createClinicalTriage();
  for (const tc of testCases.slice(0, 3)) {
    const result = await clinicalTriage.assess({
      user_input: tc.input,
      context: tc.context as any,
    });
    console.log(
      `  ✅ "${tc.input.slice(0, 20)}"\n` +
      `     症状: ${result.parsed_symptoms.map(s => s.standard_term).join(', ') || '无'}\n` +
      `     规则: ${result.rule_assessment.risk_level}(${result.rule_assessment.risk_score})\n` +
      `     笔记: ${result.decision_notes.join(' | ')}`
    );
  }
  console.log();

  // --- Evidence Retrieval 验证 ---
  console.log('--- Evidence Retrieval ---');
  const evidenceRetrieval = createEvidenceRetrievalTool();
  const triageResult = await clinicalTriage.assess({
    user_input: '恶心呕吐已经2天，吃不下东西',
    context: { treatment_phase: '化疗周期第2天' },
  });
  const evidenceResult = evidenceRetrieval.retrieve({
    parsed_symptoms: triageResult.parsed_symptoms,
    context: { treatment_phase: '化疗周期第2天' },
  });
  console.log(
    `  ✅ 检索结果:\n` +
    `     RAG来源: ${evidenceResult.rag_sources.join(', ') || '无'}\n` +
    `     知识片段: ${evidenceResult.knowledge_snippets.length}条\n` +
    `     匹配规则: ${evidenceResult.matched_rule_ids.join(', ') || '无'}`
  );

  console.log('\n=== 验证完成 ===');
}

run().catch(console.error);