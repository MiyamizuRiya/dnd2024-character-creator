/* ============================================================
   DND 工具合集构建脚本 · 用法:node build.js
   用法:  node build.js
   作用:  把三个工具源码内联成自包含 HTML → base64 → 组装成
          三合一合集(入口选择页 + 三 iframe + ☰菜单按钮 + 文档面板),
          写出三个内容相同的部署副本并自检。
   依赖:  仅 Node.js 内置模块(零 npm 依赖)。
   注意:  合集是构建产物,请改源码后重新运行本脚本,勿手改合集。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escJsInline = s => s.replace(/<\/script>/g, '<\\/script>');   // 防内联截断
const escCssInline = s => s.replace(/<\/style>/g, '<\\/style>');

/* ---------- 1) 内联多文件工具(法术书/物品卡同构) ---------- */
function inlineTool(entryFile) {
  let html = read(entryFile);
  const dir = path.dirname(entryFile);
  const css = read(path.join(dir, 'css/styles.css'));
  const dataFile = html.match(/<script src="data\/([^"]+)"><\/script>/)[1];
  const data = read(path.join(dir, 'data', dataFile));
  const js = read(path.join(dir, 'js/app.js'));
  const out = html
    .replace('<link rel="stylesheet" href="css/styles.css">', '<style>\n' + escCssInline(css) + '\n</style>')
    .replace('<script src="data/' + dataFile + '"></script>', '<script>\n' + escJsInline(data) + '\n</script>')
    .replace('<script src="js/app.js"></script>', '<script>\n' + escJsInline(js) + '\n</script>');
  if (out.includes('href="css/styles.css"') || out.includes('src="data/') || out.includes('src="js/app.js"'))
    throw new Error(entryFile + ' 内联后仍有外链残留');
  return out;
}

/* ---------- 2) 三个工具的自包含 HTML ---------- */
const spellbookHtml = inlineTool(path.join('法术书生成', '法术书生成.html'));
const itemsHtml = inlineTool(path.join('魔法物品卡', 'index.html'));
const adventurerHtml = read('DND2024冒险者创建指南.html');

/* ---------- 3) base64(UTF-8 字节 → base64,与合集内 dec() 互逆) ---------- */
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const SPELLBOOK_B64 = b64(spellbookHtml);
const ADVENTURER_B64 = b64(adventurerHtml);
const ITEMS_B64 = b64(itemsHtml);

/* ---------- 4) 项目文档(嵌入合集入口页) ---------- */
const DOC_HTML = escHtml(read('AI背景说明.md'));

