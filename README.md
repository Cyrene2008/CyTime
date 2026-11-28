# CyTime 昔时时钟

> 昔光涟涟，时不我待。

有人问过人家，教室里有手机、有讲台电脑、墙上还挂着钟，为什么还要再多一只呢。

大概是别的东西都不太肯把话说清楚——它们不告诉你这节课还剩几分几秒，不提醒你该谁去擦黑板，也不会在你低头写作业的第十五分钟，轻轻递来一句能喘口气的话 ♪

CyTime 就是为这件事做的一只钟：能放在班级大屏、自习室投影，也能安安静静待在自家书桌上，桌面端和网页端各有各的安身处。

## 它会做些什么

### 时间

- **时钟、倒计时、计时器**：可以同时开好几个任务，收起时变成一张悬浮小卡片挂在角落，不吵你
- **时钟页**：字号可调的主时钟、公历日期与农历宜忌、一句语录，还有当前与下一节课程的提示
- **倒计时 / 计时器**：按目标时间或时长创建，暂停、继续、停止都顺手，结束时用声音、通知或震动提醒
- **计时分段**：记下每一段与累计用时，能撤销上一段、分页翻看、导出 CSV；这次没记完就关掉也不要紧，下次打开还能接着走
- **重要日**：从时钟状态栏添加、编辑和查看，支持每年重复；临近或当天的重要日会出现在状态栏
- **校时**：和 CyTime 服务端对一次时间，免得系统时钟慢慢漂走，课堂跟着一起错

### 课堂

