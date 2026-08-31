# D&D 2024 工具站源码合集

纯静态(HTML+CSS+JS,无后端)的 D&D 2024 中文工具站。

## 包含工具

| 工具 | 入口 | 说明 |
|---|---|---|
| 人物卡(冒险者创建指南) | `DND2024冒险者创建指南.html` | 单文件自包含,分步生成 1 级冒险者角色卡 |
| 法术卡(法术书生成) | `法术书生成/法术书生成.html` | 搜索/筛选法术 → 勾选 → 实时排版成可打印法术卡(每页 3×2=6 张),含法术卷轴模式 |
| 物品卡(魔法物品卡) | `魔法物品卡/index.html` | 魔法物品卡排版站,支持消耗品/充能/自定义卡 |
| **DND 工具合集** | `DND工具合集.html` | 三工具各自内联进一个自包含 html(三 iframe 隔离互不干扰),打开先选工具,右上角「☰ 选择工具」随时返回 |

## 构建

合集是构建产物:改了任何源码或文档后,运行 `node build.js`(仅需 Node,零依赖)重建,会同步写出三个相同副本:`DND工具合集.html`、`index.html`、`netlify-deploy/index.html`。

## 部署

push `main` 即自动部署:Netlify 主站 <https://create-your-dnd2024-pc.netlify.app>(Publish 目录 = 仓库根 `/`,依赖根目录 `index.html`)+ GitHub Pages 镜像 <https://miyamizuriya.github.io/dnd2024-character-creator>。

## 数据来源

法术/物品数据来自中文 5e 参考站 https://5echm.kagangtuya.top (玩家手册2024 / 城主指南2024)。

详细说明(架构/构建流程/环境坑)见 `AI背景说明.md`;分发副本为 `DMsBestFriend/项目文档.md`。
