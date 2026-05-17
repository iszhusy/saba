# SABA RAG 知识库

> 从 ref.md 提取的结构化医学知识
> 用于 RAG 检索增强
> 版本：v1.0

---

## 一、副作用分类知识

### 1.1 化疗常见副作用

```yaml
category: chemotherapy_side_effects
knowledge_id: chemo_001

content: |
  化疗期间常见的副作用包括：
  - 骨髓抑制：白细胞减少、贫血、血小板减少
  - 消化道反应：恶心呕吐、腹泻、口腔溃疡
  - 毛发脱落：通常为暂时性
  - 疲劳乏力
  - 神经病变
  
  高峰期：化疗后7-14天

source: NCI Chemotherapy Side Effects Guide
relevance_tags:
  - chemotherapy
  - general_side_effects
  - bone_marrow_suppression
```

### 1.2 靶向治疗副作用

```yaml
category: targeted_therapy_side_effects
knowledge_id: targeted_001

content: |
  抗HER2靶向药（如曲妥珠单抗）常见副作用：
  - 皮疹：轻度到中度痤疮样皮疹
  - 腹泻
  - 心脏毒性：需要定期监测心功能
  - 输液反应
  
  CDK4/6抑制剂（如哌柏西利）常见副作用：
  - 中性粒细胞减少
  - 疲劳
  - 恶心

source: NCCN Breast Cancer Guidelines - Targeted Therapy
relevance_tags:
  - targeted_therapy
  - her2
  - skin_reaction
  - cardiac_toxicity
```

### 1.3 内分泌治疗副作用

```yaml
category: endocrine_therapy_side_effects
knowledge_id: endocrine_001

content: |
  内分泌治疗（他莫昔芬、芳香化酶抑制剂）常见副作用：
  
  他莫昔芬：
  - 子宫内膜增厚/子宫内膜癌风险
  - 血栓风险
  - 潮热
  - 情绪变化
  
  芳香化酶抑制剂（仅用于绝经后）：
  - 骨质疏松
  - 关节痛
  - 潮热
  - 性功能障碍

source: NCI Endocrine Therapy Guide
relevance_tags:
  - endocrine_therapy
  - bone_health
  - arthralgia
```

---

## 二、紧急症状识别

### 2.1 需要立即就医的症状

```yaml
category: emergency_symptoms
knowledge_id: emergency_001

content: |
  乳腺癌治疗期间需要立即就医的紧急症状：
  
  1. 呼吸困难或胸痛 → 可能肺部或心脏问题
  2. 高热（>38.5°C）→ 感染风险
  3. 严重出血或瘀斑 → 血小板减少
  4. 腿部单侧肿胀疼痛 → 深静脉血栓
  5. 意识模糊或剧烈头痛 → 神经系统问题
  6. 过敏反应（面部/喉咙肿胀）→ 过敏性休克
  
  处理原则：立即联系医疗团队或前往急诊

source: NCI Emergency Symptoms Guide
urgency: critical
relevance_tags:
  - emergency
  - immediate_action
```

### 2.2 感染迹象识别

```yaml
category: infection_signs
knowledge_id: infection_001

content: |
  化疗期间感染迹象识别：
  
  常见感染迹象：
  - 发热（>38°C）
  - 寒战和出汗
  - 喉咙痛
  - 口腔溃疡
  - 咳嗽或呼吸困难
  - 尿痛
  - 皮肤红肿热痛
  
  骨髓抑制期（化疗后7-14天）风险最高
  
  注意：化疗期间发热是医疗急症，需要立即就医

source: NCI Infection Prevention Guide
urgency: high
relevance_tags:
  - infection
  - fever
  - bone_marrow_suppression
```

---

## 三、常见症状管理

### 3.1 恶心呕吐管理

```yaml
category: symptom_management
knowledge_id: nausea_001

content: |
  恶心呕吐（Nausea and Vomiting）管理：
  
  预防：
  - 化疗前预防性使用止吐药
  - 避免化疗前进食过多
  
  自我管理：
  - 清淡饮食，少量多餐
  - 避免强烈气味
  - 生姜可能有帮助
  - 保持充足水分
  
  何时联系团队：
  - 24小时内呕吐超过3次
  - 无法进食或进水超过12小时
  - 出现脱水迹象（口干、尿深、头晕）

source: ASCO Antiemesis Guidelines
relevance_tags:
  - nausea
  - vomiting
  - gi_side_effect
  - dehydration
```

