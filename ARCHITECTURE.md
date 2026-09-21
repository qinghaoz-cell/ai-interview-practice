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
| 知识库 | `kb` | 上传项目文档、Q&A、行为面试准备和知识点材料 |
| 综合练习 | `interview` | 基于简历+JD 的综合面试练习 |
| 产品专项 | `product` | 产品经理题库（产品设计与策略、数据分析与增长、价值竞争与取舍） |
| 简历专项 | `resume-spec` | 针对具体项目经历深度追问 |
| 行为面试专项 | `behavior` | 单题作答：职业动机、协作分歧、压力挫折与自我认知 |
| 知识库专项 | `kb-spec` | 基于上传知识库出题 |
| **AI产品场景训练** | `aiproduct` | 从真实业务场景出发，练习AI介入判断与产品化追问 ⭐ 核心模块 |
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

### 语音输入（`toggleVoice()` / `startVoiceRecognition()`，约第 6450 行）
使用浏览器 Web Speech API。`continuous = true` 仍可能因用户思考停顿而触发 `onend`，因此 `onend` **不能**直接调用 `stopVoice()`：录音按钮仍处于开启状态且非用户主动停止时，应在短暂延迟后重建识别实例。`STATE._voiceFinalText` 用于累积每段已确认的文本，避免自动续录后丢失停顿前内容。

只有点击麦克风停止或发送回答时才调用 `stopVoice()`；它会设置 `voiceStopRequested` 并取消待执行的自动续录，防止停止后又重新开启麦克风。

### `source` 字段的取值（决定评分/参考答案/诊断走哪条路）
| source | 含义 |
|--------|------|
| `'aiproduct'` | AI产品专项模块 |
| `'product'` | 产品专项模块 |
| `'resume-spec'` | 简历专项模块 |
| `'behavior'` | 行为面试专项；单题作答后直接评分，不进入多轮追问 |
| `'kb-spec'` | 知识库专项模块 |
| `'job-target'` | 目标岗位模块（内部再细分 jtType） |
| `'random'` | 综合练习模块 |

行为面试准备材料存于独立的 `behavior` 知识库分区。`getBehaviorKBContext()` 只在行为面试的出题、改写和参考答案中注入，避免把动机/HR素材混入产品题、AI场景题或知识点专项。

---

## 四、Prompt 系统（所有提示词变量）

### 4.1 出题 Prompt

| 变量名 | 行号 | 用途 |
|--------|------|------|
| `PRODUCT_CAT_PROMPTS` | ~2715 | 产品专项各子类型的出题指令，key = subCategory |
| `buildAIProductScenarioPrompt()` | ~3235 | AI产品场景训练的首题 Prompt；按随机大业务领域生成开放场景题 |
| `AIPRODUCT_CAT_PROMPTS` | ~3300 | 目标岗位专项等保留场景使用的系统类型出题指令 |

**当前前台 `PRODUCT_CAT_PROMPTS` 的 key：**
- `design`：产品设计与策略（含AI产品设计+商业化、产品设计、产品改进、产品分析、用户洞察与机会判断、开放收敛）
- `metrics`：数据分析与增长
- `functradeoff`：价值、竞争与取舍

`aiknowledge` 与 `aipm` 保留为历史记录兼容的旧 key；前台不再作为产品思维专项入口。AI业务落地训练走 `aiproduct`，RAG/Prompt/评测等知识由知识点专项的用户资料承接。

**陌生行业题的统一要求：** `design` 出题时必须用小型业务 case 说明用户任务、当前卡点与专业边界；法律、医疗、金融、工业等场景不考术语或业务规则。首问只问一个产品判断；只有候选人的结论依赖题干未给出的专业事实时，追问才训练“如何验证判断、选择低风险辅助节点或确认专业边界”，不把专家访谈、风险或商业化当成固定必答项。

**AI产品场景训练的首题逻辑：**
- 前台没有系统类型选择；每轮从内容搜索社区、电商本地生活、企业服务协同、增长广告客户经营、供应链物流制造、出行旅游线下服务、教育招聘职业发展、医疗公共服务、金融保险风控中随机选一个大领域。
- 首题只给业务背景和当前问题，考察用户任务、AI必要性或优先介入点；不预设系统类型，也不要求一次答完整方案。
- 约 35% 的首题会练习 AI 助手 / Agent 判断：用“回答可用但任务未完成”“用户反复修改”等白话信号，考察应先优化输出、交互、工作流还是能力本身；不考术语定义或技术参数。
- 后续追问根据候选人的回答补充能力选型、产品机制、验证、质量或风险，避免首题直接给出完整约束。

**目标岗位专项的题型规则：** `buildJTQuestionPrompt()` 与 `buildJTFollowupSystem()` 负责四个大方向：岗位业务理解、岗位产品思维、岗位 AI 能力产品化、简历岗位迁移。每次首题只考一个子方向；资料不足时，改考“会如何验证/补充什么信息”，不编造公司内部事实。岗位 AI 能力产品化前台不再按系统类型选题，改为基于 JD/业务的三段式 case，首题只问 AI 必要性、优先切入点或最小验证之一；系统类型术语留给确实影响方案的后续追问。

