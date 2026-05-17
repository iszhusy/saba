// LLM-First 快速验证
import { Saba } from './src/index.js';

async function main() {
  console.log(`Provider: ${Saba.config.llm_provider ?? 'none'} | Model: ${Saba.config.anthropic_model ?? 'none'}\n`);
  
  const cases = [
    { id:'C-A01', input:'化疗完第三天开始恶心想吐，吃什么吐什么，喝水都困难', ctx:{treatment_type:'AC-T',treatment_phase:'化疗后',treatment_day:3}, exp:'medium' },
    { id:'C-D01', input:'输液的时候突然脸红心跳加速，喉咙有点发紧，护士马上把药停了', ctx:{treatment_type:'紫杉醇',treatment_phase:'化疗输液中',treatment_day:1}, exp:'high' },
    { id:'C-C01', input:'手指尖一直发麻，拿东西都没感觉，脚趾头也是，走路像踩棉花', ctx:{treatment_type:'AC-T',treatment_phase:'化疗期间',treatment_day:14}, exp:'medium' },  // 神经毒性是 medium，需要团队评估
    { id:'T-G05', input:'服用T-DXd后出现了间质性肺炎，呼吸有点困难，干咳无痰', ctx:{treatment_type:'T-DXd',treatment_phase:'靶向治疗中',treatment_day:42}, exp:'high' },
  ];

  for (const c of cases) {
    const t0 = Date.now();
    try {
      const r = await Saba.orchestrator.assess({ user_id:'eval', input:c.input, context:c.ctx as any });
      const ok = r.risk_level === c.exp;
      console.log(`${ok?'✅':'❌'} ${c.id} → ${r.risk_level.toUpperCase()}(${r.risk_score}) [${Date.now()-t0}ms] (期望:${c.exp})`);
      console.log(`   Action: ${r.immediate_action?.slice(0,50)}`);
      console.log(`   Reasoning: ${r.assessment_details?.reasoning?.slice(0,80)}...`);
      console.log('');
    } catch(e) {
      console.log(`❌ ${c.id} ERROR: ${e}\n`);
    }
  }
}

main().catch(console.error);