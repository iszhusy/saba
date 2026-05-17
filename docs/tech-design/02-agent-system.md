# SABA Agent 系统详细设计

> 文档版本：v3.0（2026-05-16）
> 实现状态：已实现，与代码一致

---

## 一、Agent 架构概述

SABA 采用**自定义编排器模式**，而非重型 Agent 框架。核心组件：

```
┌────────────────────────────────────────────────────────────────────┐
│                   Assessment Orchestrator                           │
│                   (评估编排器，单例)                               │
│                                                                    │
│   orchestrate assess(request)                                      │
│       │                                                           │
│       ├── symptomParser.parse()     → Layer 1: 规则               │
│       ├── riskAssessor.assess()    → Layer 2: RAG                │
│       ├── generateAdvice()          → Layer 3: LLM                 │
│       │                                                           │
│       └── buildResponse()           → 汇总返回                    │
└────────────────────────────────────────────────────────────────────┘
```

### 与传统 Multi-Agent 的区别

| 方面 | 传统 LangChain Agent | SABA 编排器 |
|------|----------------------|-------------|
| 工具调用 | 动态规划，LLM 决定调用顺序 | 固定流程，规则确定 |
| 状态管理 | 复杂的状态机/内存 | 简单的 context 对象 |
| LLM 依赖 | 每个决策都依赖 LLM | 规则优先，LLM 补充 |
| 延迟 | 高（多次 LLM 调用） | 低（规则快速路径 <10ms） |
| 可解释性 | 黑盒 | 白盒（每步都有 evidence） |
| 适用场景 | 开放任务 | 医疗等高可靠性场景 |

---

## 二、三层决策架构

### 决策流程图

```
                    用户输入
                        │
                        ▼
        ┌───────────────────────────────┐
        │   Layer 1: 规则引擎           │
        │   RiskAssessor.assess()       │
        │                               │
        │   Step 1: 原始文本高风险扫描   │
        │   （直接匹配关键词，最快路径）  │
        │                               │
        │   ✅ 命中 HR-* → 直接返回     │
        │      risk_level = 'high'      │
        │      耗时 < 5ms              │
        │      无需 LLM 调用             │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   Layer 2: RAG 检索          │
        │   RAGRetriever               │
        │                               │
        │   基于症状检索知识库:          │
        │   • CTCAE 术语               │
        │   • 副作用管理指南            │
        │   • 临床试验数据              │
        │                               │
        │   输出: 循证上下文            │
        │   耗时 < 20ms                │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   Layer 3: Claude LLM        │
        │   assessRiskWithLLM()        │
        │                               │
        │   综合判断:                    │
        │   • 规则匹配结果               │
        │   • RAG 检索结果               │
        │   • 症状严重程度              │
        │   • 治疗阶段上下文            │
        │                               │
        │   决策融合:                    │
        │   • 规则高风险 → 不降级       │
        │   • LLM 升级 → 需置信度 >0.9  │
        │                               │
        │   耗时 ~500ms（API 调用）     │
        └───────────────────────────────┘
                        │
                        ▼
                    最终响应
```

### 决策融合算法

```typescript
// 伪代码展示融合逻辑
function fuseRiskResults(ruleResult, llmResult) {
  // 安全规则：规则引擎高风险，不降级
  if (ruleResult.risk_level === 'high') {
    return { ...ruleResult, source: 'rule+llm' };
  }

  // LLM 升级条件：置信度足够 + 等级更高
  const shouldUpgrade =
    llmResult.risk_level > ruleResult.risk_level &&
    llmResult.confidence >= RISK_UPGRADE_MIN_CONFIDENCE;

  if (shouldUpgrade) {
    return {
      risk_level: llmResult.risk_level,  // 升级
      risk_score: max(ruleResult.score, llmResult.score),
      source: 'rule+llm',
    };
  }

  // 默认：保持规则引擎判断
  return { ...ruleResult, source: 'rule' };
}
```

---

## 三、核心组件

### 3.1 Symptom Parser（症状解析）

**文件**: `src/tools/symptom-parser.ts`

**职责**：
- 接收原始文本输入
- 提取症状关键词
- 标准化医学术语
- 返回结构化症状列表

**支持症状**（11 种）：