**目标岗位上传资料的使用规则：** 配置页上传时可选择“业务资料”或“面试参考资料”。业务资料（公司、部门、行业事实）可用于具体业务场景；面试全攻略、题库、复盘等参考资料只用于补足高频考察方向、题目颗粒度和追问逻辑。`buildJTMaterialUsageRule()` 会要求模型根据资料**随机生成新题**，不得照抄原题/答案，也不得将参考资料中的推测视为公司事实。旧记录按文件名兼容：含“面试、题库、攻略、复盘、训练、框架”等词的文件默认归为面试参考资料。

### 4.2 追问 Prompt（面试官逐轮追问的系统 prompt）

| 变量名 | 行号 | 用途 |
|--------|------|------|
| `AIPRODUCT_INTERVIEW_SYSTEM` | ~3121 | AI产品专项的通用追问系统（9个触发方向） |
| `AIPRODUCT_SYSTEM_TYPE_FOLLOWUP` | ~3450 | 目标岗位等保留题型的细化追问；AI产品场景训练仅使用通用追问 |
| `PRODUCT_CAT_FOLLOWUP` | ~3297 | 产品专项各类题的追问，key = subCategory |
| `RESUME_SPEC_FOLLOWUP` | ~3435 | 简历专项追问（针对具体项目经历） |
| `BEHAVIOR_CATS` | ~3400 | 行为面试的出题方向；只生成一题，不追问 |
| `buildJTQuestionPrompt()` | ~4171 | 目标岗位专项首题：按业务/产品/AI/迁移四类和 JD 上下文出题 |
| `buildJTFollowupSystem()` | ~4265 | 目标岗位专项追问：按实际首题范围和候选人主张只追一个点 |
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
behavior → 行为面试评分（只按题目范围评表达、具体性与匹配）
其他 → 通用评分
```

### AI产品专项评分字段（JSON schema，scoreAsAIP 路径）
```
scenario_judgment AI场景判断（1-10）
biz_scenario      业务场景与用户任务（1-10）
ai_capability     AI能力匹配（1-10）
product_mechanism 产品机制转化（1-10）
metrics_validation 指标与验证（1-10）
output_quality    AI输出质量评估（1-10，可选）⭐ 新增
risk_control      风险兜底（1-10）
overall           综合分（1-10）
strengths         []
improvements      []
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
按 subCategory 提供可迁移的产品思维训练地图。它用于输出 `next_round_framework`（若面试官继续深挖，可怎样展开），不是本题的必答清单：评分和 `improvements` 只能针对当前题目明确要求、当前追问明确考察，或候选人主动提出但未讲清的主张。

### 反馈分层（`generateScore()` / `renderScore()`）
- **本题评分与需要改进的地方**：只评当前题目范围；题目未问、候选人也没有主动主张的场景、机制、指标、风险、岗位绑定等，不得作为扣分项。
- **`question_framework`**：仅在产品思维专项、AI 产品场景训练、目标岗位专项中输出；在“亮点”前用“用产品思维理解这道题”卡片说明这题真正要判断什么、一个可直接开口的具体切入假设（资料不足时标为待验证），以及 3–5 步贴着题干的具体拆解。每一步都写清“为什么看这个事实或判断”与“回答时应具体判断、说明或验证什么”，而非只给一个框架标签。它不评价回答，也不计分。
- **`next_round_framework`**：单独输出 3–5 条“如果面试官继续深挖，可按这个框架展开”的训练路线。它在界面中以绿色卡片显示，不计入分数，也不与“需要改进的地方”混在一起。
- 历史记录详情会复用这两块反馈；旧记录没有对应字段、或缺少“建议先这样切入”的旧版拆解时，会显示“生成/更新本题具体拆解”按钮，基于原题补生成“这题真正判断什么 + 具体回答拆解”和后续训练路线，但不会重新评分或覆盖原反馈。

---

## 六、参考答案系统（`generateReferenceAnswer()`，第 5418 行）

### 路由逻辑
```
isAIProductRef（source=aiproduct）→ AI产品专项参考答案框架
isResumeSpecRef（source=resume-spec）→ 简历专项参考答案（结合具体项目）
isBehaviorRef（source=behavior）→ 行为面试参考答案（真实经历 + 完整表达）
isProductRef（source=product）→ 产品专项参考答案
jtSubRef（source=job-target）→ 根据 subCategory 路由到对应框架
其他 → 通用参考答案
```

---

## 七、反馈与参考答案

结束练习后，主评分卡已覆盖亮点、真实扣分点、可直接补的一句话、题目理解框架及后续追问路线；因此不再自动生成重复的“面试官诊断”，也不展示“对系统反馈的校准”。每轮的可直接复用表达由 `generateReferenceAnswer()` 输出“答题思路 / 改写版本 / 参考答案”。

`generateDiagnosis()` 与历史诊断代码保留为旧记录兼容，不再由新练习自动调用或在历史详情中展示。

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

### ⑥ 改AI产品场景训练的出题领域或首问
定位 `AIPRODUCT_BUSINESS_DOMAINS` 增删大业务领域，或修改 `buildAIProductScenarioPrompt()` 的首题要求。首题只考察一个核心判断；能力选型、验证与风险留给后续追问。

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
