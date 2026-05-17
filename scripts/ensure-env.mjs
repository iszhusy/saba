import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log('[setup] 已从 .env.example 创建 .env，请填入 API Key 后重启 dev 服务。');
}

const content = readFileSync(envPath, 'utf8');
const hasDashscope = /^DASHSCOPE_API_KEY=\s*\S+/m.test(content) && !/your_dashscope/i.test(content);
const hasAnthropic = /^ANTHROPIC_API_KEY=\s*\S+/m.test(content) && !/your_anthropic/i.test(content);

if (!hasDashscope && !hasAnthropic) {
  console.warn(
    '[setup] .env 中尚未配置有效的 DASHSCOPE_API_KEY 或 ANTHROPIC_API_KEY。',
  );
  console.warn('[setup] 请编辑项目根目录 .env 填入密钥后重新运行 npm run dev');
} else {
  console.log('[setup] 已检测到 LLM API Key 配置。');
}
