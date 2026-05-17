# SABA

**S**ide-effect **A**ssessment for **B**reast cancer patients with **A**I-powered feedback

面向乳腺癌患者**副作用报告**场景的 AI-native 临床判断系统：由单一对话执行主体（Conversation Executive）驱动，在安全约束下完成分流、澄清与保守建议。**不诊断、不开药、不替医嘱。**

---

## 能力概览

- 多轮对话评估（`/lab`），流式返回评估进度与结论
- 风险分级与保守建议，安全约束注入 synthesis
- 患者基线、会话/评估历史（D1 + KV）
- 临床手稿风格 Web UI（落地页 + 对话实验室）

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Cloudflare Workers |
| 数据库 | D1（主存储）、KV（评估缓存） |
| 前端 | React 18、Vite、React Router |
| LLM | Anthropic Claude / 阿里 DashScope（可切换） |
| 测试 | Vitest、Playwright |

## 架构要点

- **唯一对用户发言**：`ConversationExecutive`（`src/agents/conversation-executive.ts`）
- Reasoning 节点只产 **surface**；Safety 产 **constraints**；状态以 **Episode** 为单位
- 规格与契约：[`docs/specs-ai-native/`](docs/specs-ai-native/) · 类型真相源：[`src/types/index.ts`](src/types/index.ts)
- 服务端模块说明：[`docs/server-architecture.md`](docs/server-architecture.md)

参与开发或改代码前，请先读 [`AGENTS.md`](AGENTS.md)。

---

## 快速开始（本地）

### 环境要求

- Node.js 20+
- npm
- （可选）已登录的 Cloudflare 账号：`npx wrangler login`

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

在 `.env` 中至少配置一种 LLM（`ANTHROPIC_API_KEY` 或 `DASHSCOPE_API_KEY`），并设置 `LLM_PROVIDER`。

`.env` 已在 `.gitignore` 中，**勿提交**。

### 3. 初始化本地 D1（推荐）

```bash
npm run d1:local:init
```

默认使用 wrangler 本地 D1（`.wrangler/state`）。若只想内存存储，可在 `.env` 中设置 `SABA_DEV_STORAGE=memory`。

### 4. 启动开发服务

```bash
npm run dev
```

浏览器打开 **http://localhost:5173**：

| 路径 | 说明 |
|------|------|
| `/` | 落地页 |
| `/lab` | 对话评估 |

Vite 开发服务器会通过中间件代理 `/api/v1/*` 到本地 dev-api（与 Workers 路由一致）。

---

## 常用命令

```bash
npm run dev              # 前端 + 本地 API
npm run build:web        # 构建静态资源到 public/
npm run build            # TypeScript 编译检查
npm run test             # 单元测试
npm run test:arch        # 架构不变量
npm run harness -- ec    # 评估 harness（示例：executive 场景）
npm run test:e2e         # Playwright E2E / 视觉回归
npm run lint             # ESLint
```

---

## 部署到 Cloudflare

仓库**不包含**账号专属的 `wrangler.toml` 与部署脚本（见 `.gitignore`）。按下列步骤在本地配置后发布。

### 1. Wrangler 配置

```bash
cp wrangler.toml.example wrangler.toml
npx wrangler login
```

创建远程资源并填入 `wrangler.toml` 中的占位 ID：

```bash
npx wrangler kv namespace create ASSESSMENTS_KV
npx wrangler d1 create saba-db
```

### 2. 应用 D1 Schema

```bash
npx wrangler d1 execute saba-db --remote --file=src/storage/schema.sql
```

### 3. 配置密钥与非敏感变量

敏感项使用 secret（勿写入 git）：

```bash
npx wrangler secret put DASHSCOPE_API_KEY
# 或
npx wrangler secret put ANTHROPIC_API_KEY
```

非敏感项可在 `wrangler.toml` 的 `[vars]` 中设置，例如 `APP_ENV`、`LLM_PROVIDER`、`RAG_ENABLED`（参考 `.env.example`）。

### 4. 构建并发布

```bash
npm run build:web
npx wrangler deploy
```

部署成功后，在 Workers 控制台查看 `*.workers.dev` 地址。前端由 Worker 的 `ASSETS` 绑定托管，`/api/v1/*` 由同一 Worker 处理。

健康检查：

```bash
curl https://<your-worker>.workers.dev/api/v1/health
```

---

## 项目结构

```
src/
  agents/           # Conversation Executive
  api/              # Workers 入口 handler.ts
  components/       # React UI
  dev-api/          # Vite 开发期 API 中间件
  lib/              # LLM、配置、trace 等
  modules/          # 意图、分诊、风险审议等 reasoning
  services/         # 评估管道、会话状态
  storage/          # D1 schema 与 repository
  tools/            # harness、评估工具
  types/            # 契约类型
  web/              # 路由、页面样式
docs/
  specs-ai-native/  # AI-native 规格（权威）
public/             # Vite 构建产物（部署用）
```

---

## API 摘要

基路径：`/api/v1`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `POST` | `/assess` | 同步评估 |
| `POST` | `/assess/stream` | SSE 流式评估 |
| `GET` | `/assessments` | 评估列表 |
| `GET` | `/session` | 当前活跃会话 |
| `POST` | `/baseline` | 更新患者基线 |
| `GET` | `/baseline` | 读取患者基线 |

完整契约见 [`src/types/index.ts`](src/types/index.ts) 与 [`docs/specs-ai-native/02-contracts.md`](docs/specs-ai-native/02-contracts.md)。

---

## 安全与配置说明

- **不要**将 `wrangler.toml`（含真实 D1/KV ID）、`.env`、API 密钥提交到 git
- 仓库仅提供 [`wrangler.toml.example`](wrangler.toml.example) 与 [`.env.example`](.env.example)
- 历史提交中 `wrangler.toml` 仅为占位符；生产 ID 与 secrets 仅存在于本地/Cloudflare 控制台

---

## 许可证

见仓库根目录许可证文件（若有）。临床场景下本系统仅供辅助信息参考，不能替代专业医疗判断。
