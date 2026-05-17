# 模块目标模板（L3）

复制到 `modules/<模块名>/00-goal.md` 并填写。改模块时同步更新本节。

---

## 一句话

（本模块在 AI-native 架构中的职责，一句话。）

---

## Owner / Not owner of

| 负责 | 不负责 |
|------|--------|
| | |

---

## 模块 8 问（必填）

1. **解决什么问题？**  
2. **不解决什么问题？**  
3. **是不是 final owner？**（是 / 否；若是，说明对用户可见的最终语义）  
4. **输入是什么？**（类型 / 来源模块）  
5. **输出是什么？**（surface / constraint / 其他）  
6. **输出的是 result 还是 surface？**  
7. **失败时如何 fallback？**  
8. **哪些旧结构因此可以退场？**（字段 / 文件 / milestone）

---

## 代码锚点

| 项 | 路径 |
|----|------|
| 实现 | `src/...` |
| 类型 | `src/types/index.ts` |
| Harness | `src/tools/evaluation-harness.ts`（case id: ） |
| Behavior | `docs/specs-ai-native/behavior/...` |

---

## 验收

- [ ] harness / arch 测试覆盖主路径  
- [ ] 未输出 forbidden final semantics（见 02-contracts）  
- [ ] walkthrough 中本模块出现的路径已通  
