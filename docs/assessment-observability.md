# Assessment Observability 介绍

## 背景

当前工程已经为评估主流程补齐行为可观测性，用于回答以下问题：

- 用户有没有进入评估流程
- 用户是否真的提交了症状描述
- 系统是否进入了澄清分支
- 用户是否被要求补充治疗基线
- 用户是否完成了基线填写
- 用户是否查看了结果
- 用户是否打开过历史记录
- 用户是否从历史记录回看某次评估
- 用户是否点击了联系团队
- 用户是否在中途关闭评估

这些事件主要服务于产品分析、漏斗分析、流程优化和问题排查。

## 审计要求覆盖

当前已按审计要求覆盖以下页面与接口：

### 前端页面

- 用户输入页：进入评估、提交评估、澄清与基线补充过程均可追踪，入口在 [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx)
- 结果页：显式展示命中规则、生成时间、规则版本号，组件见 [src/components/chat/ChatResultMessage.tsx](../src/components/chat/ChatResultMessage.tsx) 和 [src/components/assessment/ResultCard.tsx](../src/components/assessment/ResultCard.tsx)
- 历史记录页：每条历史记录展示命中规则、生成时间、规则版本号，见 [src/components/history/HistoryList.tsx](../src/components/history/HistoryList.tsx)

### 后端接口

- 提交评估 `/api/v1/assess`：返回 `triggered_rules`、`created_at`、`metadata.rules_version`
- 获取结果 `/api/v1/assessments/:id`：返回 `triggered_rules`、`created_at`、`metadata.rules_version`
- 获取历史 `/api/v1/assessments`：每条 summary 返回 `triggered_rules`、`created_at`、`rules_version`
- 创建协同请求 `/api/v1/team/notify`：返回 `notification_id`、`assessment_id`、`created_at`、`status`、`recipients`

以上链路分别见 [src/api/handler.ts](../src/api/handler.ts)、[src/dev-api/middleware.ts](../src/dev-api/middleware.ts)、[src/storage/repository.ts](../src/storage/repository.ts)。

## 事件写入链路

前端统一通过 `sabaClient.trackBehaviorEvent()` 调用 `/api/v1/events`。

- 前端调用入口：[src/client.ts](../src/client.ts)
- 事件请求构造：[src/lib/assessment-observability.ts](../src/lib/assessment-observability.ts)
- Workers API 入口：[src/api/handler.ts](../src/api/handler.ts)
- 本地 dev-api 入口：[src/dev-api/middleware.ts](../src/dev-api/middleware.ts)
- D1 仓储：[src/storage/repository.ts](../src/storage/repository.ts)
- D1 表结构：[src/storage/schema.sql](../src/storage/schema.sql)

最终事件会写入 `assessment_events` 表。

## 当前事件清单

### 核心事件

| 事件名 | 含义 | 触发位置 |
| --- | --- | --- |
| `assessment_started` | 用户进入评估流程 | [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx) |
| `assessment_submitted` | 用户提交一轮症状描述 | [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx) |
| `result_viewed` | 用户查看评估结果 | [src/components/chat/ChatResultMessage.tsx](../src/components/chat/ChatResultMessage.tsx), [src/components/App.tsx](../src/components/App.tsx) |
| `contact_team_clicked` | 用户点击联系团队 | [src/components/App.tsx](../src/components/App.tsx) |
| `assessment_closed` | 用户退出评估流程 | [src/components/App.tsx](../src/components/App.tsx) |

### 扩展事件

| 事件名 | 含义 | 触发位置 |
| --- | --- | --- |
| `assessment_clarification_requested` | 本轮评估进入澄清分支 | [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx) |
| `assessment_baseline_prompted` | 系统要求用户补充治疗基线 | [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx) |
| `assessment_baseline_submitted` | 用户提交治疗基线 | [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx) |
| `assessment_baseline_submit_failed` | 治疗基线提交失败 | [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx) |
| `history_viewed` | 用户打开历史记录页 | [src/components/App.tsx](../src/components/App.tsx) |
| `history_item_selected` | 用户从历史记录中选择某次评估 | [src/components/App.tsx](../src/components/App.tsx) |

## 事件字段说明

所有事件都遵循统一结构：

```ts
{
  event: AssessmentBehaviorEvent,
  user_id: string,
  assessment_id?: string,
  session_id?: string,
  metadata?: BehaviorEventMetadata,
}
```

定义位置：

- 事件枚举：[src/types/index.ts](../src/types/index.ts)
- 元数据定义：[src/types/index.ts](../src/types/index.ts)

### metadata 字段

| 字段 | 说明 |
| --- | --- |
| `source` | 事件来源，当前有 `conversation` / `history` / `exit` |
| `risk_level` | 风险等级快照 |
| `input_length` | 用户本轮输入长度 |
| `had_assessment_id` | 退出时是否已生成 assessment |
| `notification_type` | 联系团队时对应通知类型 |
| `clarification_question_count` | 本轮澄清问题数 |
| `baseline_question_count` | 本轮基线相关问题数 |
| `treatment_category` | 用户填写的治疗类型 |
| `history_count` | 历史列表总条数 |
| `selected_assessment_id` | 从历史页点击的 assessment id |
| `error_message` | 失败事件中的错误信息 |

## 事件表结构

`assessment_events` 表字段如下：

| 字段 | 说明 |
| --- | --- |
| `id` | 事件主键 |
| `event_name` | 事件名 |
| `user_id` | 用户 id |
| `assessment_id` | 关联评估 id，可空 |
| `session_id` | 会话 id，可空 |
| `metadata` | JSON 字符串 |
| `created_at` | 事件时间 |

见 [src/storage/schema.sql](../src/storage/schema.sql)。

## 典型分析场景

### 1. 评估漏斗

可以基于以下顺序统计转化：

1. `assessment_started`
2. `assessment_submitted`
3. `assessment_clarification_requested`
4. `assessment_baseline_prompted`
5. `assessment_baseline_submitted`
6. `result_viewed`
7. `contact_team_clicked`

### 2. 澄清分支分析

可以分析：

- 哪些用户经常进入澄清分支
- 平均每次澄清问题数是多少
- 基线提示出现频率如何
- 基线提交失败率是否异常

### 3. 历史回看分析

可以分析：

- 有多少用户会回看历史记录
- 哪些风险等级的结果更容易被回看
- 历史记录回看后是否会进一步联系团队

## 当前局限

1. 当前用户 id 仍是前端固定值 `user-123`，后续应接真实用户体系。
2. 目前只做事件写入，没有单独的查询接口或导出接口。
3. 部分事件是“尽力上报”，不会阻塞主流程。
4. 目前没有统一事件版本号，后续若埋点持续演进，建议引入 schema version。

## 后续建议

1. 增加事件查询接口，方便开发和验收。
2. 为关键事件补充 dashboard 或 SQL 模板。
3. 引入真实 user/session 标识，避免 demo 数据混淆。
4. 如果后续接 BI 平台，可在服务端增加异步 outbox 或转发层。
