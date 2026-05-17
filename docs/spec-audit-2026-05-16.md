# SABA Spec 落地审计清单（2026-05-16）

> 审计目标：判断 `/Users/ahs/cancer` 当前实现与 PRD / SPEC-0 ~ SPEC-9 的一致性、落地程度与是否阻塞人工验收。
>
> 审计口径：
> - **已实现**：核心能力已真实接入主流程，并有代码/测试证据支撑
> - **部分实现**：核心思路已落地，但与 Spec 定义仍有明显差距
> - **仅骨架**：只有类型/接口/文档/初步入口，尚未形成可验收闭环
> - **未实现**：当前主代码中基本不存在对应能力

---

## 总体结论

当前项目已经达到：

- 核心评估链路可运行
- 安全门禁可回归验证
- SPEC-7 Conversation State & Episode Memory 已形成基础产品闭环
- Evaluation Harness 已覆盖 stateful 场景并全量通过

当前实测结果：

- `tsc --noEmit`：通过
- `run-harness.ts ec`：9/9 = 100%
- `run-harness.ts all`：19/19 = 100%
- Quality Gates：全绿

但**还不能宣称“SPEC-0 ~ SPEC-9 已全部以生产级完整落地”**。

主要剩余缺口：

1. `SPEC-3 Form & Clarification Manager` 的 **show_form / 表单主路径**尚未真正落地
2. `SPEC-8 LLM Runtime` 尚未形成统一 runtime（cache / retry / trace / structured output / fallback）
3. uncertainty / audit / prompt_version / trace_id 等 **审计结构不完整**
4. 团队通知仍偏 **outbox MVP**，距离完整生产通知链路仍有距离
5. 代码仍保留 **MiniMax** 路径，与当前统一到 DashScope / 千问的架构决策不一致

---

## PRD 对照结论

### 1. 评估模块（Core Loop）
状态：**部分实现，核心能力已可验收**

已具备：
- 用户输入 → AI分析 → 风险判定 → 建议生成 → 结果展示
- 风险等级 / 下一步行动 / 规则命中 / 详细说明
- 高风险 / 中风险输出安全约束

不足：
- PRD 中“结构化表单 / 症状卡片 / 持续时间 / 严重度滑条”的主交互路径未真正落地

### 2. 历史记录模块
状态：**部分实现，后端能力基本具备**

已具备：
- assessment 持久化
- assessment 详情查询
- assessment 历史列表查询
- session / episode 查询与关闭能力

不足：
- 未审计到完整用户侧展示层是否已交付

### 3. 团队协作模块
状态：**部分实现**

已具备：
- feedback 持久化
- notify outbox 持久化
- dispatch 路由

不足：
- 真实发送器不明确
- retry / dead-letter / 更完整审计链未落地

---

## SPEC 分项审计

### SPEC-0 — 架构原则
状态：**已实现（有偏差）**

证据：
- 主流程集中于 `src/agents/orchestrator-llm-first.ts`
- 子模块已拆分为：
  - `src/modules/intent-classifier.ts`
  - `src/modules/clinical-triage.ts`
  - `src/modules/evidence-retrieval.ts`
- validator / builder 为工具式实现：
  - `src/tools/safety-validator.ts`
  - `src/lib/response-builder.ts`

已符合：
- orchestrator-centered 架构基本成立
- 子模块大多是单次调用、单次输出、无状态
- Safety Validator 作为 step/tool 集成，而非自治 agent

偏差：
- 当前仍保留较强的 rule-first override / fallback，和“模型负责判断、规则只守底线”的原文有偏差
- 旧架构文件 `src/agents/orchestrator.ts` 仍存在并继续导出，说明收口未彻底完成

结论：
- 方向正确，基本达标
- 但仍需一次旧架构清理与文档口径统一

---

### SPEC-1 — Intent Classifier & Sufficiency Router
状态：**部分实现**

证据：
- `src/modules/intent-classifier.ts`
- 已支持：
  - emergency 分流
  - non_medical 分流
  - medication 问题分流
  - follow-up / worsening 识别
  - insufficient info → clarification

已实现：
- 主入口路由能力可用
- stateful follow-up 能消费 `session_history`
- 边界用例经 harness 验证通过

