# SABA LLM-First 重构设计文档

## 状态：起草中

---

## 1. 现状问题分析

### 当前架构的核心矛盾

```
当前（规则优先）：
用户输入 → 规则引擎 → 直接出结果(兜底) → LLM 融合修正

问题：
1. 规则是"快速通道"，LLM 是"后处理"——角色倒置
2. 规则输出 risk_level → LLM 难以覆盖（医疗安全不允许降级）
3. Medium 误判率高——规则粗糙 + LLM 被压制
4. 流程僵化：规则先跑、LLM 后跑，无法根据输入动态调整
```

### 参考 Claude Code 架构模式

```
Claude Code 核心模式：
用户输入 → [系统指令] + [工具定义] → LLM 自主决策调用工具 → 循环直到得出结论

关键原则：
✓ 工具是 LLM 的"外部能力扩展"，不是流水线的前置 stage
✓ LLM 是决策中枢，根据输入自主判断是否需要调用工具、调用哪个
✓ 工具输出作为 context 反馈给 LLM，再做下一步决策
✓ 没有固定顺序，LLM 决定推理路径
```

---

## 2. 目标架构：LLM-First

### 核心思路

> **规则引擎和 RAG 都是 LLM 的工具，不是裁判。**
> LLM 是唯一的事实上的决策者，规则/RAG 是它的"外部记忆"和"快速判断参考"。

```
新架构流程：
┌─────────────────────────────────────────────────────┐
│  1. LLM 接收请求                                      │
│     system: 角色定义 + 分级标准 + 可用工具            │
│     user:   症状描述 + 上下文                         │
│                                                      │
│  2. LLM 自主判断：                                    │
│     → 需要 RAG 查知识吗？ → 调用 retrieveBySymptoms   │
│     → 需要规则快速匹配吗？ → 调用 riskAssessorTool   │
│     → 需要深入推理吗？ → 直接生成评估结果             │
│                                                      │
│  3. LLM 基于所有可用信息做最终判断                    │
│     risk_level / risk_score / reasoning / advice      │
└─────────────────────────────────────────────────────┘
```

### 新旧架构对比

| 维度 | 当前（规则优先） | 目标（LLM-First） |
|------|-----------------|------------------|
| 决策者 | 规则引擎（主要）+ LLM（修正） | LLM（唯一决策者） |
| 规则作用 | 直接输出 risk_level，LLM 难以覆盖 | LLM 的工具输入（context），LLM 可参考或override |
| RAG 作用 | 在 LLM 前置注入 | LLM 按需查询，结果作为 context |
| 流程 | 固定三段式 | LLM 自主决定推理路径 |
| 误判根源 | 规则粗糙导致初始错误，LLM 受限于不降级 | 规则退出决策链 |
| LLM prompt | 包含规则输出（已污染） | 仅含原始症状 + 上下文 |

---

## 3. 技术设计

### 3.1 新增 Tool 函数（LLM 可调用）

```typescript
// 工具1: 症状解析
function parseSymptoms(
  userInput: string,
  context?: { treatment_type?: string; treatment_phase?: string }
): Promise<{
  symptoms: Array<{ standard_term: string; confidence: number; severity: string }>;
  duration?: string;
}>

// 工具2: 风险快速评估（规则引擎）
function riskAssessorTool(
  symptoms: Array<{ standard_term: string; severity: string }>,
  rawInput: string,
  context?: { treatment_type?: string; treatment_phase?: string; treatment_day?: number }
): Promise<{
  risk_level: 'low' | 'medium' | 'high';
  risk_score: number;
  triggered_rules: Array<{ id: string; name: string; reason: string }>;
  confidence: number;  // 规则置信度，LLM 用作参考
}>

// 工具3: 医学知识检索
function medicalKnowledgeRetrieval(
  symptoms: string[],
  treatment_type?: string
): Promise<{
  sources: Array<{ content: string; relevance: number; guideline: string }>;
}>

// 工具4: 风险最终评估（LLM 主决策）
function assessRisk(
  userInput: string,
  parsedSymptoms?: Array<{ standard_term: string; severity: string }>,
  ruleAssessment?: { risk_level: string; risk_score: number; triggered_rules: string[] },
  medicalKnowledge?: string,
  context?: { treatment_type?: string; treatment_phase?: string; treatment_day?: number }
): Promise<{
  risk_level: 'high' | 'medium' | 'low';
  risk_score: 0-100;
  reasoning: string;
  warning_signs: string[];
  immediate_action: string;
  follow_up_suggestion: string;
  confidence: 0.0-1.0;
}>
```

### 3.2 决策流程图（LLM 自主决策）

```
LLM 主循环（max 3 轮）：

Round 1:
  LLM 收到请求
  → 检查输入是否包含明确的极高风险信号（呼吸困难/过敏/胸痛）
    → Yes: 直接 HIGH，立即返回，调用 assessRisk
    → No:  继续

  → 检查是否需要知识检索？
    (患者提到靶向药/免疫药，且提到呼吸/皮疹/肝功能等关键词)
    → Yes: 调用 medicalKnowledgeRetrieval
    → No:  继续

  → 检查是否需要规则辅助？
    (症状模糊/矛盾/涉及骨髓抑制期/化疗后特定时间窗口)
    → Yes: 调用 riskAssessorTool 获取规则参考
    → No:  直接进入推理

  → 调用 assessRisk（综合所有 context）
  → 返回最终结果

Round 2+（可选）:
  如果 LLM 认为信息不足，可再次调用工具补充
  最多 3 轮，避免无限循环
```

