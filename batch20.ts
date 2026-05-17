// SABA 20 case 快速验证
// 覆盖: 化疗/靶向/免疫/内分泌/放疗 + 高/中/低风险
import { Saba } from './src/index.js';

const CASES = [
  // === 化疗消化道 ===
  { id:'C-A01', input:'化疗完第三天开始恶心想吐，吃什么吐什么，喝水都困难，整个人很虚', ctx:{treatment_type:'AC-T',treatment_phase:'化疗后',treatment_day:3}, exp:'medium' },
  { id:'C-A02', input:'打完化疗第五天开始拉肚子，一天跑了七八趟厕所，人都快虚脱了', ctx:{treatment_type:'TC',treatment_phase:'化疗后',treatment_day:5}, exp:'medium' },
  { id:'C-A03', input:'嘴里全是口腔溃疡，舌头也烂了，吃东西像在割肉，太痛了', ctx:{treatment_type:'AC-T',treatment_phase:'化疗期间',treatment_day:8}, exp:'medium' },
  { id:'C-A04', input:'最近几天胃口很差，看见什么都不想吃，强制自己吃点也会恶心', ctx:{treatment_type:'AC',treatment_phase:'化疗后',treatment_day:4}, exp:'low' },
  // === 骨髓抑制 ===
  { id:'C-B01', input:'化疗后一周开始发烧，38度5，整个人没力气，嘴巴有点溃疡', ctx:{treatment_type:'TC',treatment_phase:'化疗后',treatment_day:10}, exp:'high' },  // 骨髓抑制期发热: 高风险
  { id:'C-B02', input:'身上突然出现好多小红点，刷牙的时候牙龈也出血了', ctx:{treatment_type:'AC-T',treatment_phase:'化疗后',treatment_day:9}, exp:'medium' },
  { id:'C-B03', input:'化疗打完一周了还是觉得很累，爬个楼梯都喘，躺下就不想起来', ctx:{treatment_type:'AC',treatment_phase:'化疗后',treatment_day:7}, exp:'low' },
  { id:'C-B04', input:'白细胞检查结果很低，医生说要打升白针，但这几天我一直反复发烧', ctx:{treatment_type:'TC',treatment_phase:'化疗后',treatment_day:12}, exp:'high' },  // 骨髓抑制期反复发热: 高风险
  // === 神经毒性 ===
  { id:'C-C01', input:'手指尖一直发麻，拿东西都没感觉，脚趾头也是，走路像踩棉花', ctx:{treatment_type:'AC-T',treatment_phase:'化疗期间',treatment_day:14}, exp:'low' },
  { id:'C-C02', input:'化疗后手指脚趾发麻越来越严重了，有时候拿筷子都拿不稳', ctx:{treatment_type:'TC',treatment_phase:'化疗期间',treatment_day:20}, exp:'low' },
  // === 过敏/输液反应 ===
  { id:'C-D01', input:'输液的时候突然脸红心跳加速，喉咙有点发紧，护士马上把药停了', ctx:{treatment_type:'紫杉醇',treatment_phase:'化疗输液中',treatment_day:1}, exp:'high' },
  { id:'C-D02', input:'打完化疗脸上脖子上起了很多红疹子，特别痒，胳膊上也有', ctx:{treatment_type:'AC-T',treatment_phase:'化疗后',treatment_day:2}, exp:'low' },  // 化疗后常见皮疹，多部位但非全身扩散：low
  // === 靶向治疗 ===
  { id:'T-G01', input:'打赫赛汀第三次后开始腹泻，一天四五次，水样便，肚子咕噜咕噜叫', ctx:{treatment_type:'曲妥珠单抗',treatment_phase:'靶向治疗中',treatment_day:21}, exp:'low' },  // 靶向药已知腹泻，无脱水：low
  { id:'T-G02', input:'服用CDK4/6抑制剂后肝功能指标升高，转氨酶高了一倍多', ctx:{treatment_type:'哌柏西利',treatment_phase:'靶向治疗中',treatment_day:28}, exp:'medium' },
  { id:'T-G03', input:'吃了靶向药之后皮疹很严重，脸上脖子上都有，红红的还脱皮', ctx:{treatment_type:'帕妥珠单抗',treatment_phase:'靶向治疗中',treatment_day:14}, exp:'low' },
  { id:'T-G05', input:'服用T-DXd后出现了间质性肺炎，呼吸有点困难，干咳无痰', ctx:{treatment_type:'T-DXd',treatment_phase:'靶向治疗中',treatment_day:42}, exp:'high' },
  // === 免疫治疗 ===
  { id:'I-I01', input:'打了免疫药后开始起疹子，全身都有，还很痒，越来越多', ctx:{treatment_type:'帕博利珠单抗',treatment_phase:'免疫治疗中',treatment_day:14}, exp:'medium' },
  { id:'I-I02', input:'免疫治疗后出现免疫性肺炎，呼吸困难，干咳，胸闷', ctx:{treatment_type:'阿替利珠单抗',treatment_phase:'免疫治疗中',treatment_day:28}, exp:'high' },
  { id:'I-I03', input:'免疫治疗期间肝功能异常，转氨酶升高到两百多', ctx:{treatment_type:'帕博利珠单抗',treatment_phase:'免疫治疗中',treatment_day:21}, exp:'medium' },
  { id:'I-I04', input:'免疫治疗后甲减了，tsh很高，人很疲惫，浮肿，怕冷', ctx:{treatment_type:'帕博利珠单抗',treatment_phase:'免疫治疗后',treatment_day:56}, exp:'low' },
];

