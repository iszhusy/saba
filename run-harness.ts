/**
 * Evaluation Harness 运行脚本
 * 运行 SPEC-9 定义的测试集（每条 case 含 architecture-invariants 检查）
 *
 * Usage: npm run harness -- [rf|cs|ec|all] [--parallel]
 * 快速架构单测（无 LLM）: npm run test:arch
 *
 * 主路径已切换为 AI-native：runAssessPipeline + createConversationExecutive
 * （TestSuiteRunner 内部走 assess-pipeline，外部无需再注入 orchestrator）
 */

import {
  TestSuiteRunner,
  RED_FLAG_TEST_CASES,
  COMMON_SIDE_EFFECT_TEST_CASES,
  EDGE_CASE_TEST_CASES,
  formatTestReport,
} from './src/tools/evaluation-harness.js';
import type { TestCase } from './src/tools/evaluation-harness.js';

async function main() {
  const args = process.argv.slice(2);
  const suiteFilter = args[0] ?? 'all';
  const parallel = args.includes('--parallel');

  const provider = process.env.LLM_PROVIDER ?? 'anthropic';

  let cases: TestCase[] = [];
  let suiteName = '';

  switch (suiteFilter) {
    case 'rf':
      cases = RED_FLAG_TEST_CASES;
      suiteName = 'P0-红旗症状';
      break;
    case 'cs':
      cases = COMMON_SIDE_EFFECT_TEST_CASES;
      suiteName = 'P1-常见副作用';
      break;
    case 'ec':
      cases = EDGE_CASE_TEST_CASES;
      suiteName = 'P2-边界 case';
      break;
    case 'all':
    default:
      cases = [...RED_FLAG_TEST_CASES, ...COMMON_SIDE_EFFECT_TEST_CASES, ...EDGE_CASE_TEST_CASES];
      suiteName = '全部测试集';
      break;
  }

  console.log(`\n🔬 SABA Evaluation Harness`);
  console.log(`   测试集: ${suiteName}`);
  console.log(`   Case 数: ${cases.length}`);
  console.log(`   Provider: ${provider}`);
  console.log(`   并行: ${parallel ? '是（5并发）' : '否（顺序执行）'}`);
  console.log('');

  const runner = new TestSuiteRunner(suiteName);
  const result = await runner.run(cases, { parallel, concurrency: 5 });

  console.log(formatTestReport(result));

  const hasFailure = result.results.some((r) => r.status !== 'pass');
  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Evaluation harness failed:', err);
  process.exit(2);
});