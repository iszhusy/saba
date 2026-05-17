# SABA 架构重构执行计划（按依赖顺序）

**版本**: v0.2
**日期**: 2026-05-16

---

## Phase 1：稳定主流程与安全底线 ✅ 完成

### 目标
在不引入新交互复杂度的前提下，先让现有 orchestrator-centered 主流程稳定可用：
1. 统一 LLM 风险输出解析
2. 引入独立的 Safety Validator
3. 引入 Response Builder，收敛响应组装
4. 保持 orchestrator 为唯一流程控制点

### 实现范围
- `src/lib/structured-output.ts` ✅
- `src/tools/safety-validator.ts` ✅
- `src/lib/response-builder.ts` ✅
- `src/agents/orchestrator-llm-first.ts` 收敛改造 ✅

### 验收标准
- [x] `callAnthropicForDecision()` 不再直接依赖脆弱正则解析 JSON → `parseRiskAssessmentOutput()` 接管
- [x] 高风险输出自动满足"就医/急诊/120"约束 → `SafetyValidator` 强制
- [x] 中风险输出自动满足"联系医疗团队"约束 → `SafetyValidator` 强制
- [x] 响应组装不再散落在 orchestrator 内部 → `ResponseBuilder` 收敛
- [x] `tsc --noEmit` 全量通过

### 额外完成（未在原计划内）
- 新增 `src/lib/llm-tools.ts`：封装 `toolParseSymptoms` / `toolRiskAssess` / `toolRetrieve`，子模块直接调用，不再由 orchestrator 手动拼
- 新增 `src/lib/structured-output.ts`：`extractJSONObject` / `parseRiskAssessmentOutput`，支持 JSON / fenced code / unbalanced brace 三种格式容错

---

## Phase 2：提取核心轻量模块 ✅ 完成

### 目标
按依赖顺序拆出不承担复杂交互的核心模块，降低 orchestrator 文件复杂度。

### 实现范围
1. `src/modules/intent-classifier.ts` ✅
2. `src/modules/clinical-triage.ts` ✅
3. `src/modules/evidence-retrieval.ts` ✅

### 验收标准
- [x] 每个模块都是单次输入 → 单次输出
- [x] 模块之间无直接互调
- [x] orchestrator 仅负责流程编排与状态传递
- [x] 每个模块可独立单测/脚本验证（`phase2-test.ts` 通过）

### 关键决策
- `IntentClassifier` 纯同步（无外部依赖），`ClinicalTriage` 异步（需调用 LLM tools），`EvidenceRetrievalTool` 同步（内部调用 RAG retriever）
- 三者均实现为 class + factory，不引入 agent-to-agent 协商

### 导入路由（`src/index.ts`）
```ts
export { createIntentClassifier, type IntentClassificationOutput } from './modules/intent-classifier.js';
export { createClinicalTriage, type ClinicalTriageOutput } from './modules/clinical-triage.js';
export { createEvidenceRetrievalTool, type EvidenceRetrievalOutput } from './modules/evidence-retrieval.js';
```

---

## Phase 3：LLM Risk Fusion 整合到 Orchestrator ✅ 完成

### 目标
将 LLM 最终决策整合到 orchestrator 主流程中，而非独立模块。

### 执行流程（已实现）
```
用户输入
  ↓
Step 1: IntentClassifier → 快速分流（emergency / non_medical / clarification）
  ↓
Step 2: ClinicalTriage → 症状解析 + 规则评估
  ↓
Step 3: EvidenceRetrieval → RAG 知识检索
  ↓
Step 4: LLM Risk Fusion → 综合决策（Anthropic / DashScope / Rule-only fallback）
  ↓
Step 5: SafetyValidator → 安全校验（硬约束）
  ↓
Step 6: ResponseBuilder → 组装 AssessResponse
```

### 验收标准
- [x] `orchestrator.runIntentClassification()` 可独立调用
- [x] `orchestrator.runClinicalTriage()` 可独立调用（异步）
- [x] `orchestrator.runEvidenceRetrieval()` 可独立调用
- [x] 三个 LLM Provider 均接入（Anthropic / DashScope / Rule-only）
- [x] 端到端测试通过（`e2e-test.ts`，3 个 case）

### 关键决策
- **不拆分独立 `risk-fusion.ts`**：融合逻辑足够简单（一次 LLM 调用），且 orchestrator 是唯一调用方，拆成独立模块反而增加复杂度
- 融合层职责：综合 symptom parsing + rule assessment + RAG knowledge + intent classification → 输出最终 risk_level/risk_score/immediate_action/follow_up/warning_signs

---

## Phase 4：简化状态管理（待启动）

### 目标
只在主流程稳定后，再引入 episode/session，且状态管理仍由 orchestrator 控制。

### 验收标准
- [ ] session/episode 仅由 orchestrator 读写
- [ ] 子模块不维护独立状态机
- [ ] 仅支持当前产品必需的最小状态集

---

## 下一步优先级

1. **Phase 3 Risk Fusion 增强**：在 LLM Risk Fusion prompt 中增加历史上下文（如患者既往 AE 记录、治疗依从性）
2. **Phase 4 状态管理**：引入 episode 概念，支持多轮对话中的上下文累积（如首轮收集基本信息后，二轮更精准判断）
3. **单元测试**：为 Phase 2 三个模块编写 Jest/Vitest 单测
4. **文档更新**：更新 `docs/01-architecture.md` 的 LLM-First 执行流程图