async function main() {
  console.log(`\nSABA Batch Eval - Claude Opus 4.7\nProvider: ${Saba.config.llm_provider} | Model: ${Saba.config.anthropic_model}\n`);
  const results: Array<{id:string; exp:string; act:string; score:number; time:number; correct:boolean}> = [];
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    process.stdout.write(`[${String(i+1).padStart(2,'0')}] ${c.id} ... `);
    const t0 = Date.now();
    try {
      const r = await Saba.orchestrator.assess({ user_id:'eval', input:c.input, context:c.ctx });
      const ok = r.risk_level === c.exp;
      results.push({ id:c.id, exp:c.exp, act:r.risk_level, score:r.risk_score, time:r.metadata?.processing_time_ms||0, correct:ok });
      console.log(`${ok?'✅':'❌'} ${r.risk_level.toUpperCase()}(${r.risk_score}) [${r.metadata?.processing_time_ms}ms]\n`);
    } catch(e) {
      console.log(`ERROR: ${e}\n`);
    }
  }

  // 汇总
  const correct = results.filter(r=>r.correct).length;
  const byExp = { high:{c:0,t:0}, medium:{c:0,t:0}, low:{c:0,t:0} };
  results.forEach(r => { byExp[r.exp as keyof typeof byExp].t++; if(r.correct) byExp[r.exp as keyof typeof byExp].c++; });
  const avgTime = results.reduce((s,r)=>s+r.time,0)/results.length;
  console.log(`\n══════════════════════════════════`);
  console.log(`准确率: ${correct}/${CASES.length} (${(correct/CASES.length*100).toFixed(0)}%)`);
  console.log(`  HIGH: ${byExp.high.c}/${byExp.high.t} | MEDIUM: ${byExp.medium.c}/${byExp.medium.t} | LOW: ${byExp.low.c}/${byExp.low.t}`);
  console.log(`平均响应: ${avgTime.toFixed(0)}ms`);
  console.log(`\n错误案例:`);
  results.filter(r=>!r.correct).forEach(r => console.log(`  ${r.id} | 期望:${r.exp} 实际:${r.act}(${r.score}) | "${CASES.find(c=>c.id===r.id)?.input.slice(0,25)}..."`));
}
main().catch(console.error);