| ID | 症状 | 标准术语 | 默认严重程度 |
|----|------|---------|-------------|
| nausea_vomiting | 恶心、呕吐 | nausea_vomiting | moderate |
| decreased_appetite | 食欲下降 | decreased_appetite | mild |
| fatigue | 疲劳、乏力 | fatigue | mild |
| pain | 疼痛 | pain | moderate |
| fever | 发热、发烧 | fever | severe |
| diarrhea | 腹泻 | diarrhea | moderate |
| rash | 皮疹 | rash | moderate |
| headache | 头痛、头晕 | headache | mild |
| shortness_of_breath | 呼吸困难、胸闷 | shortness_of_breath | severe |
| mouth_sore | 口腔溃疡 | mouth_sore | moderate |
| bleeding | 出血、瘀斑 | bleeding | moderate |

**输出**：

```typescript
interface SymptomParserOutput {
  symptoms: Array<{
    name: string;           // 匹配到的原始词
    standard_term: string;   // 标准化医学术语
    confidence: number;      // 0-1 置信度
    severity: 'mild' | 'moderate' | 'severe';
  }>;
  duration?: string;        // 如 "2天"
  rag_sources: string[];     // 关联的知识库来源
  confidence: number;        // 整体解析置信度
}
```

### 3.2 Risk Assessor（风险评估）

**文件**: `src/tools/risk-assessor.ts`

**职责**：
- 基于症状评估风险等级
- 匹配规则引擎
- 返回完整决策链

**高风险规则**（6 条）：

| ID | 名称 | 触发关键词 | 建议 |
|----|------|-----------|------|
| HR-001 | 呼吸困难/胸痛 | 呼吸困难、胸闷、胸痛、喘不上气 | 立即拨打120或前往急诊 |
| HR-002 | 高热 | 发烧、高烧、发热 | 立即联系团队，考虑急诊 |
| HR-003 | 严重过敏 | 面部肿胀、喉咙肿胀 | 立即就医，可能是过敏性休克前兆 |
| HR-004 | 腿部肿胀 | 腿部肿胀、腿肿 | 立即就医，排除深静脉血栓 |
| HR-005 | 神经症状 | 意识模糊、剧烈头痛、视力变化 | 立即就医，排除脑转移/卒中 |
| HR-006 | 消化道出血 | 呕血、黑便、严重腹痛 | 立即就医，消化道出血可能 |

**中风险规则**（6 条）：

| ID | 名称 | 触发关键词 | 阈值 | 建议 |
|----|------|-----------|------|------|
| MR-001 | 症状持续无好转 | 一直、持续、好几天 | >3天 | 联系团队评估治疗方案 |
| MR-002 | 恶心呕吐影响进食 | 恶心、想吐、呕吐 | >2天 | 联系团队调整止吐方案 |
| MR-003 | 口腔溃疡严重 | 口腔溃疡、嘴烂 | - | 联系团队考虑口腔护理 |
| MR-004 | 严重腹泻 | 腹泻、拉肚子 | - | 联系团队补液止泻 |
| MR-005 | 皮疹扩散 | 皮疹、红疹 | - | 联系团队评估超敏反应 |
| MR-006 | 血小板低迹象 | 瘀斑、出血、牙龈出血 | - | 联系团队查血常规 |

**组合升级规则**：

| 症状组合 | 原等级 → 新等级 | 原因 |
|---------|----------------|------|
| 发热 + 寒战 | low → medium | 疑似感染 |
| 恶心 + 口干 | low → medium | 电解质紊乱风险 |
| 皮疹 + 发热 | low → medium | 药物超敏反应 |
| 疲劳 + 呼吸困难 | low → medium | 贫血或心脏毒性 |

**输出**：

```typescript
interface RiskAssessorOutput {
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number;           // 0-100
  triggered_rules: Array<{
    id: string;
    name: string;
    confidence: number;
    source: string;
  }>;
  rag_references: Array<{
    source: string;
    relevance: number;
  }>;
  decision_chain: Evidence[];   // 完整决策过程
}
```

### 3.3 Advice Generator（建议生成）

**文件**: `src/tools/advice-generator.ts`

**职责**：
- 基于风险等级生成即时行动建议
- 生成警告信号列表
- 提供推理过程说明

**输出**：

```typescript
interface AdviceGeneratorOutput {
  immediate_action: string;      // 立即行动（1-2句）
  follow_up: string;            // 后续建议
  warning_signs: string[];      // 危险信号列表（3-5项）
  reasoning_chain: string[];    // 推理过程
  references: Array<{          // 参考来源
    id: string;
    source: string;
  }>;
  team_contact_required: boolean;
}
```

