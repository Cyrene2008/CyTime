# CyTime 昔时时钟

> 昔光涟涟，时不我待。

有人问过人家，教室里有手机、有讲台电脑、墙上还挂着钟，为什么还要再多一只呢。

大概是别的东西都不太肯把话说清楚——它们不告诉你这节课还剩几分几秒，不提醒你该谁去擦黑板，也不会在你低头写作业的第十五分钟，轻轻递来一句能喘口气的话 ♪

CyTime 就是为这件事做的一只钟：能放在班级大屏、自习室投影，也能安安静静待在自家书桌上，桌面端和网页端各有各的安身处。

## 它会做些什么

### 时间

- **三种模式**：时钟、倒计时、计时器；可以同时开好几个任务，收起时变成一张悬浮小卡片挂在角落，不吵你
- **时钟页**：字号可调的主时钟、公历日期与农历宜忌、一句语录，还有当前与下一节课程的提示
- **倒计时 / 计时器**：按目标时间或时长创建，暂停、继续、停止都顺手，结束时用声音、通知或震动提醒
- **计时分段**：记下每一段与累计用时，能撤销上一段、分页翻看、导出 CSV；这次没记完就关掉也不要紧，下次打开还能接着走
- **校时**：和 CyTime 服务端对一次时间，免得系统时钟慢慢漂走，课堂跟着一起错

### 课堂

- **课程表**：CSV、JSON、Excel 都可以先预览再导入，追加去重或整表替换随你选，也支持下载模板与导出
- **作业板**：作业一条条列着；新添的模板管理能给每个科目预设起止时长，切换科目时自动填好，编辑旧作业则不会被动改写
- **值日排班**：独立的名单与任务、定次预览、单日临时调整；可以挑从哪天开始，也能导出排班表和每个人的次数统计
- **未启动不轮换**：想严格一点就打开它，只按实际运行过的日子往前推，手动补记不算数，换规则时轮次也不会乱跳

### 样子

- 深色 / 浅色主题，柔光、渐变、纯色背景，几种数字字体，各组件的大小与颜色都能单独调
- 状态栏可缩放、可上下偏移，作业板能改宽度与贴边距离，窗口被拖成奇怪的尺寸也不会挤作一团
- **沉浸模式**：去掉小组件的边框，让它们贴着背景，安安静静
- **纯净模式**：考试、自习或投屏时用，天气、作业板和语录先收起来，只留下时间

### 数据与桌面端

- **备份与恢复**：导出完整备份，恢复前先给你看一眼，设置、课程、作业、值日、语录、记事板、计时任务挑着来，旧备份也认得
- **黑板与记事板**：点一下就能写，写完失焦自动存，想重来就清空
- **桌面端（Tauri 2）**：迷你、常规、最大化、全屏四种窗口；可开机自启；能用 `cytime://` 链接唤起来、切页面、建倒计时、管任务；内置检查更新；数据存在安装目录里
- **网页端 PWA**：可离线打开，也能装到桌面上
- **触摸友好**：常用按钮的点击区域都放大了一圈，编辑时不会被"闲置太久自动回首页"打断

## 技术栈

