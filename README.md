# D&D 2024 工具站源码合集

纯静态(HTML+CSS+JS,无构建、无后端)的 D&D 2024 中文工具站。

## 包含工具

| 工具 | 入口 | 说明 |
|---|---|---|
| 法术书生成 | `法术书生成/法术书生成.html` | 搜索/筛选法术 → 勾选 → 实时排版成可打印法术卡(每页 3×2=6 张) |
| 冒险者创建指南 | `DND2024冒险者创建指南.html` | 单文件自包含,分步生成 1 级冒险者角色卡 |
| DND 工具合集 | `DND工具合集.html` | 法术书+冒险者指南整页内联进一个自包含 html,双 iframe+切换 |
| 魔法物品卡 | `魔法物品卡/index.html` | 魔法物品卡排版站 |

## 部署

`index.html`(根目录)、`netlify-deploy/index.html`、`DND工具合集.html` 三者内容相同,均为合集部署入口。Netlify Publish 目录为根 `/`。
Netlify 站点的 Publish 目录设为 `netlify-deploy`。

## 数据来源

法术/物品数据来自中文 5e 参考站 https://5echm.kagangtuya.top (玩家手册2024 / 城主指南2024)。
