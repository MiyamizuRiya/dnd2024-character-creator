# D&D 2024 工具站 · 总体项目文档

> 给 AI 助手与新电脑接手的人阅读:这是什么、怎么用、怎么改、怎么重建合集、怎么部署、有哪些坑。
> 最近更新:2026-08-31(项目文档改为独立 md 分发,合集内不再嵌文档面板)。

## 一、这是什么

一套**纯静态**(HTML/CSS/JS,无构建依赖、无后端、无 npm)的 D&D 2024 中文工具站,共三个工具 + 一个合集:

| 工具 | 入口 | 说明 |
|---|---|---|
| **人物卡**(冒险者创建指南) | `DND2024冒险者创建指南.html` | 单文件自包含,分步生成 1 级冒险者角色卡,`localStorage` 存状态 |
| **法术卡**(法术书生成) | `法术书生成/法术书生成.html` | 搜索/筛选/勾选法术 → 实时排版成可打印法术卡(每页 3×2=6 张)。数据 `data/spells.js`(391 条) |
| **物品卡**(魔法物品卡) | `魔法物品卡/index.html` | 同款魔法物品卡排版站。数据 `data/items.js`(419 条),支持消耗品/充能/自定义卡 |
| **DND 工具合集** | `DND工具合集.html` | 三工具各自 base64 内联进**一个自包含 html**,blob-URL 三 iframe 隔离,互不干扰。**= 部署版/分发版** |

**合集结构**(2026-08-29 起):
- 打开合集先见**入口选择页**(gate):三张大卡(人物卡/法术卡/物品卡)。
- 点卡片进入对应工具;工具视图右上角固定按钮 **「☰ 选择工具」** 点击即回到选择页(取代旧的双工具互换按钮)。
- 三个 iframe **启动时全部加载**(display 切换),工具状态在来回切换间保留。
- 部署入口有三个内容完全相同的文件:`index.html`(仓库根,Netlify 用)、`netlify-deploy/index.html`、`DND工具合集.html`。
- **项目文档不嵌入网页**,以独立 md 分发:`DMsBestFriend/项目文档.md`(内容即本文件)。

## 二、新电脑上手

`DMsBestFriend/` 就是**完整分发包**,整个文件夹拷到新电脑即可:

- `DND工具合集.html` —— 即拿即用的三合一合集单文件,双击就能用
- `项目文档.md` —— 本文档的分发副本
- `开发密钥与新电脑指南.md` —— GitHub Token、git 身份、仓库/部署地址、推送命令与网络坑备用方案
- `DND工具站源码合集/` —— 完整源码(含 `.git` 历史与 origin、build.js),进去就能继续开发

也可以不用分发包,直接 `git clone https://github.com/MiyamizuRiya/dnd2024-character-creator`。开发只需 **Node.js**(任意新版,零 npm 依赖,跑构建脚本用)。

**改完源码后**:运行 `node build.js` 重建合集(见「四」),再提交推送即自动上线。

## 三、线上部署

| 渠道 | 地址 | 触发 |
|---|---|---|
| **Netlify(主站)** | https://create-your-dnd2024-pc.netlify.app | push GitHub `main` 自动部署 |
| **GitHub Pages(镜像)** | https://miyamizuriya.github.io/dnd2024-character-creator | push `main` 自动构建 |

- 仓库:`MiyamizuRiya/dnd2024-character-creator`,分支 `main`。
- ⚠️ **Netlify Publish 目录 = 仓库根**,根目录必须有 `index.html`(曾因入口只在 `netlify-deploy/` 子目录导致全站 404,已修复——勿重蹈覆辙)。
- `5echm.kagangtuya.top` 与本项目无关,只是数据来源参考站。

## 四、构建流程(build.js)⚠️ 必读

**合集是构建产物**:改了 `法术书生成/`、`魔法物品卡/`、`DND2024冒险者创建指南.html` 或本文档之后,直接改合集 HTML 无效(下次构建会覆盖),必须改源码再重建:

```
node build.js
```

build.js 做的事:
1. **内联法术书**:`法术书生成/法术书生成.html` 的三个外链(`<link css/styles.css>`、`<script data/spells.js>`、`<script js/app.js>`)替换为内联 `<style>`/`<script>`(内联时把 `</script>` 转义成 `<\/script>` 防截断)→ 得到自包含法术书 HTML。
2. **内联物品卡**:同法处理 `魔法物品卡/index.html` + css/js/data。
3. **读冒险者指南**全文(本就自包含)。
4. **base64**:三者分别 `Buffer.from(html,'utf8').toString('base64')`(即 UTF-8 字节→base64;合集里的 `dec()` 用 `TextDecoder+atob` 解码,与之互逆,**别改成纯 atob**,中文会乱码)。
5. **组装合集**:模板 = 入口选择页(gate)+ 三个 iframe + 「☰ 选择工具」按钮 + `SPELLBOOK_B64`/`ADVENTURER_B64`/`ITEMS_B64` 三个变量与启动脚本(项目文档不嵌入,独立 md 分发)。
6. **写出三副本**:`DND工具合集.html`、`index.html`、`netlify-deploy/index.html`(三者必须 byte-equal)并自检(解码回环含关键代码、三副本一致)。