不足：
- Spec 中强调的 `show_form` 主路径未真正进入主链路
- 丰富输出结构未完整实现，例如：
  - `confidence`
  - `is_medical_relevant`
  - `is_possible_emergency`
  - `sufficiency.missing_fields`
  - `audit.prompt_version`

结论：
- 业务上可用
- 不是 Spec 原文 full implementation

---

### SPEC-2 — Clinical Triage Agent
状态：**部分实现**

证据：
- `src/modules/clinical-triage.ts`
- 调用了：
  - 症状解析
  - 规则风险评估
- 常见副作用 / follow-up / 红旗场景均已被 harness 覆盖

已实现：
- 症状解析
- 规则初评
- 为风险融合提供结构化输入

不足：
- 未完整实现 Spec 中更重的中间结构：
  - `information_gaps`
  - `clinical_signal_analysis`
  - `rag_strategy`
  - `suggested_clarifications`
  - 完整 `audit`
- uncertainty 表达能力较弱

结论：
- 核心 triage 能力已落地
- 中间态结构仍简化

---

### SPEC-3 — Precise Clarification Step
状态：**部分实现**

证据：
- `src/services/conversation-state.ts`
- `src/lib/response-builder.ts`
- `src/agents/orchestrator-llm-first.ts`
- `src/tools/evaluation-harness.ts`

已实现：
- `clarification_required` 显式返回
- `clarification_questions` 返回
- clarification state 持久化
- clarification TTL / 过期处理
- stateful harness 验证已通过

不足：
- clarification round limit 尚未显式收敛完成
- 问题优先级 / estimated impact / richer audit 结构未完整落地

结论：
- 已具备 MVP 闭环
- 距离 Spec 设计上限仍有差距

---

### SPEC-3 — Form & Clarification Manager
状态：**未实现**

证据：
- Spec 文档中定义了表单模板、字段映射、show_form 路由
- 当前主代码中未见表单主路径成为生产流程的一部分
- 当前系统更接近“直接评估 + 必要时澄清”，而非“先表单再评估”

结论：
- 这是当前最明确的落地缺口之一
- 若产品路线不再采用表单，应同步修订 Spec 口径

---

### SPEC-4 — Evidence Retrieval Tool
状态：**部分实现**

证据：
- `src/modules/evidence-retrieval.ts`
- orchestrator 已接入 retrieval

已实现：
- 基础检索能力存在
- RAG 结果能进入融合链路

不足：
- 未见完整的：
  - query generation strategy
  - rerank
  - chunk 裁剪
  - `evidence_summary`
  - `clinical_mappings`
  - 更完整 retrieval metadata / audit

结论：
- 基础功能存在
- 距离 Spec-4 的生产化版本仍有明显差距

---

### SPEC-5 — Risk Fusion Agent
状态：**部分实现（偏强）**

证据：
- 风险融合主逻辑已在 `src/agents/orchestrator-llm-first.ts` 中真实运行
- 已支持 DashScope / Anthropic / fallback 路径
- 已结合 triage / retrieval / history 做最终决策

已实现：
- 最终风险判定核心能力
- follow-up worsening 升级
- provider 路径下的临床安全保护

不足：
- 未完整输出 Spec 中的：
  - `uncertainty`
  - `contributing_factors`
  - `evidence_references`
  - `alternative_considerations`
  - 更标准化 `audit`

结论：
- 系统主决策链已存在且有效
- 但审计化与结构化表达仍不完整

---

### SPEC-6 — Safety Validator
状态：**已实现**

证据：
- `src/tools/safety-validator.ts`
- 全量 harness 中 `safety_violations = 0`

已实现：
- 高风险必须包含就医/急诊/120/立即
- 中风险必须包含联系医疗团队
- warning signs 自动补齐
- 避免危险停药/剂量建议

结论：
- 这是当前完成度最高的模块之一
- 可视为已实现

---

### SPEC-7 — Conversation State & Episode Memory
状态：**已实现**

证据：
- 类型：`src/types/index.ts`
- 仓储：`src/storage/conversation-repository.ts`
- 服务：`src/services/conversation-state.ts`
- API：`src/api/handler.ts`
- 测试：`src/tools/evaluation-harness.ts`

