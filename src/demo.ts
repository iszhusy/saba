/**
 * SABA 演示程序
 * 展示完整的三层评估流程：
 * Layer 1: 规则引擎（高风险快速匹配）
 * Layer 2: RAG 检索（循证上下文）
 * Layer 3: Claude LLM（深度推理）
 */

import { Saba } from './index.js';

async function main() {
  console.log('=== SABA 症状评估演示 ===\n');
  console.log('配置状态:', {
    llmProvider: Saba.config.llm_provider,
    hasAnthropicKey: !!Saba.config.anthropic_api_key,
    anthropicBaseUrl: Saba.config.anthropic_base_url || '(default)',
    anthropicModel: Saba.config.anthropic_model,
    hasDashScopeKey: !!Saba.config.dashscope_api_key,
    ragEnabled: Saba.config.rag_enabled,
    appEnv: Saba.config.app_env,
  });
  console.log('');

  // ============================================================
  // 演示 1: 高风险 - 呼吸困难（规则引擎直接命中）
  // ============================================================
  console.log('【案例 1】高风险 - 呼吸困难（规则引擎快速通道）');
  console.log('输入: "突然感觉胸闷，呼吸困难"\n');

  const result1 = await Saba.executive.execute({
    user_id: 'test-user-001',
    input: '突然感觉胸闷，呼吸困难',
    context: {
      treatment_phase: 'chemotherapy_cycle_2',
      treatment_type: 'AC-T',
      treatment_day: 5,
    },
  });

  console.log('评估结果:');
  console.log(`  风险等级: ${result1.risk_level}`);
  console.log(`  风险分数: ${result1.risk_score}`);
  console.log(`  标签: ${result1.result?.label ?? result1.risk_level}`);
  console.log(`  颜色: ${result1.result?.color ?? '#ccc'}`);
  console.log(`  立即行动: ${result1.immediate_action}`);
  console.log(`  需要联系团队: ${result1.team_contact_required}`);
  console.log(`  触发规则: ${result1.triggered_rules.map((r: { id: string }) => r.id).join(', ')}`);
  console.log(`  模型版本: ${result1.metadata.model_version}`);
  console.log(`  处理时间: ${result1.metadata.processing_time_ms}ms\n`);

  // ============================================================
  // 演示 2: 中风险 - 恶心呕吐持续2天（规则 + LLM）
  // ============================================================
  console.log('【案例 2】中风险 - 恶心呕吐持续2天（规则+LLM融合）');
  console.log('输入: "恶心想吐已经2天了，吃不下东西"\n');

  const result2 = await Saba.executive.execute({
    user_id: 'test-user-002',
    input: '恶心想吐已经2天了，吃不下东西',
    context: {
      treatment_phase: 'chemotherapy_cycle_2',
      treatment_type: 'AC-T',
      treatment_day: 5,
    },
  });

  console.log('评估结果:');
  console.log(`  风险等级: ${result2.risk_level}`);
  console.log(`  风险分数: ${result2.risk_score}`);
  console.log(`  立即行动: ${result2.immediate_action}`);
  console.log(`  触发规则: ${result2.triggered_rules.map((r: { id: string }) => r.id).join(', ')}`);
  console.log(`  警告信号: ${result2.warning_signs?.join(', ')}`);
  console.log(`  推理链: ${result2.reasoning ?? ''}`);
  console.log('');

  // ============================================================
  // 演示 3: 低风险 - 轻微疲劳（规则兜底）
  // ============================================================
  console.log('【案例 3】低风险 - 轻微疲劳（规则兜底）');
  console.log('输入: "有点累，想睡觉"\n');

  const result3 = await Saba.executive.execute({
    user_id: 'test-user-003',
    input: '有点累，想睡觉',
    context: {
      treatment_phase: 'chemotherapy_after',
    },
  });

  console.log('评估结果:');
  console.log(`  风险等级: ${result3.risk_level}`);
  console.log(`  风险分数: ${result3.risk_score}`);
  console.log(`  立即行动: ${result3.immediate_action}`);
  console.log(`  需要联系团队: ${result3.team_contact_required}\n`);

  // ============================================================
  // 演示 4: 复杂模糊输入（LLM 处理规则盲区）
  // ============================================================
  console.log('【案例 4】复杂模糊 - LLM 处理边界场景');
  console.log('输入: "这两天感觉浑身没劲，吃东西也没什么胃口，而且头有点晕"\n');

  const result4 = await Saba.executive.execute({
    user_id: 'test-user-004',
    input: '这两天感觉浑身没劲，吃东西也没什么胃口，而且头有点晕',
    context: {
      treatment_phase: 'chemotherapy_cycle_1',
      treatment_type: 'AC-T',
    },
  });

  console.log('评估结果:');
  console.log(`  风险等级: ${result4.risk_level}`);
  console.log(`  风险分数: ${result4.risk_score}`);
  console.log(`  识别症状: ${result4.symptoms?.map((s: { standard_term: string }) => s.standard_term).join(', ')}`);
  console.log(`  立即行动: ${result4.immediate_action}`);
  console.log(`  推理: ${result4.reasoning ?? ''}`);
  console.log('');

  console.log('=== 演示完成 ===');
  console.log('\n如需配置 Claude API Key，请设置环境变量:');
  console.log('  export ANTHROPIC_API_KEY=your_key_here');
}

main().catch(console.error);
