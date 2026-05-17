# SPEC-7 — Conversation State & Episode Memory

**版本**: v0.2
**状态**: Draft
**依赖**: SPEC-1（Intent Framing Agent）
**实现优先级**: P1（多轮对话核心）

---

## 7.1 目标

新增 Conversation State & Episode Memory 系统，用于：

1. **维护**多轮对话状态
2. **管理**临床 Episode（事件）
3. **追踪**症状变化趋势
4. **持久化**会话数据（KV/D1）
5. **记录**工作假设、未解决不确定性与澄清历史
6. 支持**追问状态**和**会话恢复**

**关键约束**: Episode 是核心抽象，不是简单的 messages 数组；系统必须知道上一轮在判断什么、还不知道什么、这轮是否改变了结论资格。

---

## 7.2 核心类型

### Episode（临床事件）

```typescript
interface Episode {
  // 身份
  episode_id: string;
  session_id: string;
  user_id: string;

  // 时间
  started_at: string;
  updated_at: string;
  status: "active" | "resolved" | "escalated";

  // 症状记录
  symptoms: {
    reported: string[];
    extracted: ExtractedSymptom[];
  };

  // 评估历史
  assessments: {
    assessment_id: string;
    risk_level: "high" | "medium" | "low";
    decision_mode: "conclusive" | "provisional" | "insufficient";
    risk_score: number;
    confidence: number;
    timestamp: string;
    agent_source: string;
  }[];

  // 当前工作假设
  working_hypotheses: {
    primary?: string;
    alternatives: string[];
    updated_at: string;
  };

  // 未解决不确定性
  unresolved_uncertainties: {
    item: string;
    impact: string;
    status: "open" | "resolved";
  }[];

  // 澄清历史
  clarification_history: {
    round: number;
    question_goal: string;
    question_text: string;
    answer?: string;
    impact_on_assessment: string;
    status: "asked" | "answered" | "skipped";
  }[];

  // 当前对话模式
  current_response_mode?: "clarify" | "provisional_assessment" | "conclusive_assessment" | "escalation" | "route_out";
  last_safe_action_recommendation?: string;
  last_decision_mode?: "conclusive" | "provisional" | "insufficient";

  // 上下文摘要
  context_summary: string;
}

interface ExtractedSymptom {
  term: string;
  standard_term: string;
  category: string;
  severity: "mild" | "moderate" | "severe";
  duration?: string;
  trend?: "worsening" | "improving" | "stable";
}
```

### Session（会话）

```typescript
interface Session {
  session_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  status: "active" | "clarifying" | "assessing" | "completed" | "expired";
  episodes: { episode_id: string; status: string; started_at: string; last_activity: string }[];
  active_episode_id?: string;
}
```

---

## 7.3 Session 管理

### 创建 Session

```typescript
async function createSession(userId: string): Promise<Session> {
  const session: Session = {
    session_id: generateId("sess_"),
    user_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    status: "active",
    episodes: [],
    active_episode_id: undefined,
  };
  await sessionStore.save(session);
  return session;
}
```

### 创建 Episode

```typescript
async function createEpisode(session: Session, firstMessage: string): Promise<Episode> {
  const episode: Episode = {
    episode_id: generateId("ep_"),
    session_id: session.session_id,
    user_id: session.user_id,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "active",
    symptoms: { reported: [firstMessage], extracted: [] },
    assessments: [],
    working_hypotheses: { alternatives: [], updated_at: new Date().toISOString() },
    unresolved_uncertainties: [],
    clarification_history: [],
    context_summary: firstMessage.slice(0, 100),
  };

  session.episodes.push({ episode_id: episode.episode_id, status: "active", started_at: episode.started_at, last_activity: episode.updated_at });
  session.active_episode_id = episode.episode_id;

  await episodeStore.save(episode);
  await sessionStore.save(session);
  return episode;
}
```

---

## 7.4 症状变化与判断状态追踪

```typescript
function calculateSymptomTrends(current: string[], previous: ExtractedSymptom[]): ("worsening" | "improving" | "stable" | "unknown")[] {
  return current.map(symptom => {
    const prev = previous.find(p => p.term.includes(symptom) || symptom.includes(p.term));
    if (!prev) return "unknown";
    if (symptom.includes("更") || symptom.includes("加重")) return "worsening";
    if (symptom.includes("好转") || symptom.includes("减轻")) return "improving";
    return "stable";
  });
}
```

除了症状趋势，还需要追踪：
- 上轮判断模式是 conclusive / provisional / insufficient
- 本轮是否关闭了某个 critical unknown
- 本轮是否需要升级 risk floor

---

## 7.5 历史上下文生成

```typescript
function buildConversationContext(session: Session, episode: Episode, maxTurns = 10): ConversationContext {
  const recentTurns = turnStore.getByEpisode(episode.episode_id).slice(-maxTurns);
  const historicalSymptoms = episode.symptoms.extracted.map(s => s.term);
  const historicalRiskLevels = episode.assessments.map(a => a.risk_level);
  const symptomTrends = calculateSymptomTrends(historicalSymptoms, episode.symptoms.extracted);

  return {
    episode_summary: generateEpisodeSummary(episode),
    recent_turns: recentTurns.map(t => ({ role: t.role, content: t.content.slice(0, 200) })),
    historical_symptoms: historicalSymptoms,
    historical_risk_levels: historicalRiskLevels,
    symptom_trends: symptomTrends,
    unresolved_uncertainties: episode.unresolved_uncertainties.filter(u => u.status === "open").map(u => u.item),
    last_decision_mode: episode.last_decision_mode,
    current_response_mode: episode.current_response_mode,
    time_since_last_assessment: episode.assessments.length > 0
      ? Date.now() - new Date(episode.assessments.at(-1)!.timestamp).getTime()
      : null,
  };
}
```

---

## 7.6 会话状态机

```
active ──[首条消息]──► active (with episode)
  ├─[结构化收集]──► clarifying
  ├─[澄清中]──────► clarifying ──[用户回答]──► active
  ├─[评估中]──────► assessing ──[评估完成]──► active
  ├─[升级]────────► active (episode escalated)
  ├─[30min无活动]─► expired
  └─[用户关闭]────► completed
```

---

## 7.7 验收标准

- [ ] 能创建 session 和 episode
- [ ] 能追加 assessment 记录（含 decision_mode）
- [ ] 能追踪症状变化趋势
- [ ] 能维护 unresolved_uncertainties
- [ ] 能记录 clarification_history
- [ ] Session 30min 后自动过期