- **课程表**：以 [CSES](https://github.com/SmartTeachCN/CSES)（YAML）为主要交换格式，支持单双周、教师、教室和秒级时段。导入前可对照新增、移除和冲突；旧版 CSV、JSON、Excel 仍可读入。有单双周课程时，在昔时设置学期第 1 周即可。
- **作业与小黑板**：宽屏并排，手机在时钟下方直接切换。作业可按科目预设起止时间，小黑板可以看值日、写记事。
- **值日排班**：独立的名单与任务、定次预览、单日临时调整；可以挑从哪天开始，也能导出排班表和每个人的次数统计
- **未启动不轮换**：想严格一点就打开它，只按实际运行过的日子往前推，手动补记不算数，换规则时轮次也不会乱跳
- **随机分组**：粘贴名单或填入本机值日成员，按组数或人数上限均分。同名会编号，结果可以放大投屏、复制或重抽；名单不会上传
- **课堂流程**：给讲解、讨论、展示等阶段分别设定时长，从模板开始也可以。每段到时由老师确认是否继续，刷新后仍能接着用

### 样子

- **教室大屏**：默认随窗口切换，也可在「视觉外观 → 显示与主题」指定教室或桌面排版；「字号与颜色」可分别预览和调整时钟与日期、课程、语录、状态栏、作业、小黑板和活动计时。
- **指针特效**：普通箭头跟随主题色，文字和控件保留原生光标。鼠标从站内切到课堂工具首页时播放过场，导航仍可用，按 Esc 可跳过。「显示与主题」可即时预览指针，并分别关闭特效或开启绘制音效。
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
bun run build      # 构建网页端（会先生成图标）
bun run test       # 跑逻辑与接口测试
bun run preview    # 预览构建产物
```

桌面端：

```bash
bun run tauri:dev    # 桌面开发模式
bun run tauri:build  # 打包 Windows 安装包（NSIS）
```

## 在线语录

这次更新会把旧配置切换到昔枢。以后可在「语录来源」改首选服务；首选不可用时会自动试备用源，在线服务均不可用时使用本地语录。

| 顺序 | 服务 | 接口 |
| --- | --- | --- |
| 1 | 昔枢 · `api.cyrene.hk` | `/v1/quote` 随机语录；`/v1/quote/categories` 同时提供分类与计数，兼容查询 `/v1/quote/count` |
| 2 | 昔言 · `quote.cyrene.hk` | `/api/v1/quote`，另提供 `/categories` 和 `/count` |
| 3 | 昔时 · `time.cyrene.hk` | 随机语录、分类与数量的最终备用；数据来自 Cloudflare KV |

昔时的 Cloudflare 接口只对已允许的 CyTime 页面来源和客户端标记开放，不允许通配跨域访问。需要从自定义预览域访问时，可通过 `CYTIME_QUOTE_EXTRA_ORIGINS` 显式添加精确来源。列出的浏览器来源和公开标记不能验证调用方身份。时间校准仍使用 `/api/v1/time`。

分类设置读取各服务自己的目录；目录不可用时仍可选用内置分类。随机分组和课堂流程在本机运行，无需连接昔枢。

### 昔时语录数据（Cloudflare KV）

昔时的完整语录不再提交到公开仓库，而是放在 Cloudflare KV：

1. 在 Cloudflare Pages 项目的 Functions 绑定里创建一个 KV 命名空间，变量名填 `QUOTES`。
2. 把私有 `quotes.jsonc` 放在仓库外，运行：
   `bun run quotes:upload -- "D:\private\quotes.jsonc" <namespace-id>`
3. 脚本会写入 `meta` 和 `category:<分类>` 键；Function 只从 `env.QUOTES` 读取。
4. 之后更新语录只需重新上传，不必重新部署代码。

公开仓库只保留接口代码和测试用的小样本；`api/data/quotes.jsonc` 已加入 `.gitignore`，不会再次提交。

## 项目结构

```
api/data/                # JSONC 解析（本地内置语录构建用）
functions/               # Cloudflare Pages Functions：KV 语录、校时与天气
server/                  # Cloudflare 语录请求检查
scripts/
  build-icons.mjs        # 生成实际使用的离线图标子集
  upload-quotes.mjs      # 上传私有语录到 Cloudflare KV
src/
  components/            # 黑板、备份、值日、作业、课程表导入、语录来源
  composables/           # useDigitBox / useAlmanac / useTypewriter 等
  config/branding.js     # 版本、版权与备案信息
  data/quotes.jsonc      # 内置语录（日常 / 逐火 / 校训）
  services/              # 语录、天气、校时、备份、排班、CSES、计时分段与桌面桥接
  stores/                # Pinia：设置、时间、内容、语录、天气
  styles/app.css         # 主题与布局
  views/                 # 时钟 / 倒计时 / 计时器 / 作业管理 / 设置
src-tauri/               # Tauri 2 桌面端
tests/                   # 持久化、备份、排班、网络、计时分段与接口测试
```

## 部署

- 网页端走 Cloudflare Pages（Git 集成，生产分支 `Cyrene`），自定义域名 `time.cyrene.hk`
- 昔枢与昔言独立部署；昔言源码与部署说明见 [Cyrene2008/CyQuote](https://github.com/Cyrene2008/CyQuote)
- 桌面端用 GitHub Actions 发版：手动触发 `.github/workflows/build-release.yml`，跑网页与 Rust 测试，再构建 NSIS 安装包，最后创建或更新 Release
- 昔时的 KV 绑定需要在 Cloudflare Pages 项目中配置一次；数据更新用 `bun run quotes:upload`，不需要改代码
- 版本号以 `src-tauri/tauri.conf.json` 为准，发布出来的就是它

## 相关项目

- [CyQuote 昔言](https://github.com/Cyrene2008/CyQuote)——语录库与轻量 API 服务（Go / Rust）
- [VueFluentWidgets](https://github.com/Cyrene2008/VueFluentWidgets)——Fluent Design System for Vue（MIT）
- [CyTime Releases](https://github.com/Cyrene2008/CyTime/releases)——下载最新安装包

## 版权与许可

`swarm-cursors-vue` 及其 divPointers 引擎使用 MIT 许可证，参见[第三方许可和署名](./public/licenses/swarm-cursors-vue/NOTICE.md)。

- Copyright © 2025-2026 Cyrene2008
- 本项目基于 GNU General Public License v3.0 开源
- [萌ICP备20260093号](https://icp.gov.moe/?keyword=20260093)

愿你抬头的时候，时间正好 ♪
