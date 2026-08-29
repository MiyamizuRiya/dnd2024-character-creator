# D&D 2024 工具站源码合集 · AI 背景说明

> 本文件给 AI 助手阅读，帮助快速理解这套项目是什么、数据从哪来、怎么跑、怎么改、怎么部署、有哪些坑。人类也可读。
> 最近大更新：2026-08-28(修复一批审查问题 + 建立 GitHub→Netlify 部署链路)。详见「八、2026-08-28 修复记录」。

## 一、这是什么

一套**纯静态**(HTML + CSS + JS，无构建、无后端、无 npm)的 D&D 2024 中文工具站。共 4 个工具：

| 工具 | 入口 | 说明 |
|---|---|---|
| **法术书生成** | `法术书生成/法术书生成.html` | 搜索/筛选法术 → 勾选 → 右侧实时排版成可打印法术卡(每页 3 行 × 2 列 = 6 张)。数据 `data/spells.js`(`window.SPELL_DATA`,391 条)。 |
| **魔法物品卡** | `魔法物品卡/index.html` | 同款魔法物品卡排版站。数据 `data/items.js`(`window.ITEM_DATA`,419 条)。 |
| **冒险者创建指南** | `DND2024冒险者创建指南.html` | 单文件自包含。分步生成 1 级冒险者角色卡,`localStorage` 存状态(key `dnd2024_char`)。 |
| **DND 工具合集** | `DND工具合集.html` | 把法术书+冒险者指南**整页 base64 内联**进一个自包含 html,blob-URL 双 iframe 隔离,右上角金色 ⇄ 切换。**= 部署版**。 |

**部署上有三个内容完全相同的合集入口文件**(见「二、线上部署」的同步要求):
- 根目录 `index.html`
- `netlify-deploy/index.html`
- `DND工具合集.html`

## 二、线上部署 ⚠️ 重点

| 渠道 | 地址 | 触发方式 |
|---|---|---|
| **Netlify(主站)** | https://create-your-dnd2024-pc.netlify.app | push 到 GitHub `main` **自动部署** |
| **GitHub Pages(镜像)** | https://miyamizuriya.github.io/dnd2024-character-creator | push 到 `main` 自动构建 |