### 3.4 RAG Retriever（RAG 检索）

**文件**: `src/rag/retriever.ts`

**职责**：
- 基于症状检索知识库
- 提供循证上下文

**知识库内容**：

| 类型 | 数量 | 说明 |
|------|------|------|
| 副作用条目 | 17 条 | 化疗/靶向/内分泌治疗副作用管理 |
| CTCAE 术语 | 194 条 | v5.0 不良事件分级标准 |
| 临床试验 | 170 项 | 相关临床研究信息 |

**检索逻辑**：

```typescript
class RAGRetriever {
  retrieveBySymptoms(symptoms: Symptom[]): RetrievalResult {
    const matchedEntries = [];

    for (const symptom of symptoms) {
      for (const entry of KNOWLEDGE_BASE) {
        if (entry.keywords.includes(symptom.standard_term)) {
          matchedEntries.push(entry);
        }
      }
    }

    return {
      entries: deduplicate(matchedEntries),
      query: symptoms.map(s => s.standard_term).join(', '),
    };
  }
}
```

### 3.5 LLM 模块

**文件**: `src/lib/llm.ts`

**职责**：
- 封装 Claude API 调用
- 提供症状解析、风险评估、建议生成三个 LLM 工具

**Claude Prompt 策略**：

```typescript
// 症状解析 Prompt 关键部分
const systemPrompt = `
你是一位专门帮助乳腺癌患者识别和管理治疗副作用的医学助手。

已知症状标准术语（严格使用这些术语，不要自创）:
- nausea_vomiting: 恶心呕吐
- fatigue: 疲劳/乏力
- shortness_of_breath: 呼吸困难/胸闷
...（共 14 种）

严重程度定义:
- mild: 轻微，不影响日常生活
- moderate: 中等，部分影响日常生活
- severe: 严重，明显影响日常生活或需要医疗干预

重要原则:
1. 始终以患者安全为第一优先
2. 当症状描述模糊时，基于保守假设评估
3. 如果描述涉及危及生命的症状，务必以最高置信度标记
`;
```

**错误处理**：

```typescript
async function assessRiskWithLLM(client, ...): Promise<LLMRiskAssessment> {
  try {
    const response = await client.messages.create({ ... });
    const json = parseJSON(response);
    return json;
  } catch (error) {
    // 降级到保守策略
    return {
      risk_level: 'medium',
      risk_score: 50,
      confidence: 0.1,  // 低置信度
      reasoning: 'LLM 调用失败，采用保守估计',
    };
  }
}
```

---

## 四、评估编排器详细流程

### 4.1 完整流程时序

```typescript
async assess(request: AssessRequest): Promise<AssessResponse> {
  const startTime = Date.now();

  // Step 1: 症状解析
  const symptomResult = await this.tools.symptomParser(
    request.input,
    request.context
  );

  // Step 2: 风险评估（三层决策）
  const riskResult = await this.tools.riskAssessor(
    symptomResult,
    request.input,
    request.context
  );

  // 高风险直接返回（不调用 LLM）
  if (riskResult.risk_level === 'high') {
    return this.buildResponse(riskResult, symptomResult, startTime);
  }

  // Layer 2: RAG 检索
  const ragResults = this.tools.ragRetriever.retrieveBySymptoms(
    symptomResult.symptoms
  );
  const ragContext = this.formatRAGContext(ragResults.entries);

  // Layer 3: LLM 推理（如果配置了 API Key）
  if (this.hasLLMAccess()) {
    const llmResult = await this.callLLMForRiskAssessment(
      request.input,
      symptomResult,
      riskResult,
      ragContext
    );
    riskResult = this.fuseRiskResults(riskResult, llmResult);
  }

  // Step 3: 建议生成
  const adviceResult = await this.tools.adviceGenerator(
    riskResult,
    request.context
  );

  // Step 4: 汇总响应
  return this.buildResponse(riskResult, symptomResult, adviceResult, startTime);
}
```

### 4.2 响应构建