- Vue 3 + Vite + Pinia + Vue Router
- [VueFluentWidgets](https://github.com/Cyrene2008/VueFluentWidgets)——Fluent Design / WinUI 3 风格的 Vue 组件库
- Tauri 2（Windows 桌面端，NSIS 安装包）
- Cloudflare Pages（网页端与函数）
- lunar-javascript（农历与黄历）
- 测试：Node 自带的 `node --test`，加 Rust 侧的单元测试

## 快速开始

```bash
bun install        # 安装依赖
bun run dev        # 启动开发服务器
bun run build      # 构建网页端（会先生成图标、同步语录接口）
bun run test       # 跑逻辑与接口测试
bun run preview    # 预览构建产物
```

桌面端：

```bash
bun run tauri:dev    # 桌面开发模式
bun run tauri:build  # 打包 Windows 安装包（NSIS）
```

## CyQuote 昔言 API

语录服务已经独立成一个小项目，放在自己的仓库里了：[Cyrene2008/CyQuote](https://github.com/Cyrene2008/CyQuote)。Go 与 Rust 两种等价实现，单个二进制就能跑，也欢迎自己部署一份。

线上地址：`https://quote.cyrene.hk`

| 接口 | 说明 |
| --- | --- |
| `GET /api/v1/quote?format=json` | 随机返回一条语录 |
| `GET /api/v1/quote?format=json&category=崩铁` | 按分类随机（逗号分隔可多选） |
| `GET /api/v1/quote/categories` | 返回全部分类 |
| `GET /api/v1/quote/count` | 查询分类与总数 |

响应示例（真实返回）：

```json
{
  "value": "时代不负奋斗者，星光不负赶路人。",
  "author": "",
  "from": "《人民日报》",
  "category": ["人民日报", "名人名言", "崩铁", "幽默解压"],
  "source": "CyQuote"
}
```

这四个分类目前一共 3562 条：人民日报 537、名人名言 1599、崩铁 1215、幽默解压 211（截至 2026-10-29）。

几点说明：

- 语录内容和接口实现都在 CyQuote 仓库，新增或修改请去那边提交，本仓库不再维护语录数据
- 本仓库里的 `api/` 是随网页端留下的旧接口与数据副本，`functions/` 由 `scripts/sync-quote-data.mjs` 生成，只负责把 `/api` 指向昔言文档页
- 网页端还留着「昔时源」`https://time.cyrene.hk/api/v1/quote`，给旧版本和回退用；时间校准仍是 `https://time.cyrene.hk/api/v1/time`

## 项目结构

```
api/                     # 旧版 Vercel 风格接口与语录数据副本（兼容用）
functions/               # Cloudflare Pages Functions（由脚本生成，指向昔言文档页）
scripts/
  build-icons.mjs        # 生成实际使用的离线图标子集
  sync-quote-data.mjs    # 同步语录接口与数据
src/
  components/            # 黑板、备份、值日、作业、课程表导入、语录来源
  composables/           # useDigitBox / useAlmanac / useTypewriter 等
  config/branding.js     # 版本、版权与备案信息
  data/quotes.jsonc      # 内置语录（日常 / 逐火 / 校训）
  services/              # 语录、天气、校时、备份、排班、计时分段、CSV、桌面桥接
  stores/                # Pinia：设置、时间、内容、语录、天气
  styles/app.css         # 主题与布局
  views/                 # 时钟 / 倒计时 / 计时器 / 作业管理 / 设置
src-tauri/               # Tauri 2 桌面端
tests/                   # 持久化、备份、排班、网络、计时分段与接口测试
```

## 部署

- 网页端走 Cloudflare Pages（Git 集成，生产分支 `Cyrene`），自定义域名 `time.cyrene.hk`
- 语录服务单独部署在 `quote.cyrene.hk`，源码与部署说明见 CyQuote 仓库
- 桌面端用 GitHub Actions 发版：手动触发 `.github/workflows/build-release.yml`，先同步语录、跑网页与 Rust 测试，再构建 NSIS 安装包，最后创建或更新 Release
- 版本号以 `src-tauri/tauri.conf.json` 为准，发布出来的就是它

## 相关项目

- [CyQuote 昔言](https://github.com/Cyrene2008/CyQuote)——语录库与轻量 API 服务（Go / Rust）
- [VueFluentWidgets](https://github.com/Cyrene2008/VueFluentWidgets)——Fluent Design System for Vue（MIT）
- [CyTime Releases](https://github.com/Cyrene2008/CyTime/releases)——下载最新安装包

## 版权与许可

- Copyright © 2025-2026 Cyrene2008
- 本项目基于 GNU General Public License v3.0 开源
- [萌ICP备20260093号](https://icp.gov.moe/?keyword=20260093)

愿你抬头的时候，时间正好 ♪
