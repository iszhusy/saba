# SABA 前后端规约 v1.0

> 制定时间：2026-05-16
> 状态：✅ 已通过架构评审 (2026-05-16)

---

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          前端 (Web/H5)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  评估页面    │  │  历史页面    │  │  团队协作    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼──────────────────┼─────────────────────┘
          │                 │                  │
          └─────────────────┼──────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API 网关 (Cloudflare)                       │
│              认证、限流、日志、路由、CORS                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    后端服务 (Cloudflare Workers)                    │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ AssessmentAPI│  │ HistoryAPI   │  │  TeamAPI     │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                  │                  │                     │
│         └──────────────────┼──────────────────┘                     │
│                            ▼                                        │
│                   ┌──────────────┐                                 │
│                   │  AI Engine   │                                 │
│                   │ (Claude API) │                                 │
│                   └──────────────┘                                 │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │    D1 DB     │  │   KV Store   │  │  R2 Storage  │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、核心数据模型

### 2.1 评估记录 (Assessment)

```typescript
// 请求
interface AssessRequest {
  user_id: string;           // UUID
  input: string;             // 用户原始输入文本
  context?: {
    treatment_phase?: string;    // e.g., "chemotherapy_cycle_2"
    treatment_type?: string;   // e.g., "AC-T"
    treatment_day?: number;     // 治疗第几天
    known_side_effects?: string[]; // 已知的副作用
  };
}

// 响应
interface AssessResponse {
  assessment_id: string;      // UUID
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number;        // 0-100
  result: {
    level: string;
    label: string;           // "高风险" / "中风险" / "低风险"
    color: string;           // "#EF4444" / "#F59E0B" / "#22C55E"
  };
  immediate_action: string;  // 立即行动建议
  reasoning: string;         // AI生成的推理过程（用户可读）
  triggered_rules: Array<{
    id: string;
    name: string;
    confidence: number;      // 0-1
    source: string;
  }>;
  team_contact_required: boolean;
  follow_up_suggestion?: string;
  warning_signs?: string[];   // 警告信号列表
  metadata: {
    model_version: string;
    rules_version: string;
    processing_time_ms: number;
  };
  created_at: string;        // ISO 8601
}

// 评估记录详情
interface AssessmentDetail extends AssessResponse {
  raw_input: string;
  structured_input?: {
    symptoms: Symptom[];
    duration?: string;
  };
  evidence?: Evidence[];
  reasoning_chain: string[];
}

// 症状结构
interface Symptom {
  name: string;
  standard_term: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
}

// 证据详情
interface Evidence {
  step: number;
  type: 'rule_match' | 'rag_reference' | 'llm_reasoning';
  description: string;
  confidence: number;
  source?: string;
}
```

### 2.2 反馈 (Feedback)

```typescript
interface FeedbackRequest {
  assessment_id: string;
  feedback_type: 'user_rating' | 'team_verdict' | 'behavior';
  // 显式反馈
  is_helpful?: boolean;
  rating?: number;           // 1-5
  // 隐式反馈
  user_acted?: boolean;
  user_sought_medical_help?: boolean;
  // 团队反馈
  team_verdict?: 'accurate' | 'inaccurate' | 'needs_adjustment';
  team_comment?: string;
}

interface FeedbackResponse {
  feedback_id: string;
  created_at: string;
}
```

### 2.3 团队通知 (Team Notification)

```typescript
interface TeamNotifyRequest {
  assessment_id: string;
  patient_id: string;
  notification_type: 'high_risk' | 'medium_risk' | 'team_contact';
  message?: string;          // 可选的附加消息
}

interface TeamNotifyResponse {
  notification_id: string;
  sent_at: string;
  recipients: string[];      // 通知到的团队成员 ID 列表
}
```

### 2.4 历史记录查询

