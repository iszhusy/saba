// 速度测试 - 10个快速验证
import { Saba } from './src/index.js';

const cases = [
  { id: 'C-A01', input: '化疗完第三天开始恶心想吐，吃什么吐什么，喝水都困难，整个人很虚', expected: 'medium' },
  { id: 'C-A02', input: '打完化疗第五天开始拉肚子，一天跑了七八趟厕所，人都快虚脱了', expected: 'medium' },
  { id: 'C-A03', input: '嘴里全是口腔溃疡，舌头也烂了，吃东西像在割肉，太痛了', expected: 'medium' },
  { id: 'C-B01', input: '化疗后一周开始发烧，38度5，整个人没力气，嘴巴有点溃疡', expected: 'medium' },
  { id: 'C-B02', input: '身上突然出现好多小红点，刷牙的时候牙龈也出血了', expected: 'medium' },
  { id: 'C-D01', input: '输液的时候突然脸红心跳加速，喉咙有点发紧，护士马上把药停了', expected: 'high' },
  { id: 'C-C01', input: '手指尖一直发麻，拿东西都没感觉，脚趾头也是，走路像踩棉花', expected: 'low' },
  { id: 'E-F01', input: '吃内分泌药三个月了，最近总是潮热出汗，一阵一阵的，晚上更明显', expected: 'low' },
  { id: 'T-G05', input: '服用T-DXd后出现了间质性肺炎，呼吸有点困难，干咳无痰', expected: 'high' },
  { id: 'I-I02', input: '免疫治疗后出现免疫性肺炎，呼吸困难，干咳，胸闷', expected: 'high' },
];

async function main() {
  let correct = 0;
  for (const c of cases) {
    const r = await Saba.orchestrator.assess({ user_id: 'test', input: c.input });
    const ok = r.risk_level === c.expected;
    if (ok) correct++;
    console.log(`${ok ? '✅' : '❌'} ${c.id} "${c.input.slice(0,20)}..." → ${r.risk_level.toUpperCase()}(${r.risk_score}) [${r.metadata?.processing_time_ms}ms] (期望:${c.expected})`);
  }
  console.log(`\n准确率: ${correct}/10 (${correct*10}%)`);
}

main().catch(console.error);