### 3.2 疲劳管理

```yaml
category: symptom_management
knowledge_id: fatigue_001

content: |
  癌症相关疲劳管理：
  
  特点：
  - 与普通疲劳不同，休息后可能不缓解
  - 可能持续数月
  - 与贫血、甲状腺功能、情绪都相关
  
  管理策略：
  - 适度活动（如散步）可能反而有帮助
  - 节省体力的技巧
  - 保证充足睡眠
  - 营养支持
  
  何时联系团队：
  - 严重疲劳影响日常活动
  - 伴有呼吸困难或心悸（可能贫血）

source: NCCN Cancer-Related Fatigue Guidelines
relevance_tags:
  - fatigue
  - general_side_effects
  - quality_of_life
```

### 3.3 口腔护理

```yaml
category: symptom_management
knowledge_id: mucositis_001

content: |
  口腔护理和口腔粘膜炎管理：
  
  预防：
  - 保持口腔清洁
  - 使用软毛牙刷
  - 避免酒精漱口水
  - 定期口腔检查
  
  自我护理：
  - 温盐水漱口
  - 避免刺激性食物（辛辣、过热、过酸）
  - 使用口腔保湿凝胶
  
  何时联系团队：
  - 口腔溃疡影响进食
  - 口腔疼痛严重
  - 口腔出血
  - 口腔白斑（可能感染）

source: MASCC Oral Care Guidelines
relevance_tags:
  - mucositis
  - oral_care
  - nutrition
```

### 3.4 皮疹管理

```yaml
category: symptom_management
knowledge_id: rash_001

content: |
  靶向治疗相关皮疹管理：
  
  常见类型：
  - 痤疮样皮疹（最常见）
  - 通常在治疗前几周出现
  
  自我护理：
  - 使用温和的清洁产品
  - 保持皮肤湿润
  - 避免阳光直射，使用防晒霜
  - 不要挤压或抓挠
  
  皮疹分级（需要团队评估）：
  - 1级：局部，轻微
  - 2级：广泛，轻度影响日常生活
  - 3级：严重，影响日常生活
  - 4级：危及生命
  
  何时联系团队：
  - 皮疹广泛或影响日常生活
  - 出现水泡或皮肤剥脱
  - 怀疑感染

source: NCCN Dermatologic Toxicity Guidelines
relevance_tags:
  - rash
  - skin_reaction
  - targeted_therapy
  - EGFR_inhibitor
```

---

## 四、治疗阶段指导

### 4.1 化疗周期指导

```yaml
category: treatment_phase_guidance
knowledge_id: chemo_phase_001

content: |
  化疗周期中的常见时间点：
  
  化疗当天：
  - 可能感到焦虑，这是正常的
  - 提前了解可能副作用
  - 做好准备（舒适衣物、读物等）
  
  化疗后1-3天：
  - 恶心呕吐风险最高（急性）
  - 疲劳可能开始
  
  化疗后7-14天：
  - 骨髓抑制高峰期
  - 血细胞计数最低
  - 感染风险最高
  - 需要特别注意发热
  
  化疗后14-21天（恢复期）：
  - 血细胞计数开始恢复
  - 副作用可能逐渐减轻
  - 为下一周期做准备

source: NCI Chemotherapy Timing Guide
relevance_tags:
  - chemotherapy_timing
  - bone_marrow_suppression
  - infection_prevention
```

### 4.2 手术恢复指导

```yaml
category: treatment_phase_guidance
knowledge_id: surgery_001

content: |
  手术后恢复阶段指导：
  
  术后1-2周：
  - 伤口护理
  - 注意感染迹象（红、肿、热、痛）
  - 引流管护理（如适用）
  - 渐进性活动
  
  术后3-6周：
  - 逐步恢复日常活动
  - 关注手臂肿胀（淋巴水肿风险）
  - 康复运动
  
  淋巴水肿警示：
  - 单侧手臂或手肿胀
  - 肿胀持续不消退
  - 需要早期识别和治疗

source: ACS Surgery Recovery Guide
relevance_tags:
  - post_surgery
  - wound_care
  - lymphedema
```

