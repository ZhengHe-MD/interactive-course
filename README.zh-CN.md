<p align="center">
  <img src="public/brand/lockup.svg" alt="Course Studio" width="340" />
</p>

<p align="center">
  <strong>与 AI 共同设计、个性化定制的互动式课程工作台。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README_zh.md">简体中文</a>
</p>

---

## 什么是 Course Studio？

Course Studio 将任何主题的学习过程变成你与 AI 共同创作的旅程。你不再只是阅读静态教材或在对话框里干聊，Course Studio 会为你量身生成**包含交互沙盒、模拟器与测验的原生 HTML 课程**。

在阅读过程中，你可以随时划选文字或点击页面模块，向 AI 追问细节、要求用更通俗的方式重写，或者直接生成可视化互动工具来辅助理解。

## 工作原理

1. **输入学习主题** — 告诉 Course Studio 你想学什么以及你的背景，AI 将为你规划定制大纲。
2. **在互动中学习** — 逐步阅读每一课，体验内置的互动图表、参数模拟器和即时测验。
3. **划选即时调整** — 选中课程中的任意句子或区块发起提问，AI 会实时就地修改并优化课程内容。

## 核心特性

- 🎯 **内置丰富互动体验** — 不仅是纯文本 Markdown，课程包含动态模拟器、滑块实验和自测小工具，帮助建立直觉。
- ✍️ **划选定位与定向修改** — 点击或划选任意段落发起提问，AI 能够精准理解上下文并修改对应位置。
- ⏪ **安心探索与一键回滚** — 每次 AI 修改都会自动建立 Git 检查点，随时可以一键恢复到历史版本。
- 🌐 **纯原生、零构建步骤** — 课程采用标准 HTML/CSS/JS，保存在本地 `~/.courses/` 目录，无打包门槛、不产生平台绑定。
- 📦 **单文件独立导出** — 一键将整门课程导出为便携的单文件 HTML，无需网络或服务器，任意浏览器均可直接打开。
- 🌍 **原生双语支持** — 界面、AI 对话和课程生成对英文与简体中文提供一等公民级别的完整支持。

## 快速上手

### 环境要求

- [Node.js](https://nodejs.org/) 24 或更高版本
- 已安装并完成登录认证的 [Codex CLI](https://github.com/openai/codex)（运行 `codex login`）

### 本地运行

```bash
npm install
npm run dev
```

在浏览器中打开 [http://127.0.0.1:4311](http://127.0.0.1:4311)。

> **生产模式运行**：执行 `npm run build && npm start`，访问 [http://127.0.0.1:4310](http://127.0.0.1:4310)。

### 桌面客户端（macOS）

不想每次都开终端、开浏览器标签页？可以构建一个真正的桌面应用：

```bash
npm run desktop:install
```

这会把 `Course Studio.app` 安装到 `/Applications`。它运行同一个服务端、读取同一个课程库——Web 版完全不受影响，仍是一等公民。若已有 Studio 服务在运行，桌面端会直接接入，而不是另起一个，因此浏览器标签页和桌面应用可以同时打开。

自己构建 Mac 应用无需 Apple 开发者账号，也不必上架 App Store：本地编译出的应用不带隔离属性（quarantine），双击即可运行。任何人克隆本仓库都能以同样方式构建。

不想自己构建？每个版本标签都会在 [Releases 页面](https://github.com/ZhengHe-MD/interactive-course/releases) 发布 Apple Silicon 与 Intel 两种架构的 `.dmg` 和 `.zip`。这些安装包只做了 ad-hoc 签名、未经 Apple 公证，下载后会被 macOS 加上隔离属性——发布说明里给出了解除它的那一条命令。详情（包括版本发布流程，以及公证能改变什么）见 [docs/desktop-app.md](docs/desktop-app.md)。

### 常用环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `COURSE_STUDIO_LIBRARY` | `~/.courses` | 课程文件及其 Git 历史存储的本地目录 |
| `COURSE_STUDIO_COURSE` | `current` | 当前打开的课程目录名称 |
| `COURSE_STUDIO_PORT` | `4310` | Studio 服务端口 |
| `CODEX_BIN` | `codex` | Codex CLI 命令路径 |

## 导出与分享

点击顶部工具栏的 **导出**：
- **独立单文件 HTML**：将所有课时、样式和交互组件打包为单个 `.html` 文件，随时随地离线阅读。
- **课程数据包**：导出包含完整 Git 检查点与对话记录的 `.course.zip`，便于备份、迁移或导入分享。

## 延伸阅读

- [DESIGN.md](DESIGN.md) — 架构决策与设计考量
- [AGENTS.md](AGENTS.md) — AI Agent 的工作机制与教学提示词设计
- [docs/desktop-app.md](docs/desktop-app.md) — macOS 桌面应用的构建、发布与代码签名
- [docs/language-policy.md](docs/language-policy.md) — 双语开发与多语言行为规范