- GitHub 仓库:**`MiyamizuRiya/dnd2024-character-creator`**(https://github.com/MiyamizuRiya/dnd2024-character-creator),分支 `main`。
- **⚠️ Netlify 的 Publish 目录 = 仓库根目录 `/`**。所以**根目录必须有 `index.html`**。
  - 2026-08-28 出过一次事故:一次推送把合集入口只放在 `netlify-deploy/` 子目录,根目录没有 index.html → 全站 404。已修复(根目录补 index.html)。**改文件结构时千万别重蹈覆辙**。
- GitHub Pages 配置:branch `main` / path `/`(legacy 构建器)。它默认入口也是根 index.html。
- `5echm.kagangtuya.top` **与本项目无关**——那只是数据来源参考站,不是本项目的部署。

### 部署的唯一动作

改完源码 → 按下面「四、构建流程」重建合集 → 三个入口文件同步 → `git commit` → push `main` → Netlify 与 Pages 各自自动上线(Netlify 通常 1~2 分钟)。

## 三、数据来源

均来自中文 5e 参考站 **https://5echm.kagangtuya.top**(站名「5E 不全书」,WinCHM 转 HTML,JS 生成的目录树 + 嵌套 frame 页):

- **法术**:`玩家手册2024/法术详述/0环.htm … 9环.htm`(10 页,h4+`<p>` 结构)。
- **魔法物品**:`城主指南2024/7.宝藏/魔法物品详述/{护甲,药水,戒指,卷轴,武器,法杖,魔杖,权杖,奇物[装饰品/其他物品/着装品]}/{稀有度}.htm`。
  - ⚠️ 站点目录树(TOC)里穿戴类奇物链接写的是 `着装物品/`,**那是 404 失效旧路径**;真路径是 **`着装品/`**(少一个「物」字)。
  - 多稀有度物品(治疗药水等)在源站是一个带表格的条目,已**展开成各变体独立卡片**。
- **冒险者创建指南**:原源文件在 `C:\Users\<user>\.zcode\workspace\default\DND2024冒险者创建指南.html`;本合集里的是其副本(已大量修改,以此为准)。
- 法术对象字段:`castingTime, classes[], components{material,materials,raw,somatic,verbal}, concentration, description, duration, id, level, nameEn, nameZh, range, ritual, school, higherLevels{kind,text}, source` 等。`components.materials` 是材料说明文字(如"一点磷")。

## 四、构建流程:从源码重建合集 ⚠️ 必读

**什么时候需要**:改了 `法术书生成/` 下任何文件或 `DND2024冒险者创建指南.html` 之后。合集(DND工具合集.html / index.html / netlify-deploy/index.html)是**构建产物**,直接改它没用——下次重建会覆盖;必须改源码再重建。

**步骤**(Node 即可,无 npm 依赖):

1. **内联法术书**:读 `法术书生成/法术书生成.html`,把三个外链替换成内联:
   - `<link rel="stylesheet" href="css/styles.css">` → `<style>…styles.css 全文…</style>`
   - `<script src="data/spells.js"></script>` → `<script>…spells.js 全文…</script>`
   - `<script src="js/app.js"></script>` → `<script>…app.js 全文…</script>`
   - 内联 JS 前把 `</script>` 替换成 `<\/script>`(防截断);内联 CSS 同理处理 `</style>`。
   - 保留那段动态 `import('https://cdn.jsdelivr.net/npm/pinyin-pro@3/+esm')` 的 module 脚本不动。
2. **base64 编码**:
   - `SPELLBOOK_B64 = Buffer.from(内联后的法术书html, 'utf8').toString('base64')`
   - `ADVENTURER_B64 = Buffer.from(冒险者指南.html全文, 'utf8').toString('base64')`
   - 即「**UTF-8 字节 → base64**」。wrapper 里的解码函数 `dec` 用 `TextDecoder + atob`,是 UTF-8 安全的,与该编码方式配套,别改成纯 `atob`(会乱码)。
3. **注入 wrapper**:取旧合集 html,替换两个变量值:
   - `var SPELLBOOK_B64 = "…";` 和 `var ADVENTURER_B64 = "…";`(base64 不含引号,可用正则 `/var SPELLBOOK_B64 = "[^"]*";/` 安全匹配)。
   - wrapper 其余部分(iframe、toggle、dec、setSrc)不用动。
4. **三副本同步**:把重建产物同时写到 `DND工具合集.html`、`netlify-deploy/index.html`、根 `index.html`(三者内容必须一致)。
5. **验证**:解码回来 `Buffer.from(b64,'base64').toString('utf8')` 应含全部新代码;两份部署副本 byte-equal。

## 五、技术要点

- **纯静态、零依赖**:原生 HTML/CSS/JS,无框架。`file://` 双击即跑;http 部署同源(blob iframe 与父页同源,postMessage/localStorage 可互通)。
- **打印 = 浏览器打印**:`window.print()` + `@media print`。法术书只显示卡片网格;冒险者指南隐藏顶栏/步骤条/导航、保留羊皮纸底色(`print-color-adjust:exact`)、`break-inside:avoid` 防表格断页。
- **卡片装箱**:离屏测量自然高度 → 超 1 格占 2 格,超 2 格占 3 格(整列);`computeSizes`+`packPages` 做 2×3 网格装箱,绝不重叠/溢出。
- **拼音搜索**:在线时从 jsdelivr 动态 import `pinyin-pro`,离线退化字符级模糊(编辑距离+LCS)。物品站未接拼音层。
- **合集架构**:两工具各自 base64→blob URL→iframe;两 iframe **同时加载**(display 切换),同源,可 postMessage 互通。
- **天赋法术贯通(A2,2026-08-28 新增)**:冒险者指南端 `grantedSpells()` 计算种族/血系授予的法术(阿斯莫→光亮术;精灵血系 卓尔/高等精灵/木精灵;侏儒血系;提夫林三系遗赠,含 3/5 级解锁),`broadcastGranted()` 经 `parent.frames[i].postMessage` 广播 `{type:'dnd:granted',spells:[中文名]}`;法术书端 `applyGrantedMessage` 监听并按 `nameZh` 加入已选,另有 `{type:'dnd:requestGranted'}` 请求-应答握手兜底时序。**只加不减**(换种族不自动移除旧天赋法术)。
- **内嵌检测(A1)**:法术书 `init` 里 `window.parent!==window` 时给 `<html>` 加 `embedded` class,CSS `html.embedded .topbar{padding-right:190px}` 为合集右上角切换按钮让位;独立打开无此留白。
- **键盘可达(C21)**:冒险者指南用 MutationObserver 给所有带 onclick 的 div 自动补 `role=button`+`tabindex=0`,全局 keydown 委托 Enter/Space 触发 click。
- **XSS 防护(C20)**:冒险者指南有全局 `esc()`,所有用户输入(角色名/外貌/背景/信仰等)写入 innerHTML 前必须过 `esc()`。新代码同样要遵守。
- **奇幻主题**:羊皮纸/皮革/金色;环阶 `--l0~--l9`、稀有度 `--r-*` 配色变量在 `:root`。

## 六、文件结构

```
DND工具站源码合集/            ← 本地即 git 仓库(origin=GitHub 上述库)
├─ AI背景说明.md              ← 本文件
├─ README.md                  ← GitHub 仓库门面说明
├─ .gitignore / .gitattributes ← 忽略 OS/编辑器文件;强制 html/css/js/md 换行=LF(保护 base64 单行)
├─ index.html                 ← 合集部署入口①(=DND工具合集.html)
├─ DND工具合集.html           ← 合集部署入口②(自包含)
├─ DND2024冒险者创建指南.html  ← 冒险者指南源(自包含,≈2300行)
├─ netlify-deploy/
│   └─ index.html             ← 合集部署入口③(与①②相同)
├─ 法术书生成/
│   ├─ 法术书生成.html        ← 入口(引用 css/js/data)
│   ├─ css/styles.css
│   ├─ data/spells.js         ← window.SPELL_DATA=[391法术](单行压缩,Read工具读不动,用 Node 读)
│   ├─ js/app.js              ← 全部交互逻辑(IIFE)
│   └─ 问题清单.md            ← 早前审查(大部分已修,见第八节)
└─ 魔法物品卡/
    ├─ index.html / css/styles.css / data/items.js / js/app.js
    └─ 显示问题清单.md         ← 物品站审查(大部分已修)
```

## 七、功能清单

卡片站共有:搜索/筛选 · 整行点选 · 多张同物品 · 置顶/一键排序/拖拽排序 · 导入导出 md(可读列表+内嵌 JSON,按 id+名称回退) · 空白自定义卡 · 消耗品徽章 · 充能圆圈 · A4/Letter+缩放。
法术书额外:拼音模糊搜索、角色名(导出文件名+角色卡显示)、材料成分说明、DC/攻击加值显示(见八)。
冒险者指南:九步流程(概览/等级/职业/进阶/起源/属性/法术/细节/角色卡),属性四种生成法(标准数列/购点/掷点/手动),兼职、子职、专长/传奇恩惠、魔能祈唤、战斗风格、超魔法、战技,角色表含豁免/技能加值与被动察觉,导出 txt/打印 PDF,`localStorage` 自动存档(3 秒间隔+beforeunload)。

## 八、2026-08-28 修复记录

对照 `法术书生成/问题清单.md` 的编号(D 节优先 13 项全修 + A2 部分):

**冒险者创建指南**(`DND2024冒险者创建指南.html`):
- C1 `init()` 改调 `go(S.step)`,重载后还原步骤面板
- C2 `ASI_LEVELS` 各职业加 19(传奇恩惠可达);`renderLevelInfo` 不把 19 计入"属性提升"计数
- C3 `asiBonusTotal` 计入专长/传奇恩惠 `+1` 属性(featAttr);`detectFeatAttrs` 支持单属性自动选、"提升属性/提升一项…"识别为任选;epic 分支补属性选择 UI
- C4 HP 计入健壮(背景/人类起源/ASI 专长三处来源,`hasTough`)+ 矮人刚毅 `+1/级`
- C5 `effSpeed/effDarkvision`:木精灵 35 尺、卓尔 120 尺黑视上角色表
- C6 掷点按**掷值索引**去重(`S.rollAssign`+`setRollAssign`),正确处理重复掷值
- C7 阵营补守序/中立/混乱邪恶
- C8 顺带修复:技能行去重、职业未选时不再塌缩
- C9/C10/C11 角色表:豁免加值(`力量 +5`式)、技能加值、被动察觉
- C17/C18 `@media print` + `@page{margin:12mm}` + 分页控制
- C20 全局 `esc()` 转义所有用户输入
- C21 MutationObserver 键盘可达(见五)
- C22 `sync`/`pickSpeciesChoice` 用过滤后末步索引(非施法者角色表正确刷新)

**法术书生成**(`法术书生成/js/app.js`、`css/styles.css`):
- B1 `compText` 附材料说明:`V、S、M（一点磷）`
- B2 三档卡片尺寸(size=3 占整列),超长法术不再被裁
- A1 内嵌时顶栏右让 190px(见五)

**合集/贯通**:
- A2(部分)天赋法术 postMessage 流入法术书(见五)
- 根目录补 `index.html` 修复 Netlify 404 事故(见二)

**未修**(问题清单仍在,后续可做):C12-C16、C19、C23-C30(战技描述空、奇械师数据、子职法术结构化等)、B3-B7、A3。A2 的"替换式同步"(换种族自动移除旧天赋法术)未做,当前为只加不减。

## 九、已知坑 / 环境注意 ⚠️

1. **开发机 Git Bash 崩**:`STATUS_DLL_INIT_FAILED`(疑似杀软注入 msys dll),**没有可用 shell**。文件/命令操作全部走 Node(`child_process.execSync` 直调 git/curl 可用;bash 包装命令全挂)。
2. **git 走的代理经常不在线**:git 全局配了 `http.proxy=http://127.0.0.1:9098`(本地代理客户端,时常关闭)。连不上 GitHub 时加 `-c http.proxy= -c https.proxy=` 直连绕过。
3. **GFW 间歇性拦截**:`api.github.com` 大多可达;`github.com:443`(git push 端点)、`*.netlify.app`、`*.github.io` 时通时断(直连常见 `ECONNRESET`)。**git push 失败时的可靠备用路径**:GitHub **Git Data API**(Node HTTPS 直连 api.github.com):`POST /git/blobs`(base64 内容)→ `POST /git/trees`(base_tree=远程当前 tree)→ `POST /git/commits`(parent=远程 HEAD)→ `PATCH /git/refs/heads/main`。注意 Contents API 单文件限 1MB,合集 index.html 1.3MB 必须走 Git Data API。
4. **git 本地/远程分叉现状**:远程 main 与本地 main 各有一个内容相同但 SHA 不同的修复提交(远程 `72fc32d`,本地 `0fa8239`,parent 同为 `e99f2f3`,tree 等价)。不影响部署;下次正式改动前建议先对齐(`git -c http.proxy= -c https.proxy= fetch origin && git reset --hard origin/main`,或干脆 force push)。
5. **合集的拼音层**:blob iframe 在 `file://` 下源为 null,远程 CDN import 可能被拦 → 退化字符级模糊(不影响主功能)。
6. **真机渲染未实测**:开发机内置浏览器(IAB)坏,验证靠静态检查+纯函数单测(语法 `new Function`、blob 解码回验、`asiBonusTotal/packPages/compText/grantedSpells` 等 22 条单测全过)。
7. **大文件读取**:`data/spells.js`(239KB 单行压缩)与合集 html 超出 Read 工具 token 限制,要用 Node `fs` 读。
8. **安全**:部署用过的 GitHub PAT 用完即弃,不要写进任何文件/git 配置。当前 origin URL 不含 token(干净)。

## 十、怎么用 / 怎么改

- **用**:双击 `DND工具合集.html`(或任一入口)。
- **部署**:改源码 → 按「四」重建 → 三副本同步 → `git add -A && git commit` → push main(代理坑见九,失败走 API 路径)。Netlify+Pages 自动上线。
- **改法术书逻辑**:`法术书生成/js/app.js`;数据 `data/spells.js`;样式 `css/styles.css`。改完**必须重建合集**。
- **改冒险者指南**:直接改 `DND2024冒险者创建指南.html`(自包含)。改完**必须重建合集**。
- **改物品卡**:`魔法物品卡/` 下改(它不进合集,独立部署;如需上线要单独处理)。
- **用户输入一律过 `esc()`** 再进 innerHTML(防 XSS 回归)。

## 十一、一句话总结

四套 D&D 2024 中文静态工具站(法术卡/物品卡/角色卡/合集),数据源自 5echm,纯前端、打印 PDF、奇幻主题;合集是 base64 双 iframe 的自包含部署产物,**改源码后必须重建并同步三个入口文件**;push main 到 `MiyamizuRiya/dnd2024-character-creator` 即自动部署 Netlify 主站(Publish 目录=仓库根!)+ GitHub Pages 镜像;开发机无 shell、git 代理坑多,Node 直调是万能解。