### 3.3 Tool 定义格式（Anthropic Messages API）

```typescript
const tools = [
  {
    name: 'assess_risk',
    description: '给定症状和上下文，给出风险等级评估',
    input_schema: {
      type: 'object',
      properties: {
        parsed_symptoms: { type: 'array', description: '已解析的症状列表' },
        rule_assessment: { type: 'object', description: '规则引擎快速评估结果（可选）' },
        medical_knowledge: { type: 'string', description: '检索到的医学知识（可选）' },
        user_input: { type: 'string', description: '原始用户输入' },
        context: { type: 'object', properties: { treatment_type: {}, treatment_phase: {}, treatment_day: {} } },
      },
    },
  },
  {
    name: 'retrieve_medical_knowledge',
    description: '检索乳腺癌治疗副作用相关的循证医学知识',
    input_schema: { ... },
  },
  {
    name: 'risk_assessor_tool',
    description: '使用规则引擎进行快速风险评估（辅助参考）',
    input_schema: { ... },
  },
];
```

### 3.4 Prompt 设计原则

**System Prompt 结构**：

```
# 角色
你是一位专注于乳腺癌患者副作用管理的临床决策支持 AI。

# 核心能力
- 症状解析：从自然语言提取标准化症状
- 风险评估：综合症状、治疗阶段、规则、知识做判断
- 建议生成：给出可操作的建议

# 风险分级标准（含分数量化，精确边界）
[分数量化表格]

# 关键安全原则
1. 高风险优先：任何呼吸困难/过敏前兆 → HIGH
2. 靶向/免疫特殊关注：[...]
3. 骨髓抑制期：[...]
[...具体规则...]

# 可用工具
当需要时调用以下工具（不要猜测，使用工具获取准确信息）：
- parse_symptoms: 解析症状
- risk_assessor_tool: 规则快速评估（参考）
- retrieve_medical_knowledge: 知识检索
- assess_risk: 最终风险评估

# 决策原则
1. 优先使用工具获取准确信息，不要凭记忆猜测
2. 规则评估结果仅供参考，LLM 有最终决策权
3. 信息不足时，宁高勿低
4. 靶向/免疫治疗期间出现呼吸道症状，优先考虑肺炎

# 输出格式
[...]
```

**User Prompt**：

```
请评估以下乳腺癌患者描述的风险等级：

患者描述: "${userInput}"
${context ? `治疗阶段: ${context.treatment_phase} | 治疗类型: ${context.treatment_type}` : ''}
```

---

## 4. 关键变化

### 4.1 规则引擎角色变更

| 当前 | 重构后 |
|------|--------|
| 输出 `risk_level`（直接参与决策） | 输出 `risk_score` + `confidence`（仅作参考） |
| 有优先级，可覆盖 LLM | 无优先级，LLM 可 override |
| 固定在 Layer 2 先跑 | 按需调用，LLM 决定 |
| 是裁判 | 是工具 |

### 4.2 RAG 角色变更

| 当前 | 重构后 |
|------|--------|
| 在 LLM 前置注入 | LLM 按需查询，结果注入 context |
| 总是注入（即使不相关） | 精确检索，仅提供相关内容 |
| 无法追踪命中 | 追踪命中来源 |

### 4.3 LLM 能力提升

- 直接访问症状解析结果（不需要融合）
- 直接访问规则评估结果（仅作参考）
- 有最终决策权（可覆盖规则）
- 自主决定是否需要 RAG

---

## 5. 实现计划

### Phase 1: 基础设施（最小可行）
- [ ] 定义新的 Tool interface（TypeScript）
- [ ] 创建 `tools/` 目录，重构 tool 函数
- [ ] 保持现有 `orchestrator.ts` 结构不变，增加兼容层

### Phase 2: LLM-First 核心
- [ ] 重构 `assessRiskWithLLM` prompt，支持 tool_calls
- [ ] 实现 `max_turns=3` 的工具调用循环
- [ ] 实现 tool 结果注入逻辑

### Phase 3: 移除规则优先逻辑
- [ ] 移除 `orchestrator.ts` 中的规则优先分支
- [ ] 规则引擎作为 tool 提供，不在 pipeline 中预设
- [ ] 更新评估脚本和测试

### Phase 4: 验证与优化
- [ ] 20-case 批量测试对比
- [ ] 延迟优化（减少不必要的 tool 调用）
- [ ] prompt 迭代优化

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| LLM 不调用 tool，直接拍脑袋 | system prompt 强调工具使用义务 |
| LLM 调用 tool 过多（循环） | max_turns=3 上限 |
| 延迟增加（多轮 tool 调用） | 第一轮优先让 LLM 快速判断，tool 仅在必要时调用 |
| 准确率下降（失去规则兜底） | 关键词兜底（fallback）保留 |

---

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/tools/` | 新建 | Tool 函数定义 |
| `src/agents/orchestrator.ts` | 重构 | LLM-First 流程 |
| `src/lib/llm.ts` | 重构 | 支持 tool_calls |
| `src/lib/dashscope.ts` | 更新 | 兼容新架构 |
| `src/types/index.ts` | 更新 | 新增类型 |

---

_本文档随实现迭代更新_