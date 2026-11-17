/* ===========================================================
   app.js —— 小票来了 v1.0.4
   模板可自定义：开单 / 打印 / 票夹（搜索·分类·回收站）/ 设置 / 模板编辑
   =========================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TPL = window.TPL;
  const APP_VERSION = '1.0.4';
  const LATEST_RELEASE_API = 'https://api.github.com/repos/luminshot/piao/releases/latest';
  const LATEST_RELEASE_PAGE = 'https://github.com/luminshot/piao/releases/latest';

  const RATIOS = [
    { id: '3:4', label: '3:4', v: 4 / 3 },
    { id: '9:16', label: '9:16', v: 16 / 9 },
    { id: 'auto', label: '自动', v: 0 },
    { id: 'custom', label: '自定义', v: 0 }
  ];
  const DEFAULTS = {
    paperMm: 58, ratioId: '9:16', ratio: 16 / 9,
    font: 'mono', fontSize: 'standard', density: 'standard', dividerStyle: 'solid',
    paper: 'cool', texture: 'grain', tear: 'straight',
    visualPreset: 3, sound: true, volume: 0.85
  };
  const FONT_OPTS = [{ v: 'mono', t: '等宽' }, { v: 'sans', t: '黑体' }, { v: 'serif', t: '宋体' }];
  const FONT_SIZE_OPTS = [{ v: 'small', t: '小' }, { v: 'standard', t: '标准' }, { v: 'large', t: '大' }];
  const DENSITY_OPTS = [{ v: 'compact', t: '紧凑' }, { v: 'standard', t: '标准' }, { v: 'loose', t: '舒展' }];
  const DIVIDER_OPTS = [{ v: 'solid', t: '细实线' }, { v: 'dashed', t: '细虚线' }, { v: 'dotted', t: '点线' }];
  const TEXTURE_OPTS = [{ v: 'fine', t: '轻纸纹' }, { v: 'grain', t: '纸纤维' }, { v: 'thermal', t: '热敏纹' }];
  const TEAR_OPTS = [{ v: 'straight', t: '平切' }, { v: 'zigzag', t: '锯齿' }];
  const PAPER_OPTS = [
    { v: 'white', t: '纯白', c: '#FFFFFF' }, { v: 'cream', t: '暖白', c: '#FAF8F2' },
    { v: 'cool', t: '浅灰', c: '#F1F2F0' }, { v: 'warm', t: '浅黄', c: '#F8F2E3' }
  ];

  const el = {
    machine: $('machine'), slot: $('slot'), wrap: $('wrap'),
    paper: $('cv-paper'), ink: $('cv-ink'), head: $('head'), led: $('led'),
    dockIdle: $('dock-idle'), dockDone: $('dock-done'), hint: $('dock-hint'),
    about: $('dock-about'), toast: $('toast'),
    maskNew: $('mask-new'), sheetNew: $('sheet-new'), tip: $('sheet-tip'),
    maskAct: $('mask-act'), sheetAct: $('sheet-act'),
    maskClip: $('mask-clip'), sheetClip: $('sheet-clip'),
    pageSet: $('page-settings'), pageEd: $('page-editor')
  };

  const S = {
    mode: 'idle',
    templates: [],
    tplId: 't-default',
    values: {},
    data: null,
    receipt: null,
    history: [],
    trash: [],
    settings: Object.assign({}, DEFAULTS),
    clip: { cat: 'all', query: '', mode: 'list' },
    editing: null
  };

  /* ---------------- 基础 ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1900);
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function lsJSON(k, d) { try { return JSON.parse(lsGet(k) || 'null') ?? d; } catch (e) { return d; } }

  function makeNo() {
    const d = new Date();
    const key = 'xpl_no_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    const seq = parseInt(lsGet(key) || '0', 10) + 1;
    lsSet(key, String(seq));
    return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + String(seq).padStart(3, '0');
  }
  function nowText() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  /* ---------------- 模板 ---------------- */
  function loadTemplates() {
    const raw = lsGet('xpl_templates_v1');
    if (raw == null) {
      S.templates = [TPL.defaultTemplate()];
    } else {
      try {
        const parsed = JSON.parse(raw);
        S.templates = Array.isArray(parsed) ? parsed.map(TPL.normalizeTpl) : [TPL.defaultTemplate()];
      } catch (e) {
        S.templates = [TPL.defaultTemplate()];
      }
    }
    S.tplId = S.templates.some((t) => t.id === S.tplId) ? S.tplId : (S.templates[0] ? S.templates[0].id : null);
    saveTemplates();
  }
  function saveTemplates() { lsSet('xpl_templates_v1', JSON.stringify(S.templates)); }
  function tpl() { return S.templates.find((t) => t.id === S.tplId) || S.templates[0] || null; }
  function tplById(id) { return S.templates.find((t) => t.id === id) || S.templates[0] || null; }

  function prefillValues(t) {
    const vals = {};
    (t && t.sections || []).forEach((s) => (s.fields || []).forEach((f) => {
      vals[f.id] = f.type === 'time' ? nowText() : '';
    }));
    S.values = vals;
    S.demo = false;
  }

  /* ---------------- 纸宽 / 设置 ---------------- */
  function paperPx() {
    const px = 286 + (S.settings.paperMm - 58) * 1.545;
    return Math.round(Math.max(236, Math.min(330, px)));
  }
  const machinePx = () => Math.round(Math.min(370, paperPx() + 54));

  function loadSettings() {
    const stored = lsJSON('xpl_settings_v1', null) || {};
    S.settings = Object.assign({}, DEFAULTS, stored);
    const savedPreset = Number(stored.visualPreset) || 0;
    if (savedPreset < 3) {
      if (S.settings.font === 'sans' || S.settings.font === 'mono') S.settings.font = 'mono';
      S.settings.visualPreset = 3;
    }
    if (!isFinite(S.settings.paperMm) || S.settings.paperMm < 20) S.settings.paperMm = 58;
    if (!isFinite(S.settings.ratio) || S.settings.ratio < 0) S.settings.ratio = DEFAULTS.ratio;
    if (!RATIOS.some((r) => r.id === S.settings.ratioId)) {
      S.settings.ratioId = DEFAULTS.ratioId;
      S.settings.ratio = DEFAULTS.ratio;
    }
    if (!isFinite(S.settings.volume)) S.settings.volume = DEFAULTS.volume;
    if (!FONT_OPTS.some((o) => o.v === S.settings.font)) S.settings.font = DEFAULTS.font;
    if (!FONT_SIZE_OPTS.some((o) => o.v === S.settings.fontSize)) S.settings.fontSize = DEFAULTS.fontSize;
    if (!DENSITY_OPTS.some((o) => o.v === S.settings.density)) S.settings.density = DEFAULTS.density;
    if (!DIVIDER_OPTS.some((o) => o.v === S.settings.dividerStyle)) S.settings.dividerStyle = DEFAULTS.dividerStyle;
    if (!PAPER_OPTS.some((o) => o.v === S.settings.paper)) S.settings.paper = DEFAULTS.paper;
    if (!TEXTURE_OPTS.some((o) => o.v === S.settings.texture)) S.settings.texture = DEFAULTS.texture;
    if (!TEAR_OPTS.some((o) => o.v === S.settings.tear)) S.settings.tear = DEFAULTS.tear;
    saveSettings();
  }
  function saveSettings() { lsSet('xpl_settings_v1', JSON.stringify(S.settings)); }

  function applyLook() {
    document.documentElement.style.setProperty('--paper-w', paperPx() + 'px');
    document.documentElement.style.setProperty('--machine-w', machinePx() + 'px');
    if (window.Sound) {
      window.Sound.setVolume(S.settings.volume);
      window.Sound.setMuted(!S.settings.sound);
      window.Sound.applyGain && window.Sound.applyGain();
    }
  }

  function renderOpts(extra) {
    return Object.assign({
      width: paperPx(), ratio: S.settings.ratio,
      dpr: Math.min(devicePixelRatio || 2, 3),
      font: S.settings.font, fontSize: S.settings.fontSize, density: S.settings.density,
      dividerStyle: S.settings.dividerStyle, paper: S.settings.paper,
      texture: S.settings.texture, tear: S.settings.tear
    }, extra || {});
  }

  /* ---------------- 渲染 ---------------- */
  function normalizeDate(value) {
    const match = String(value || '').trim().match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return match[1] + '-' + match[2] + '-' + match[3];
  }

  function displayValues(t, vals) {
    const out = Object.assign({}, vals || {});
    (t && t.sections || []).forEach((s) => (s.fields || []).forEach((f) => {
      if (f.type === 'date' && out[f.id]) out[f.id] = normalizeDate(out[f.id]) || out[f.id];
    }));
    return out;
  }

  function buildRec(t) {
    const no = makeNo();
    const timeText = nowText();
    return {
      template: TPL.clone(t),
      values: TPL.fillAuto(t, displayValues(t, S.values), no, timeText),
      no, timeText, demo: !!S.demo
    };
  }

  function previewRec() {
    const active = tpl();
    const d = new Date();
    const no = String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '001';
    if (!active) {
      return {
        template: { name: '还没有模板', brand: { en: '', cn: '', img: null }, sections: [], footer: { line1: '请点「打 印」并新建一张模板。', line2: '', slogan1: '', slogan2: '' } },
        values: {}, no: '', timeText: nowText(), demo: false
      };
    }
    const t = TPL.clone(active);
    const sample = {
      'f-customer': '示例', 'f-shootdate': '2026-12-18',
      'f-shoottime': '上午', 'f-city': '深圳', 'f-place': '有光入画摄影棚', 'f-content': '周岁',
      'f-tier': '标准档', 'f-money': '300', 'f-balance': '1200', 'f-pay': '支付宝'
    };
    const sampleTime = '2026-11-17 09:00';
    const sampleByLabel = {
      '客户': '示例', '拍摄日期': '2026-12-18', '拍摄时段': '上午', '拍摄城市': '深圳',
      '拍摄地点': '有光入画摄影棚', '拍摄内容': '周岁', '拍摄档位': '标准档',
      '定金': '300', '定金：人民币': '300', '剩余尾款': '1200', '收款方式': '支付宝'
    };
    const values = {};
    t.sections.forEach((s) => (s.fields || []).forEach((f) => {
      const value = sample[f.id] == null ? sampleByLabel[f.label] : sample[f.id];
      values[f.id] = value == null ? '' : value;
    }));
    return {
      template: t,
      values: TPL.fillAuto(t, displayValues(t, values), no, sampleTime),
      no, timeText: sampleTime, demo: true
    };
  }

  function centerStage() {
    const st = $('stage');
    if (!st) return;
    st.style.paddingTop = '';
    const contentH = el.machine.offsetHeight + (el.slot.offsetHeight || 0);
    const free = st.clientHeight - contentH - 10;
    if (free > 0) st.style.paddingTop = Math.round(Math.min(free * 0.42, 120)) + 'px';
  }

  function renderCurrent() {
    const rec = (S.mode !== 'idle' && S.data) ? S.data : previewRec();
    applyLook();
    window.Printer.show(rec, renderOpts());
    centerStage();
  }

  /* ---------------- 打印 ---------------- */
  function setHint(t) {
    if (!el.hint) return;
    el.hint.textContent = t;
    el.hint.classList.toggle('gone', !t);
  }
  function followPaper(printH) {
    const r = el.slot.getBoundingClientRect();
    const bottom = r.top + printH + 6;
    const limit = window.innerHeight - 120;
    if (bottom > limit) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = Math.min(max, window.scrollY + (bottom - limit));
      if (next > window.scrollY) window.scrollTo(0, next);
    }
  }

  function startPrint(rec) {
    S.mode = 'printing';
    S.data = rec;
    if (el.about) el.about.hidden = true;
    el.dockIdle.hidden = true;
    el.dockDone.hidden = true;
    setHint('正在打印…');
    el.led.classList.remove('idle');
    el.led.classList.add('on');

    return window.Printer.print(rec, Object.assign(renderOpts(), {
      onStart() { el.machine.classList.add('printing'); },
      onProgress(p, printH) { followPaper(printH); },
      onEnd() {
        el.machine.classList.remove('printing');
        el.led.classList.remove('on');
      }
    })).then((r) => {
      S.receipt = r;
      S.mode = 'done';
      el.machine.classList.remove('printing');
      el.led.classList.remove('on');
      el.dockDone.hidden = false;
      el.dockIdle.hidden = true;
      setHint('撕下来 · 或者点小票换比例、存图');
      saveHistory(rec);
      centerStage();
      return r;
    });
  }

  function backToIdle() {
    S.mode = 'idle';
    S.receipt = null;
    S.data = null;
    if (el.about) el.about.hidden = false;
    el.dockDone.hidden = true;
    el.dockIdle.hidden = false;
    el.led.classList.add('idle');
    setHint('这是默认模板 · 点「打 印」开你的一张');
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 票夹 ---------------- */
  const WEEK = 7 * 24 * 3600 * 1000;

  function loadHistory() {
    S.history = lsJSON('xpl_history_v1', []);
    S.trash = lsJSON('xpl_trash_v1', []);
    if (!Array.isArray(S.history)) S.history = [];
    if (!Array.isArray(S.trash)) S.trash = [];
    const now = Date.now();
    const before = S.trash.length;
    S.trash = S.trash.filter((t) => now - (t.deletedAt || 0) < WEEK);
    if (S.trash.length !== before) persistTrash();
  }
  const persistHistory = () => lsSet('xpl_history_v1', JSON.stringify(S.history.slice(0, 200)));
  const persistTrash = () => lsSet('xpl_trash_v1', JSON.stringify(S.trash.slice(0, 200)));

  function saveHistory(rec) {
    const snapshot = TPL.clone(rec);
    if (snapshot.template && snapshot.template.brand) snapshot.template.brand.img = null;
    S.history.unshift({ id: 'r' + Date.now(), at: Date.now(), rec: snapshot, name: rec.template.name });
    persistHistory();
  }

  function thumbCanvas(rec) {
    const r = window.Receipt.render(rec, renderOpts({ width: 120, ratio: 4 / 3, dpr: 2 }));
    const c = document.createElement('canvas');
    c.width = r.canvas.width; c.height = r.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = window.Receipt.PAPERS[S.settings.paper] || '#FDFAF1';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(r.canvas, 0, 0);
    return c;
  }

  const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); };
  function groupName(ts) {
    if (dayKey(ts) === dayKey(Date.now())) return '今天';
    if (Date.now() - ts < WEEK) return '本周';
    return '更早';
  }
  function matchItem(item, q) {
    if (!q) return true;
    const rec = item.rec || {};
    const vals = rec.values || {};
    const hay = [rec.no, rec.template && rec.template.name, item.name].concat(Object.values(vals)).join(' ').toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  }

  function renderClip() {
    const list = $('his-list');
    list.innerHTML = '';
    const trash = S.clip.mode === 'trash';
    const src = trash ? S.trash : S.history;
    $('his-count').textContent = src.length ? '· ' + src.length : '';
    $('clip-main').hidden = trash;
    $('trash-main').hidden = !trash;
    $('clip-title').firstChild.nodeValue = trash ? '回收站 ' : '票夹 ';
    $('btn-trash').textContent = trash ? '返回票夹' : '回收站';

    const items = src.filter((it) => {
      if (trash) return true;
      if (S.clip.cat !== 'all' && ((it.rec || {}).template || {}).id !== S.clip.cat) return false;
      return matchItem(it, S.clip.query);
    });

    $('his-empty').hidden = items.length > 0;
    $('his-empty').textContent = trash ? '回收站是空的' : '没有找到小票';

    if (trash) {
      items.forEach((item) => list.appendChild(rowFor(item, true)));
      return;
    }
    let last = '';
    items.forEach((item) => {
      const g = groupName(item.at || Date.now());
      if (g !== last) {
        last = g;
        const h = document.createElement('div');
        h.className = 'his-group';
        h.textContent = g;
        list.appendChild(h);
      }
      list.appendChild(rowFor(item, false));
    });
  }

  function rowFor(item, isTrash) {
    const rec = item.rec || { template: { name: '小票' }, values: {} };
    const row = document.createElement('div');
    row.className = 'his-item';

    const th = document.createElement('div');
    th.className = 'his-thumb';
    try { th.appendChild(thumbCanvas(rec)); } catch (e) { /* ignore */ }
    row.appendChild(th);

    const main = document.createElement('div');
    main.className = 'his-main';
    const t1 = document.createElement('div');
    t1.className = 'his-t1';
    const firstVal = Object.values(rec.values || {}).filter((v) => v)[0] || '';
    t1.textContent = (firstVal || '未命名') + ' · ' + ((rec.template || {}).name || '');
    const t2 = document.createElement('div');
    t2.className = 'his-t2';
    t2.textContent = rec.no || '';
    main.appendChild(t1); main.appendChild(t2);
    row.appendChild(main);

    const acts = document.createElement('div');
    acts.className = 'his-acts';
    if (isTrash) {
      const b1 = document.createElement('button');
      b1.className = 'his-btn'; b1.textContent = '恢复';
      b1.addEventListener('click', (e) => {
        e.stopPropagation();
        S.trash = S.trash.filter((x) => x.id !== item.id);
        S.history.unshift({ id: item.id, at: item.at, rec: item.rec, name: item.name });
        persistTrash(); persistHistory(); renderClip(); toast('已恢复');
      });
      const b2 = document.createElement('button');
      b2.className = 'his-btn del'; b2.textContent = '彻底删除';
      b2.addEventListener('click', (e) => {
        e.stopPropagation();
        S.trash = S.trash.filter((x) => x.id !== item.id);
        persistTrash(); renderClip(); toast('已彻底删除');
      });
      acts.appendChild(b1); acts.appendChild(b2);
    } else {
      const b1 = document.createElement('button');
      b1.className = 'his-btn'; b1.textContent = '存图';
      b1.addEventListener('click', (e) => { e.stopPropagation(); exportImage(rec, 'download'); });
      const b2 = document.createElement('button');
      b2.className = 'his-btn del'; b2.textContent = '删除';
      b2.addEventListener('click', (e) => {
        e.stopPropagation();
        S.history = S.history.filter((x) => x.id !== item.id);
        S.trash.unshift({ id: item.id, at: item.at, deletedAt: Date.now(), rec: item.rec, name: item.name });
        persistHistory(); persistTrash(); renderClip(); toast('已移到回收站');
      });
      acts.appendChild(b1); acts.appendChild(b2);
    }
    row.appendChild(acts);
    return row;
  }

  /* ---------------- 导出 ---------------- */
  function exportBlob(rec) {
    return new Promise((resolve) => {
      const r = window.Receipt.render(rec, renderOpts({ dpr: 3 }));
      const out = document.createElement('canvas');
      out.width = r.canvas.width; out.height = r.canvas.height;
      const g = out.getContext('2d');
      g.fillStyle = window.Receipt.PAPERS[S.settings.paper] || '#FDFAF1';
      g.fillRect(0, 0, out.width, out.height);
      g.drawImage(r.canvas, 0, 0);
      out.toBlob((b) => resolve(b ? { blob: b, w: out.width, h: out.height } : null), 'image/png');
    });
  }

  function sendBlobToAndroid(blob, name, method) {
    const bridge = window.AndroidApp;
    if (!bridge || typeof bridge[method] !== 'function') return false;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      if (comma < 0) { toast('文件读取失败'); return; }
      try { bridge[method](name, blob.type || 'application/octet-stream', dataUrl.slice(comma + 1)); }
      catch (e) { toast('文件处理失败，请重试'); }
    };
    reader.onerror = () => toast('文件读取失败');
    reader.readAsDataURL(blob);
    return true;
  }

  function exportImage(rec, mode) {
    rec = rec || S.data;
    if (!rec) return;
    exportBlob(rec).then((info) => {
      if (!info) { toast('生成失败了，再试一次'); return; }
      const name = '小票-' + (rec.no || 'export') + '.png';
      if (mode === 'share' && sendBlobToAndroid(info.blob, name, 'shareFile')) return;
      if (mode !== 'share' && sendBlobToAndroid(info.blob, name, 'saveFile')) return;
      const file = new File([info.blob], name, { type: 'image/png' });
      if (mode === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '小票 ' + (rec.no || '') }).catch(() => download(info.blob, name));
        return;
      }
      download(info.blob, name);
      toast('已保存 · 微信里长按图片也能存');
    });
  }
  function download(blob, name) {
    if (sendBlobToAndroid(blob, name, 'saveFile')) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportBackup() {
    const pack = { app: '小票来了', v: 1, at: Date.now(), settings: S.settings, templates: S.templates, history: S.history, trash: S.trash };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const d = new Date();
    download(blob, '小票来了备份-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json');
    if (!window.AndroidApp || typeof window.AndroidApp.saveFile !== 'function') toast('备份文件已导出');
  }

  let fileInput = null;
  function importBackup() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json,.json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const pack = JSON.parse(String(reader.result));
            if (pack.settings) {
              S.settings = Object.assign({}, DEFAULTS, pack.settings);
              const savedPreset = Number(pack.settings.visualPreset) || 0;
              if (savedPreset < 3) {
                if (S.settings.font === 'sans' || S.settings.font === 'mono') S.settings.font = 'mono';
                S.settings.visualPreset = 3;
              }
              if (!RATIOS.some((r) => r.id === S.settings.ratioId)) {
                S.settings.ratioId = DEFAULTS.ratioId;
                S.settings.ratio = DEFAULTS.ratio;
              }
              if (!FONT_OPTS.some((o) => o.v === S.settings.font)) S.settings.font = DEFAULTS.font;
              if (!FONT_SIZE_OPTS.some((o) => o.v === S.settings.fontSize)) S.settings.fontSize = DEFAULTS.fontSize;
              if (!DENSITY_OPTS.some((o) => o.v === S.settings.density)) S.settings.density = DEFAULTS.density;
              if (!DIVIDER_OPTS.some((o) => o.v === S.settings.dividerStyle)) S.settings.dividerStyle = DEFAULTS.dividerStyle;
              if (!PAPER_OPTS.some((o) => o.v === S.settings.paper)) S.settings.paper = DEFAULTS.paper;
              if (!TEXTURE_OPTS.some((o) => o.v === S.settings.texture)) S.settings.texture = DEFAULTS.texture;
              if (!TEAR_OPTS.some((o) => o.v === S.settings.tear)) S.settings.tear = DEFAULTS.tear;
            }
            if (Array.isArray(pack.templates)) {
              S.templates = pack.templates.map(TPL.normalizeTpl);
              if (!S.templates.some((t) => t.id === S.tplId)) S.tplId = S.templates[0] ? S.templates[0].id : null;
              prefillValues(tpl());
            }
            if (Array.isArray(pack.history)) S.history = pack.history;
            if (Array.isArray(pack.trash)) S.trash = pack.trash;
            saveSettings(); saveTemplates(); persistHistory(); persistTrash();
            applyLook(); buildSettings(); buildTemplateCards(); buildForm(); renderCurrent();
            toast('备份已恢复');
          } catch (e) { toast('这个文件读不出来'); }
        };
        reader.readAsText(f);
        fileInput.value = '';
      });
    }
    fileInput.click();
  }

  function clearAll() {
    if (!window.confirm('会清空所有小票、模板、回收站和设置，确定吗？')) return;
    ['xpl_history_v1', 'xpl_trash_v1', 'xpl_settings_v1', 'xpl_templates_v1'].forEach(lsDel);
    S.history = []; S.trash = [];
    S.settings = Object.assign({}, DEFAULTS);
    S.templates = [TPL.defaultTemplate()];
    S.tplId = 't-default';
    loadSettings(); prefillValues(tpl()); applyLook(); buildSettings(); buildTemplateCards(); buildForm(); backToIdle();
    toast('已清空');
  }

  /* ---------------- 面板 ---------------- */
  function openSheet(sheet, mask) {
    mask.hidden = false; sheet.hidden = false;
    requestAnimationFrame(() => { mask.classList.add('show'); sheet.classList.add('show'); });
  }
  function closeSheet(sheet, mask) {
    mask.classList.remove('show'); sheet.classList.remove('show');
    setTimeout(() => { mask.hidden = true; sheet.hidden = true; }, 340);
  }
  function openPage(page) {
    page.hidden = false;
    requestAnimationFrame(() => page.classList.add('show'));
  }
  function closePage(page) {
    page.classList.remove('show');
    setTimeout(() => { page.hidden = true; }, 340);
  }

  function handleBack() {
    if (S.mode === 'printing') return true;
    if (!el.pageEd.hidden) { closePage(el.pageEd); return true; }
    if (!el.pageSet.hidden) { closePage(el.pageSet); return true; }
    if (!el.sheetClip.hidden) { closeSheet(el.sheetClip, el.maskClip); return true; }
    if (!el.sheetAct.hidden) { closeSheet(el.sheetAct, el.maskAct); return true; }
    if (!el.sheetNew.hidden) { closeSheet(el.sheetNew, el.maskNew); return true; }
    if (S.mode === 'done') { backToIdle(); return true; }
    return false;
  }

  /* ---------------- 模板卡 / 表单 ---------------- */
  function buildTemplateCards() {
    const host = $('tpl-row');
    host.innerHTML = '';
    S.templates.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tpl-card' + (t.id === S.tplId ? ' on' : '');
      b.innerHTML = '<span class="tic"><i></i><i></i><i></i><b></b></span><span>' + (t.name || '模板') + '</span>';
      b.addEventListener('click', () => {
        S.tplId = t.id;
        prefillValues(t);
        buildTemplateCards(); buildForm(); renderCurrent();
        window.Sound && window.Sound.click();
      });
      {
        const pen = document.createElement('i');
        pen.className = 'tpl-pen';
        pen.textContent = '✎';
        pen.addEventListener('click', (e) => { e.stopPropagation(); openEditor(t); });
        b.appendChild(pen);
      }
      host.appendChild(b);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'tpl-card tpl-add';
    add.innerHTML = '<span class="tic add"><i class="plus">＋</i></span><span>新建模板</span>';
    add.addEventListener('click', () => openEditor(null));
    host.appendChild(add);
  }

  function buildForm() {
    const host = $('form-fields');
    host.innerHTML = '';
    const t = tpl();
    if (!t) {
      const empty = h('p', 'tpl-help empty-template', '还没有模板，请点「新建模板」创建一张。');
      host.appendChild(empty);
      return;
    }
    (t.sections || []).forEach((sec) => (sec.fields || []).forEach((f) => {
      if (f.type === 'no') return;
      host.appendChild(fieldRow(f));
    }));
  }

  function fieldRow(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('span');
    lab.className = 'f-label';
    lab.textContent = f.label;
    wrap.appendChild(lab);

    const setVal = (v) => { S.values[f.id] = v; S.demo = false; renderCurrent(); };

    if (f.type === 'select' || f.type === 'payment') {
      const opts = Array.isArray(f.options) && f.options.length
        ? f.options : (f.type === 'payment' ? ['微信', '支付宝'] : []);
      const box = document.createElement('div');
      box.className = 'chips';
      const custom = S.values[f.id] && opts.indexOf(S.values[f.id]) < 0;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '写一个自己的';
      input.value = custom ? S.values[f.id] : '';
      input.hidden = !custom;
      input.addEventListener('input', () => setVal(input.value));
      const all = opts.concat(['自定义']);
      all.forEach((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (S.values[f.id] === o ? ' on' : '');
        b.textContent = o;
        b.addEventListener('click', () => {
          if (o === '自定义') { input.hidden = false; input.focus(); return; }
          setVal(o);
          box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
          input.value = o;
          input.hidden = true;
          window.Sound && window.Sound.click();
        });
        box.appendChild(b);
      });
      wrap.appendChild(box);
      wrap.appendChild(input);
    } else if (f.type === 'time') {
      const input = document.createElement('input');
      input.type = 'text'; input.readOnly = true; input.value = nowText();
      input.setAttribute('aria-label', '自动获取当前开具时间');
      S.values[f.id] = input.value;
      wrap.appendChild(input);
    } else if (f.type === 'date') {
      const dateWrap = document.createElement('div');
      dateWrap.className = 'date-input-wrap';
      const input = document.createElement('input');
      input.type = 'date'; input.className = 'date-input'; input.placeholder = 'YYYY-MM-DD';
      input.setAttribute('aria-label', '拍摄日期，YYYY-MM-DD');
      input.value = normalizeDate(S.values[f.id]) || '';
      const hasValue = !!input.value;
      input.classList.toggle('has-value', hasValue);
      dateWrap.classList.toggle('has-value', hasValue);
      const placeholder = h('span', 'date-input-placeholder', 'YYYY-MM-DD');
      placeholder.setAttribute('aria-hidden', 'true');
      dateWrap.appendChild(input); dateWrap.appendChild(placeholder);
      const syncDate = () => {
        const hasDate = !!input.value;
        input.classList.toggle('has-value', hasDate);
        dateWrap.classList.toggle('has-value', hasDate);
        setVal(input.value);
      };
      input.addEventListener('input', syncDate);
      input.addEventListener('change', syncDate);
      wrap.appendChild(dateWrap);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = f.type === 'money' ? 'decimal' : 'text';
      input.placeholder = f.type === 'money' ? '0.00' : '';
      input.value = S.values[f.id] || '';
      input.addEventListener('input', () => setVal(input.value));
      wrap.appendChild(input);
    }
    return wrap;
  }

  function readForm() {
    const t = tpl();
    if (!t) { el.tip.textContent = '还没有模板，请先新建一张'; return null; }
    let hasMoney = false, okMoney = true, invalidDate = false;
    (t.sections || []).forEach((s) => (s.fields || []).forEach((f) => {
      if (f.type === 'date') {
        const rawDate = String(S.values[f.id] || '').trim();
        if (rawDate) {
          const normalized = normalizeDate(rawDate);
          if (!normalized) invalidDate = true;
          else S.values[f.id] = normalized;
        }
      }
      if (f.type === 'money') {
        const rawAmount = String(S.values[f.id] || '').trim();
        const optionalBalance = !!f.optional || f.id === 'f-balance' || f.label === '剩余尾款';
        if (optionalBalance && !rawAmount) return;
        hasMoney = true;
        const v = parseFloat(rawAmount.replace(/[^\d.]/g, ''));
        if (!isFinite(v) || v <= 0) okMoney = false;
        else S.values[f.id] = String(Math.round(v * 100) / 100);
      }
    }));
    if (invalidDate) { el.tip.textContent = '拍摄日期请按 YYYY-MM-DD 填写'; return null; }
    if (hasMoney && !okMoney) { el.tip.textContent = '金额还没填对'; return null; }
    el.tip.textContent = '';
    return buildRec(t);
  }

  /* ---------------- 模板编辑 ---------------- */
  function openEditor(t) {
    S.editingNew = !t;
    S.editing = t ? TPL.clone(t) : TPL.emptyTemplate();
    $('editor-title').textContent = t ? '编辑模板' : '新建模板';
    buildEditor();
    openPage(el.pageEd);
  }

  function buildEditor() {
    const body = $('editor-body');
    body.innerHTML = '';
    const ed = S.editing;

    const top = h('section', 'set-group');
    top.appendChild(h('h3', null, '顶部'));
    const topCard = h('div', 'set-card');
    const nameRow = document.createElement('label');
    nameRow.className = 'field';
    nameRow.appendChild(h('span', 'f-label', '小票标题（最大字）'));
    const nameIn = document.createElement('input');
    nameIn.type = 'text'; nameIn.value = ed.name;
    nameIn.addEventListener('input', () => { ed.name = nameIn.value; });
    nameRow.appendChild(nameIn); topCard.appendChild(nameRow);

    [['英文（小字）', 'en', 'LUMINSHOT'], ['中文（大字）', 'cn', '有光入画']].forEach(([label, key, placeholder]) => {
      const r = document.createElement('label'); r.className = 'field';
      r.appendChild(h('span', 'f-label', label));
      const input = document.createElement('input'); input.type = 'text'; input.value = ed.brand[key] || ''; input.placeholder = placeholder;
      input.addEventListener('input', () => { ed.brand[key] = input.value; });
      r.appendChild(input); topCard.appendChild(r);
    });
    top.appendChild(topCard); body.appendChild(top);

    const roles = { body: '正文', amount: '金额' };
    ed.sections.forEach((sec) => {
      if (!roles[sec.role]) return;
      const g = h('section', 'set-group');
      g.appendChild(h('h3', null, roles[sec.role]));
      const card = h('div', 'set-card');
      (sec.fields || []).forEach((f) => card.appendChild(editorField(sec, f)));
      const add = h('button', 'set-action', '＋ 加一个字段');
      add.type = 'button';
      add.addEventListener('click', () => {
        sec.fields.push({ id: TPL.uid('f'), type: 'text', label: '新字段' }); buildEditor();
      });
      card.appendChild(add); g.appendChild(card); body.appendChild(g);
    });

    const bottom = h('section', 'set-group');
    bottom.appendChild(h('h3', null, '底部'));
    const bottomCard = h('div', 'set-card');
    [['底部文案第一行', 'line1'], ['底部文案第二行', 'line2'], ['Slogan第一行', 'slogan1'], ['Slogan第二行', 'slogan2']].forEach(([label, key]) => {
      const r = document.createElement('label'); r.className = 'field';
      r.appendChild(h('span', 'f-label', label));
      const input = document.createElement('input'); input.type = 'text'; input.value = ed.footer[key] || '';
      input.addEventListener('input', () => { ed.footer[key] = input.value; });
      r.appendChild(input); bottomCard.appendChild(r);
    });
    bottom.appendChild(bottomCard); body.appendChild(bottom);

    if (S.editingNew) return;
    const del = h('button', 'set-action danger', '删除这个模板');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (!window.confirm('删除这个模板？已经开出去的票不受影响。')) return;
      const removedId = S.editing.id;
      S.templates = S.templates.filter((x) => x.id !== removedId);
      if (S.tplId === removedId) S.tplId = S.templates[0] ? S.templates[0].id : null;
      saveTemplates(); closePage(el.pageEd);
      prefillValues(tpl());
      buildTemplateCards(); buildForm(); renderCurrent();
      toast(S.templates.length ? '模板已删除' : '模板已删除 · 请新建一张');
    });
    body.appendChild(del);
  }

  function editorField(sec, f) {
    const wrap = h('div', 'ed-field');
    const top = h('div', 'ed-row');
    const labelIn = document.createElement('input');
    labelIn.className = 'mini-input wide';
    labelIn.type = 'text';
    labelIn.value = f.label;
    labelIn.addEventListener('input', () => { f.label = labelIn.value; });
    top.appendChild(labelIn);

    const sel = document.createElement('select');
    sel.className = 'mini-select';
    Object.keys(TPL.TYPES).forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = TPL.TYPES[k].name;
      if (k === f.type) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      f.type = sel.value;
      if (f.type === 'select' && !f.options) f.options = [];
      buildEditor();
    });
    top.appendChild(sel);

    const del = h('button', 'mini-del', '✕');
    del.type = 'button';
    del.addEventListener('click', () => {
      sec.fields = sec.fields.filter((x) => x.id !== f.id);
      buildEditor();
    });
    top.appendChild(del);
    wrap.appendChild(top);

    if (f.type === 'select' || f.type === 'payment') {
      const optIn = document.createElement('input');
      optIn.className = 'mini-input full';
      optIn.type = 'text';
      optIn.placeholder = '选项用逗号隔开，比如：全天,上午,下午';
      optIn.value = (f.options || []).join(',');
      optIn.addEventListener('input', () => {
        f.options = optIn.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      });
      wrap.appendChild(optIn);
    }
    return wrap;
  }

  function saveEditor() {
    const ed = TPL.normalizeTpl(S.editing);
    const i = S.templates.findIndex((x) => x.id === ed.id);
    if (i >= 0) S.templates[i] = ed; else S.templates.push(ed);
    S.tplId = ed.id;
    saveTemplates();
    closePage(el.pageEd);
    prefillValues(tpl());
    buildTemplateCards(); buildForm(); renderCurrent();
    toast('模板已保存');
  }

  /* ---------------- 设置 ---------------- */
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function group(title, rows) {
    const g = h('section', 'set-group');
    g.appendChild(h('h3', null, title));
    const card = h('div', 'set-card');
    rows.forEach((r) => card.appendChild(r));
    g.appendChild(card);
    return g;
  }
  function row(label, ctrl) {
    const r = h('div', 'set-row');
    r.appendChild(h('span', 'lab', label));
    const c = h('div', 'ctrl');
    if (ctrl) c.appendChild(ctrl);
    r.appendChild(c);
    return r;
  }
  function seg(opts, cur, onPick) {
    const s = h('div', 'seg');
    opts.forEach((o) => {
      const b = h('button', o.v === cur ? 'on' : '', o.t);
      b.type = 'button';
      b.addEventListener('click', () => onPick(o.v));
      s.appendChild(b);
    });
    return s;
  }
  function swatches(cur, onPick) {
    const s = h('div', 'swatches');
    PAPER_OPTS.forEach((o) => {
      const option = h('div', 'sw-option');
      const b = h('button', 'sw' + (o.v === cur ? ' on' : ''));
      b.type = 'button';
      b.style.background = o.c;
      b.title = o.t;
      b.setAttribute('aria-label', o.t);
      b.addEventListener('click', () => onPick(o.v));
      option.appendChild(b);
      s.appendChild(option);
    });
    return s;
  }
  function switchEl(on, onPick) {
    const b = h('button', 'switch' + (on ? ' on' : ''));
    b.type = 'button';
    b.addEventListener('click', () => onPick(!on));
    return b;
  }

  function compareVersions(a, b) {
    const parts = (value) => String(value).replace(/^v/i, '').split('.').map((part) => parseInt(part, 10) || 0);
    const left = parts(a), right = parts(b);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const delta = (left[i] || 0) - (right[i] || 0);
      if (delta) return delta > 0 ? 1 : -1;
    }
    return 0;
  }

  async function checkForUpdates(button, status) {
    if (!button || button.disabled) return;
    let nativeDownloadStarted = false;
    button.disabled = true;
    button.textContent = '正在检查…';
    status.textContent = '正在连接 GitHub…';
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store'
      });
      if (response.status === 404) {
        status.textContent = '暂时找不到更新信息，发布页可能尚未上线。';
        return;
      }
      if (!response.ok) throw new Error('release request failed');
      const release = await response.json();
      const tag = String(release.tag_name || '').trim().replace(/^v/i, '');
      if (!/^\d+(?:\.\d+)*$/.test(tag)) throw new Error('invalid release tag');
      if (compareVersions(tag, APP_VERSION) <= 0) {
        status.textContent = `当前版本 v${APP_VERSION}，暂无更新。`;
        return;
      }
      status.textContent = `发现新版本 v${tag}。`;
      if (window.AndroidApp && typeof window.AndroidApp.startUpdate === 'function') {
        const expectedName = `piao-v${tag}.apk`;
        const asset = Array.isArray(release.assets)
          ? release.assets.find((item) => item && item.name === expectedName) : null;
        if (!asset) {
          status.textContent = '发布页暂时没有可用的 APK，请稍后重试。';
          return;
        }
        const size = Number(asset.size);
        const digest = String(asset.digest || '');
        let assetUrl;
        try { assetUrl = new URL(asset.browser_download_url || ''); }
        catch (e) { assetUrl = null; }
        const expectedPath = `/luminshot/piao/releases/download/v${tag}/${expectedName}`;
        if (!assetUrl || assetUrl.protocol !== 'https:' || assetUrl.hostname.toLowerCase() !== 'github.com'
            || assetUrl.pathname.toLowerCase() !== expectedPath.toLowerCase()
            || !/^sha256:[a-f0-9]{64}$/i.test(digest)
            || !Number.isSafeInteger(size) || size <= 0 || size > 100 * 1024 * 1024) {
          status.textContent = '更新包信息不完整或无法校验，请稍后重试。';
          return;
        }
        if (window.confirm(`发现新版本 v${tag}。确定后将在 App 内下载，下载完成再由 Android 确认安装。现在下载吗？`)) {
          nativeDownloadStarted = true;
          window.__xpl.nativeUpdateProgress('starting', 0, `准备下载 v${tag}…`);
          try {
            window.AndroidApp.startUpdate(assetUrl.href, tag, digest, size);
          } catch (e) {
            nativeDownloadStarted = false;
            throw e;
          }
        }
        return;
      }
      if (window.confirm(`发现新版本 v${tag}，是否打开 GitHub 发布页下载安装？`)) {
        let target = LATEST_RELEASE_PAGE;
        try {
          const candidate = new URL(release.html_url || LATEST_RELEASE_PAGE);
          if (candidate.origin === 'https://github.com'
              && candidate.pathname.toLowerCase().startsWith('/luminshot/piao/releases/')) target = candidate.href;
        } catch (e) { /* keep the trusted fallback URL */ }
        window.location.href = target;
      }
    } catch (e) {
      status.textContent = '连接或启动更新失败，请检查网络后重试。';
    } finally {
      if (!nativeDownloadStarted) {
        button.disabled = false;
        button.textContent = '检查更新';
      }
    }
  }

  function buildSettings() {
    const body = $('settings-body');
    body.innerHTML = '';
    const st = S.settings;

    const rows1 = [row('纸张宽度', seg(
      [{ v: '58', t: '58mm' }, { v: '80', t: '80mm' }, { v: 'custom', t: '自定义' }],
      st.paperMm === 58 ? '58' : st.paperMm === 80 ? '80' : 'custom',
      (v) => {
        st.paperMm = v === '58' ? 58 : v === '80' ? 80 : 62;
        saveSettings(); buildSettings(); renderCurrent();
      }
    ))];
    if (st.paperMm !== 58 && st.paperMm !== 80) {
      const inp = h('input', 'mini-input');
      inp.type = 'number'; inp.min = '30'; inp.max = '110'; inp.value = st.paperMm;
      inp.addEventListener('change', () => {
        st.paperMm = Math.max(30, Math.min(110, Number(inp.value) || 58));
        saveSettings(); buildSettings(); renderCurrent();
      });
      const box = h('div', 'ctrl');
      box.appendChild(inp); box.appendChild(h('span', 'mini-sep', 'mm'));
      rows1.push(row('自定义宽度', box));
    }
    rows1.push(row('画幅比例', seg(
      RATIOS.map((r) => ({ v: r.id, t: r.label })),
      st.ratioId,
      (v) => {
        const r = RATIOS.find((x) => x.id === v);
        st.ratioId = v;
        if (r && v !== 'custom') st.ratio = r.v;
        saveSettings(); buildSettings(); renderCurrent();
      }
    )));
    if (st.ratioId === 'custom') {
      const w = h('input', 'mini-input'); w.type = 'number'; w.value = Math.round(1 / st.ratio * 10) / 10 || 3;
      const hh = h('input', 'mini-input'); hh.type = 'number'; hh.value = Math.round(st.ratio * 10) / 10 || 4;
      const box = h('div', 'ctrl');
      box.appendChild(w); box.appendChild(h('span', 'mini-sep', ':')); box.appendChild(hh);
      const apply = () => {
        const wv = Number(w.value) || 3, hv = Number(hh.value) || 4;
        st.ratio = hv / wv; st.ratioId = 'custom';
        saveSettings(); renderCurrent();
      };
      w.addEventListener('change', apply);
      hh.addEventListener('change', apply);
      rows1.push(row('自定义比例', box));
    }

    const rows2 = [row('字体', seg(FONT_OPTS, st.font, (v) => {
      st.font = v; saveSettings(); buildSettings(); renderCurrent();
    }))];
    rows2.push(row('字号', seg(FONT_SIZE_OPTS, st.fontSize, (v) => {
      st.fontSize = v; saveSettings(); buildSettings(); renderCurrent();
    })));
    rows2.push(row('内容密度', seg(DENSITY_OPTS, st.density, (v) => {
      st.density = v; saveSettings(); buildSettings(); renderCurrent();
    })));
    rows2.push(row('分隔线', seg(DIVIDER_OPTS, st.dividerStyle, (v) => {
      st.dividerStyle = v; saveSettings(); buildSettings(); renderCurrent();
    })));

    const rows3 = [
      row('纸张颜色', swatches(st.paper, (v) => { st.paper = v; saveSettings(); buildSettings(); renderCurrent(); })),
      row('纸张纹理', seg(TEXTURE_OPTS, st.texture, (v) => { st.texture = v; saveSettings(); buildSettings(); renderCurrent(); })),
      row('撕纸边缘', seg(TEAR_OPTS, st.tear, (v) => { st.tear = v; saveSettings(); buildSettings(); renderCurrent(); }))
    ];

    const rows4 = [row('打印音效', switchEl(st.sound, (v) => {
      st.sound = v; saveSettings(); applyLook(); buildSettings();
    }))];
    const vol = h('input', 'range');
    vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = String(Math.round(st.volume * 100));
    vol.style.setProperty('--fill', Math.round(st.volume * 100) + '%');
    vol.addEventListener('input', () => {
      st.volume = Number(vol.value) / 100;
      vol.style.setProperty('--fill', vol.value + '%');
      saveSettings(); applyLook();
    });
    vol.addEventListener('change', () => { window.Sound && window.Sound.click(); });
    const volRow = h('div', 'set-row');
    volRow.appendChild(h('span', 'lab', '音量'));
    const vc = h('div', 'ctrl'); vc.appendChild(vol);
    volRow.appendChild(vc);
    rows4.push(volRow);

    const card5 = h('div', 'set-card');
    const a1 = h('button', 'set-action', '导出备份文件'); a1.type = 'button'; a1.addEventListener('click', exportBackup);
    const a2 = h('button', 'set-action', '从备份文件恢复'); a2.type = 'button'; a2.addEventListener('click', importBackup);
    const a3 = h('button', 'set-action danger', '清空所有数据'); a3.type = 'button'; a3.addEventListener('click', clearAll);
    card5.appendChild(a1); card5.appendChild(a2); card5.appendChild(a3);
    const g5 = h('section', 'set-group');
    g5.appendChild(h('h3', null, '数据'));
    g5.appendChild(card5);

    body.appendChild(group('样式', rows1));
    body.appendChild(group('排版', rows2));
    body.appendChild(group('质感', rows3));
    body.appendChild(group('效果', rows4));
    body.appendChild(g5);

    const updateButton = h('button', 'set-action', '检查更新');
    updateButton.id = 'btn-check-updates';
    updateButton.type = 'button';
    const updateProgress = h('progress', 'update-progress');
    updateProgress.id = 'update-progress';
    updateProgress.max = 100;
    updateProgress.value = 0;
    updateProgress.hidden = true;
    updateProgress.setAttribute('aria-label', '更新下载进度');
    const updateStatus = h('p', 'update-status');
    updateStatus.id = 'update-status';
    updateStatus.setAttribute('role', 'status');
    updateStatus.setAttribute('aria-live', 'polite');
    updateButton.addEventListener('click', () => checkForUpdates(updateButton, updateStatus));
    body.appendChild(group('关于', [
      row('当前版本', h('span', 'about-line', 'v' + APP_VERSION)),
      updateButton,
      updateProgress,
      updateStatus
    ]));
  }

  /* ---------------- 事件 ---------------- */
  function bindPageDragGuard() {
    let touchX = 0, touchY = 0;
    document.addEventListener('touchstart', (event) => {
      const touch = event.touches && event.touches[0];
      if (touch) { touchX = touch.clientX; touchY = touch.clientY; }
    }, { passive: true });
    document.addEventListener('touchmove', (event) => {
      if (!event.cancelable || !event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - touchX, dy = touch.clientY - touchY;
      touchX = touch.clientX; touchY = touch.clientY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      const target = event.target;
      const horizontal = target.closest && target.closest('.tpl-row');
      if (horizontal && Math.abs(dx) > Math.abs(dy)) return;
      const scrollArea = target.closest && target.closest('.sheet-body, .page-body');
      if (scrollArea) {
        const atTop = scrollArea.scrollTop <= 1;
        const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
        if ((dy > 0 && atTop) || (dy < 0 && atBottom)) event.preventDefault();
        return;
      }
      event.preventDefault();
    }, { passive: false });
    document.addEventListener('wheel', (event) => {
      const target = event.target;
      if (target.closest && target.closest('.sheet-body, .page-body')) return;
      const horizontal = target.closest && target.closest('.tpl-row');
      if (horizontal && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
    }, { passive: false });
  }

  function bind() {
    bindPageDragGuard();
    window.Printer.mount(el);

    $('btn-print').addEventListener('click', () => {
      prefillValues(tpl()); buildForm();
      window.Sound && window.Sound.unlock();
      window.Sound && window.Sound.click();
      el.tip.textContent = '';
      openSheet(el.sheetNew, el.maskNew);
    });
    $('close-new').addEventListener('click', () => closeSheet(el.sheetNew, el.maskNew));
    el.maskNew.addEventListener('click', () => closeSheet(el.sheetNew, el.maskNew));

    $('btn-do-print').addEventListener('click', () => {
      const rec = readForm();
      if (!rec) return;
      closeSheet(el.sheetNew, el.maskNew);
      setTimeout(() => startPrint(rec), 300);
    });

    $('btn-tear').addEventListener('click', () => {
      if (S.mode !== 'done') return;
      el.dockDone.hidden = true;
      el.dockIdle.hidden = true;
      window.Printer.tear().then(backToIdle);
    });
    $('btn-save').addEventListener('click', () => {
      window.Sound && window.Sound.click();
      exportImage(S.data, 'download');
    });

    el.slot.addEventListener('click', () => {
      if (S.mode === 'printing') return;
      buildRatioChips();
      openSheet(el.sheetAct, el.maskAct);
    });
    $('close-act').addEventListener('click', () => closeSheet(el.sheetAct, el.maskAct));
    el.maskAct.addEventListener('click', () => closeSheet(el.sheetAct, el.maskAct));
    $('act-save').addEventListener('click', () => exportImage(S.data, 'download'));
    $('act-share').addEventListener('click', () => exportImage(S.data, 'share'));
    $('act-tear').addEventListener('click', () => {
      closeSheet(el.sheetAct, el.maskAct);
      if (S.mode === 'done') {
        el.dockDone.hidden = true;
        el.dockIdle.hidden = true;
        window.Printer.tear().then(backToIdle);
      }
    });
    $('r-ok').addEventListener('click', () => {
      const w = parseFloat($('r-w').value), hh = parseFloat($('r-h').value);
      if (!(w > 0) || !(hh > 0)) { toast('宽高要填数字'); return; }
      S.settings.ratioId = 'custom';
      S.settings.ratio = hh / w;
      saveSettings(); renderCurrent(); buildRatioChips();
      toast('比例已改为 ' + w + ':' + hh);
    });

    $('btn-clip').addEventListener('click', () => {
      window.Sound && window.Sound.click();
      S.clip.mode = 'list';
      renderClip();
      openSheet(el.sheetClip, el.maskClip);
    });
    $('close-clip').addEventListener('click', () => closeSheet(el.sheetClip, el.maskClip));
    el.maskClip.addEventListener('click', () => closeSheet(el.sheetClip, el.maskClip));
    $('btn-trash').addEventListener('click', () => {
      S.clip.mode = S.clip.mode === 'trash' ? 'list' : 'trash';
      renderClip();
    });
    $('his-search').addEventListener('input', (e) => {
      S.clip.query = e.target.value.trim();
      renderClip();
    });

    $('btn-settings').addEventListener('click', () => {
      window.Sound && window.Sound.click();
      buildSettings();
      openPage(el.pageSet);
    });
    $('close-settings').addEventListener('click', () => closePage(el.pageSet));

    $('close-editor').addEventListener('click', () => closePage(el.pageEd));
    $('editor-cancel').addEventListener('click', () => closePage(el.pageEd));
    $('editor-save').addEventListener('click', saveEditor);

    window.addEventListener('resize', () => centerStage());
    const unlock = () => { window.Sound && window.Sound.unlock(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  function buildRatioChips() {
    const host = $('ratio-chips');
    host.innerHTML = '';
    RATIOS.forEach((r) => {
      const b = h('button', 'chip' + (r.id === S.settings.ratioId ? ' on' : ''), r.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        S.settings.ratioId = r.id;
        if (r.id !== 'custom') S.settings.ratio = r.v;
        $('custom-ratio').hidden = r.id !== 'custom';
        if (r.id !== 'custom') { saveSettings(); renderCurrent(); }
        host.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      });
      host.appendChild(b);
    });
    $('custom-ratio').hidden = S.settings.ratioId !== 'custom';
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    loadSettings();
    loadTemplates();
    loadHistory();
    prefillValues(tpl());
    bind();
    el.led.classList.add('idle');
    applyLook();
    buildTemplateCards();
    buildForm();
    renderCurrent();

  }

  window.__xpl = {
    state: S,
    previewRec,
    printNow() { const rec = readForm(); if (rec) return startPrint(rec); return false; },
    tearNow() { if (S.mode === 'done') window.Printer.tear().then(backToIdle); },
    setSetting(k, v) { S.settings[k] = v; saveSettings(); applyLook(); buildSettings(); renderCurrent(); },
    selectTemplate(id) { S.tplId = id; prefillValues(tpl()); buildTemplateCards(); buildForm(); renderCurrent(); },
    openEditor, openSettings: () => { buildSettings(); openPage(el.pageSet); },
    exportImage, renderClip, handleBack,
    nativeSaveResult(ok) { toast(ok ? '文件已保存' : '保存失败，请重试'); },
    nativeUpdateProgress(state, percent, message) {
      const status = $('update-status');
      const progress = $('update-progress');
      const button = $('btn-check-updates');
      if (status) status.textContent = message || '';
      if (progress) {
        progress.hidden = state !== 'downloading' && state !== 'verifying';
        progress.value = Math.max(0, Math.min(100, Number(percent) || 0));
      }
      if (button) {
        button.disabled = ['starting', 'permission', 'downloading', 'verifying'].includes(state);
        button.textContent = state === 'downloading' ? '正在下载…'
          : state === 'verifying' ? '正在校验…' : '检查更新';
      }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
