# SABA 项目会话归档

> 归档时间：2026-05-16
> 会话方向：SABA MVP 架构实施 + Bug 修复

---

## 一、项目概述

**SABA** = Side-Effect Assessment for Breast cancer patients with AI-powered feedback

乳腺癌患者副作用管理系统，核心价值：
- 即时性：7x24 小时秒级响应
- 专业性：基于循证医学指南
- 进化性：持续学习闭环

---

## 二、核心架构

### 规则 + RAG + LLM 三层架构

| 层级 | 职责 | 置信度 |
|------|------|--------|
| Layer 1: 规则引擎 | 高优先级规则匹配，直接返回 | 0.95+ |
| Layer 2: RAG 检索 | 检索相关指南片段，提供上下文 | 0.90+ |
| Layer 3: LLM 推理 | 综合判断，生成最终结论 | 0.85+ |

---

## 三、已完成工作

### 3.1 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 评估编排器 | `src/agents/orchestrator.ts` | Root Agent 实现 |
| 症状解析 | `src/tools/symptom-parser.ts` | 11 种症状模式 |
| 风险评估 | `src/tools/risk-assessor.ts` | 6 高风险 + 6 中风险规则 |
| 建议生成 | `src/tools/advice-generator.ts` | 分级建议 + 警告信号 |
| RAG 检索 | `src/rag/retriever.ts` | 知识库 + 规则索引 |
| API Handler | `src/api/handler.ts` | Cloudflare Workers 入口 |
| 前端组件 | `src/components/` | React 组件 |
| API 客户端 | `src/client.ts` | 前端调用封装 |

### 3.2 文档

| 文档 | 路径 |
|------|------|
| 产品需求文档 | `docs/prd.md` |
| 架构决策记录 | `docs/02-architecture-decisions.md` |
| 数据评估 | `docs/03-data-assessment.md` |
| 前后端规约 | `docs/04-api-spec.md` |

---

## 四、运行方式

```bash
cd ~/cancer
npm install
npm run dev
```

---

## 五、测试结果 (2026-05-16)

Demo 测试全部通过：

| 案例 | 输入 | 预期 | 实际 | 分数 |
|------|------|------|------|------|
| 1 | 突然感觉胸闷，呼吸困难 | high | high | 90 |
| 2 | 恶心想吐已经2天了 | medium | medium | 71 |
| 3 | 有点累，想睡觉 | low | low | 33 |
| 4 | 浑身没劲，头有点晕 | low | low | 33 |

---

## 六、修复的 Bug

1. **TypeScript 配置**：添加 `jsx`, `lib`, `types` 支持 React
2. **LLM 类型名**：`LLM RiskAssessment` → `LLM_RiskAssessment`
3. **RAG 兼容方法**：`retrieveBySymptoms` 添加到 `RAGRetriever` 类
4. **Orchestrator 引用**：修复 `riskResult.reasoning` → `riskResult.decision_chain`
5. **API 客户端**：添加 JSON 解析类型断言
6. **客户端组件**：`onSubmit` 类型从 `Promise<AssessResponse>` 改为 `Promise<void>`

---

## 七、待完成工作

1. **LLM 集成**：配置 ANTHROPIC_API_KEY 启用 Claude 增强分析
2. **数据库集成**：连接 D1 实现历史记录持久化
3. **团队通知**：集成邮件/推送通知
4. **前端部署**：配置 Cloudflare Pages 部署前端

---

*归档完成时间：2026-05-16T01:50:00Z*
