# SPEC-8 — LLM Runtime (Cache + Structured Output + Constraint Injection)

**版本**: v0.2
**状态**: Draft
**依赖**: 无（基础设施）
**实现优先级**: P1（性能与一致性核心）

---

## 8.1 目标

新增一个统一的 LLM Runtime，用于：

1. **统一封装**所有模型调用
2. 支持 **Prompt Cache**（降低成本）
3. 强制 **Structured Output**（JSON Schema）
4. 支持 **重试和降级**策略
5. **调用追踪**和成本统计
6. 支持 **安全约束注入** 与 **最终回复重写**
7. 区分 **reasoning output** 与 **user-visible response draft**

**关键约束**: 所有 agent / critic / synthesis 调用必须经过这个 runtime。

---

## 8.2 核心接口

### LLM Provider 抽象

```typescript
interface LLMProvider {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  listModels(): Promise<ModelInfo[]>;
}

interface ChatParams {
  model: string;
  messages: Message[];
  system?: string;
  temperature?: number;
  max_tokens?: number;
  cache_control?: { type: "ephemeral"; budget_tokens?: number };
  response_format?: { type: "json_schema"; json_schema: object };
  thinking?: { type: "enabled" | "disabled"; budget_tokens?: number };
  metadata?: {
    agent_name?: string;
    request_id?: string;
    trace_id?: string;
    phase?: "reasoning" | "critique" | "synthesis";
  };
}

interface ChatResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model: string;
  stop_reason?: string;
}
```

---

## 8.3 Runtime 配置

```typescript
interface LLMConfig {
  default_provider: "anthropic" | "claude" | "openai";
  providers: {
    anthropic?: { api_key: string; base_url?: string };
    claude?: { api_key: string; base_url?: string };
    openai?: { api_key: string; base_url?: string };
  };
  models: {
    intent_framing: string;
    triage: string;
    deliberation: string;
    critic: string;
    clarification: string;
    synthesis: string;
  };
  cache: { enabled: boolean; ttl_seconds: number; max_size_mb: number };
  retry: { max_attempts: number; initial_delay_ms: number; max_delay_ms: number; backoff_multiplier: number };
  fallback: { enabled: boolean; fallback_model?: string; fallback_provider?: string };
}
```

---

## 8.4 标准调用阶段

系统统一支持三类调用阶段：

1. **reasoning pass**
   - 给 Intent / Triage / Deliberation / Clarification Planner 使用
   - 输出结构化判断

2. **critique / constraint pass**
   - 给 Safety Critic 使用
   - 输出 violations + constraints

3. **constrained synthesis pass**
   - 给 Executive / Response Composer 使用
   - 在约束下生成最终用户回复

```typescript
type RuntimePhase = "reasoning" | "critique" | "synthesis";
```

---

## 8.5 Structured Output 实现

### JSON Schema 强制

```typescript
const OUTPUT_SCHEMAS = {
  intent_framing: { type: "object" },
  risk_deliberation: { type: "object" },
  safety_critic: { type: "object" },
  final_response: { type: "object" },
};

async function parseOutput<T>(text: string, schema: object, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const json = extractJSON(text);
      return validateSchema(json, schema) as T;
    } catch (e) {
      if (attempt === maxRetries) throw new ParseError(`Failed after ${maxRetries + 1} attempts`, text, e);
      text = fixCommonIssues(text);
    }
  }
  throw new Error("Unreachable");
}
```

---

## 8.6 安全约束注入

### 约束式最终重写

```typescript
interface SynthesisInput {
  draft_response: {
    mode: "clarify" | "provisional_assessment" | "conclusive_assessment" | "escalation" | "route_out";
    message: string;
  };
  constraints: {
    required_actions: string[];
    forbidden_claims: string[];
    required_warning_signals: string[];
    risk_floor?: "high" | "medium" | "low";
    rewrite_reason?: string;
  };
}

async function synthesizeWithConstraints(input: SynthesisInput): Promise<FinalResponse> {
  return runtime.call({
    agent: "response_synthesis",
    phase: "synthesis",
    model: config.models.synthesis,
    system: STATIC_PROMPTS.constrained_synthesis,
    messages: [{ role: "user", content: buildSynthesisPrompt(input) }],
    response_format: OUTPUT_SCHEMAS.final_response,
  });
}
```

**关键约束**：
- Safety 不能直接替代 synthesis
- synthesis 必须显式接收 constraints
- 最终用户可见内容必须来自 constrained synthesis pass

---

## 8.7 调用追踪和成本统计

```typescript
interface CallTrace {
  request_id: string;
  trace_id: string;
  agent_name: string;
  phase: RuntimePhase;
  model: string;
  provider: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  usage?: { input_tokens: number; output_tokens: number; cache_read_tokens?: number };
  estimated_cost_usd?: number;
  success: boolean;
  error?: string;
}
```

建议在 trace 中保留：
- reasoning summary
- uncertainty summary
- safety constraints summary
- final response mode

这样可以完整复盘：
- 为什么先澄清而不是直接评估
- 为什么只给 provisional
- 为什么 final response 被强制改写

---

## 8.8 集成示例

```typescript
class ConversationExecutiveAgent {
  async assess(input: AssessRequest): Promise<SystemResponse> {
    const framing = await runtime.callReasoning("intent_framing", input);
    const deliberation = await runtime.callReasoning("risk_deliberation", buildDeliberationInput(framing, input));
    const draft = responseComposer.compose(deliberation);
    const critique = await runtime.callCritique("safety_critic", { deliberation, draft });
    return runtime.callSynthesis("response_synthesis", { draft_response: draft, constraints: critique.constraints });
  }
}
```

---

## 8.9 验收标准

- [ ] 所有 agent 调用经过统一 runtime
- [ ] Prompt Cache 正常工作
- [ ] Structured Output 强制验证
- [ ] 重试策略生效
- [ ] 追踪记录完整
- [ ] 支持 reasoning / critique / synthesis 三阶段
- [ ] 支持安全约束注入最终生成
- [ ] Cache 命中率 > 50%（静态 prompt）