```typescript
interface HistoryQuery {
  user_id: string;
  page?: number;             // 默认 1
  limit?: number;            // 默认 20, 最大 100
  risk_level?: 'high' | 'medium' | 'low';  // 筛选
  start_date?: string;       // ISO 8601
  end_date?: string;
}

interface HistoryResponse {
  assessments: AssessmentSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

interface AssessmentSummary {
  assessment_id: string;
  risk_level: 'high' | 'medium' | 'low';
  result_label: string;
  result_color: string;
  symptom_summary: string;    // 症状摘要
  immediate_action: string;
  created_at: string;
}
```

---

## 三、API 接口规范

### 3.1 评估接口

#### POST /api/v1/assess

提交副作用评估（核心接口）

**请求头**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体**:
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "input": "恶心想吐已经2天了，吃不下东西，浑身没劲",
  "context": {
    "treatment_phase": "chemotherapy_cycle_2",
    "treatment_type": "AC-T",
    "treatment_day": 5,
    "known_side_effects": ["fatigue", "nausea"]
  }
}
```

**响应** (200 OK):
```json
{
  "assessment_id": "660e8400-e29b-41d4-a716-446655440001",
  "risk_level": "medium",
  "risk_score": 65,
  "result": {
    "level": "medium",
    "label": "中风险",
    "color": "#F59E0B"
  },
  "immediate_action": "建议您今天联系您的医疗团队，他们可能需要调整您的止吐方案",
  "reasoning": "您描述的恶心呕吐已持续2天，且影响进食，根据化疗副作用管理指南，这属于需要医疗团队评估的情况",
  "triggered_rules": [
    {
      "id": "MR-002",
      "name": "恶心呕吐影响进食",
      "confidence": 0.85,
      "source": "treatment_guideline"
    }
  ],
  "team_contact_required": true,
  "follow_up_suggestion": "如果出现以下情况请立即就医：呕吐带血、无法进水超过12小时、出现发热",
  "warning_signs": [
    "呕吐带血",
    "无法进水超过12小时",
    "出现高烧（>38.5°C）"
  ],
  "metadata": {
    "model_version": "v1.0.0",
    "rules_version": "v1.0.0",
    "processing_time_ms": 120
  },
  "created_at": "2026-05-16T14:30:00Z"
}
```

**错误响应**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "user_id 是必填字段",
    "details": [
      { "field": "user_id", "message": "不能为空" }
    ]
  }
}
```

| 状态码 | 说明 |
|--------|------|
| 200 | 评估成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 429 | 请求过于频繁（限流） |
| 500 | 服务器内部错误 |

---

#### GET /api/v1/assessments/:id

获取评估详情

**响应** (200 OK):
```json
{
  "assessment_id": "660e8400-e29b-41d4-a716-446655440001",
  "risk_level": "medium",
  "risk_score": 65,
  "result": {
    "level": "medium",
    "label": "中风险",
    "color": "#F59E0B"
  },
  "raw_input": "恶心想吐已经2天了，吃不下东西，浑身没劲",
  "structured_input": {
    "symptoms": [
      { "name": "恶心呕吐", "standard_term": "nausea_vomiting", "confidence": 0.95, "severity": "moderate" },
      { "name": "食欲下降", "standard_term": "decreased_appetite", "confidence": 0.85, "severity": "mild" }
    ],
    "duration": "2天"
  },
  "immediate_action": "建议您今天联系您的医疗团队",
  "reasoning": "您描述的恶心呕吐已持续2天...",
  "evidence": [
    { "step": 1, "type": "rule_match", "description": "匹配规则 MR-002", "confidence": 0.95, "source": "MR-002" },
    { "step": 2, "type": "rag_reference", "description": "检索到化疗副作用管理指南", "confidence": 0.92, "source": "chemo_guide_v1" },
    { "step": 3, "type": "llm_reasoning", "description": "综合判断为中风险", "confidence": 0.88 }
  ],
  "triggered_rules": [...],
  "reasoning_chain": [
    "1. 您的症状（恶心+食欲下降）持续2天，符合MR-002规则",
    "2. 根据化疗副作用管理指南，这类症状需要团队关注",
    "3. 结合您的治疗阶段（化疗后），需要密切监测",
    "4. 综合判断：中风险，建议24小时内联系团队"
  ],
  "team_contact_required": true,
  "follow_up_suggestion": "如果出现以下情况请立即就医...",
  "metadata": {...},
  "created_at": "2026-05-16T14:30:00Z"
}
```