---

## 五、心理健康支持

### 5.1 情绪支持

```yaml
category: psychosocial_support
knowledge_id: mental_001

content: |
  乳腺癌治疗期间的情绪支持：
  
  常见的情绪反应：
  - 焦虑和抑郁
  - 对复发的恐惧
  - 身体形象变化困扰
  - 社交孤立感
  
  自我帮助策略：
  - 与他人分享感受
  - 加入支持小组
  - 保持适度活动
  - 专业的心理咨询
  
  何时寻求帮助：
  - 持续的情绪低落超过2周
  - 无法正常生活
  - 有自我伤害想法（紧急！）

source: APA Cancer Coping Guide
relevance_tags:
  - mental_health
  - emotional_support
  - quality_of_life
```

---

## 六、营养与生活方式

### 6.1 营养建议

```yaml
category: nutrition_lifestyle
knowledge_id: nutrition_001

content: |
  乳腺癌治疗期间营养建议：
  
  一般原则：
  - 均衡饮食，多样化
  - 增加蛋白质摄入（帮助恢复）
  - 保持足够水分
  
  特殊情况：
  - 恶心时：少量多餐，清淡食物
  - 口腔溃疡时：软烂食物，避免刺激
  - 腹泻时：低纤维饮食，补充电解质
  - 体重下降时：高热量高蛋白
  
  营养补充剂：
  - 使用任何补充剂前咨询团队
  - 某些抗氧化剂可能影响治疗
  
  避免：
  - 生食（免疫低下时）
  - 酒精
  - 过度加工食品

source: ACS Nutrition Guidelines
relevance_tags:
  - nutrition
  - side_effect_management
  - hydration
```

---

## 七、知识检索示例

### 7.1 用户问题 → 知识检索映射

```yaml
user_query_examples:
  - "恶心想吐怎么办"
    search_terms: ["恶心", "呕吐", "化疗", "止吐"]
    knowledge_ids: ["nausea_001", "chemo_001"]
    
  - "化疗后发烧"
    search_terms: ["发烧", "发热", "感染", "骨髓抑制"]
    knowledge_ids: ["infection_001", "chemo_phase_001"]
    
  - "头发掉了很多"
    search_terms: ["脱发", "头发", "化疗"]
    knowledge_ids: ["chemo_001", "LR-005"]
    
  - "手臂肿了"
    search_terms: ["肿胀", "手臂", "淋巴水肿"]
    knowledge_ids: ["surgery_001", "HR-004"]
    
  - "皮疹很痒"
    search_terms: ["皮疹", "瘙痒", "靶向"]
    knowledge_ids: ["rash_001", "targeted_001"]
```

---

## 八、知识库维护

### 8.1 知识条目结构

```yaml
knowledge_entry_template: |
  每条知识条目应包含：
  - id: 唯一标识符
  - category: 知识分类
  - content: 知识内容（结构化文本）
  - source: 来源
  - relevance_tags: 检索标签
  - urgency: 紧急程度（可选）
  - version: 版本
  - last_updated: 最后更新时间
```

### 8.2 更新流程

```yaml
update_workflow: |
  知识库更新流程：
  
  1. 提案：提出新的知识条目或修改
  2. 审核：医疗专家审核准确性
  3. 测试：验证与现有规则的兼容性
  4. 发布：更新知识库版本
  5. 监控：追踪使用效果
```

---

## 九、附录

### 9.1 参考来源

| 来源 | 类型 | URL |
|------|------|-----|
| NCI Breast Cancer Hub | Guidelines | cancer.gov |
| ASCO Guidelines | Treatment | asco.org/guidelines |
| NCCN Guidelines | Comprehensive | nccn.org |
| MASCC | Supportive Care | mascc.org |

### 9.2 文档版本

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2024-01-15 | 初始版本，基于 ref.md |