```typescript
private buildResponse(context, processingTime): AssessResponse {
  return {
    assessment_id: crypto.randomUUID(),

    // 风险信息
    risk_level: context.riskResult.risk_level,
    risk_score: context.riskResult.risk_score,
    result: {
      level: context.riskResult.risk_level,
      label: RISK_CONFIG[context.riskResult.risk_level].label,
      color: RISK_CONFIG[context.riskResult.risk_level].color,
    },

    // 建议
    immediate_action: context.adviceResult.immediate_action,
    follow_up_suggestion: context.adviceResult.follow_up,
    warning_signs: context.adviceResult.warning_signs,
    team_contact_required: context.adviceResult.team_contact_required,

    // 决策依据
    triggered_rules: context.riskResult.triggered_rules,
    reasoning: context.adviceResult.reasoning_chain.join('；'),
    evidence: context.riskResult.decision_chain,

    // 元数据
    metadata: {
      model_version: this.hasLLMAccess() ? 'claude-v1' : 'rule-only-v1',
      rules_version: 'v1.0.0',
      processing_time_ms: processingTime,
    },

    created_at: new Date().toISOString(),
  };
}
```

---

## 五、降级策略

### 5.1 LLM 不可用时

```
配置: 无 ANTHROPIC_API_KEY
效果: 完全使用规则引擎

流程:
用户输入 → 规则引擎 → RAG 检索 → 规则建议 → 响应

响应 metadata.model_version = "rule-only-v1"
```

### 5.2 LLM 调用失败时

```
配置: 有 API Key，但 API 调用失败
效果: 降级到规则引擎结果

流程:
用户输入 → 规则引擎 → LLM 调用失败 → 使用规则结果

响应 metadata.model_version = "rule-only-v1"（降级标识）
```

### 5.3 系统异常时

```
效果: 返回保守的中风险响应

响应:
{
  risk_level: 'medium',
  risk_score: 50,
  immediate_action: '系统遇到问题，建议您今天联系您的医疗团队',
  metadata.model_version: 'fallback-v1'
}
```

---

## 六、配置与扩展

### 6.1 环境变量

```bash
# 必需
ANTHROPIC_API_KEY=your_key_here

# 可选
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # 默认模型
ANTHROPIC_MAX_TOKENS=1024                  # 最大 token 数
RAG_ENABLED=true                          # 是否启用 RAG
APP_ENV=development                        # 环境
LOG_LEVEL=info                             # 日志级别
```

### 6.2 扩展症状类型

```typescript
// 在 src/tools/symptom-parser.ts 中添加
const SYMPTOM_PATTERNS = {
  // ... 现有 11 种

  // 新增症状示例
  insomnia: {
    standard_term: '失眠',
    keywords: ['失眠', '睡不着', '睡眠不好'],
    default_severity: 'mild',
  },
};
```

### 6.3 扩展风险规则

```typescript
// 在 src/tools/risk-assessor.ts 中添加
const HIGH_RISK_RULES = [
  // ... 现有 6 条

  // 新增高风险规则
  {
    id: 'HR-007',
    name: '严重出血',
    trigger_terms: ['大出血', '出血不止'],
    action: '立即就医',
  },
];
```

### 6.4 更换 LLM 模型

```typescript
// 在 src/lib/env.ts 中修改
const DEFAULT_CONFIG = {
  anthropic_model: 'claude-opus-4-20250514',  // 更换为更强大的模型
  // ...
};
```

---

## 七、测试策略

### 7.1 单元测试（待实现）

```typescript
// tests/orchestrator.test.ts
describe('AssessmentOrchestrator', () => {
  it('高风险症状应直接返回，不调用 LLM', async () => {
    const result = await orchestrator.assess({
      user_id: 'test',
      input: '突然感觉胸闷，呼吸困难',
    });

    expect(result.risk_level).toBe('high');
    expect(result.metadata.model_version).toBe('rule-only-v1');
  });

  it('中风险症状应触发 LLM 评估', async () => {
    const result = await orchestrator.assess({
      user_id: 'test',
      input: '恶心想吐已经2天了，吃不下东西',
    });

    expect(result.risk_level).toBe('medium');
  });

  it('系统异常时应返回保守中风险', async () => {
    // 测试降级逻辑
  });
});
```

### 7.2 测试用例覆盖

| 场景 | 输入 | 预期结果 |
|------|------|---------|
| 高风险-呼吸困难 | "突然感觉胸闷，呼吸困难" | high, rule-only-v1 |
| 高风险-高热 | "发烧到39度了" | high, rule-only-v1 |
| 中风险-持续恶心 | "恶心想吐已经2天了" | medium |
| 低风险-轻微疲劳 | "有点累" | low |
| 模糊描述 | "感觉不太舒服" | 取决于 LLM |
| 无 API Key | 任意输入 | rule-only-v1 |

---

*本文件最后更新：2026-05-16*
