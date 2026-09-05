# AI面试陪练 — 项目架构文档

> 给 AI 助手（Codex / ChatGPT / Gemini）看的技术说明，帮助快速理解项目结构、定位代码位置、完成修改任务。

---

## 一、项目概览

- **单文件项目**：所有代码在 `index.html` 一个文件里（~7200 行），HTML + CSS + JS 三合一
- **无构建工具**：不用 React/Vue/webpack，原生 JS + DOM
- **数据存储**：`localStorage`，无后端
- **AI 调用**：用户自填 API Key，支持 Anthropic Claude（默认）和 DeepSeek，通过 `callClaude()` 统一调用
- **语言模式（V1）**：顶部 `中文 / EN` 开关同时控制界面语言和练习语言；偏好存于 `localStorage.app_language`。英文模式由 `callClaude()` 统一注入英文输出规则，评分 JSON 字段和内部诊断标记保持不变。
- **依赖**：pdf.js（PDF解析）、mammoth.js（Word解析），从 CDN 引入

---

## 二、页面模块（导航栏 → 页面 ID）

| 导航项 | page ID | 说明 |
|--------|---------|------|
| 简历 | `resume` | 上传简历（PDF/DOCX），提取文本存 localStorage |
| JD | `jd` | 粘贴目标职位描述 |
| 知识库 | `kb` | 上传项目文档，按 projects/qna/notes 分区 |
| 综合练习 | `interview` | 基于简历+JD 的综合面试练习 |
| 产品专项 | `product` | 产品经理题库（5类题型） |
| 简历专项 | `resume-spec` | 针对具体项目经历深度追问 |
| 知识库专项 | `kb-spec` | 基于上传知识库出题 |
| **AI产品专项** | `aiproduct` | AI能力产品化专项（4类系统类型）⭐ 核心模块 |
| **目标岗位** | `job-target` | 根据目标公司/岗位定向出题 |
| 观察者模式 | `obs` | 复盘功能 |
| 历史记录 | `history` | 所有练习记录 |
| 设置 | `settings` | API Key、偏好设置 |

---

## 三、核心数据结构

### `STATE`（全局运行时状态，第 1379 行）
```js
STATE = {
  interview: {
    active: boolean,
    question: string,      // 当前题目
    messages: [],          // 对话历史 [{role, content}]
    turn: number,          // 当前追问轮次
    maxTurns: number,      // 最大追问轮次
    source: string,        // 来源模块（见下方 source 说明）
    subCategory: string,   // 子类别（如 'design', 'task', 'workflow'）
    jtType: string,        // job-target 专用：题型（'product'/'aiproduct'/'business'/'migration'）
    rewrites: [],          // AI改写历史
    hasVoiceInput: boolean
  }
}
```

### `source` 字段的取值（决定评分/参考答案/诊断走哪条路）
| source | 含义 |
|--------|------|
| `'aiproduct'` | AI产品专项模块 |
| `'product'` | 产品专项模块 |
| `'resume-spec'` | 简历专项模块 |
| `'kb-spec'` | 知识库专项模块 |
| `'job-target'` | 目标岗位模块（内部再细分 jtType） |
| `'random'` | 综合练习模块 |

---

## 四、Prompt 系统（所有提示词变量）

### 4.1 出题 Prompt

| 变量名 | 行号 | 用途 |
|--------|------|------|
| `PRODUCT_CAT_PROMPTS` | ~2715 | 产品专项各子类型的出题指令，key = subCategory |
| `AIPRODUCT_CAT_PROMPTS` | ~2999 | AI产品专项各子类型的出题指令，key = subCategory |

**`PRODUCT_CAT_PROMPTS` 的 key：**
- `design`：产品设计题（含AI产品设计+商业化、产品设计、产品改进、产品分析、开放收敛共5类）
- `metrics`：数据指标题
- `functradeoff`：功能取舍题
- `aiknowledge`：AI基础知识题
- `aipm`：AI PM岗位理解题

**`AIPRODUCT_CAT_PROMPTS` 的 key：**
- `task`：任务型AI系统（单次请求→明确输出）
- `knowledge`：知识型AI系统（RAG/知识库/搜索）
- `workflow`：流程型AI系统（多节点流水线）
- `interactive`：交互型AI系统（多轮对话）

### 4.2 追问 Prompt（面试官逐轮追问的系统 prompt）

| 变量名 | 行号 | 用途 |
|--------|------|------|
| `AIPRODUCT_INTERVIEW_SYSTEM` | ~3121 | AI产品专项的通用追问系统（9个触发方向） |
| `AIPRODUCT_SYSTEM_TYPE_FOLLOWUP` | ~3197 | 按系统类型细化的追问，key = `task/knowledge/workflow/interactive/trustworthy` |
| `PRODUCT_CAT_FOLLOWUP` | ~3297 | 产品专项各类题的追问，key = subCategory |
| `RESUME_SPEC_FOLLOWUP` | ~3435 | 简历专项追问（针对具体项目经历） |
| `NO_FABRICATION_RULE` | ~3548 | 通用禁止编造规则，注入所有 prompt |

---

## 五、评分系统（`generateScore()`，第 5096 行）

### 路由逻辑
```
source/jtType → 评分模式
────────────────────────────────
aiproduct / jtType=aiproduct → scoreAsAIP（AI产品专项评分）
resume-spec / jtType=migration → scoreAsRS（简历专项评分）
product / jtType=product/business → scoreAsProd（产品专项评分）
其他 → 通用评分
```

