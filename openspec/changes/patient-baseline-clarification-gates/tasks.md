## 1. 类型与存储

- [x] 1.1 在 `src/types/index.ts` 新增 `PatientBaseline` 与 `baseline_complete` 推导辅助类型
- [x] 1.2 新增 `PatientBaselineRepository` 接口及 `MemoryPatientBaselineRepo`（dev-api / harness 共用）
- [x] 1.3 在 `conversation-state.ts` 的 `prepareRequest` 中合并 baseline + `AssessRequest.context`

## 2. Intent Framing 门禁

- [x] 2.1 实现 `assessBaselineSufficiency()`，与现有 `assessInformationSufficiency`（Episode）分离
- [x] 2.2 调整 `deriveRuleFallback` / disposition：基线不全时不得 `proceed_to_triage`
- [x] 2.3 澄清优先级：基线 P1 先于 Episode P1（红旗与用药边界例外）
- [x] 2.4 在 `intent-framing.test.ts` 增加「今天开始恶心 + 无基线 → needs_clarification」

## 3. Executive 输出资格

- [x] 3.1 在 `conversation-executive.ts` 增加 eligibility guard（基线不全禁止 conclusive / 带 risk 终稿）
- [x] 3.2 确保澄清路径下 `executive_summary.status === clarification_required` 与 surface 一致
- [x] 3.3 更新 `conversation-executive.test.ts` 覆盖 guard 场景

## 4. 前端与 API

- [x] 4.1 移除 `ConversationAssessment.tsx` 中静默 `DEFAULT_CONTEXT`
- [x] 4.2 首访/基线缺失时展示 structured intake 或简短建档 UI（三字段 MVP）
  - 新增 `BaselineIntakeCard.tsx`（治疗大类下拉 + 时间锚点输入 + 可选 regimen）
  - `ConversationAssessment.tsx` 检测 `question_id.startsWith('baseline_')` 时切换为卡片
  - 新增 `POST/GET /api/v1/baseline` 端点（dev-api + Worker handler，D1 表 `patient_baselines`）
- [x] 4.3 澄清回答写入 baseline 并触发下一轮 assess（卡片提交 → `/api/v1/baseline` → 重发上一条用户输入）

## 5. 回归与 Harness

- [x] 5.1 修复 `run-harness.ts` 入口（使用 `assess-pipeline`，去除已删除 orchestrator 依赖）
- [x] 5.2 强化 `evaluation-harness.ts` 的 `evaluate()`：断言 `response_mode`、`decision_mode`、`intent_answerability`
- [x] 5.3 新增 harness case `ec-006`「恶心首发-缺治疗背景应澄清」+ `ec-007` 红旗 bypass
- [x] 5.4 为依赖 context 的既有 case 增加 `setup_baseline` 或 fixture（runner 默认 seed 合规基线；`setup_baseline: null` 显式触发门禁）
- [x] 5.5 运行 `npm run test:arch` 与 `npm run harness -- ec` 并记录结果
  - `npm run test:arch`: 6/6 通过
  - `npm test` (含新增 baseline 单测 + harness offline 测试): 25/25 通过
  - `npm run harness -- ec --parallel` (real DashScope, 134s): 5/12 通过（ec-006/ec-007 等基线门禁 case 通过；其余 7 项失败均属 episode lifecycle / LLM 输出回归，已用 `evaluation-harness.test.ts > ec-004` 单测确认非门禁误伤，需后续 cs/rf 套件单独跟进）

## 6. 规格同步

- [x] 6.1 更新 `docs/specs-ai-native/behavior/03-intake-and-clarification.md`（三层信息与优先级）
- [x] 6.2 更新 `docs/specs-ai-native/behavior/07-episode-state.md`（Baseline vs Episode 边界）
- [x] 6.3 在 `docs/specs-ai-native/behavior/01-executive.md` 补充 eligibility 表