---

#### GET /api/v1/assessments

获取评估历史列表

**查询参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页数量，最大100 |
| risk_level | string | - | 筛选风险等级 |
| start_date | string | - | 开始日期 |
| end_date | string | - | 结束日期 |

**响应** (200 OK):
```json
{
  "assessments": [
    {
      "assessment_id": "660e8400-e29b-41d4-a716-446655440001",
      "risk_level": "medium",
      "result_label": "中风险",
      "result_color": "#F59E0B",
      "symptom_summary": "恶心呕吐 2天，食欲下降",
      "immediate_action": "建议您今天联系您的医疗团队",
      "created_at": "2026-05-16T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

---

### 3.2 反馈接口

#### POST /api/v1/feedback

提交反馈

**请求体**:
```json
{
  "assessment_id": "660e8400-e29b-41d4-a716-446655440001",
  "feedback_type": "user_rating",
  "is_helpful": true,
  "rating": 4
}
```

**响应** (201 Created):
```json
{
  "feedback_id": "770e8400-e29b-41d4-a716-446655440002",
  "created_at": "2026-05-16T15:00:00Z"
}
```

---

### 3.3 团队协作接口

#### POST /api/v1/team/notify

发送团队通知

**请求体**:
```json
{
  "assessment_id": "660e8400-e29b-41d4-a716-446655440001",
  "patient_id": "550e8400-e29b-41d4-a716-446655440000",
  "notification_type": "medium_risk",
  "message": "患者化疗后持续恶心呕吐，请关注"
}
```

**响应** (201 Created):
```json
{
  "notification_id": "880e8400-e29b-41d4-a716-446655440003",
  "sent_at": "2026-05-16T15:05:00Z",
  "recipients": ["doctor_001", "nurse_002"]
}
```

---

#### GET /api/v1/team/assessments

医疗团队查看患者评估列表

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| patient_id | string | 是 | 患者 ID |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |
| risk_level | string | 否 | 筛选风险等级 |

**响应** (200 OK):
```json
{
  "assessments": [
    {
      "assessment_id": "660e8400-e29b-41d4-a716-446655440001",
      "patient_id": "550e8400-e29b-41d4-a716-446655440000",
      "risk_level": "medium",
      "symptom_summary": "恶心呕吐 2天",
      "created_at": "2026-05-16T14:30:00Z",
      "team_contact_required": true
    }
  ],
  "pagination": {...}
}
```

---

### 3.4 系统接口

#### GET /api/v1/health

健康检查

**响应** (200 OK):
```json
{
  "status": "healthy",
  "version": "v1.0.0",
  "timestamp": "2026-05-16T14:30:00Z"
}
```

---

#### GET /api/v1/rules/versions

获取当前规则版本

**响应** (200 OK):
```json
{
  "current_version": "v1.0.0",
  "updated_at": "2026-01-15T10:00:00Z",
  "rules_summary": {
    "high_risk": 6,
    "medium_risk": 6,
    "low_risk": 5
  }
}
```

---

## 四、错误码规范

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| VALIDATION_ERROR | 400 | 请求参数验证失败 |
| UNAUTHORIZED | 401 | 未授权或 token 过期 |
| FORBIDDEN | 403 | 无权访问该资源 |
| NOT_FOUND | 404 | 资源不存在 |
| RATE_LIMITED | 429 | 请求过于频繁 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| AI_SERVICE_ERROR | 503 | AI 服务不可用 |

---

## 五、WebSocket 实时接口 (可选 v1.1)

用于评估进度实时反馈：

```
WS /api/v1/ws/assess/:assessment_id