## 五、数据来源

均来自中文 5e 参考站 **https://5echm.kagangtuya.top**「5E 不全书」(WinCHM 转 HTML、JS 渲染的 frame 站,**普通 curl/WebFetch 抓不到**,需浏览器自动化):
- 法术:`玩家手册2024/法术详述/0环.htm…9环.htm`
- 物品:`城主指南2024/7.宝藏/魔法物品详述/{类别}/{稀有度}.htm`
  - ⚠️ TOC 里「着装物品/」是 404 失效旧路径,真路径是 **「着装品/」**(少一个字);多稀有度物品已展开成独立变体卡。
- 法术字段含 `components{material,materials,raw,...}`(materials 是材料说明文字)、`higherLevels{kind,text}`(升环施法)、`classes[]`(可施放职业)。

## 六、技术要点

- **纯静态零依赖**:`file://` 双击即跑;http 部署下 blob iframe 与父页同源,postMessage 互通。
- **打印 = 浏览器打印**:`window.print()` + `@media print` 只输出卡片网格(A4/Letter)。
- **卡片装箱**:离屏测高 → 超 1 格占 2 格、超 2 格占 3 格(整列);`computeSizes`+`packPages` 2×3 网格装箱,绝不重叠。
- **页面尺寸留余量**:`--page-w` = 纸宽−页边距−1mm(A4 189mm / Letter 194.9mm)。这 1mm 是**必须的**:曾因零余量导致打印 PDF 时最右列卡片右边框被裁(已修)。改页面尺寸时 CSS 与 app.js 的 `PAGE_DIMS` 必须同步。
- **拼音搜索**(仅法术书):在线动态 import jsdelivr 的 pinyin-pro,离线退化字符级模糊。
- **法术卷轴模式**(法术书):「📜 法术卷轴」切换按钮,卡片隐藏升环施法、显示可施放职业(`state.scrollMode`)。
- **天赋法术贯通(A2)**:人物卡端 `grantedSpells()` 计算种族/血系授予法术,`broadcastGranted()` 经 `parent.frames` postMessage `{type:'dnd:granted',spells:[中文名]}`;法术书端监听并按 `nameZh` 加入已选(另有 request 应答握手)。只加不减。**合集三个 iframe 时此机制依然有效**(items 无监听,收不到也无害)。
- **内嵌让位(A1)**:法术书/物品卡检测 `window.parent!==window` 时给 `<html>` 加 `embedded` class,顶栏右侧留 130px 给合集的「☰ 选择工具」按钮;独立打开无留白。
- **键盘可达**:人物卡用 MutationObserver 给 onclick 的 div 补 `role=button`+`tabindex`,全局 Enter/Space 委托。
- **XSS**:人物卡全局 `esc()`,用户输入进 innerHTML 前必须转义;法术书/物品卡本就有 esc。
- **奇幻主题**:羊皮纸/皮革/金;法术环阶 `--l0~l9`、稀有度 `--r-*` 在 `:root`。

## 七、文件结构

```
DND工具站源码合集/            ← 本地即 git 仓库(origin=GitHub 上述库)
├─ AI背景说明.md              ← 本文件(总体项目文档,同时被嵌入合集)
├─ README.md                  ← GitHub 门面
├─ build.js                   ← 合集构建脚本(node build.js,零依赖)
├─ .gitignore / .gitattributes
├─ index.html                 ← 合集部署入口①(=构建产物)
├─ DND工具合集.html           ← 合集②(自包含,可直接分发)
├─ DND2024冒险者创建指南.html  ← 人物卡源(自包含,≈2300 行)
├─ netlify-deploy/index.html  ← 合集③
├─ 法术书生成/                ← 法术卡源(入口+css+js+data)
└─ 魔法物品卡/                ← 物品卡源(入口+css+js+data)
```

## 八、修复与功能记录