/* ---------- 5) 合集模板 ---------- */
const wrapper = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DND 工具合集 · 人物卡 + 法术卡 + 物品卡</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#0d0a06;overflow:hidden;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif}
#wrap{position:fixed;inset:0}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0d0a06}
#toggle{position:fixed;top:12px;right:16px;z-index:999999;background:linear-gradient(180deg,#e8c45e,#c9a227);color:#1f130a;border:1.5px solid #9c6b1f;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 6px rgba(0,0,0,.4)}
#toggle:hover{background:linear-gradient(180deg,#f0d068,#d4af37)}
/* 入口选择页 */
#gate{position:fixed;inset:0;z-index:999998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:radial-gradient(1100px 600px at 50% -10%,#2a1d12 0%,#0d0a06 65%);padding:30px;overflow:auto}
#gate h1{margin:0;font-family:Georgia,serif;color:#e8c75a;font-size:2rem;letter-spacing:2px;text-shadow:0 2px 10px #000;text-align:center}
#gate .sub{margin:0;color:#c9a96a;font-size:.9rem;text-align:center}
.gate-cards{display:flex;gap:20px;flex-wrap:wrap;justify-content:center;max-width:920px}
.gate-card{width:230px;padding:26px 18px;border:1.5px solid #5a4632;border-radius:14px;background:linear-gradient(180deg,#2a2018,#1a130d);cursor:pointer;text-align:center;transition:.18s;font-family:inherit}
.gate-card:hover{border-color:#c9a227;transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.5)}
.gate-card .ico{font-size:2.6rem;display:block;margin-bottom:10px}
.gate-card .t{color:#e8c75a;font-size:1.15rem;font-weight:700;font-family:Georgia,serif}
.gate-card .s{color:#b9a888;font-size:.78rem;margin-top:6px;line-height:1.5}
#docToggle{background:none;border:1px solid #5a4632;color:#c9a96a;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:.85rem;font-family:inherit}
#docToggle:hover{border-color:#c9a227;color:#e8c75a}
#docPanel{display:none;width:min(880px,94vw);max-height:60vh;overflow:auto;background:#171009;border:1px solid #5a4632;border-radius:12px;padding:22px 26px;text-align:left}
#docPanel.show{display:block}
#docPanel h2{color:#e8c75a;font-family:Georgia,serif;margin:0 0 10px;font-size:1.1rem}
.doc-pre{white-space:pre-wrap;word-break:break-word;color:#d9c9a0;font-size:.76rem;line-height:1.6;font-family:Consolas,"Cascadia Code","Microsoft YaHei",monospace;margin:0}
.gate-foot{color:#7a6a52;font-size:.75rem;text-align:center}
</style>
</head>
<body>
<div id="wrap">
  <iframe id="spellbook" title="法术书生成" style="display:none"></iframe>
  <iframe id="adventurer" title="冒险者创建指南" style="display:none"></iframe>
  <iframe id="items" title="魔法物品卡" style="display:none"></iframe>
</div>
<button id="toggle" type="button" style="display:none" title="返回工具选择页">☰ 选择工具</button>
<div id="gate">
  <h1>D&amp;D 2024 工具合集</h1>
  <p class="sub">选择要使用的工具 · 数据基于玩家手册2024 / 城主指南2024</p>
  <div class="gate-cards">
    <button type="button" class="gate-card" data-tool="adventurer">
      <span class="ico">⚔</span><span class="t">人物卡</span>
      <div class="s">冒险者创建指南<br>分步创建 D&amp;D 2024 冒险者</div>
    </button>
    <button type="button" class="gate-card" data-tool="spellbook">
      <span class="ico">📜</span><span class="t">法术卡</span>
      <div class="s">法术书生成<br>391 条法术 · 排版打印法术卡</div>
    </button>
    <button type="button" class="gate-card" data-tool="items">
      <span class="ico">🛡</span><span class="t">物品卡</span>
      <div class="s">魔法物品卡<br>419 条魔法物品 · 排版打印</div>
    </button>
  </div>
  <button type="button" id="docToggle">📖 项目文档</button>
  <div id="docPanel"><h2>项目文档</h2><pre class="doc-pre">${DOC_HTML}</pre></div>
  <div class="gate-foot">工具间互不干扰 · 右上角「☰ 选择工具」随时返回本页 · 三个工具后台常驻,切换不丢状态</div>
</div>
<script>
var SPELLBOOK_B64 = "${SPELLBOOK_B64}";
var ADVENTURER_B64 = "${ADVENTURER_B64}";
var ITEMS_B64 = "${ITEMS_B64}";
function dec(b64){
  var bin = atob(b64);
  var u = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(u);
}
function setSrc(id, b64){
  var f = document.getElementById(id);
  f.src = URL.createObjectURL(new Blob([dec(b64)], { type: 'text/html;charset=utf-8' }));
}
setSrc('spellbook', SPELLBOOK_B64);
setSrc('adventurer', ADVENTURER_B64);
setSrc('items', ITEMS_B64);
var cur = null;
var gate = document.getElementById('gate'), tg = document.getElementById('toggle');
var frames = {
  spellbook: document.getElementById('spellbook'),
  adventurer: document.getElementById('adventurer'),
  items: document.getElementById('items')
};
function enter(tool){
  cur = tool;
  gate.style.display = 'none';
  for (var k in frames) frames[k].style.display = (k === tool ? 'block' : 'none');
  tg.style.display = 'block';
}
function backToGate(){
  cur = null;
  gate.style.display = 'flex';
  for (var k in frames) frames[k].style.display = 'none';
  tg.style.display = 'none';
}
tg.addEventListener('click', backToGate);
Array.prototype.forEach.call(document.querySelectorAll('.gate-card'), function(c){
  c.addEventListener('click', function(){ enter(c.getAttribute('data-tool')); });
});
document.getElementById('docToggle').addEventListener('click', function(){
  document.getElementById('docPanel').classList.toggle('show');
});
</script>
</body>
</html>
`;

/* ---------- 6) 写出三个部署副本 + 自检 ---------- */
const outputs = ['DND工具合集.html', 'index.html', path.join('netlify-deploy', 'index.html')];
for (const p of outputs) fs.writeFileSync(path.join(ROOT, p), wrapper, 'utf8');

const eq = fs.readFileSync(path.join(ROOT, outputs[0])).equals(fs.readFileSync(path.join(ROOT, outputs[1]))) &&
           fs.readFileSync(path.join(ROOT, outputs[0])).equals(fs.readFileSync(path.join(ROOT, outputs[2])));

const chkSb = Buffer.from(SPELLBOOK_B64, 'base64').toString('utf8');
const chkAv = Buffer.from(ADVENTURER_B64, 'base64').toString('utf8');
const chkIt = Buffer.from(ITEMS_B64, 'base64').toString('utf8');

console.log('=== build.js 完成 ===');
console.log('合集大小: ' + wrapper.length + ' bytes');
console.log('blob: SPELLBOOK=' + SPELLBOOK_B64.length + ' ADVENTURER=' + ADVENTURER_B64.length + ' ITEMS=' + ITEMS_B64.length);
console.log('三副本一致: ' + eq);
console.log('法术书含: SPELL_DATA=' + chkSb.includes('SPELL_DATA') + ' scrollMode=' + chkSb.includes('scrollMode') + ' 189mm=' + chkSb.includes('189mm'));
console.log('人物卡含: 守序邪恶=' + chkAv.includes('守序邪恶') + ' grantedSpells=' + chkAv.includes('grantedSpells') + ' @media print=' + chkAv.includes('@media print'));
console.log('物品卡含: ITEM_DATA=' + chkIt.includes('ITEM_DATA') + ' embedded=' + chkIt.includes('embedded') + ' 189mm=' + chkIt.includes('189mm'));
console.log('合集含: gate=' + wrapper.includes('id="gate"') + ' items iframe=' + wrapper.includes('id="items"') + ' 文档=' + wrapper.includes('项目文档') + ' 菜单按钮=' + wrapper.includes('选择工具'));
if (!eq || !chkSb.includes('SPELL_DATA') || !chkAv.includes('守序邪恶') || !chkIt.includes('ITEM_DATA')) {
  console.error('!! 自检失败');
  process.exit(1);
}
