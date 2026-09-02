/* ============================================================
   魔法物品卡 · D&D 2024 城主指南
   左：搜索/筛选 + 自定义(空白)卡   右：实时排版预览（每页 3行×2列=6张，过长占2格）
   · 一个物品可多次选择 → 打印多张
   · 消耗品（药水/卷轴/一次性）卡片标注「消耗品」
   · 有充能的物品卡片右下角放空心圆圈（=充能数，可标记使用）
   数据：window.ITEM_DATA（来源 5echm 城主指南2024/7.宝藏/魔法物品详述）
   ============================================================ */
(function () {
  "use strict";
  const ITEMS = Array.isArray(window.ITEM_DATA) ? window.ITEM_DATA : [];
  const RARITIES = ["普通", "非普通", "珍稀", "极珍稀", "传说", "神器"];
  const RARITY_ORDER = { "普通": 0, "非普通": 1, "珍稀": 2, "极珍稀": 3, "传说": 4, "神器": 5 };
  const byId = Object.create(null);
  ITEMS.forEach(s => { byId[s.id] = s; });
  const CATEGORIES = Array.from(new Set(ITEMS.map(s => s.category))).sort((a, b) => a.localeCompare(b, "zh"));

  const state = {
    filters: { q: "", cat: "all", rarity: "all", att: false, onlySelected: false },
    selEntries: [],          // [{uid, itemId}] —— 每条 = 一张卡；同物品可多条
    openDetails: new Set(),
    customItems: [],
    pageSize: "A4", zoom: 100, fontScale: 1, slotHints: {}, _uidSeq: 0, _dragId: null, _pageCount: 0, _editingCustomId: null,
  };
  const getEntry = id => byId[id] || state.customItems.find(c => c.id === id);
  const countOf = id => state.selEntries.filter(e => e.itemId === id).length;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function displayType(item) { const m = (item.meta || "").match(/^([^，（(]+)(?:[（(]([^）)]*)[)）])?/); return m ? { type: m[1].trim(), detail: (m[2] || "").trim() } : { type: item.category || "", detail: "" }; }
  function metaLine(item) { const { type, detail } = displayType(item); if (!type && !detail) return item.attunement ? '<span class="att">需同调</span>' : ""; return (type || item.category || "") + (detail ? "（" + detail + "）" : "") + (item.attunement ? ' <span class="att">需同调</span>' : ""); }

  // ---------- 下拉 ----------
  function initFilters() {
    $("#catFilter").innerHTML = `<option value="all">全部类别</option>` + CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    $("#rarityFilter").innerHTML = `<option value="all">全部稀有度</option>` + RARITIES.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    $("#cRarity").innerHTML = RARITIES.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    $("#cRarity").value = "非普通";
  }

  // ---------- 模糊搜索（与法术书同款：编辑距离 + 子序列 + 拼音近似） ----------
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
  function fuzzyScore(q, t) {
    if (!q || !t) return 0;
    if (t.includes(q)) return 1000 + q.length;
    const qs = new Set(q); let cov = 0;
    qs.forEach(c => { if (t.indexOf(c) >= 0) cov++; });
    const coverage = qs.size ? cov / qs.size : 0;
    // 字符重排(乱序输入,如「甲烁闪」→「闪烁甲」):字符集相同,视为强命中,排普通弱命中之前
    if (q.length === t.length && [...q].sort().join("") === [...t].sort().join("")) return 900 + q.length;
    const lev = levDist(q, t);
    const sim = 1 - lev / Math.max(q.length, t.length);
    const lcs = lcsLen(q, t) / q.length;
    const lcsT = t.length > q.length ? lcsLen(q, t) / t.length : lcs; // 目标侧覆盖:惩罚只在长目标里凑齐字符的弱命中
    if (coverage < 0.5 && sim < 0.4) return 0;
    return coverage * 40 + sim * 25 + lcs * 15 + lcsT * 20;
  }
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
  function pyOf(s) { if (!s._py) s._py = toPinyinStr((s.nameZh || "").toLowerCase()) || ""; return s._py; }
  function itemScore(q, qpy, s) {
    const zh = (s.nameZh || "").toLowerCase();
    const en = (s.nameEn || "").toLowerCase();
    const cat = (s.category || "").toLowerCase();
    let score = Math.max(fuzzyScore(q, zh), fuzzyScore(q, en), fuzzyScore(q, cat));
    if (qpy) score = Math.max(score, fuzzyScore(qpy, pyOf(s)));
    return score;
  }

  // ---------- 过滤 ----------
  function getFiltered() {
    const f = state.filters; const q = f.q.trim().toLowerCase();
    const useFuzzy = q.length >= 2; // 1 字用精确子串，2 字起用模糊
    const qpy = (useFuzzy && window.__pinyin) ? toPinyinStr(q) : null;
    const base = ITEMS.filter(s => {
      if (f.cat !== "all" && s.category !== f.cat) return false;
      if (f.rarity !== "all" && s.rarity !== f.rarity) return false;
      if (f.att && !s.attunement) return false;
      if (f.onlySelected && countOf(s.id) === 0) return false;
      if (!q) return true;
      if (!useFuzzy) {
        const hay = (s.nameZh + " " + s.nameEn + " " + (s.type || "") + " " + (s.detail || "") + " " + (s.meta || "") + " " + (s.description || "")).toLowerCase();
        return hay.includes(q);
      }
      if (itemScore(q, qpy, s) > 0) return true;
      return (s.description || "").toLowerCase().includes(q);
    });
    if (q && useFuzzy) {
      const scored = base.map(s => ({ s, sc: itemScore(q, qpy, s) || (((s.description || "").toLowerCase().includes(q)) ? 1 : 0) }));
      scored.sort((a, b) => (b.sc - a.sc) || (RARITY_ORDER[a.s.rarity] - RARITY_ORDER[b.s.rarity]) || a.s.nameZh.localeCompare(b.s.nameZh, "zh"));
      return scored.map(x => x.s);
    }
    return base.sort((a, b) => (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || a.nameZh.localeCompare(b.nameZh, "zh"));
  }

  // ---------- 左列表 ----------
  function rowHtml(s, isCustom) {
    const c = countOf(s.id);
    const sel = c > 0 ? " selected" : "";
    const open = state.openDetails.has(s.id);
    const det = open ? "" : " hidden"; const ob = open ? " open" : "";
    const customFlag = isCustom ? '<span class="custom-flag">自定义</span>' : "";
    const attBadge = s.attunement ? '<span class="badge att">需同调</span>' : "";
    const consBadge = s.consumable ? '<span class="badge cons">消耗品</span>' : "";
    const cntBadge = c > 0 ? `<span class="cnt-badge">×${c}</span>` : "";
    const editBtns = isCustom ? `<button class="mini-btn edt" data-edit="${esc(s.id)}" title="编辑">✎</button><button class="mini-btn del" data-del="${esc(s.id)}" title="删除">✕</button>` : `<button class="detail-btn${ob}" data-detail="${esc(s.id)}">详情</button>`;
    return `<div class="spell-item${sel}" data-id="${esc(s.id)}" role="button" tabindex="0" aria-pressed="${sel ? "true" : "false"}">
      <div class="sel-mark" aria-hidden="true">${c > 0 ? c : ""}</div>
      <div class="item-body">
        <div class="item-name">${esc(s.nameZh)} ${s.nameEn ? `<span class="en">${esc(s.nameEn)}</span>` : ""}${cntBadge}${customFlag}</div>
        <div class="item-meta"><span class="badge r-${esc(s.rarity)}">${esc(s.rarity)}</span>${isCustom ? "" : `<span class="school">${esc(s.category)}</span>`}${attBadge}${consBadge}</div>
        ${isCustom ? "" : `<div class="item-detail${det}"><p class="ddesc">${esc(s.description)}</p></div>`}
      </div>
      ${c > 0 ? `<button class="mini-btn dec" data-dec="${esc(s.id)}" title="减少1张">−</button>` : ""}
      ${editBtns}
    </div>`;
  }
  function renderList() {
    const list = $("#itemList");
    const items = getFiltered();
    $("#listCount").textContent = `${state.customItems.length + items.length} / ${ITEMS.length + state.customItems.length}`;
    let html = "";
    if (state.customItems.length) {
      html += `<div class="list-section-head" style="font-size:11px;color:var(--ink-soft);margin:8px 4px 4px;font-weight:700">我的自定义物品</div>`;
      html += state.customItems.map(c => rowHtml(c, true)).join("");
    }
    if (!items.length && !state.customItems.length) html += `<div class="empty-state" style="padding:40px 10px"><p>没有匹配的物品。</p></div>`;
    else html += items.map(s => rowHtml(s, false)).join("");
    list.innerHTML = html;
  }

  // ---------- 卡片 ----------
  function chargeHtml(s) {
    if (!s.charges || s.charges <= 0) return "";
    if (s.charges <= 20) { let c = ""; for (let i = 0; i < s.charges; i++) c += '<span class="c-circle"></span>'; return `<div class="charge-circles"><span class="cc-label">充能</span>${c}</div>`; }
    return `<div class="charge-circles"><span class="cc-label">充能 ${s.charges}</span></div>`;
  }
  function cardHtml(s, gridStyle, uid) {
    const styleAttr = gridStyle ? ` style="${gridStyle}"` : "";
    const cardBtns = `<button class="pin-btn" type="button" data-pin="${esc(uid)}" draggable="false" title="置顶该卡片">↑</button><button class="edit-btn" type="button" data-editcard="${esc(uid)}" draggable="false" title="编辑此卡文本">✎</button><button class="del-btn" type="button" data-delcard="${esc(uid)}" draggable="false" title="删除此卡（或把卡片拖到页面外深色区域）">✕</button>`;
    const consBadge = s.consumable ? `<span class="cons-badge">消耗品</span>` : "";
    const attBadge = s.attunement ? `<span class="att-tag">需同调</span>` : "";
    return `<article class="card r-${esc(s.rarity)}${s.consumable ? " cons" : ""}" data-id="${esc(uid)}" draggable="true"${styleAttr}>
      ${cardBtns}
      <div class="card-head">
        <div class="card-name">${esc(s.nameZh || "（未命名）")} ${s.nameEn ? `<span class="en">${esc(s.nameEn)}</span>` : ""}</div>
        <div class="card-tags"><span class="card-tag">${esc(s.rarity || "")}</span>${consBadge}${attBadge}</div>
      </div>
      <div class="card-meta">${metaLine(s)}</div>
      <p class="card-desc">${esc(s.description || "").replace(/\n/g, "<br>")}</p>
      ${chargeHtml(s)}
    </article>`;
  }

  // ---------- 测量与分页（超出一格 → 占2行1列） ----------
  const PX_PER_MM = 96 / 25.4;
  const PAGE_DIMS = { A4: { w: 189, h: 276 }, Letter: { w: 194.9, h: 258 } };
  const GAP_MM = 5;
  function getCellDims() { const d = PAGE_DIMS[state.pageSize] || PAGE_DIMS.A4; return { w: ((d.w - GAP_MM) / 2) * PX_PER_MM, h: ((d.h - 2 * GAP_MM) / 3) * PX_PER_MM }; }
  function computeSizes(entries) {
    const { w, h } = getCellDims();
    let m = document.getElementById("__measurer");
    if (!m) { m = document.createElement("div"); m.id = "__measurer"; m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;"; document.body.appendChild(m); }
    m.style.width = w + "px";
    const sizes = {};
    const gapPx = GAP_MM * PX_PER_MM;
    for (const e of entries) { const s = getEntry(e.itemId); if (!s) { sizes[e.uid] = 1; continue; } m.innerHTML = cardHtml(s, "", e.uid); const art = m.querySelector("article"); const nat = art ? art.offsetHeight : 0; sizes[e.uid] = nat <= h ? 1 : (nat <= 2 * h + gapPx ? 2 : 3); }
    return sizes;
  }
  // 装箱:slotHints 指定的卡(按 uid)先就位,其余按顺序自动装(页码只前进);返回每页 {items, grid}
  function packPages(entries, sizes, hints) {
    const pages = [];
    const gridAt = p => { while (pages.length <= p) pages.push({ items: [], grid: [[null, null], [null, null], [null, null]] }); return pages[p]; };
    const fits = (p, row, col, span, skip) => {
      if (row + span > 3) return false;
      const pg = pages[p]; if (!pg) return true;
      for (let r = row; r < row + span; r++) { const occ = pg.grid[r][col]; if (occ && occ !== skip) return false; }
      return true;
    };
    const place = (uid, row, col, span, page) => { const pg = gridAt(page); pg.items.push({ uid, row, col, span }); for (let r = row; r < row + span; r++) pg.grid[r][col] = uid; };
    const placed = new Set();
    for (const e of entries) {
      const h = hints && hints[e.uid]; if (!h) continue;
      const size = sizes[e.uid] || 1;
      if (fits(h.page, h.row, h.col, size, e.uid)) { place(e.uid, h.row, h.col, size, h.page); placed.add(e.uid); }
    }
    let cur = 0;
    for (const e of entries) {
      if (placed.has(e.uid)) continue;
      const size = sizes[e.uid] || 1;
      let done = false, guard = 0;
      while (!done && guard++ < 500) {
        if (size === 3) { for (let c = 0; c < 2 && !done; c++) if (fits(cur, 0, c, 3, e.uid)) { place(e.uid, 0, c, 3, cur); done = true; } }
        else if (size === 2) { for (let r = 0; r <= 1 && !done; r++) for (let c = 0; c < 2 && !done; c++) if (fits(cur, r, c, 2, e.uid)) { place(e.uid, r, c, 2, cur); done = true; } }
        else { for (let r = 0; r < 3 && !done; r++) for (let c = 0; c < 2 && !done; c++) if (fits(cur, r, c, 1, e.uid)) { place(e.uid, r, c, 1, cur); done = true; } }
        if (!done) cur++;
      }
      placed.add(e.uid);
    }
    return pages;
  }
  function renderPreview() {
    const pagesEl = $("#pages");
    const entries = state.selEntries;
    $("#selCount").textContent = entries.length;
    if (!entries.length) { state._pageCount = 0; state._layout = null; $("#pageCount").textContent = "0"; pagesEl.innerHTML = `<div class="empty-state" id="emptyState"><div class="empty-illus">📜</div><p>尚未选择任何物品。</p><p class="muted">在左侧勾选物品（可多次点选加多张），或添加空白卡自填。</p></div>`; applyZoom(); return; }
    const sizes = computeSizes(entries);
    const packed = packPages(entries, sizes, state.slotHints);
    state._pageCount = packed.length;
    state._layout = { grids: packed.map(p => p.grid), sizes };
    $("#pageCount").textContent = String(packed.length);
    pagesEl.innerHTML = packed.map((page, i) => {
      const cards = page.items.map(it => { const s = getEntryById(it.uid); return s ? cardHtml(s, `grid-column:${it.col + 1}; grid-row:${it.row + 1} / span ${it.span};`, it.uid) : ""; }).join("");
      const slots = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
        if (!page.grid[r][c]) slots.push(`<div class="cell-slot" data-page="${i}" data-row="${r}" data-col="${c}" style="grid-column:${c + 1};grid-row:${r + 1};"></div>`);
      }
      return `<div class="page-wrap"><div class="page-label">第 ${i + 1} 页 / 共 ${packed.length} 页</div><div class="page">${cards}${slots.join("")}</div></div>`;
    }).join("");
    applyZoom();
  }
  function getEntryById(uid) { const e = state.selEntries.find(x => x.uid === uid); return e ? getEntry(e.itemId) : null; }

  // ---------- 顶栏统计（按稀有度，含多张） ----------
  function renderSummary() {
    const counts = {}; RARITIES.forEach(r => counts[r] = 0);
    state.selEntries.forEach(e => { const s = getEntry(e.itemId); if (s && counts[s.rarity] !== undefined) counts[s.rarity]++; });
    const pages = state._pageCount;
    if (!state.selEntries.length) { $("#summary").innerHTML = `<span class="summary-hint">在左侧点选物品（可多次点选加多张），或添加空白卡自填</span>`; return; }
    const chips = RARITIES.map(r => `<span class="sum-item r-${esc(r)} ${counts[r] ? "" : "zero"}">${r} <b>${counts[r]}</b></span>`).join("");
    $("#summary").innerHTML = chips + `<span class="sum-total">共 ${state.selEntries.length} 张 · ${pages} 页</span>`;
  }

  // ---------- 选择 / 详情 ----------
  function addItem(id) { state.selEntries.push({ uid: ++state._uidSeq, itemId: id }); renderList(); renderPreview(); renderSummary(); if (state.filters.onlySelected) renderList(); }
  function removeOne(id) { for (let i = state.selEntries.length - 1; i >= 0; i--) { if (state.selEntries[i].itemId === id) { state.selEntries.splice(i, 1); break; } } renderList(); renderPreview(); renderSummary(); }
  function toggleDetail(id) {
    const open = state.openDetails.has(id);
    if (open) state.openDetails.delete(id); else state.openDetails.add(id);
    document.querySelectorAll(`.spell-item[data-id="${id}"]`).forEach(el => { const det = el.querySelector(".item-detail"); const btn = el.querySelector(".detail-btn"); if (det) det.classList.toggle("hidden", open); if (btn) btn.classList.toggle("open", !open); });
  }

  // ---------- 自定义 / 空白卡 ----------
  function readForm() { return { nameZh: $("#cName").value.trim(), nameEn: $("#cNameEn").value.trim(), type: $("#cType").value.trim(), detail: $("#cDetail").value.trim(), rarity: $("#cRarity").value, attunement: $("#cAtt").checked, description: $("#cDesc").value.replace(/\r\n/g, "\n").trim(), consumable: $("#cCons").checked, charges: parseInt($("#cCharges").value, 10) || 0 }; }
  function buildMeta(f) { return (f.type || "奇物") + (f.detail ? "（" + f.detail + "）" : "") + "，" + (f.rarity || "非普通") + (f.attunement ? "（需同调）" : ""); }
  function clearForm() { ["cName", "cNameEn", "cType", "cDetail", "cDesc"].forEach(id => { $("#" + id).value = ""; }); $("#cRarity").value = "非普通"; $("#cAtt").checked = false; $("#cCons").checked = false; $("#cCharges").value = "0"; state._editingCustomId = null; $("#cAddBtn").classList.remove("hidden"); $("#cUpdateBtn").classList.add("hidden"); $("#cCancelBtn").classList.add("hidden"); }
  function fillForm(c) { $("#cName").value = c.nameZh || ""; $("#cNameEn").value = c.nameEn || ""; $("#cType").value = c.type || ""; $("#cDetail").value = c.detail || ""; $("#cRarity").value = c.rarity || "非普通"; $("#cAtt").checked = !!c.attunement; $("#cCons").checked = !!c.consumable; $("#cCharges").value = c.charges || 0; $("#cDesc").value = (c.description || "").replace(/\n/g, "\r\n"); }
  function makeCustom(f, id) { return { id: id || ("custom_" + (++customSeq)), nameZh: f.nameZh, nameEn: f.nameEn, category: "自定义", rarity: f.rarity, type: f.type, detail: f.detail, attunement: f.attunement, meta: buildMeta(f), description: f.description, custom: true, consumable: !!f.consumable, charges: f.charges || 0 }; }
  function addCustom(fromBlank) {
    if (fromBlank) {
      const c = { id: "custom_" + (++customSeq), nameZh: "", nameEn: "", category: "", rarity: "", type: "", detail: "", attunement: false, meta: "", description: "", custom: true, consumable: false, charges: 0 };
      state.customItems.push(c); state.selEntries.push({ uid: ++state._uidSeq, itemId: c.id });
      renderList(); renderPreview(); renderSummary();
      showToast("已添加空白卡，点 ✎ 编辑填写");
      return;
    }
    const f = readForm();
    if (!f.nameZh && !f.description) { showToast("请填写至少名称或描述，或用「空白卡」"); return; }
    const c = makeCustom(f); state.customItems.push(c);
    state.selEntries.push({ uid: ++state._uidSeq, itemId: c.id });
    clearForm(); renderList(); renderPreview(); renderSummary();
    showToast("已添加自定义物品");
  }
  function editCustom(id) { const c = state.customItems.find(x => x.id === id); if (!c) return; fillForm(c); state._editingCustomId = id; $("#cAddBtn").classList.add("hidden"); $("#cUpdateBtn").classList.remove("hidden"); $("#cCancelBtn").classList.remove("hidden"); $("#customForm").classList.remove("hidden"); $("#customToggle").textContent = "收起 ▴"; $("#cName").focus(); }
  function updateCustom() { const id = state._editingCustomId; if (!id) return; const idx = state.customItems.findIndex(c => c.id === id); if (idx < 0) return; const f = readForm(); state.customItems[idx] = makeCustom(f, id); clearForm(); renderList(); renderPreview(); renderSummary(); showToast("已更新自定义物品"); }
  function deleteCustom(id) { const idx = state.customItems.findIndex(c => c.id === id); if (idx < 0) return; state.customItems.splice(idx, 1); state.selEntries.forEach(e => { if (e.itemId === id) delete state.slotHints[e.uid]; }); state.selEntries = state.selEntries.filter(e => e.itemId !== id); if (state._editingCustomId === id) clearForm(); renderList(); renderPreview(); renderSummary(); showToast("已删除自定义物品"); }
  let customSeq = 0;

  // ---------- 排序 / 置顶 / 拖拽（按 uid） ----------
  function sortSelected() {
    if (!state.selEntries.length) return;
    state.selEntries.sort((a, b) => { const sa = getEntry(a.itemId), sb = getEntry(b.itemId); const ra = sa ? (RARITY_ORDER[sa.rarity] ?? 9) : 9, rb = sb ? (RARITY_ORDER[sb.rarity] ?? 9) : 9; if (ra !== rb) return ra - rb; return (sa ? sa.nameZh : "").localeCompare(sb ? sb.nameZh : "", "zh"); });
    state.slotHints = {};
    renderPreview(); renderSummary();
  }
  // dataset 取出的 uid 是字符串，selEntries 里是数字 —— 统一在这里转换
  const toUid = v => parseInt(v, 10);
  function pinToTop(uidRaw) { const uid = toUid(uidRaw); const idx = state.selEntries.findIndex(e => e.uid === uid); if (idx < 0) return; if (idx === 0) { showToast("已在顶部"); return; } const [e] = state.selEntries.splice(idx, 1); state.selEntries.unshift(e); renderPreview(); renderSummary(); }
  function reorder(uidRaw, targetRaw) { const uid = toUid(uidRaw), targetUid = toUid(targetRaw); if (uid === targetUid) return; const i = state.selEntries.findIndex(e => e.uid === uid); if (i < 0) return; const [e] = state.selEntries.splice(i, 1); const j = state.selEntries.findIndex(e => e.uid === targetUid); if (j < 0) state.selEntries.push(e); else state.selEntries.splice(j, 0, e); renderPreview(); renderSummary(); }
  // 删除单张卡（按 uid，不动自定义物品定义）
  function deleteEntry(uidRaw) { const uid = toUid(uidRaw); const idx = state.selEntries.findIndex(e => e.uid === uid); if (idx < 0) return; const [e] = state.selEntries.splice(idx, 1); delete state.slotHints[uid]; const s = getEntry(e.itemId); renderList(); renderPreview(); renderSummary(); showToast(`已删除卡片${s && s.nameZh ? "「" + s.nameZh + "」" : ""}（剩余 ${state.selEntries.length} 张）`); }
  // 手动放入指定空槽
  function setSlotHint(uidRaw, page, row, col) {
    const uid = toUid(uidRaw); if (!state.selEntries.some(e => e.uid === uid)) return;
    state.slotHints[uid] = { page, row, col };
    renderPreview(); renderSummary();
    showToast(`已放到第 ${page + 1} 页 第${row + 1}排左起第${col + 1}列`);
  }
  // 编辑卡片文本：自定义卡直接进表单；数据卡先克隆为可编辑副本（保持原位置与张数）
  function editCard(uidRaw) {
    const uid = toUid(uidRaw); const e = state.selEntries.find(x => x.uid === uid); if (!e) return;
    let s = getEntry(e.itemId); if (!s) return;
    if (!s.custom) {
      const f = { nameZh: s.nameZh || "", nameEn: s.nameEn || "", type: s.type || displayType(s).type || "", detail: s.detail || displayType(s).detail || "", rarity: s.rarity || "非普通", attunement: !!s.attunement, description: s.description || "", consumable: !!s.consumable, charges: s.charges || 0 };
      const clone = makeCustom(f); state.customItems.push(clone);
      e.itemId = clone.id;
      renderList();
      showToast("已转为可编辑副本，修改后点「更新」生效");
    }
    editCustom(e.itemId);
  }

  // ---------- 导入 / 导出 ----------
  function showToast(msg) { let t = document.getElementById("toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("show"); clearTimeout(globalThis.__toastT); globalThis.__toastT = setTimeout(() => t.classList.remove("show"), 2800); }
  function exportSelection() {
    if (!state.selEntries.length) { showToast("尚未选择任何物品，无法导出。"); return; }
    const now = new Date().toISOString(); const date = now.slice(0, 10);
    const data = { format: "dnd2024-itemcards/v1", exportedAt: now, source: "城主指南2024", sourceCount: ITEMS.length, count: state.selEntries.length, items: state.selEntries.map(e => { const s = getEntry(e.itemId); return { itemId: e.itemId, nameZh: s ? s.nameZh : "", nameEn: s ? s.nameEn : "", rarity: s ? s.rarity : "", category: s ? s.category : "", custom: !!(s && s.custom) }; }), customItems: state.customItems, slots: state.selEntries.map(e => state.slotHints[e.uid] || null) };
    const json = JSON.stringify(data, null, 2);
    const list = state.selEntries.map((e, i) => { const s = getEntry(e.itemId); const nm = (s && s.nameZh) ? s.nameZh : "（未命名）"; return `${i + 1}. **${nm}**${s && s.nameEn ? "｜" + s.nameEn : ""}　${s ? s.rarity : ""}${s && s.attunement ? "·需同调" : ""}${s && s.consumable ? "·消耗品" : ""}`; }).join("\n");
    const md = `# DND 2024 魔法物品 · 导出\n\n- 共 **${state.selEntries.length}** 张（含重复）\n- 导出时间：${date}\n- 数据来源：城主指南2024（${ITEMS.length} 条）${state.customItems.length ? ` + 自定义 ${state.customItems.length} 条` : ""}\n\n## 已选物品（按当前排序）\n\n${list}\n\n> 把此文件拖回网站「导入」即可恢复物品、张数与排序。下方为机器可读数据，导入时以此为准。\n\n\`\`\`json\n${json}\n\`\`\`\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `dnd2024-魔法物品卡-${date}.md`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); showToast(`已导出 ${state.selEntries.length} 张 → dnd2024-魔法物品卡-${date}.md`);
  }
  function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || ""); let jsonText = null;
      const m = text.match(/```json\s*([\s\S]*?)```/); if (m) jsonText = m[1].trim(); else { try { JSON.parse(text); jsonText = text; } catch (e) { jsonText = null; } }
      if (!jsonText) { showToast("未能识别文件：请用本站导出的 .md / .json"); return; }
      let data; try { data = JSON.parse(jsonText); } catch (e) { showToast("JSON 解析失败：" + e.message); return; }
      try {
        state.customItems = (data.customItems || []).map(c => { const mm = String(c.id || "").match(/custom_(\d+)/); if (mm) { const n = parseInt(mm[1], 10) || 0; if (n > customSeq) customSeq = n; } return Object.assign({}, c, { custom: true }); });
        state.selEntries = [];
        for (const it of (data.items || [])) {
          let e = getEntry(it.itemId); if (!e && it.nameZh) e = state.customItems.find(c => c.nameZh === it.nameZh) || ITEMS.find(s => s.nameZh === it.nameZh);
          if (e) state.selEntries.push({ uid: ++state._uidSeq, itemId: e.id });
        }
        state.openDetails = new Set();
        // 恢复手动槽位(与 items 数组平行,按序对应)
        state.slotHints = {};
        if (Array.isArray(data.slots)) {
          state.selEntries.forEach((e, i) => { const h = data.slots[i]; if (h && typeof h.page === "number") state.slotHints[e.uid] = { page: h.page, row: h.row, col: h.col }; });
        }
      } catch (e) { showToast("恢复失败：" + e.message); return; }
      renderList(); renderPreview(); renderSummary(); showToast(`已导入 ${state.selEntries.length} 张`);
    };
    reader.onerror = () => showToast("读取文件失败");
    reader.readAsText(file, "utf-8");
  }

  // ---------- 缩放 / 纸张 / 字号 ----------
  function applyZoom() { const p = $("#pages"); p.style.transform = `scale(${state.zoom / 100})`; $("#zoomLabel").textContent = state.zoom + "%"; }
  function setPageSize(size) { state.pageSize = size; $("#pages").setAttribute("data-size", size); }
  // 卡片字号：写入 --card-fs，离屏测量器同步继承；重新排版（卡片可能因此占 2 格）
  function setFontScale(v) {
    state.fontScale = Math.min(1.4, Math.max(0.7, Math.round(v * 20) / 20));
    document.documentElement.style.setProperty("--card-fs", String(state.fontScale));
    $("#fontLabel").textContent = Math.round(state.fontScale * 100) + "%";
    renderPreview(); renderSummary();
  }

  // ---------- 事件 ----------
  function wire() {
    $("#search").addEventListener("input", e => { state.filters.q = e.target.value; renderList(); });
    $("#catFilter").addEventListener("change", e => { state.filters.cat = e.target.value; renderList(); });
    $("#rarityFilter").addEventListener("change", e => { state.filters.rarity = e.target.value; renderList(); });
    $("#attFilter").addEventListener("change", e => { state.filters.att = e.target.checked; renderList(); });
    $("#onlySelected").addEventListener("change", e => { state.filters.onlySelected = e.target.checked; renderList(); });

    const list = $("#itemList");
    list.addEventListener("click", e => {
      const dec = e.target.closest("[data-dec]"); if (dec) { e.stopPropagation(); removeOne(dec.dataset.dec); return; }
      const edt = e.target.closest("[data-edit]"); if (edt) { e.stopPropagation(); editCustom(edt.dataset.edit); return; }
      const del = e.target.closest("[data-del]"); if (del) { e.stopPropagation(); deleteCustom(del.dataset.del); return; }
      const db = e.target.closest("[data-detail]"); if (db) { e.stopPropagation(); toggleDetail(db.dataset.detail); return; }
      const item = e.target.closest(".spell-item"); if (item && item.dataset.id) { addItem(item.dataset.id); }
    });
    list.addEventListener("keydown", e => { if (e.key !== "Enter" && e.key !== " ") return; const item = e.target.closest(".spell-item"); if (item && item.dataset.id) { e.preventDefault(); addItem(item.dataset.id); } });

    $("#customToggle").addEventListener("click", () => { const f = $("#customForm"); const hidden = f.classList.contains("hidden"); f.classList.toggle("hidden"); $("#customToggle").textContent = hidden ? "收起 ▴" : "展开 ▾"; });
    $("#cAddBtn").addEventListener("click", () => addCustom(false));
    $("#cBlankBtn").addEventListener("click", () => addCustom(true));
    $("#cUpdateBtn").addEventListener("click", updateCustom);
    $("#cCancelBtn").addEventListener("click", clearForm);

    $("#clearBtn").addEventListener("click", () => { if (!state.selEntries.length) return; if (!confirm("确定清空所有已选物品？（自定义物品保留，仅取消选中）")) return; state.selEntries = []; state.slotHints = {}; renderList(); renderPreview(); renderSummary(); });
    $("#printBtn").addEventListener("click", () => window.print());
    $("#sortBtn").addEventListener("click", sortSelected);
    $("#exportBtn").addEventListener("click", exportSelection);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) importFromFile(f); e.target.value = ""; });

    $("#pageSize").addEventListener("change", e => setPageSize(e.target.value));
    $("#zoomIn").addEventListener("click", () => { state.zoom = Math.min(150, state.zoom + 10); applyZoom(); });
    $("#zoomOut").addEventListener("click", () => { state.zoom = Math.max(50, state.zoom - 10); applyZoom(); });

    const pages = $("#pages");
    pages.addEventListener("click", e => {
      const pin = e.target.closest("[data-pin]"); if (pin) { e.stopPropagation(); pinToTop(pin.dataset.pin); return; }
      const ec = e.target.closest("[data-editcard]"); if (ec) { e.stopPropagation(); editCard(ec.dataset.editcard); return; }
      const dc = e.target.closest("[data-delcard]"); if (dc) { e.stopPropagation(); deleteEntry(dc.dataset.delcard); return; }
    });
    pages.addEventListener("dragstart", e => {
      const card = e.target.closest('.card[data-id]'); if (!card) return;
      state._dragId = toUid(card.dataset.id); card.classList.add("dragging");
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
    pages.addEventListener("dragover", e => {
      const slot = e.target.closest(".cell-slot.ok");
      if (slot && state._dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; pages.querySelectorAll(".cell-slot.hover").forEach(x => { if (x !== slot) x.classList.remove("hover"); }); slot.classList.add("hover"); return; }
      const card = e.target.closest('.card[data-id]'); if (!card || !state._dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; pages.querySelectorAll(".drop-target").forEach(c => { if (c !== card) c.classList.remove("drop-target"); }); card.classList.add("drop-target");
    });
    pages.addEventListener("drop", e => {
      pages.classList.remove("slot-mode"); // 重渲染会使 dragend 失效,投放时立即退出槽位模式
      const slot = e.target.closest(".cell-slot.ok");
      if (slot && state._dragId) { e.preventDefault(); setSlotHint(state._dragId, +slot.dataset.page, +slot.dataset.row, +slot.dataset.col); state._dragId = null; return; }
      const card = e.target.closest('.card[data-id]'); if (!card || !state._dragId) return; e.preventDefault(); const tid = card.dataset.id; if (tid && toUid(tid) !== state._dragId) { delete state.slotHints[state._dragId]; reorder(state._dragId, tid); } state._dragId = null;
    });
    pages.addEventListener("dragend", () => { pages.querySelectorAll(".dragging,.drop-target").forEach(c => { c.classList.remove("dragging", "drop-target"); }); pages.classList.remove("slot-mode"); pages.querySelectorAll(".cell-slot.ok,.cell-slot.hover").forEach(c => { c.classList.remove("ok", "hover"); }); state._dragId = null; });

    // 拖到纸面（.page）之外——页面周围的深色桌面/预览区外——松开 = 删除该卡片（光标旁小暗牌提示）
    const inPage = t => !!(t && t.closest && t.closest(".page"));
    const dragHint = () => {
      let h = document.getElementById("dragDeleteHint");
      if (!h) { h = document.createElement("div"); h.id = "dragDeleteHint"; h.textContent = "🗑 松开删除"; document.body.appendChild(h); }
      return h;
    };
    document.addEventListener("dragover", e => {
      if (!state._dragId) return;
      e.preventDefault();
      const h = dragHint();
      if (inPage(e.target)) h.classList.remove("show");
      else { h.classList.add("show"); h.style.left = (e.clientX + 16) + "px"; h.style.top = (e.clientY + 16) + "px"; }
    });
    document.addEventListener("drop", e => {
      if (!state._dragId) return;
      dragHint().classList.remove("show");
      if (!inPage(e.target)) {
        e.preventDefault();
        const uid = state._dragId; state._dragId = null;
        deleteEntry(uid);
      }
    });
    document.addEventListener("dragend", () => { dragHint().classList.remove("show"); });

    // 卡片字号 A⁻/A⁺
    $("#fontUp").addEventListener("click", () => setFontScale(state.fontScale + 0.05));
    $("#fontDown").addEventListener("click", () => setFontScale(state.fontScale - 0.05));

    // 拼音库就绪后：预建缓存；若已有搜索词则按声音近似重排
    window.addEventListener("pinyin-ready", () => { if (state.filters.q.trim()) renderList(); });
  }

  function init() {
    if (window.parent !== window) document.documentElement.classList.add("embedded");
    if (!ITEMS.length) { document.body.innerHTML = '<p style="padding:24px">未能加载物品数据（data/items.js）。</p>'; return; }
    initFilters(); setPageSize("A4"); wire(); renderList(); renderPreview(); renderSummary();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
