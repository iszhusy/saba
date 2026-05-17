# SABA 知识库 JSON 格式

> 可直接导入系统的知识库
> 版本：v1.0

---

```json
{
  "knowledge_base": {
    "version": "1.0.0",
    "created_at": "2024-01-15",
    "source": "NCI Breast Cancer Guidelines",
    "rules": [
      {
        "id": "HR-001",
        "name": "呼吸困难/胸痛",
        "category": "emergency_symptom",
        "trigger_conditions": {
          "symptoms": ["呼吸困难", "喘不上气", "胸闷", "胸痛", "气短"],
          "logic": "OR"
        },
        "risk_level": "high",
        "risk_score": 90,
        "confidence": 0.95,
        "immediate_action": "立即拨打120或前往急诊！",
        "reasoning": "这些症状可能危及生命，需要立即医疗干预。",
        "contact_type": "emergency",
        "urgency": "immediate",
        "source": "NCI IBC 症状指南",
        "requires_verification": true
      },
      {
        "id": "HR-002",
        "name": "高热持续",
        "category": "infection_sign",
        "trigger_conditions": {
          "symptoms": ["发烧", "发热", "高烧", "体温38", "体温39", "体温40", "持续发热"],
          "logic": "OR",
          "duration_condition": "持续"
        },
        "risk_level": "high",
        "risk_score": 88,
        "confidence": 0.90,
        "immediate_action": "立即联系医疗团队，考虑前往急诊。",
        "reasoning": "高热可能是感染迹象，化疗期间免疫力低下需要紧急评估。",
        "contact_type": "emergency",
        "urgency": "2小时内",
        "source": "化疗副作用管理指南",
        "requires_verification": true
      },
      {
        "id": "HR-003",
        "name": "严重过敏反应",
        "category": "allergic_reaction",
        "trigger_conditions": {
          "symptoms": ["面部肿胀", "喉咙肿胀", "全身红肿", "过敏反应", "严重瘙痒"],
          "logic": "OR"
        },
        "risk_level": "high",
        "risk_score": 92,
        "confidence": 0.90,
        "immediate_action": "立即就医！可能是过敏性休克前兆。",
        "reasoning": "这些症状可能表示严重过敏反应，需要立即干预。",
        "contact_type": "emergency",
        "urgency": "immediate",
        "source": "药物不良反应指南",
        "requires_verification": false
      },
      {
        "id": "HR-004",
        "name": "单侧腿部疼痛肿胀",
        "category": "vascular_complication",
        "trigger_conditions": {
          "symptoms": ["腿痛", "腿肿", "单侧肿胀", "小腿抽筋", "腿部疼痛"],
          "logic": "AND"
        },
        "risk_level": "high",
        "risk_score": 85,
        "confidence": 0.85,
        "immediate_action": "立即就医！需要排除深静脉血栓（DVT）。",
        "reasoning": "单侧腿部肿胀疼痛可能表示血栓形成，是化疗的严重并发症。",
        "contact_type": "emergency",
        "urgency": "immediate",
        "source": "化疗并发症识别指南",
        "requires_verification": true
      },
      {
        "id": "HR-005",
        "name": "神经症状",
        "category": "neurological",
        "trigger_conditions": {
          "symptoms": ["意识模糊", "剧烈头痛", "视力变化", "视力模糊", "抽搐", "麻木", "说话困难"],
          "logic": "OR"
        },
        "risk_level": "high",
        "risk_score": 90,
        "confidence": 0.90,
        "immediate_action": "立即就医！需要排除脑转移或卒中。",
        "reasoning": "这些症状可能涉及神经系统并发症，需要紧急评估。",
        "contact_type": "emergency",
        "urgency": "immediate",
        "source": "乳腺癌神经系统并发症指南",
        "requires_verification": true
      },
      {
        "id": "HR-006",
        "name": "消化道出血",
        "category": "gi_complication",
        "trigger_conditions": {
          "symptoms": ["呕血", "黑便", "便血", "严重腹痛", "大便发黑"],
          "logic": "OR"
        },
        "risk_level": "high",
        "risk_score": 90,
        "confidence": 0.90,
        "immediate_action": "立即就医！可能存在消化道出血。",
        "reasoning": "这些症状可能表示消化道出血，是化疗粘膜损伤的严重表现。",
        "contact_type": "emergency",
        "urgency": "immediate",
        "source": "化疗粘膜损伤管理指南",
        "requires_verification": false
      },
      {
        "id": "MR-001",
        "name": "症状持续不缓解",
        "category": "prolonged_symptom",
        "trigger_conditions": {
          "symptoms": ["持续", "几天", "一直没好", "没有好转"],
          "logic": "AND",
          "duration": "超过3天"
        },
        "risk_level": "medium",
        "risk_score": 60,
        "confidence": 0.75,
        "immediate_action": "建议今天联系医疗团队，评估是否需要调整治疗方案。",
        "reasoning": "症状持续超过3天无好转可能需要医疗团队调整管理策略。",
        "contact_type": "team",
        "urgency": "24小时内",
        "source": "常见不良反应监测指南",
        "requires_verification": false
      },
      {
        "id": "MR-002",
        "name": "恶心呕吐影响进食",
        "category": "gi_side_effect",
        "trigger_conditions": {
          "symptoms": ["恶心", "呕吐", "吃不下", "食欲", "进食困难"],
          "logic": "AND",
          "duration_condition": "持续"
        },
        "risk_level": "medium",
        "risk_score": 65,
        "confidence": 0.85,
        "immediate_action": "建议今天联系医疗团队，考虑调整止吐方案。",
        "reasoning": "恶心呕吐已影响进食，可能导致脱水和电解质紊乱。",
        "contact_type": "team",
        "urgency": "24小时内",
        "source": "化疗副作用管理指南",
        "requires_verification": false
      },
      {
        "id": "MR-003",
        "name": "严重口腔溃疡",
        "category": "mucositis",
        "trigger_conditions": {
          "symptoms": ["口腔溃疡", "嘴烂", "无法进食", "口腔疼痛", "口腔出血"],
          "logic": "OR"
        },
        "risk_level": "medium",
        "risk_score": 62,
        "confidence": 0.80,
        "immediate_action": "建议联系医疗团队，考虑口腔护理方案和止痛方案。",
        "reasoning": "严重口腔溃疡可能影响营养摄入，需要医疗团队帮助。",
        "contact_type": "team",
        "urgency": "24小时内",
        "source": "化疗粘膜炎管理指南",
        "requires_verification": false
      },
      {
        "id": "MR-004",
        "name": "严重腹泻",
        "category": "gi_side_effect",
        "trigger_conditions": {
          "symptoms": ["腹泻", "拉肚子", "水样便", "大便稀"],
          "logic": "OR",
          "frequency_condition": "超过4次/天"
        },
        "risk_level": "medium",
        "risk_score": 65,
        "confidence": 0.85,
        "immediate_action": "建议联系医疗团队，考虑补液和调整用药方案。",
        "reasoning": "严重腹泻可能导致脱水和电解质紊乱，需要医疗关注。",
        "contact_type": "team",
        "urgency": "24小时内",
        "source": "靶向/免疫治疗副作用指南",
        "requires_verification": false
      },
      {
        "id": "MR-005",
        "name": "皮疹扩散",
        "category": "skin_reaction",
        "trigger_conditions": {
          "symptoms": ["皮疹", "红疹", "全身", "扩散", "红斑", "水泡"],
          "logic": "OR"
        },
        "risk_level": "medium",
        "risk_score": 60,
        "confidence": 0.80,
        "immediate_action": "建议联系医疗团队评估，可能是药物超敏反应。",
        "reasoning": "皮疹扩散可能表示药物反应，需要医疗团队评估是否需要调整治疗。",
        "contact_type": "team",
        "urgency": "24小时内",
        "source": "靶向治疗皮疹管理指南",
        "requires_verification": false
      },
      {
        "id": "MR-006",
        "name": "出血倾向",
        "category": "hematological",
        "trigger_conditions": {
          "symptoms": ["瘀斑", "出血", "紫癜", "牙龈出血", "鼻血", "皮下出血"],
          "logic": "OR"
        },
        "risk_level": "medium",
        "risk_score": 70,
        "confidence": 0.85,
        "immediate_action": "建议尽快联系医疗团队查血常规，评估出血风险。",
        "reasoning": "出血倾向可能表示血小板减少，是化疗骨髓抑制的表现。",
        "contact_type": "team",
        "urgency": "24小时内",
        "source": "化疗骨髓抑制管理指南",
        "requires_verification": false
      },
      {
        "id": "LR-001",
        "name": "轻微恶心",
        "category": "gi_side_effect",
        "trigger_conditions": {
          "symptoms": ["轻微恶心", "稍微恶心", "有点恶心", "食欲下降"],
          "logic": "OR"
        },
        "risk_level": "low",
        "risk_score": 25,
        "confidence": 0.80,
        "immediate_action": "这通常是化疗的常见反应，可以继续观察，记录症状变化。",
        "reasoning": "轻微恶心是化疗的正常反应，通常可以自行缓解。",
        "contact_type": "self_monitor",
        "urgency": "常规",
        "source": "化疗常见副作用",
        "requires_verification": false
      },
      {
        "id": "LR-002",
        "name": "疲劳",
        "category": "general_side_effect",
        "trigger_conditions": {
          "symptoms": ["疲劳", "乏力", "没力气", "累", "疲倦", "虚弱", "没精神"],
          "logic": "OR"
        },
        "risk_level": "low",
        "risk_score": 20,
        "confidence": 0.85,
        "immediate_action": "注意休息，适度活动，记录疲劳程度。如越来越严重请联系团队。",
        "reasoning": "疲劳是治疗的常见副作用，注意休息即可。",
        "contact_type": "self_monitor",
        "urgency": "常规",
        "source": "治疗常见副作用管理",
        "requires_verification": false
      },
      {
        "id": "LR-003",
        "name": "轻微头痛/肌痛",
        "category": "general_symptom",
        "trigger_conditions": {
          "symptoms": ["轻微头痛", "肌痛", "轻微疼痛", "酸痛", "关节痛"],
          "logic": "OR"
        },
        "risk_level": "low",
        "risk_score": 22,
        "confidence": 0.75,
        "immediate_action": "可以对症处理，继续观察。如加重或出现新症状请联系团队。",
        "reasoning": "轻微头痛/肌痛通常不严重，可以对症处理。",
        "contact_type": "self_monitor",
        "urgency": "常规",
        "source": "非特异性症状管理",
        "requires_verification": false
      },
      {
        "id": "LR-004",
        "name": "局部轻微皮疹",
        "category": "skin_reaction",
        "trigger_conditions": {
          "symptoms": ["局部皮疹", "轻微皮疹", "小疹子", "局部瘙痒"],
          "logic": "OR"
        },
        "risk_level": "low",
        "risk_score": 18,
        "confidence": 0.80,
        "immediate_action": "保持皮肤清洁，避免抓挠，观察变化。如扩散请联系团队。",
        "reasoning": "局部皮疹是靶向治疗的常见反应，通常不严重。",
        "contact_type": "self_monitor",
        "urgency": "常规",
        "source": "靶向治疗常见皮疹",
        "requires_verification": false
      },
      {
        "id": "LR-005",
        "name": "脱发",
        "category": "cosmetic_side_effect",
        "trigger_conditions": {
          "symptoms": ["脱发", "头发掉", "掉发", "秃"],
          "logic": "OR"
        },
        "risk_level": "low",
        "risk_score": 15,
        "confidence": 0.90,
        "immediate_action": "这是化疗的预期反应，可以考虑使用冰帽。心理上做好准备。",
        "reasoning": "脱发是化疗的常见副作用，治疗结束后通常会恢复。",
        "contact_type": "self_monitor",
        "urgency": "常规",
        "source": "化疗副作用管理",
        "requires_verification": false
      }
    ],
    "combination_rules": [
      {
        "id": "COMBO-001",
        "name": "发热伴寒战",
        "symptoms": ["发热", "发烧", "寒战", "发冷"],
        "logic": "AND",
        "upgrade_from": "medium",
        "upgrade_to": "high",
        "reasoning": "发热伴寒战可能表示感染，需要紧急评估。"
      },
      {
        "id": "COMBO-002",
        "name": "持续高热",
        "symptoms": ["高烧", "持续发热", "体温不退"],
        "logic": "AND",
        "upgrade_from": "medium",
        "upgrade_to": "high",
        "reasoning": "持续高热可能表示严重感染，需要立即就医。"
      },
      {
        "id": "COMBO-003",
        "name": "恶心伴脱水体征",
        "symptoms": ["恶心", "口干", "尿深", "头晕"],
        "logic": "AND",
        "upgrade_from": "low",
        "upgrade_to": "medium",
        "reasoning": "恶心伴脱水体征可能引起电解质紊乱。"
      },
      {
        "id": "COMBO-004",
        "name": "皮疹伴发热",
        "symptoms": ["皮疹", "发热", "全身红斑"],
        "logic": "AND",
        "upgrade_from": "low",
        "upgrade_to": "medium",
        "reasoning": "皮疹伴发热可能表示药物超敏反应。"
      },
      {
        "id": "COMBO-005",
        "name": "疲劳伴呼吸困难",
        "symptoms": ["疲劳", "呼吸困难", "气短"],
        "logic": "AND",
        "upgrade_from": "low",
        "upgrade_to": "medium",
        "reasoning": "疲劳伴呼吸困难可能表示贫血或心脏毒性。"
      }
    ],
    "symptom_mappings": {
      "恶心呕吐": {
        "keywords": ["恶心", "想吐", "呕吐", "反胃", "干呕", "胃不适"],
        "standard_term": "nausea_vomiting",
        "category": "gi_side_effect"
      },
      "发热": {
        "keywords": ["发烧", "发热", "体温高", "高烧", "38", "39", "40"],
        "standard_term": "fever",
        "category": "infection_sign"
      },
      "呼吸困难": {
        "keywords": ["呼吸困难", "喘不上气", "胸闷", "气短", "憋气", "呼吸急促"],
        "standard_term": "dyspnea",
        "category": "emergency_symptom"
      },
      "疼痛": {
        "keywords": ["疼痛", "痛", "酸痛", "不适", "难受", "胀痛", "刺痛"],
        "location_keywords": {
          "胸": "chest_pain",
          "腹": "abdominal_pain",
          "骨": "bone_pain",
          "关节": "joint_pain",
          "头痛": "headache"
        },
        "standard_term": "pain",
        "category": "general_symptom"
      },
      "皮疹": {
        "keywords": ["皮疹", "红疹", "痒", "皮肤", "红斑", "痘痘", "疹子"],
        "standard_term": "rash",
        "category": "skin_reaction"
      },
      "疲劳": {
        "keywords": ["疲劳", "乏力", "没力气", "累", "疲倦", "虚弱", "没精神"],
        "standard_term": "fatigue",
        "category": "general_side_effect"
      },
      "口腔问题": {
        "keywords": ["口腔", "嘴", "舌头", "溃疡", "口腔粘", "口腔不适"],
        "standard_term": "oral_mucositis",
        "category": "mucositis"
      },
      "出血": {
        "keywords": ["出血", "瘀斑", "紫癜", "牙龈出血", "鼻血", "便血"],
        "standard_term": "bleeding",
        "category": "hematological"
      },
      "神经症状": {
        "keywords": ["头痛", "头晕", "意识", "模糊", "视力", "抽搐", "麻木"],
        "standard_term": "neurological_symptom",
        "category": "neurological"
      },
      "水肿": {
        "keywords": ["肿胀", "水肿", "肿", "浮肿"],
        "location_keywords": {
          "腿": "leg_swelling",
          "单侧": "unilateral_swelling"
        },
        "standard_term": "edema",
        "category": "vascular_complication"
      },
      "腹泻": {
        "keywords": ["腹泻", "拉肚子", "大便稀", "水样便"],
        "standard_term": "diarrhea",
        "category": "gi_side_effect"
      },
      "脱发": {
        "keywords": ["脱发", "头发掉", "掉发", "秃"],
        "standard_term": "alopecia",
        "category": "cosmetic_side_effect"
      }
    },
    "context_adjustments": {
      "chemotherapy_day_1_to_7": {
        "description": "化疗后1-7天（骨髓抑制高峰期）",
        "symptom_adjustments": {
          "发热": {"from_risk": "medium", "to_risk": "high", "reason": "骨髓抑制高峰期，感染风险增加"},
          "出血": {"from_risk": "medium", "to_risk": "high", "reason": "血小板可能降低，出血风险增加"}
        },
        "monitoring_notes": "特别注意发热和感染迹象"
      },
      "post_surgery": {
        "description": "手术后恢复期",
        "symptom_adjustments": {
          "伤口疼痛": {"from_risk": "low", "to_risk": "medium", "reason": "手术后需要关注感染和愈合情况"},
          "发热": {"from_risk": "medium", "to_risk": "high", "reason": "手术后感染需要紧急评估"}
        },
        "monitoring_notes": "关注伤口愈合和淋巴水肿"
      },
      "targeted_therapy": {
        "description": "靶向治疗期间",
        "symptom_adjustments": {
          "高血压": {"from_risk": "low", "to_risk": "medium", "reason": "某些靶向药物可导致高血压"}
        },
        "monitoring_notes": "定期监测血压"
      },
      "endocrine_therapy": {
        "description": "内分泌治疗期间",
        "symptom_adjustments": {
          "骨痛": {"adjustment": "提高关注级别", "reason": "内分泌治疗可能影响骨骼健康"}
        },
        "monitoring_notes": "定期骨密度检查"
      }
    }
  }
}
```
