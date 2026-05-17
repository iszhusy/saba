# SABA 数据集评估报告

> 评估日期：2024-01-15
> 数据源：`/Users/ahs/BreastCancerData/`

---

## 一、数据集总览

```
BreastCancerData/
├── cBioPortal_Other/      # TCGA/METABRIC 基因组数据
│   ├── tcga_clinical.json     # TCGA 临床数据 (~250KB)
│   ├── tcga_samples.json      # TCGA 样本数据 (~240KB)
│   ├── metabric_clinical.json # METABRIC 临床数据 (~90KB)
│   └── ...
├── COSMIC/                 # 体细胞突变数据
├── DepMap/                # 依赖性数据（空）
├── GEO/                   # 基因表达数据集
│   ├── GSE2034*.gz        # 基因表达矩阵
│   └── GSE7390.gz         # 基因表达矩阵
├── METABRIC/              # 分子特征数据（空）
├── OncoTree/              # 肿瘤分类树（空）
├── SEER/                  # 流行病学数据
│   ├── breast_cancer_facts.html    # HTML 文件（抓取失败）
│   ├── globocan_2022.csv          # 全球癌症统计
│   └── seer_breast_csv.csv         # SEER 乳腺癌统计
├── TCGA/                  # TCGA 原始数据（空）
├── TCIA/                  # 影像数据（空）
├── UCI_Kaggle/            # Kaggle 数据（空）
└── UCI_Wisconsin/         # Wisconsin 经典数据集
    ├── ljubljana.data          # Ljubljana 乳腺癌数据
    └── wdbc_direct.data        # WDBC 诊断数据
```

---

## 二、数据集详细分析

### 2.1 TCGA/METABRIC 临床数据

**文件**：`cBioPortal_Other/tcga_clinical.json`, `tcga_samples.json`

**数据格式**：
```json
{
  "uniqueSampleKey": "VENHQS1BUi1BMUFSLTAxOmJyY2FfdGNnYQ",
  "sampleId": "TCGA-AR-A1AR-01",
  "patientId": "TCGA-AR-A1AR",
  "studyId": "brca_tcga",
  "clinicalAttributeId": "CANCER_TYPE_DETAILED",
  "value": "Breast Invasive Ductal Carcinoma"
}
```

**数据内容**：
| 属性 | 描述 | 可用性 |
|------|------|--------|
| CANCER_TYPE | 癌症类型 | ✅ |
| CANCER_TYPE_DETAILED | 详细分型（如 IDC, ILC） | ✅ |
| ONCOTREE_CODE | 肿瘤树代码 | ✅ |
| MUTATION_COUNT | 突变数量 | ✅ |
| FRACTION_GENOME_ALTERED | 基因组改变比例 | ✅ |
| TMB_NONSYNONYMOUS | 肿瘤突变负荷 | ✅ |
| SAMPLE_TYPE | 样本类型 | ✅ |

**评估结论**：
- ❌ **不适合** RAG 知识库
- 原因：这些是基因组/分子标记数据，与副作用症状评估无关
- 用途：可能用于未来个性化风险评估（结合基因型）

---

### 2.2 UCI Wisconsin Ljubljana 数据

**文件**：`UCI_Wisconsin/ljubljana.data`

**数据格式**：
```
no-recurrence-events,30-39,premeno,30-34,0-2,no,3,left,left_low,no
```

**特征说明**：
| 列 | 特征 | 说明 |
|----|------|------|
| 1 | Class | no-recurrence-events / recurrence-events |
| 2 | Age | 10-19, 20-29, ... 60-69 |
| 3 | Menopause | lt40 / ge40 / premeno |
| 4 | Tumor-Size | 0-4, 5-9, ... 50-54 |
| 5 | Inv-Nodes | 0-2, 3-5, ... 36-38 |
| 6 | Node-Caps | yes / no |
| 7 | Deg-Malig | 1, 2, 3 (组织学分级) |
| 8 | Breast | left / right |
| 9 | Breast-Quad | left_up, left_low, right_up, ... |
| 10 | Irradiat | yes / no |

**评估结论**：
- ❌ **不适合** 直接用于副作用评估
- 原因：这是乳腺癌诊断数据（肿瘤特征），不是治疗副作用数据
- 用途：可以作为参考，但不能直接用于 RAG

---

### 2.3 GEO 基因表达数据

**文件**：`GEO/GSE2034.gz`, `GSE7390.gz`

**数据格式**：需要解压查看

**评估结论**：
- ❌ **不适合** 当前场景
- 原因：这是基因表达数据，用于分子分型和靶点研究
- 用途：未来个性化医疗可能有参考价值

---

### 2.4 SEER 流行病学数据

**文件**：
- `SEER/globocan_2022.csv` - 全球癌症统计
- `SEER/seer_breast_csv.csv` - SEER 乳腺癌统计（下载失败）
- `SEER/breast_cancer_facts.html` - HTML 文件（抓取失败）

**评估结论**：
- ⚠️ **部分可用**（globocan_2022.csv）
- 用途：获取乳腺癌流行病学统计数据（发病率、死亡率等）
- 需要：重新下载 SEER 原始数据

