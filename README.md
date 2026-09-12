# CyTime 昔时时钟

> 昔光涟涟，时不我待。

CyTime 是一款面向学生与教育场景的桌面 / 网页时钟应用：大屏时钟、倒计时、计时器、重点日、课程提示、作业板、天气与黄历一应俱全，并内置本地与云端语录系统 **CyQuote 昔言**。

## 功能特性

- **三种模式**：时钟、倒计时、计时器，支持多任务并行与任务悬浮卡片。
- **时钟页**：可调整字号的主时钟、公历日期 + 农历 + 当日宜忌、金句、当前/下一节课程提示。
- **倒计时 / 计时器**：目标时间与时长创建、暂停 / 继续 / 停止、结束提醒（声音、通知、震动）。
- **响应式布局**：自适应窗口尺寸，顶部状态栏、导航与内容不会在怪尺寸下重叠；状态栏支持缩放与垂直偏移，作业板支持宽度与贴边偏移。
- **视觉外观**：深色 / 浅色桃粉主题、Mica / Acrylic / 纯色背景、多种数字字体，主时钟、日期、金句字号独立可调。
- **内容管理**：重点日、课程表、作业板、日常励志语录，均可本地维护或导入。
- **语录系统 CyQuote 昔言**：本地语录 + 多云端来源（默认仅自建 CyQuote API），支持分类多选与权重抽取。
- **桌面端增强**（Tauri 2）：窗口模式（Mini / 常规 / 最大化 / 全屏）、开机自启动、`cytime://` URI 唤醒、检查更新、数据持久化到安装目录。
- **PWA**：网页端可离线使用、可安装到桌面。

## 技术栈

- Vue 3 + Vite + Pinia + Vue Router
- [VueFluentWidgets](https://github.com/Cyrene2008/VueFluentWidgets)（Fluent Design / WinUI 3 风格组件库）
- Tauri 2（Windows 桌面端，NSIS 安装包）
- Cloudflare Pages + Pages Functions（网页部署与语录 API）
- lunar-javascript（农历 / 黄历）

## 快速开始

```bash
bun install        # 安装依赖
bun run dev        # 启动开发服务器
bun run build      # 构建网页端（自动构建落地页并同步语录 Functions）
bun run preview    # 预览构建产物
```

桌面端：

```bash
bun run tauri:dev    # 桌面开发模式
bun run tauri:build  # 打包 Windows 安装包（NSIS）
```

## CyQuote 昔言 API

线上地址：`https://time.cyrene.hk`

| 接口 | 说明 |
| --- | --- |
| `GET /api/v1/quote?format=json` | 随机返回一条语录 |
| `GET /api/v1/quote?format=json&category=崩铁` | 按分类随机（逗号分隔可多选） |
| `GET /api/v1/quote/categories` | 返回全部分类 |
| `GET /api` | API 说明页（VueFluentWidgets 实现） |

响应示例：

```json
{
  "value": "……",
  "author": "CyTime",
  "from": "逐火篇章",
  "category": ["崩铁"],
  "source": "CyQuote"
}
```

语录数据统一维护在 `api/data/quotes.jsonc`（支持注释的 JSONC，顶层键为分类）。修改后提交推送，Cloudflare Pages 自动重建；也可运行 `bun run sync:quotes` 本地同步。

## 项目结构

```
api/
  data/quotes.jsonc      # 云端语录唯一数据源（分类 -> 语录数组）
  v1/quote/              # Vercel 风格备用接口
  landing-src/           # API 说明页（Vue 3 + VueFluentWidgets 源码）
  landing.html           # 构建产物（单文件，供 Functions 内联）
functions/               # Cloudflare Pages Functions（由脚本生成语录接口）
scripts/
  build-landing.mjs      # 构建落地页
  sync-quote-data.mjs    # 同步语录数据到 Functions
src/
  components/            # 通用组件（语录来源、作业板等）
  composables/           # useDigitBox / useAlmanac / useTypewriter
  config/branding.js     # 版本、版权与备案信息
  data/quotes.jsonc      # 本地语录（日常励志 / 逐火篇章 / 大学校训）
  services/              # 天气、语录、桌面桥接
  stores/                # Pinia：设置、时间、内容、语录、天气
  styles/app.css         # 主题与布局
  views/                 # 时钟 / 倒计时 / 计时器 / 设置
src-tauri/               # Tauri 2 桌面端
```

## 部署

- 网页端通过 Cloudflare Pages 部署（Git 集成，生产分支 `Cyrene`），自定义域名 `time.cyrene.hk`。
- `functions/` 目录由 `bun run build` 的 prebuild 自动生成，随仓库提交。
- 桌面端发行使用 GitHub Actions（`.github/workflows/build-release.yml`）手动触发，自动创建 Release 并上传 NSIS 安装包。

## 相关项目

- [VueFluentWidgets](https://github.com/Cyrene2008/VueFluentWidgets) —— Fluent Design System for Vue（MIT）
- [CyTime 仓库](https://github.com/Cyrene2008/CyTime)

## 版权与许可

- Copyright © 2025-2026 Cyrene2008
- 本项目基于 GNU General Public License v3.0 开源
- [萌ICP备20260093号](https://icp.gov.moe/?keyword=20260093)