### AI产品专项评分字段（JSON schema，scoreAsAIP 路径）
```
system_type       系统类型识别（1-10）
biz_scenario      业务场景与用户任务（1-10）
ai_capability     AI能力匹配（1-10）
product_mechanism 产品机制转化（1-10）
metrics_validation 指标与验证（1-10）
output_quality    AI输出质量评估（1-10，可选）⭐ 新增
risk_control      风险兜底（1-10）
overall           综合分（1-10）
strengths         []
improvements      []
system_type_reveal 揭示候选人可能没想到的系统类型角度
```

### 产品专项评分字段（scoreAsProd 路径）
```
product_sense     产品感（1-10）
product_depth     产品深度（1-10）
structure         结构化程度（1-10）
overall           综合分（1-10）
strengths         []
improvements      []
```

### `_productImpDimsMap`（产品专项改进维度映射，第 5126 行）
按 subCategory 定义"improvements 应该考察哪些维度"，影响评分提示词。

### `_productR1FrameworkMap`（第1轮框架提示，第 5135 行）
按 subCategory 告诉模型"第1轮重点考察什么框架"。

---

## 六、参考答案系统（`generateReferenceAnswer()`，第 5418 行）

### 路由逻辑
```
isAIProductRef（source=aiproduct）→ AI产品专项参考答案框架
isResumeSpecRef（source=resume-spec）→ 简历专项参考答案（结合具体项目）
isProductRef（source=product）→ 产品专项参考答案
jtSubRef（source=job-target）→ 根据 subCategory 路由到对应框架
其他 → 通用参考答案
```

---

## 七、诊断系统（`generateDiagnosis()`，第 5786 行）

面试结束后生成"导师点评"，包含：
- 本次最大缺失是什么
- 下次可以怎么说（口语化示范）
- 对应的题型分类知识

题型分类 taxonomy 在函数内定义，包含：
- 任务型/知识型/流程型(Workflow)/交互型 系统拆解框架
- 产品设计/改进/分析/取舍/指标 题型框架
- AI产品设计+商业化题框架 ⭐ 新增
- 简历专项追问框架

---

## 八、renderScore()（第 5966 行）

把 `generateScore()` 返回的 JSON 渲染成 UI 分数卡片。根据 `isAIProduct` 决定显示哪些维度。

---

## 九、常见修改任务指南

### ① 新增一类出题题型（已有模块内）
1. 找到对应 `PRODUCT_CAT_PROMPTS` 或 `AIPRODUCT_CAT_PROMPTS` 的 key
2. 在 prompt 字符串内用 `【XXX题】XX%概率` 格式新增一个 bucket
3. 在对应 `PRODUCT_CAT_FOLLOWUP` / `AIPRODUCT_SYSTEM_TYPE_FOLLOWUP` 里新增追问触发条件

### ② 新增追问方向（AI产品专项）
在 `AIPRODUCT_INTERVIEW_SYSTEM`（~3121行）的 `▸ 9.` 之后新增 `▸ 10.`，格式：
```
▸ 10. [追问方向名]（[触发条件]时触发）
  何时用：...
  → "追问句1"
  → "追问句2"
```

### ③ 新增评分维度
1. 在 `generateScore()` 的 JSON schema 字符串里新增字段说明
2. 在 `renderScore()` 的 `dims` 数组里用 `...(data.xxx != null ? [{name: '...', val: data.xxx}] : [])` 形式新增（保持向后兼容）

### ④ 新增参考答案框架
在 `generateReferenceAnswer()` 里找到对应的 `isXxxRef` 分支，在 system prompt 内新增题型的框架说明。

### ⑤ 改产品专项某类题的出题逻辑
定位 `PRODUCT_CAT_PROMPTS.{key}`（设计/分析/改进/取舍/指标），直接修改 prompt 字符串。

### ⑥ 改AI产品专项某系统类型的追问
定位 `AIPRODUCT_SYSTEM_TYPE_FOLLOWUP.{key}`（task/knowledge/workflow/interactive），直接修改字符串。`workflow` 是6个场景触发式，其他是条件列表式。

---

## 十、deploy 流程

```bash
# 修改完 index.html 后：
cp index.html ~/Desktop/interview\ practice/index.html
cp index.html ~/Desktop/ai-interview-deploy/index.html
cd ~/Desktop/ai-interview-deploy
git add index.html
git commit -m "描述改动"
git push
```

GitHub 仓库：`https://github.com/qinghaoz-cell/ai-interview-practice`

---

## 十一、注意事项

- JS 里大量使用模板字符串（`` ` `` 反引号），修改 prompt 时注意不要破坏字符串边界
- `PRODUCT_CAT_FOLLOWUP` 和 `AIPRODUCT_SYSTEM_TYPE_FOLLOWUP` 的值都是普通字符串（不是函数），直接 string interpolation 注入到系统 prompt
- `output_quality` 字段用了 `data.output_quality != null` 的可选渲染，老记录没有这个字段也不会报错
- localStorage key 命名：`api_key`、`resume`、`jd`、`history`、`favorites`、`pref`、`ai_provider`、`deepseek_key`、`kb_files_{section}`、`kb_text_{section}`、`kbProjectFolders`
- 英文模式下启动的练习会在 `STATE.interview.language` 和历史记录中保存语言。新增用户可见文案时，优先补入 `UI_EN` / `ATTR_EN`；新增 AI 调用不用单独写英文 prompt，统一语言规则会自动注入。