---

## 三、对 SABA 的适用性总结

### 3.1 数据适用性矩阵

| 数据集 | RAG 知识库 | 规则库 | 学习数据 | 风险评估 | 备注 |
|--------|-----------|--------|---------|----------|------|
| TCGA/METABRIC | ❌ | ❌ | ❌ | ⚠️ | 基因组数据，需个性化时参考 |
| UCI Wisconsin | ❌ | ⚠️ | ❌ | ⚠️ | 诊断特征，可参考不可直接用 |
| GEO | ❌ | ❌ | ❌ | ❌ | 基因表达，分子研究用 |
| SEER | ⚠️ | ❌ | ❌ | ⚠️ | 统计数据，需重新下载 |
| ref.md | ✅ | ✅ | ⚠️ | ✅ | 核心参考，已整合 |

### 3.2 核心结论

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据集评估结论                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ❌ 现有数据集**不适合直接用于**：                               │
│     • RAG 知识库构建                                             │
│     • 副作用症状-风险对训练                                     │
│     • 规则库验证                                                │
│                                                                  │
│  ✅ ref.md 已有的医学参考：                                      │
│     • NCI 指南中的副作用管理建议                                │
│     • 风险分级规则                                             │
│     • 治疗阶段上下文                                           │
│                                                                  │
│  📋 建议的 RAG 知识库数据来源：                                 │
│     1. 从 ref.md 提取的结构化知识                               │
│     2. 化疗副作用管理指南（ASCO/NCCN/ESMO）                    │
│     3. 用户反馈积累的案例库                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、建议的数据构建策略

### 4.1 MVP 阶段

**RAG 知识库来源**：

```
优先级 1（立即可用）：
├── ref.md 中的副作用知识 → 提取结构化知识条目
└── NCI Guidelines → 副作用管理建议

优先级 2（需要额外工作）：
├── 邀请医疗专家预标注症状-风险对
├── 从 ASCO/NCCN 指南提取副作用处理建议
└── 构建初始规则库
```

**知识条目格式建议**：

```json
{
  "id": "knowledge_001",
  "category": "chemotherapy_side_effect",
  "symptom": "恶心呕吐",
  "keywords": ["恶心", "想吐", "呕吐", "反胃"],
  "severity_mapping": {
    "mild": "轻微恶心，食欲下降",
    "moderate": "持续恶心，影响进食",
    "severe": "剧烈呕吐，无法进食"
  },
  "risk_level": {
    "criteria": "症状持续时间 + 进食影响",
    "high": "无法进水 > 12小时",
    "medium": "持续 > 2天 或 影响进食",
    "low": "轻微，可自行缓解"
  },
  "management": {
    "immediate": "止吐药调整",
    "follow_up": "联系团队评估",
    "warning_signs": ["呕血", "脱水体征", "高烧"]
  },
  "source": "NCI Chemotherapy Side Effects Guide",
  "confidence": 0.95
}
```

### 4.2 后续阶段

**学习数据积累**：
- 用户评估 → 反馈 → 规则修正 → 知识积累
- 团队反馈 → 专业验证 → 规则更新
- 最终目标：从真实案例中学习，形成案例库

---

## 五、行动项

| 优先级 | 行动 | 状态 |
|--------|------|------|
| P0 | 整合 ref.md 构建初始 RAG 知识库 | 待执行 |
| P0 | 基于 ref.md 设计初始规则库条目 | 已完成（prd.md） |
| P1 | 邀请医疗专家审核规则库 | 待安排 |
| P2 | 构建症状-风险对标注数据 | 待数据 |
| P3 | 补充 SEER 流行病学数据 | 可选 |

---

## 六、附录：数据格式参考

### A. 理想的学习数据格式

```json
{
  "training_data": [
    {
      "id": "case_001",
      "input": {
        "raw_text": "恶心想吐，已经2天了，吃不下东西",
        "treatment_phase": "chemotherapy_cycle_2",
        "duration": "2天"
      },
      "expected_output": {
        "risk_level": "medium",
        "triggered_rules": ["MR-002"],
        "reasoning": "持续恶心呕吐 > 2天，影响进食"
      },
      "feedback": {
        "is_helpful": true,
        "team_verdict": "accurate",
        "actual_outcome": "患者联系团队，调整止吐方案"
      },
      "metadata": {
        "source": "user_feedback",
        "timestamp": "2024-01-15",
        "validated_by": "medical_expert"
      }
    }
  ]
}
```

### B. 规则库条目格式

```json
{
  "rule": {
    "id": "HR-001",
    "name": "呼吸困难/胸痛",
    "trigger_conditions": {
      "symptoms": ["呼吸困难", "胸闷", "胸痛"],
      "logic": "OR"
    },
    "risk_level": "high",
    "confidence": 0.95,
    "immediate_action": "立即拨打120或前往急诊",
    "source": "NCI IBC Symptoms",
    "requires_verification": true
  }
}
```

---

## 七、文档版本

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2024-01-15 | 初始评估报告 |
