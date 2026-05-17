import Anthropic from '@anthropic-ai/sdk';

async function main() {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  const system = `你是一位专注于乳腺癌患者副作用管理的临床决策支持 AI。
请以 JSON 格式返回：{"risk_level":"high|medium|low","risk_score":0-100,"reasoning":"...","warning_signs":[],"immediate_action":"...","follow_up_suggestion":"...","confidence":0-1}`;

  const user = `请评估以下乳腺癌患者描述的风险等级。
患者描述: "手指尖一直发麻，拿东西都没感觉，脚趾头也是，走路像踩棉花"
治疗类型: AC-T
治疗阶段: 化疗期间
治疗第14天
已解析的症状:
- numbness (moderate)
规则引擎评估（仅供参考）:
- 风险等级: low
- 风险分数: 30
- 触发规则: 无
- 规则置信度: 0.8`;

  const res = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  });

  console.log(JSON.stringify(res.content, null, 2));
}
main().catch(console.error);