已实现：
- session / episode 持久化
- clarification state 持久化与 TTL
- active / resolved / escalated / completed 流转基础能力
- active session / session by id / episode by id 查询
- session complete / episode resolve API
- stateful harness 覆盖与通过

不足：
- clarification round limit 仍待补强
- 更细粒度 episode 复用策略仍可继续产品化
- turn-level richer history 未充分体现

结论：
- 核心闭环已经成立
- 已达到可验收级别

---

### SPEC-8 — LLM Runtime
状态：**未实现**

证据：
- 当前存在：
  - `src/lib/llm.ts`
  - `src/lib/dashscope.ts`
  - `src/lib/structured-output.ts`
- 但未形成统一 runtime 入口

未实现的关键能力：
- 统一模型调用 runtime
- prompt cache
- 统一 retry / backoff
- trace / request_id / cost tracking
- 统一 response schema enforcement
- 统一 fallback 策略

结论：
- 只能算“局部能力散落存在”
- 不能算 Spec-8 已落地

---

### SPEC-9 — Evaluation Harness
状态：**已实现**

证据：
- `src/tools/evaluation-harness.ts`
- 已支持：
  - P0 / P1 / P2
  - safety constraints
  - quality gates
  - stateful spec7 场景
- 当前全量结果：19/19 通过

结论：
- 已形成真实有效的回归框架
- 可视为已实现

---

## Spec 状态矩阵

| Spec | 状态 | 备注 |
|---|---|---|
| SPEC-0 | 已实现（有偏差） | orchestrator-centered 成立，但旧架构/规则角色仍有遗留 |
| SPEC-1 | 部分实现 | 核心路由可用，但 show_form 与富结构输出未完整落地 |
| SPEC-2 | 部分实现 | triage 能力已落地，但信息缺口/uncertainty 结构不完整 |
| SPEC-3 Clarification | 部分实现 | clarification 闭环已通，但 round limit 等未完全收敛 |
| SPEC-3 Form | 未实现 | 表单主路径未落地 |
| SPEC-4 | 部分实现 | 基础 retrieval 存在，但 rerank/chunk/summary 不完整 |
| SPEC-5 | 部分实现（偏强） | 最终风险决策链已成立，但审计/不确定性不足 |
| SPEC-6 | 已实现 | 安全校验与门禁已成立 |
| SPEC-7 | 已实现 | session/episode/stateful harness 闭环已成 |
| SPEC-8 | 未实现 | 缺统一 runtime |
| SPEC-9 | 已实现 | harness 全量与 stateful 回归已通过 |

---

## 是否阻塞人工验收

### 不阻塞人工验收的项
- SPEC-6 Safety Validator
- SPEC-7 Conversation State
- SPEC-9 Evaluation Harness
- 核心评估主链路

### 会阻止“宣称全面生产级完成”的项
- SPEC-3 Form 主路径未落地
- SPEC-8 LLM Runtime 未落地
- uncertainty / audit / trace 结构不足
- 团队通知仍偏 outbox MVP
- MiniMax 路径仍未清理

---

## 建议优先级

### P0：架构收口
1. 移除 MiniMax 路径，统一到 DashScope / 千问
2. 清理旧 orchestrator 暴露路径，统一主入口
3. 将本审计清单纳入 docs，作为当前真实口径

### P1：补影响验收的关键缺口
4. 决定是否真正实现 `show_form` 主路径；若不实现，则修订 Spec
5. 落地最小统一 LLM runtime：provider 入口、retry/backoff、trace id、structured output parsing

### P1：补生产化薄弱点
6. 强化 uncertainty / audit 输出结构
7. 将团队通知从 outbox 推进到真实 sender + retry + 审计链

---

## 最终判断

当前项目可被描述为：

> **核心流程可验收，安全门禁通过，SPEC-7 状态闭环成立，但尚未达到“Spec 全量生产级完整落地”的状态。**

更准确的对外口径应为：

> **已完成核心风险评估、会话状态与质量回归框架建设；剩余工作主要集中在表单主路径、统一 LLM Runtime、审计结构与通知链生产化。**