// 连接
wscat -c ws://api.saba.com/api/v1/ws/assess/660e8400-...

// 消息类型
{
  "type": "processing" | "completed" | "error",
  "assessment_id": "...",
  "progress": 50,  // 0-100
  "current_step": "symptom_parsing"
}
```

---

## 六、前端组件契约

### 6.1 评估页面状态机

```
┌─────────────┐     用户输入     ┌──────────────┐
│   IDLE      │ ───────────────▶ │  SUBMITTING  │
│  (初始状态)  │                  │  (提交中)     │
└─────────────┘                  └──────┬───────┘
      ▲                                │
      │           ┌────────────────────┘
      │           │ 评估完成
      │           ▼
      │    ┌──────────────┐     ┌────────────┐
      │    │   RESULT      │     │   ERROR    │
      │    │ (显示结果)    │     │ (显示错误)  │
      │    └──────┬───────┘     └────────────┘
      │           │
      │           ▼
      │    ┌──────────────┐
      └────│   FEEDBACK   │
           │ (收集反馈)   │
           └──────────────┘
```

### 6.2 核心组件列表

| 组件 | 说明 | 状态 |
|------|------|------|
| AssessmentForm | 评估输入表单 | 必需 |
| RiskBadge | 风险等级标签 | 必需 |
| ResultCard | 结果展示卡片 | 必需 |
| ReasoningChain | 推理链展示 | 必需 |
| WarningSigns | 警告信号列表 | 必需 |
| ActionButtons | 操作按钮（联系团队/返回） | 必需 |
| HistoryList | 历史评估列表 | 必需 |
| HistoryItem | 历史记录项 | 必需 |
| FeedbackForm | 反馈表单 | MVP后 |
| TeamNotification | 团队通知组件 | MVP后 |

---

## 七、数据存储策略

### 7.1 Cloudflare D1 (SQLite)

```sql
-- 评估记录
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  structured_input TEXT,  -- JSON string
  risk_level TEXT NOT NULL,
  risk_score REAL,
  immediate_action TEXT,
  reasoning TEXT,
  evidence TEXT,          -- JSON string
  triggered_rules TEXT,   -- JSON string
  team_contact_required INTEGER DEFAULT 0,
  follow_up_suggestion TEXT,
  metadata TEXT,          -- JSON string
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_created_at ON assessments(created_at);
CREATE INDEX idx_assessments_risk_level ON assessments(risk_level);

-- 反馈
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  feedback_type TEXT,
  is_helpful INTEGER,
  rating INTEGER,
  user_acted INTEGER,
  user_sought_medical_help INTEGER,
  team_verdict TEXT,
  team_comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_feedback_assessment_id ON feedback(assessment_id);
```

### 7.2 Cloudflare KV

```
键模式:
  session:{user_id}:{session_id} -> 会话上下文 JSON
  rules:current -> 当前规则版本信息
  cache:symptom:{hash} -> 症状解析缓存
```

### 7.3 R2 Storage

```
bucket: saba-knowledge-base
  /guidelines/chemo_guide_v1.md
  /guidelines/targeted_therapy_guide.md
  /rules/rules_v1.0.0.json
```

---

## 八、版本演进计划

| 版本 | 功能 | 状态 |
|------|------|------|
| v1.0 | 核心评估 API | 当前 |
| v1.1 | WebSocket 实时反馈 | 规划 |
| v1.2 | 团队端完整功能 | 规划 |
| v2.0 | 学习闭环基础功能 | 规划 |

---

## 九、兼容性说明

- 所有时间字段使用 ISO 8601 格式
- 所有 ID 使用 UUID v4
- 响应字段使用 camelCase
- 支持 CORS 跨域
- 支持 gzip 压缩

---

*文档状态：待架构评审后定稿*