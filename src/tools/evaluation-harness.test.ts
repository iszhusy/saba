/**
 * Harness 行为级集成测试（不依赖 LLM key）。
 * 验证 baseline gate + harness fixture 端到端工作。
 * 对应 OpenSpec change: patient-baseline-clarification-gates。
 */

import { describe, expect, it } from 'vitest';
import { TestRunner, EDGE_CASE_TEST_CASES } from './evaluation-harness.js';
import { createConversationExecutive } from '../agents/conversation-executive.js';

/** 显式注入空密钥的 executive，避免 vitest 环境读取 .env 后真的发起 LLM 调用。 */
function offlineExecutive() {
  return createConversationExecutive({
    llm_provider: 'dashscope',
    anthropic_api_key: '',
    dashscope_api_key: '',
    deliberation_runtime: 'structured',
  });
}

const ec006 = EDGE_CASE_TEST_CASES.find((c) => c.id === 'ec-006');
const ec007 = EDGE_CASE_TEST_CASES.find((c) => c.id === 'ec-007');

describe('EvaluationHarness baseline gate', () => {
  it('ec-006「恶心首发-缺治疗背景应澄清」短路到澄清，不调用 LLM', async () => {
    expect(ec006).toBeDefined();
    const runner = new TestRunner(offlineExecutive());
    const result = await runner.runCase(ec006!);

    expect(result.status).toBe('pass');
    expect(result.actual.final_mode).toMatch(/structured_intake|clarify/);
    expect(result.actual).not.toHaveProperty('response_mode');
    expect(result.actual.decision_mode).toBe('insufficient');
    expect(result.actual.risk_level).toBe('low');
    expect(result.actual.risk_score).toBe(0);
    expect(result.evaluation.failed_checks).toHaveLength(0);
    expect(result.safety_violations).toHaveLength(0);
    expect(result.architecture_violations).toHaveLength(0);
  });

  it('ec-007「无基线但红旗仍升级」不被档案门禁阻塞', async () => {
    expect(ec007).toBeDefined();
    const runner = new TestRunner(offlineExecutive());
    const result = await runner.runCase(ec007!);

    expect(result.status).toBe('pass');
    expect(result.actual.final_mode).toBe('escalation');
    expect(result.actual).not.toHaveProperty('response_mode');
    expect(result.actual.decision_mode).toBe('conclusive');
    expect(result.actual.risk_level).toBe('high');
    expect(result.evaluation.failed_checks).toHaveLength(0);
  });

  it('显式传 setup_baseline=null 才会触发档案门禁（默认 fixture 不触发）', async () => {
    expect(ec006).toBeDefined();
    const runner = new TestRunner(offlineExecutive());

    const withDefaultBaseline = {
      ...ec006!,
      id: 'ec-006-with-baseline',
      input: { ...ec006!.input, setup_baseline: undefined },
    };
    const result = await runner.runCase(withDefaultBaseline);

    // 默认 baseline 已注入，final_mode 不再是 baseline gate 的 clarify。
    // 注意：此 case 没有 LLM 密钥的话进入 triage 会失败，所以我们只断言不再是单纯
    // "baseline-only" 短路（即 risk_score 不强制为 0，或者 clarification_questions
    // 不包含 baseline_* 问题）。
    const surface = result.evaluation.passed_checks.join(',');
    expect(surface).not.toContain('baseline_treatment_category');
  });

  it('ec-004 follow-up 默认 baseline fixture 不会被门禁短路到 risk_score=0', async () => {
    const ec004 = EDGE_CASE_TEST_CASES.find((c) => c.id === 'ec-004');
    expect(ec004).toBeDefined();
    const runner = new TestRunner(offlineExecutive());
    const result = await runner.runCase(ec004!);

    // 离线 executive 没有 LLM 密钥，deliberation 会抛错，runCase 应为 'error' 状态。
    // 关键：失败原因不能是「baseline gate 短路」(framing→clarify with risk_score=0)。
    // 真正的 LLM 错误会落到 catch 分支返回 status='error'。
    expect(['error', 'fail']).toContain(result.status);
    if (result.status === 'error') {
      expect(result.error?.message ?? '').toMatch(/LLM|configured|api/i);
    }
  });
});
