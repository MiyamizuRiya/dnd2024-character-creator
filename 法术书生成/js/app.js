/* ============================================================
   法术卡排版 · D&D 5r 2024
   左：搜索/筛选/勾选   右：实时排版预览（每页 3行×2列=6张）
   数据：window.SPELL_DATA（391 条，来源 5echm 玩家手册2024/法术详述）
   ============================================================ */
(function () {
  "use strict";

  const SPELLS = Array.isArray(window.SPELL_DATA) ? window.SPELL_DATA : [];
  const LEVEL_LABELS = ["戏法", "一环", "二环", "三环", "四环", "五环", "六环", "七环", "八环", "九环"];
  const SCHOOLS = ["防护", "惑控", "预言", "塑能", "幻术", "死灵", "变化", "咒法"];
  const CARDS_PER_PAGE = 6; // 2 列 × 3 行

  // 索引
  const byId = Object.create(null);
  SPELLS.forEach(s => { byId[s.id] = s; });

  // 状态
  const state = {
    filters: { q: "", level: "all", school: "all", cls: "all", ritual: false, conc: false, onlySelected: false },
    selSet: new Set(),
    selOrder: [],          // 选择顺序（决定卡片排列顺序）
    openDetails: new Set(),// 展开详情的 id
    pageSize: "A4",
    zoom: 100,
    fontScale: 1,          // 卡片字号缩放（A⁻/A⁺）
    slotHints: {},         // id → {page,row,col} 用户手动指定槽位；无提示的卡按顺序自动装箱
    scrollMode: false,     // 法术卷轴模式：卡片隐藏升环施法、显示可施放职业
    _dragId: null,         // 当前拖拽的法术 id
    _pageCount: 0,         // 实际分页页数（由 renderPreview 计算）
  };

  // ---------- 工具 ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const compText = (c) => { if (!c) return ""; let s = c.raw || ""; if (c.material && c.materials && !s.includes(c.materials)) s += "（" + c.materials + "）"; return s; };
  // 人物卡已实现的 12 职业;数据中含"奇械师"等未实现职业标记,展示/筛选时剔除避免误导
  const KNOWN_CLASSES = new Set(["野蛮人", "吟游诗人", "牧师", "德鲁伊", "战士", "武僧", "圣武士", "游侠", "游荡者", "术士", "魔契师", "法师"]);
  const classesStr = (s) => (s.classes || []).filter(c => KNOWN_CLASSES.has(c)).join(" · ");

  // ---------- 初始化下拉 ----------
  function initFilters() {
    const levelSel = $("#levelFilter");
    levelSel.innerHTML = `<option value="all">全部环阶</option>` +
      LEVEL_LABELS.map((lab, i) => `<option value="${i}">${lab}</option>`).join("");
    const schoolSel = $("#schoolFilter");
    schoolSel.innerHTML = `<option value="all">全部学派</option>` +
      SCHOOLS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    const classSel = $("#classFilter");
    const allClasses = Array.from(new Set(SPELLS.flatMap(s => (s.classes || []).filter(c => KNOWN_CLASSES.has(c))))).sort((a, b) => a.localeCompare(b, "zh"));
    classSel.innerHTML = `<option value="all">全部职业</option>` +
      allClasses.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  }

  // ---------- 模糊搜索 ----------
  // 编辑距离（处理错字：摩登肯→摩邓肯）
  function levDist(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }
  // 最长公共子序列长度（处理缺字/乱序里的顺序命中）
  function lcsLen(a, b) {
    const m = a.length, n = b.length;
    let prev = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      const cur = new Array(n + 1).fill(0);
      for (let j = 1; j <= n; j++) {
        cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      prev = cur;
    }
    return prev[n];
  }
  // 模糊打分：综合 字符覆盖（调序/缺字）+ 编辑距离相似度（错字）+ 子序列比
  function fuzzyScore(q, t) {
    if (!q || !t) return 0;
    if (t.includes(q)) return 1000 + q.length;            // 子串命中（最强）
    const qs = new Set(q); let cov = 0;
    qs.forEach(c => { if (t.indexOf(c) >= 0) cov++; });
    const coverage = qs.size ? cov / qs.size : 0;
    const lev = levDist(q, t);
    const sim = 1 - lev / Math.max(q.length, t.length);
    const lcs = lcsLen(q, t) / q.length;
    if (coverage < 0.5 && sim < 0.4) return 0;            // 信号太弱，不算命中
    return coverage * 50 + sim * 30 + lcs * 20;
  }
  // 拼音层（声音近似）：摩登肯→魔邓肯。需在线加载 pinyin-pro；离线返回 null 退化为字符级匹配。
  // 同一套转换同时作用于查询与目标，故即便带音调也能命中子串。
  function toPinyinStr(str) {
    if (!window.__pinyin || !str) return null;
    try {
      let out = "";
      for (const ch of str) {
        const code = ch.codePointAt(0);
        if (code >= 0x4e00 && code <= 0x9fff) {
          let p = window.__pinyin(ch, { toneType: "none" });
          if (Array.isArray(p)) p = p[0] || "";
          out += (p && p !== "") ? p : ch;
        } else { out += ch; }
      }
      return out.toLowerCase();
    } catch (e) { return null; }
  }
  function buildPinyinCache() {
    if (!window.__pinyin) return;
    for (const s of SPELLS) { if (!s._py) s._py = toPinyinStr((s.nameZh || "").toLowerCase()) || ""; }
  }
  function spellScore(q, qpy, s) {
    const zh = (s.nameZh || "").toLowerCase();
    const en = (s.nameEn || "").toLowerCase();
    const sc = (s.school || "").toLowerCase();
    let score = Math.max(fuzzyScore(q, zh), fuzzyScore(q, en), fuzzyScore(q, sc));
    if (qpy) score = Math.max(score, fuzzyScore(qpy, s._py || ""));
    return score;
  }

  // ---------- 过滤 ----------
  function getFiltered() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    const useFuzzy = q.length >= 2; // 1 字用精确子串，2 字起用模糊
    const qpy = (useFuzzy && window.__pinyin) ? toPinyinStr(q) : null;
    const base = SPELLS.filter(s => {
      if (f.level !== "all" && String(s.level) !== String(f.level)) return false;
      if (f.school !== "all" && s.school !== f.school) return false;
      if (f.cls !== "all" && !(s.classes || []).includes(f.cls)) return false;
      if (f.ritual && !s.ritual) return false;
      if (f.conc && !s.concentration) return false;
      if (f.onlySelected && !state.selSet.has(s.id)) return false;
      if (!q) return true;
      if (!useFuzzy) {
        const hay = (s.nameZh + " " + s.nameEn + " " + (s.school || "") + " " + (s.description || "")).toLowerCase();
        return hay.includes(q);
      }
      if (spellScore(q, qpy, s) > 0) return true;
      return (s.description || "").toLowerCase().includes(q); // 描述子串也算
    });
    if (q && useFuzzy) {
      const scored = base.map(s => ({ s, sc: spellScore(q, qpy, s) || (((s.description || "").toLowerCase().includes(q)) ? 1 : 0) }));
      scored.sort((a, b) => (b.sc - a.sc) || (a.s.level - b.s.level) || a.s.nameZh.localeCompare(b.s.nameZh, "zh"));
      return scored.map(x => x.s);
    }
    return base.sort((a, b) => a.level - b.level || a.nameZh.localeCompare(b.nameZh, "zh"));
  }

  // ---------- 渲染：左列表 ----------
  function renderList() {
    const list = $("#spellList");
    const items = getFiltered();
    $("#listCount").textContent = `${items.length} / ${SPELLS.length}`;
    if (!items.length) {
      list.innerHTML = `<div class="empty-state" style="padding:40px 10px"><p>没有匹配的法术。</p></div>`;
      return;
    }
    const html = items.map(s => {
      const sel = state.selSet.has(s.id) ? " selected" : "";
      const open = state.openDetails.has(s.id);
      const det = open ? "" : " hidden";
      const ob = open ? " open" : "";
      const higher = s.higherLevels
        ? `<p class="dhigher"><b>${esc(s.higherLevels.kind)}。</b> ${esc(s.higherLevels.text)}</p>` : "";
      return `<div class="spell-item${sel}" data-id="${esc(s.id)}" role="button" tabindex="0" aria-pressed="${sel ? "true" : "false"}">
        <div class="sel-mark" aria-hidden="true"></div>
        <div class="item-body">
          <div class="item-name">${esc(s.nameZh)} <span class="en">${esc(s.nameEn)}</span></div>
          <div class="item-meta">
            <span class="badge l${s.level}">${LEVEL_LABELS[s.level]}</span>
            <span class="school">${esc(s.school)}</span>
            <span class="cls">${esc(classesStr(s))}</span>
          </div>
          <div class="item-detail${det}">
            <div class="dline"><b>施法时间</b>${esc(s.castingTime)}${s.ritual ? ' <span class="dd-tag r">仪式</span>' : ""}</div>
            <div class="dline"><b>施法距离</b>${esc(s.range)}</div>
            <div class="dline"><b>法术成分</b>${esc(compText(s.components))}</div>
            <div class="dline"><b>持续时间</b>${esc(s.duration)}${s.concentration ? ' <span class="dd-tag c">专注</span>' : ""}</div>
            <p class="ddesc">${esc(s.description)}</p>
            ${higher}
          </div>
        </div>
        <button class="detail-btn${ob}" data-id="${esc(s.id)}" type="button">详情</button>
      </div>`;
    }).join("");
    list.innerHTML = html;
  }

  // ---------- 渲染：右预览 ----------
  function cardHtml(s, gridStyle) {
    const higher = (!state.scrollMode && s.higherLevels)
      ? `<p class="card-higher"><b>${esc(s.higherLevels.kind)}。</b> ${esc(s.higherLevels.text)}</p>` : "";
    const classesRow = state.scrollMode
      ? `<div class="m-classes"><dt>职业</dt><dd>${esc(classesStr(s))}</dd></div>` : "";
    const ritTag = s.ritual ? '<span class="dd-tag r">仪式</span>' : "";
    const concTag = s.concentration ? '<span class="dd-tag c">专注</span>' : "";
    const styleAttr = gridStyle ? ` style="${gridStyle}"` : "";
    return `<article class="card l${s.level}${(state._overflow && state._overflow.has(s.id)) ? " overflowing" : ""}" data-id="${esc(s.id)}" draggable="true"${styleAttr}>
      <button class="pin-btn" type="button" data-id="${esc(s.id)}" draggable="false" title="置顶该法术" aria-label="置顶该法术">↑</button>
      <div class="card-head">
        <div class="card-name">${esc(s.nameZh)} <span class="en">${esc(s.nameEn)}</span></div>
        <div class="card-tag">${LEVEL_LABELS[s.level]} · ${esc(s.school)}</div>
      </div>
      <dl class="card-meta">
        <div><dt>施法时间</dt><dd>${esc(s.castingTime)}${ritTag}</dd></div>
        <div><dt>距离</dt><dd>${esc(s.range)}</dd></div>
        <div><dt>成分</dt><dd>${esc(compText(s.components))}</dd></div>
        <div><dt>持续</dt><dd>${esc(s.duration)}${concTag}</dd></div>
        ${classesRow}
      </dl>
      <p class="card-desc">${esc(s.description)}</p>
      ${higher}
    </article>`;
  }

  // ---------- 卡片尺寸测量与分页排版 ----------
  // 长 description 的法术 → 大型卡（占 2 行 1 列 = 2 格），该页少放 1 个法术；绝不遮挡其它卡。
  const PX_PER_MM = 96 / 25.4;
  const PAGE_DIMS = { A4: { w: 189, h: 276 }, Letter: { w: 194.9, h: 258 } };
  const GAP_MM = 5;
  function getCellDims() {
    const d = PAGE_DIMS[state.pageSize] || PAGE_DIMS.A4;
    return { w: ((d.w - GAP_MM) / 2) * PX_PER_MM, h: ((d.h - 2 * GAP_MM) / 3) * PX_PER_MM };
  }
  // 用离屏卡片量取自然高度，超出一格 → 标记为大型(size=2);超三格仍放不下 → 记入溢出集,卡片标角标
  function computeSizes(order) {
    const { w, h } = getCellDims();
    let m = document.getElementById("__measurer");
    if (!m) { m = document.createElement("div"); m.id = "__measurer"; m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;"; document.body.appendChild(m); }
    m.style.width = w + "px";
    const sizes = {}; const overflow = new Set();
    const gapPx = GAP_MM * PX_PER_MM;
    for (const id of order) {
      const s = byId[id];
      if (!s) { sizes[id] = 1; continue; }
      m.innerHTML = cardHtml(s);
      const art = m.querySelector("article");
      const nat = art ? art.offsetHeight : 0;
      sizes[id] = (nat > h * 2 + 2) ? 3 : (nat > h + 1) ? 2 : 1;
      if (nat > 3 * h + 2 * gapPx + 2) overflow.add(id);
    }
    state._overflow = overflow;
    return sizes;
  }
  // 把卡片(1格/2格/3格)装进 2列×3行 的页。slotHints 指定的卡先就位(用户手动放到该格),
  // 其余按选择顺序自动装箱(页码只前进不回填);返回每页 {items, grid},grid 供空槽渲染与拖放判定
  function packPages(order, sizes, hints) {
    const pages = [];
    const gridAt = p => { while (pages.length <= p) pages.push({ items: [], grid: [[null, null], [null, null], [null, null]] }); return pages[p]; };
    const fits = (p, row, col, span, skip) => {
      if (row + span > 3) return false;
      const pg = pages[p]; if (!pg) return true;
      for (let r = row; r < row + span; r++) { const occ = pg.grid[r][col]; if (occ && occ !== skip) return false; }
      return true;
    };
    const place = (id, row, col, span, page) => { const pg = gridAt(page); pg.items.push({ id, row, col, span }); for (let r = row; r < row + span; r++) pg.grid[r][col] = id; };
    const placed = new Set();
    // 1) 手动槽位先就位(放不下则回退自动)
    for (const id of order) {
      const h = hints && hints[id]; if (!h) continue;
      const size = sizes[id] || 1;
      if (fits(h.page, h.row, h.col, size, id)) { place(id, h.row, h.col, size, h.page); placed.add(id); }
    }
    // 2) 其余顺序装箱
    let cur = 0;
    for (const id of order) {
      if (placed.has(id)) continue;
      const size = sizes[id] || 1;
      let done = false, guard = 0;
      while (!done && guard++ < 500) {
        const pg = gridAt(cur);
        if (size === 3) {
          for (let c = 0; c < 2 && !done; c++) if (fits(cur, 0, c, 3, id)) { place(id, 0, c, 3, cur); done = true; }
        } else if (size === 2) {
          for (let r = 0; r <= 1 && !done; r++) for (let c = 0; c < 2 && !done; c++) if (fits(cur, r, c, 2, id)) { place(id, r, c, 2, cur); done = true; }
        } else {
          for (let r = 0; r < 3 && !done; r++) for (let c = 0; c < 2 && !done; c++) if (fits(cur, r, c, 1, id)) { place(id, r, c, 1, cur); done = true; }
        }
        if (!done) cur++;
      }
      placed.add(id);
    }
    return pages;
  }

  function renderPreview() {
    const pages = $("#pages");
    const sel = state.selOrder.map(id => byId[id]).filter(Boolean);
    $("#selCount").textContent = sel.length;
    if (!sel.length) {
      state._pageCount = 0;
      state._layout = null;
      $("#pageCount").textContent = "0";
      pages.innerHTML = `<div class="empty-state" id="emptyState"><div class="empty-illus">🃏</div><p>尚未选择任何法术。</p><p class="muted">在左侧勾选法术，即可在此处排版为可打印的卡片。</p></div>`;
      applyZoom();
      return;
    }
    const sizes = computeSizes(state.selOrder);
    const packed = packPages(state.selOrder, sizes, state.slotHints);
    state._pageCount = packed.length;
    state._layout = { grids: packed.map(p => p.grid), sizes };
    $("#pageCount").textContent = String(packed.length);
    const charName = ($("#charName").value || "").trim();
    pages.innerHTML = packed.map((page, i) => {
      const cards = page.items.map(it => {
        const s = byId[it.id]; if (!s) return "";
        const gridStyle = `grid-column:${it.col + 1}; grid-row:${it.row + 1} / span ${it.span};`;
        return cardHtml(s, gridStyle);
      }).join("");
      // 空格渲染为槽位占位(仅拖拽时可见/可投)
      const slots = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
        if (!page.grid[r][c]) slots.push(`<div class="cell-slot" data-page="${i}" data-row="${r}" data-col="${c}" style="grid-column:${c + 1};grid-row:${r + 1};"></div>`);
      }
      return `<div class="page-wrap"><div class="page-label">${charName ? esc(charName) + " · " : ""}第 ${i + 1} 页 / 共 ${packed.length} 页</div><div class="page">${cards}${slots.join("")}</div></div>`;
    }).join("");
    applyZoom();
  }

  // ---------- 渲染：顶栏统计 ----------
  function renderSummary() {
    const counts = Array(10).fill(0);
    state.selOrder.forEach(id => { const s = byId[id]; if (s) counts[s.level]++; });
    const pages = state._pageCount;
    if (!state.selOrder.length) {
      $("#summary").innerHTML = `<span class="summary-hint">在左侧勾选法术，右侧实时排版预览</span>`;
      return;
    }
    const chips = counts.map((n, i) =>
      `<span class="sum-item l${i} ${n ? "" : "zero"}">${LEVEL_LABELS[i]} <b>${n}</b></span>`).join("");
    $("#summary").innerHTML = chips +
      `<span class="sum-total">共 ${state.selOrder.length} 个 · ${pages} 页</span>`;
  }

  // ---------- 排序 / 置顶 / 拖拽 ----------
  // 一键排序：按环阶从小到大（同环阶按名称）；清除手动槽位
  function sortSelected() {
    if (!state.selOrder.length) return;
    state.selOrder.sort((a, b) => {
      const sa = byId[a], sb = byId[b];
      const la = sa ? sa.level : 0, lb = sb ? sb.level : 0;
      if (la !== lb) return la - lb;
      return (sa ? sa.nameZh : "").localeCompare(sb ? sb.nameZh : "", "zh");
    });
    state.slotHints = {};
    renderPreview(); renderSummary();
  }
  // 置顶：把该法术移到选择列表最前
  function pinToTop(id) {
    if (!state.selSet.has(id)) return;
    state.selOrder = [id].concat(state.selOrder.filter(x => x !== id));
    renderPreview(); renderSummary();
  }
  // 拖拽手动排序：把 dragId 移动到 targetId 之前
  function reorder(dragId, targetId) {
    if (dragId === targetId) return;
    const arr = state.selOrder.filter(x => x !== dragId);
    const idx = arr.indexOf(targetId);
    if (idx === -1) arr.push(dragId); else arr.splice(idx, 0, dragId);
    state.selOrder = arr;
    renderPreview(); renderSummary();
  }
  // 删除单个已选法术（✕/拖出纸面删除）
  function removeSpell(id) {
    if (!state.selSet.has(id)) return;
    state.selSet.delete(id);
    state.selOrder = state.selOrder.filter(x => x !== id);
    delete state.slotHints[id];
    renderList(); renderPreview(); renderSummary();
    const s = byId[id];
    showToast(`已删除法术「${s ? s.nameZh : id}」（剩余 ${state.selOrder.length} 张）`);
  }
  // 手动放入指定空槽
  function setSlotHint(id, page, row, col) {
    state.slotHints[id] = { page, row, col };
    renderPreview(); renderSummary();
    showToast(`已放到第 ${page + 1} 页 第${row + 1}排左起第${col + 1}列`);
  }

  // ---------- 导入 / 导出 ----------
  function showToast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(globalThis.__toastT);
    globalThis.__toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // 导出：markdown（人/AI 可读列表 + 内嵌 JSON），导入时以此为准
  function exportSelection() {
    const sel = state.selOrder.map(id => byId[id]).filter(Boolean);
    if (!sel.length) { showToast("尚未选择任何法术，无法导出。"); return; }
    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const charName = ($("#charName").value || "").trim();
    const safeName = charName.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    const fileBase = `dnd5r-法术卡-${safeName ? safeName + "-" : ""}${date}`;
    const data = {
      format: "dnd5r-spellcards/v1",
      exportedAt: now,
      character: charName,
      source: "玩家手册2024",
      sourceCount: SPELLS.length,
      count: sel.length,
      spells: sel.map(s => ({ id: s.id, nameZh: s.nameZh, nameEn: s.nameEn, level: s.level, school: s.school })),
      slots: state.selOrder.map(id => state.slotHints[id] || null), // 手动槽位(与 spells 平行,按序对应)
    };
    const json = JSON.stringify(data, null, 2);
    const list = sel.map((s, i) => `${i + 1}. **${s.nameZh}**｜${s.nameEn}　${LEVEL_LABELS[s.level]}·${s.school}`).join("\n");
    const md =
`# DND 5r 法术卡 · 已选法术导出

- 共 **${sel.length}** 个法术
- 角色：${charName || "（未命名）"}
- 导出时间：${date}
- 数据来源：玩家手册2024（${SPELLS.length} 条）

## 已选法术（按当前排序）

${list}

> 把此文件拖回网站「导入」按钮即可恢复选择与排序。下方为机器可读数据，导入时以此为准。

\`\`\`json
${json}
\`\`\`
`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast(`已导出 ${sel.length} 个法术 → ${fileBase}.md`);
  }

  // 导入：解析 .md（取 ```json 块）或纯 .json；按 id 恢复选择与排序（id 失效则按名称回退）
  function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      let jsonText = null;
      const m = text.match(/```json\s*([\s\S]*?)```/);
      if (m) jsonText = m[1].trim();
      else { try { JSON.parse(text); jsonText = text; } catch (e) { jsonText = null; } }
      if (!jsonText) { showToast("未能识别文件：请用本站导出的 .md / .json。"); return; }
      let data;
      try { data = JSON.parse(jsonText); }
      catch (e) { showToast("JSON 解析失败：" + e.message); return; }
      let entries = [];
      if (Array.isArray(data.spells)) entries = data.spells;
      else if (Array.isArray(data.selOrder)) entries = data.selOrder.map(id => ({ id }));
      else if (Array.isArray(data)) entries = data;
      const newOrder = []; const newSet = new Set(); let missing = 0;
      for (const e of entries) {
        const id = typeof e === "string" ? e : e.id;
        let spell = null;
        if (id && byId[id]) spell = byId[id];
        else if (e && e.nameZh) spell = SPELLS.find(s => s.nameZh === e.nameZh);
        else if (e && e.nameEn) spell = SPELLS.find(s => s.nameEn === e.nameEn);
        if (spell) { if (!newSet.has(spell.id)) { newSet.add(spell.id); newOrder.push(spell.id); } }
        else missing++;
      }
      state.selSet = newSet; state.selOrder = newOrder; state.openDetails = new Set();
      // 恢复手动槽位(与 spells 数组平行;只保留仍存在的)
      state.slotHints = {};
      if (Array.isArray(data.slots)) {
        newOrder.forEach((id, i) => { const h = data.slots[i]; if (h && typeof h.page === "number") state.slotHints[id] = { page: h.page, row: h.row, col: h.col }; });
      }
      if (data.character != null) { const cn = $("#charName"); if (cn) cn.value = data.character; }
      renderList(); renderPreview(); renderSummary();
      showToast(`已导入 ${newOrder.length} 个法术${missing ? `，${missing} 个未匹配已跳过` : ""}。`);
    };
    reader.onerror = () => showToast("读取文件失败。");
    reader.readAsText(file, "utf-8");
  }

  // ---------- 选择 / 详情 ----------
  function toggleSelect(id) {
    if (state.selSet.has(id)) {
      state.selSet.delete(id);
      state.selOrder = state.selOrder.filter(x => x !== id);
    } else {
      state.selSet.add(id);
      state.selOrder.push(id);
    }
    // 更新对应行（可能多行：同一 id 只会出现一次，但保险起见遍历）
    document.querySelectorAll(`.spell-item[data-id="${cssAttr(id)}"]`).forEach(el => {
      const on = state.selSet.has(id);
      el.classList.toggle("selected", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderPreview();
    renderSummary();
    if (state.filters.onlySelected) renderList();
  }
  // 把 id 转为可安全用于 CSS 属性选择器的字面量（id 不含 " ，仅可能含 '）
  const cssAttr = (id) => id;

  function toggleDetail(id) {
    const open = state.openDetails.has(id);
    if (open) state.openDetails.delete(id); else state.openDetails.add(id);
    document.querySelectorAll(`.spell-item[data-id="${cssAttr(id)}"]`).forEach(el => {
      const det = el.querySelector(".item-detail");
      const btn = el.querySelector(".detail-btn");
      if (det) det.classList.toggle("hidden", open);
      if (btn) btn.classList.toggle("open", !open);
    });
  }

  // ---------- 缩放 / 纸张 / 字号 ----------
  function applyZoom() {
    const pages = $("#pages");
    pages.style.transform = `scale(${state.zoom / 100})`;
    $("#zoomLabel").textContent = state.zoom + "%";
  }
  function setPageSize(size) {
    state.pageSize = size;
    $("#pages").setAttribute("data-size", size);
  }
  // 卡片字号：写入 --card-fs，离屏测量器同步继承；重新排版（长法术可能因此占 2~3 格）
  function setFontScale(v) {
    state.fontScale = Math.min(1.4, Math.max(0.7, Math.round(v * 20) / 20));
    document.documentElement.style.setProperty("--card-fs", String(state.fontScale));
    $("#fontLabel").textContent = Math.round(state.fontScale * 100) + "%";
    renderPreview(); renderSummary();
  }

  // ---------- 事件 ----------
  function wire() {
    $("#search").addEventListener("input", (e) => { state.filters.q = e.target.value; renderList(); });
    $("#levelFilter").addEventListener("change", (e) => { state.filters.level = e.target.value; renderList(); });
    $("#schoolFilter").addEventListener("change", (e) => { state.filters.school = e.target.value; renderList(); });
    $("#classFilter").addEventListener("change", (e) => { state.filters.cls = e.target.value; renderList(); });
    $("#ritualFilter").addEventListener("change", (e) => { state.filters.ritual = e.target.checked; renderList(); });
    $("#concFilter").addEventListener("change", (e) => { state.filters.conc = e.target.checked; renderList(); });
    $("#onlySelected").addEventListener("change", (e) => { state.filters.onlySelected = e.target.checked; renderList(); });

    const list = $("#spellList");
    // 整行点选：除「详情」按钮外，点任意位置即切换该法术的选中
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".detail-btn");
      if (btn && btn.dataset.id) { toggleDetail(btn.dataset.id); return; }
      const item = e.target.closest(".spell-item");
      if (item && item.dataset.id) toggleSelect(item.dataset.id);
    });
    // 键盘可达：聚焦某行后按 Enter/Space 切换选中（「详情」为原生按钮，自带键盘）
    list.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.closest(".detail-btn")) return;
      const item = e.target.closest(".spell-item");
      if (item && item.dataset.id) { e.preventDefault(); toggleSelect(item.dataset.id); }
    });

    $("#clearBtn").addEventListener("click", () => {
      if (!state.selOrder.length) return;
      if (!confirm("确定清空所有已选法术？")) return;
      state.selSet.clear(); state.selOrder = []; state.slotHints = {};
      renderList(); renderPreview(); renderSummary();
    });
    $("#printBtn").addEventListener("click", () => window.print());

    $("#exportBtn").addEventListener("click", exportSelection);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importFromFile(f);
      e.target.value = "";
    });

    $("#pageSize").addEventListener("change", (e) => setPageSize(e.target.value));
    $("#zoomIn").addEventListener("click", () => { state.zoom = Math.min(150, state.zoom + 10); applyZoom(); });
    $("#zoomOut").addEventListener("click", () => { state.zoom = Math.max(50, state.zoom - 10); applyZoom(); });

    // 一键排序
    $("#sortBtn").addEventListener("click", sortSelected);

    // 法术卷轴模式：隐藏升环施法、显示可施放职业（影响右侧卡片与打印件）
    $("#scrollBtn").addEventListener("click", () => {
      state.scrollMode = !state.scrollMode;
      $("#scrollBtn").classList.toggle("active", state.scrollMode);
      renderPreview();
      renderSummary();
      showToast(state.scrollMode ? "卷轴模式：卡片已隐藏升环施法，显示可施放职业" : "已退出卷轴模式");
    });

    // 预览区：置顶按钮 + 拖拽手动排序（委托在 #pages 上，重渲染后仍生效）
    const pages = $("#pages");
    pages.addEventListener("click", (e) => {
      const pin = e.target.closest(".pin-btn");
      if (pin && pin.dataset.id) { e.stopPropagation(); pinToTop(pin.dataset.id); }
    });
    pages.addEventListener("dragstart", (e) => {
      const card = e.target.closest('.card[data-id]');
      if (!card) return;
      state._dragId = card.dataset.id;
      card.classList.add("dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.dataset.id); } catch (_) {}
      // 槽位模式:标出该卡能放进的空槽(按占格数判定;被拖卡自己占的格视为空)
      const lay = state._layout;
      if (lay) {
        const sz = lay.sizes[state._dragId] || 1;
        pages.classList.add("slot-mode");
        pages.querySelectorAll(".cell-slot").forEach(el => {
          const p = +el.dataset.page, r = +el.dataset.row, c = +el.dataset.col;
          let ok = r + sz <= 3;
          if (ok && lay.grids[p]) for (let rr = r; rr < r + sz; rr++) {
            const occ = lay.grids[p][rr][c];
            if (occ && occ !== state._dragId) { ok = false; break; }
          }
          el.classList.toggle("ok", ok);
        });
      }
    });
    pages.addEventListener("dragover", (e) => {
      const slot = e.target.closest(".cell-slot.ok");
      if (slot && state._dragId) {
        e.preventDefault(); e.dataTransfer.dropEffect = "move";
        pages.querySelectorAll(".cell-slot.hover").forEach(x => { if (x !== slot) x.classList.remove("hover"); });
        slot.classList.add("hover");
        return;
      }
      const card = e.target.closest('.card[data-id]');
      if (!card || !state._dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      pages.querySelectorAll(".drop-target").forEach(c => { if (c !== card) c.classList.remove("drop-target"); });
      card.classList.add("drop-target");
    });
    pages.addEventListener("drop", (e) => {
      pages.classList.remove("slot-mode"); // 重渲染会使 dragend 失效,投放时立即退出槽位模式
      const slot = e.target.closest(".cell-slot.ok");
      if (slot && state._dragId) {
        e.preventDefault();
        setSlotHint(state._dragId, +slot.dataset.page, +slot.dataset.row, +slot.dataset.col);
        state._dragId = null;
        return;
      }
      const card = e.target.closest('.card[data-id]');
      if (!card || !state._dragId) return;
      e.preventDefault();
      const targetId = card.dataset.id;
      if (targetId && targetId !== state._dragId) { delete state.slotHints[state._dragId]; reorder(state._dragId, targetId); }
      state._dragId = null;
    });
    pages.addEventListener("dragend", () => {
      pages.querySelectorAll(".dragging,.drop-target").forEach(c => { c.classList.remove("dragging", "drop-target"); });
      pages.classList.remove("slot-mode");
      pages.querySelectorAll(".cell-slot.ok,.cell-slot.hover").forEach(c => { c.classList.remove("ok", "hover"); });
      state._dragId = null;
      dragHintEl().classList.remove("show");
    });

    // 拖到纸面（.page）之外——页面周围的深色桌面/预览区外——松开 = 删除该法术卡（光标旁小暗牌提示）
    const inPage = t => !!(t && t.closest && t.closest(".page"));
    const dragHintEl = () => {
      let h = document.getElementById("dragDeleteHint");
      if (!h) { h = document.createElement("div"); h.id = "dragDeleteHint"; h.textContent = "🗑 松开删除"; document.body.appendChild(h); }
      return h;
    };
    document.addEventListener("dragover", e => {
      if (!state._dragId) return;
      e.preventDefault();
      const h = dragHintEl();
      if (inPage(e.target)) h.classList.remove("show");
      else { h.classList.add("show"); h.style.left = (e.clientX + 16) + "px"; h.style.top = (e.clientY + 16) + "px"; }
    });
    document.addEventListener("drop", e => {
      if (!state._dragId) return;
      dragHintEl().classList.remove("show");
      if (!inPage(e.target)) {
        e.preventDefault();
        const id = state._dragId; state._dragId = null;
        removeSpell(id);
      }
    });
    document.addEventListener("dragend", () => { dragHintEl().classList.remove("show"); });

    // 卡片字号 A⁻/A⁺
    $("#fontUp").addEventListener("click", () => setFontScale(state.fontScale + 0.05));
    $("#fontDown").addEventListener("click", () => setFontScale(state.fontScale - 0.05));

    // 拼音库就绪后：预建缓存；若已有搜索词则按声音近似重排;失败则提示已退化为字符级模糊
    window.addEventListener("pinyin-ready", () => { buildPinyinCache(); if (state.filters.q.trim()) renderList(); });
    window.addEventListener("pinyin-failed", () => showToast("拼音搜索不可用(离线或网络受限),已退化为字符模糊匹配"));
  }

  // ---------- A2: 接收角色卡同步的天赋法术 ----------
  function requestGrantedSpells() {
    try {
      var msg = { type: "dnd:requestGranted" };
      var p = window.parent;
      if (p && p !== window) {
        try { for (var i = 0; i < p.frames.length; i++) p.frames[i].postMessage(msg, "*"); } catch (e) {}
        try { p.postMessage(msg, "*"); } catch (e) {}
      }
    } catch (e) {}
  }
  function applyGrantedMessage(e) {
    var d = e.data;
    if (!d || d.type !== "dnd:granted") return;
    var names = Array.isArray(d.spells) ? d.spells : [];
    if (!names.length) return;
    var added = 0;
    names.forEach(function (n) {
      var s = SPELLS.find(function (x) { return x.nameZh === n; });
      if (s && !state.selSet.has(s.id)) { state.selSet.add(s.id); state.selOrder.push(s.id); added++; }
    });
    if (added) { renderList(); renderPreview(); renderSummary(); showToast("已从角色卡同步 " + added + " 个天赋法术"); }
  }

  // ---------- 启动 ----------
  function init() {
    if (window.parent !== window) document.documentElement.classList.add("embedded");
    if (!SPELLS.length) {
      document.body.innerHTML = '<p style="padding:24px">未能加载法术数据（data/spells.js）。</p>';
      return;
    }
    initFilters();
    setPageSize("A4");
    wire();
    if (window.__pinyin) buildPinyinCache();
    renderList();
    renderPreview();
    renderSummary();
    window.addEventListener("message", applyGrantedMessage);
    requestGrantedSpells();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