**2026-08-29**:
- 合集改三合一:魔法物品卡并入(ITEMS_B64+第三 iframe),新增入口选择页与「☰ 选择工具」菜单按钮(替代旧双工具互换)。
- 新增 build.js 构建脚本与本文档嵌入。
- 修复打印 PDF 最右列卡片右边框被裁:页面宽度留 1mm(A4 189/Letter 194.9,CSS+PAGE_DIMS 同步)。
- 法术书新增「法术卷轴」模式:卡片隐藏升环施法、显示可施放职业。

**2026-08-28**(对照 `法术书生成/问题清单.md` 编号,D 节优先 13 项全修+A2 部分):
- 人物卡:C1 重载还原步骤 / C2 19级传奇恩惠 / C3 专长属性计入 / C4 健壮+矮人HP / C5 血系速度黑视 / C6 掷点去重 / C7 阵营邪恶 / C8 技能去重 / C9-C11 豁免技能被动加值 / C17-C18 打印样式 / C20 XSS转义 / C21 键盘可达 / C22 步骤索引。
- 法术书:B1 材料说明上卡 / B2 三档卡片 / A1 切换按钮让位。
- A2:种族天赋法术 postMessage 流入法术书(只加不减)。
- **未修**(问题清单仍在):C12-C16、C19、C23-C30、B3-B7、A3。

## 九、已知坑 / 环境注意 ⚠️

1. **原开发机 Git Bash 崩**(`STATUS_DLL_INIT_FAILED`,疑似杀软注入):无可用 shell,文件/命令操作走 Node(`child_process.execSync` 直调 git/curl 可用)。
2. **git 代理坑**:全局配了 `http.proxy=http://127.0.0.1:9098` 且代理常不在线,连 GitHub 失败时加 `-c http.proxy= -c https.proxy=` 直连绕过。
3. **GFW 间歇拦截**:`api.github.com` 大多可达;`github.com:443`(git push)、`*.netlify.app`、`*.github.io` 时通时断。**git push 失败的可靠备用**:GitHub **Git Data API**(Node 直连 api.github.com):`POST /git/blobs`(base64 内容)→ `POST /git/trees`(base_tree=远程当前 tree)→ `POST /git/commits`(parent=远程 HEAD)→ `PATCH /git/refs/heads/main`。⚠️ URL path 含中文文件名必须 `encodeURIComponent`;Contents API 单文件限 1MB(合集 1.3MB 必须走 Git Data API);blob/tree/commit 创建成功但 ref 更新报 "not a fast forward" 时先重查远程 HEAD(可能已推进)。
4. **本地/远程偶发等价提交分叉**(API 与 git 两种推送方式造成):内容一致、SHA 不同,不影响部署;网络好时 `git fetch origin && git reset --hard origin/main` 或 force push 对齐。
5. **大文件读取**:`data/spells.js`、`data/items.js`、合集 html 超出某些读取工具 token 限制,用 Node `fs` 处理。
6. **合集拼音层**:blob iframe 在 `file://` 下源为 null,CDN import 可能被拦→退化字符级模糊(不影响主功能)。
7. **真机渲染未实测**(开发机内置浏览器坏):验证靠静态检查+纯函数单测(语法 `new Function`、blob 解码回环、`cardHtml/packPages/compText` 等单测)。
8. **安全**:GitHub PAT 用完即弃,勿写进文件/git 配置;origin URL 保持不含 token。

## 十、怎么用 / 怎么改

- **用**:双击 `DND工具合集.html`(或线上地址),入口页选工具。
- **改人物卡**:直接改 `DND2024冒险者创建指南.html`,然后 `node build.js`。
- **改法术卡**:`法术书生成/js/app.js`(逻辑)、`data/spells.js`(数据)、`css/styles.css`(样式),然后 `node build.js`。
- **改物品卡**:`魔法物品卡/` 下对应文件,然后 `node build.js`。
- **改合集本身**(选择页/菜单按钮):改 `build.js` 里的模板,重新构建。
- **改文档**:改 `AI背景说明.md`;分发时把最新内容同步为 `DMsBestFriend/项目文档.md`。
- **部署**:改源码 → `node build.js` → `git add -A && git commit` → push `main`(代理坑见九,失败走 API)→ Netlify+Pages 自动上线。
- **用户输入一律过 `esc()`** 再进 innerHTML。

## 十一、一句话总结

三套 D&D 2024 中文静态工具站(人物卡/法术卡/物品卡)+ 一个三合一自包含合集(入口选择页+菜单切换);合集由 `node build.js` 从源码构建(改源码必须重建并同步三入口);项目文档独立为 md 分发(`DMsBestFriend/项目文档.md`);push `main` 到 `MiyamizuRiya/dnd2024-character-creator` 即自动部署 Netlify 主站(Publish 目录=仓库根!)+ GitHub Pages;原开发机无 shell、git 代理坑多,Node 直调是万能解。
