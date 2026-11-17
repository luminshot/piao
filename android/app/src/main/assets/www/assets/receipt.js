/* ===========================================================
   receipt.js —— 按模板把小票画成一张「热敏纸」
   渲染输入：{ template, values, no, timeText, demo }
   =========================================================== */
(function (global) {
  'use strict';

  const BASE_W = 320;
  const PAD = 24;
  const V_PAD = 24;
  const TOOTH = 8;
  const BOTTOM_PAD = Math.max(0, V_PAD - TOOTH);
  const FONTS = {
    mono:  'monospace,"Roboto Mono","SF Mono","Menlo","Noto Sans Mono CJK SC","PingFang SC","Microsoft YaHei"',
    sans:  'system-ui,"Hiragino Sans GB","Microsoft YaHei",sans-serif',
    serif: '"Songti SC","STSong","SimSun","Noto Serif SC","Source Han Serif SC",serif'
  };
  const PAPERS = { cream: '#FAF8F2', warm: '#F8F2E3', cool: '#F1F2F0', white: '#FFFFFF' };

  let FONT = FONTS.sans;
  const INK = '#302F2B';
  const INK_SOFT = '#5C5B54';
  const INK_FAINT = '#858278';
  const RULE = '#D8D2C5';
  const MONO_TRACKING = 0.24;

  /* ---------- 基础 ---------- */
  let meas = null;
  const M = () => (meas || (meas = document.createElement('canvas').getContext('2d')));
  const setFont = (ctx, size, weight) => { ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT; };

  function measureSpaced(ctx, text, ls) {
    let w = 0;
    for (const ch of Array.from(text)) w += ctx.measureText(ch).width + ls;
    return w - ls;
  }
  function drawSpaced(ctx, text, x, y, ls, align) {
    ctx.textAlign = 'left';
    const total = measureSpaced(ctx, text, ls);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (const ch of Array.from(text)) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + ls;
    }
  }
  function drawText(ctx, text, x, y, o) {
    o = o || {};
    const size = o.size || 12.2;
    const ls = o.ls == null ? (FONT === FONTS.mono ? MONO_TRACKING : 0) : o.ls;
    const align = o.align || 'left';
    setFont(ctx, size, o.weight || 400);
    ctx.fillStyle = o.color || INK;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    const paint = (dx, dy, alpha) => {
      ctx.globalAlpha = alpha;
      if (ls) drawSpaced(ctx, text, x + dx, y + dy, ls, align);
      else ctx.fillText(text, x + dx, y + dy);
    };
    paint(0, 0, 1);
    ctx.globalAlpha = 1;
  }
  function wrapText(text, maxW, size, weight) {
    const m = M();
    setFont(m, size, weight);
    const out = [];
    let cur = '';
    const tracking = FONT === FONTS.mono ? MONO_TRACKING : 0;
    for (const ch of Array.from(String(text == null ? '' : text))) {
      if (ch === '\n') { out.push(cur); cur = ''; continue; }
      const t = cur + ch;
      const spacedWidth = m.measureText(t).width + Math.max(0, Array.from(t).length - 1) * tracking;
      if (cur && spacedWidth > maxW) { out.push(cur); cur = ch; }
      else cur = t;
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }
  function money(n) {
    const v = Number(n);
    if (!isFinite(v)) return '0.00';
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------- 大写金额 ---------- */
  const CN_D = '零壹贰叁肆伍陆柒捌玖';
  const CN_U = ['', '拾', '佰', '仟'];
  const CN_B = ['', '万', '亿'];
  function intCN(num) {
    if (num === 0) return '零';
    const str = String(num), len = str.length;
    let s = '', zero = false;
    for (let i = 0; i < len; i++) {
      const d = +str[i], pos = len - 1 - i, u = pos % 4, b = Math.floor(pos / 4);
      if (d === 0) zero = true;
      else {
        if (zero && s) s += '零';
        zero = false;
        s += CN_D[d] + CN_U[u];
      }
      if (u === 0 && b > 0) {
        const seg = str.slice(Math.max(0, len - (b + 1) * 4), len - b * 4);
        if (+seg !== 0) s += CN_B[b];
      }
    }
    return s.replace(/^壹拾/, '拾');
  }
  function amountCN(n) {
    let v = Number(n);
    if (!isFinite(v) || v <= 0) return '零元整';
    v = Math.round(v * 100) / 100;
    const yuan = Math.floor(v), jiao = Math.floor(v * 10) % 10, fen = Math.round(v * 100) % 10;
    let s = '';
    if (yuan > 0) s += intCN(yuan) + '元';
    if (jiao === 0 && fen === 0) s += '整';
    else {
      if (yuan === 0) s += '零';
      if (jiao > 0) s += CN_D[jiao] + '角';
      if (fen > 0) s += CN_D[fen] + '分';
      else s += '整';
    }
    return s;
  }

  /* ---------- 纸 ---------- */
  let noisePattern = null;
  let noiseKind = 'fine';
  function getNoise(ctx, kind) {
    kind = kind || 'fine';
    if (noisePattern && noiseKind === kind) return noisePattern;
    noiseKind = kind;
    const s = 96;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    const grain = kind === 'grain';
    for (let i = 0; i < img.data.length; i += 4) {
      const v = grain ? (120 + Math.random() * 110) : (168 + Math.random() * 52);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = grain ? 20 : 5;
    }
    g.putImageData(img, 0, 0);
    noisePattern = ctx.createPattern(c, 'repeat');
    return noisePattern;
  }

  function paperPath(ctx, w, h, tear) {
    tear = tear || 'zigzag';
    const base = h - (tear === 'straight' ? 0 : TOOTH);
    let seed = 20261108;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, base);
    if (tear === 'straight') {
      ctx.lineTo(0, base);
    } else if (tear === 'wave') {
      const step = 9;
      for (let x = w; x > 0; x -= step) {
        const nx = Math.max(0, x - step);
        ctx.quadraticCurveTo(x - step / 2, base + TOOTH * 0.95, nx, base + TOOTH * 0.15);
      }
    } else if (tear === 'burr') {
      let x = w;
      while (x > 0) {
        const wd = 2.5 + rnd() * 5;
        const nx = Math.max(0, x - wd);
        ctx.lineTo(x - wd * 0.5, base + TOOTH * (0.2 + rnd() * 0.5));
        ctx.lineTo(nx, base + TOOTH * 0.06 * rnd());
        x = nx;
      }
    } else {
      let x = w;
      while (x > 0) {
        const wd = 7 + rnd() * 17;
        const nx = Math.max(0, x - wd);
        ctx.lineTo(x - wd * 0.5, base + TOOTH * (0.32 + rnd() * 0.68));
        ctx.lineTo(nx, base);
        x = nx;
      }
    }
    ctx.closePath();
  }

  function paintPaper(ctx, w, h, opt) {
    opt = opt || {};
    const color = opt.paper || PAPERS.cream;
    const texture = opt.texture || 'fine';
    const tear = opt.tear || 'zigzag';
    ctx.save();
    paperPath(ctx, w, h, tear);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);

    if (texture !== 'plain') {
      ctx.globalAlpha = texture === 'grain' ? 0.65 : 0.32;
      ctx.fillStyle = getNoise(ctx, texture);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    let g = ctx.createLinearGradient(0, 0, 14, 0);
    g.addColorStop(0, 'rgba(86,72,46,0.10)');
    g.addColorStop(1, 'rgba(86,72,46,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 14, h);

    g = ctx.createLinearGradient(w, 0, w - 14, 0);
    g.addColorStop(0, 'rgba(86,72,46,0.10)');
    g.addColorStop(1, 'rgba(86,72,46,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w - 14, 0, 14, h);

    g = ctx.createLinearGradient(0, 0, 0, 13);
    g.addColorStop(0, 'rgba(70,58,36,0.16)');
    g.addColorStop(0.5, 'rgba(70,58,36,0.05)');
    g.addColorStop(1, 'rgba(70,58,36,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 13);

    if (texture === 'thermal' || texture === 'fine') {
      ctx.fillStyle = texture === 'thermal' ? 'rgba(96,84,58,0.025)' : 'rgba(96,84,58,0.008)';
      const step = texture === 'thermal' ? 4 : 6;
      for (let yy = 0; yy < h; yy += step) ctx.fillRect(0, yy, w, 1);
    }
    ctx.restore();
  }

  /* ---------- 排版积木 ---------- */
  function makeKit(W, dense) {
    const D = dense || { lh: 1, rule: 10, size: 1, dividerStyle: 'solid' };
    const P = PAD;
    const CW = W - P * 2;
    const lines = [];
    const gap = (h) => lines.push({ h: Math.round(h * D.lh), paint() {} });

    const row = (text, o) => {
      o = o || {};
      const size = (o.size || 12.2) * D.size;
      const lh = Math.round((o.lh || 1.62) * size * D.lh);
      const x = o.align === 'center' ? W / 2 : o.align === 'right' ? W - P : P;
      lines.push({
        h: lh,
        paint(ctx, y) {
          drawText(ctx, text, x, y + lh / 2, {
            size, weight: o.weight || 400, color: o.color || INK,
            align: o.align || 'left', ls: o.ls || 0
          });
        }
      });
    };

    const rule = () => {
      const hgt = D.rule;
      lines.push({
        h: hgt,
        paint(ctx, y) {
          const yy = Math.round(y + hgt / 2) + 0.5;
          ctx.save();
          ctx.strokeStyle = RULE;
          ctx.lineWidth = D.dividerStyle === 'solid' ? 0.85 : 1;
          ctx.lineCap = D.dividerStyle === 'dotted' ? 'round' : 'butt';
          ctx.setLineDash(D.dividerStyle === 'dashed' ? [4, 4] : D.dividerStyle === 'dotted' ? [1, 3.5] : []);
          ctx.beginPath();
          ctx.moveTo(P, yy);
          ctx.lineTo(W - P, yy);
          ctx.stroke();
          ctx.restore();
        }
      });
    };

    const kv = (k, v, o) => {
      o = o || {};
      const size = (o.size || 12) * D.size;
      const lh = Math.round((o.lh || 1.8) * size * D.lh);
      const vstr = String(v == null || v === '' ? '—' : v);
      const m = M();
      setFont(m, size, 400);
      const tracking = FONT === FONTS.mono ? MONO_TRACKING : 0;
      const trackedWidth = (text) => m.measureText(text).width + Math.max(0, Array.from(text).length - 1) * tracking;
      const vw = trackedWidth(vstr);
      const kw = trackedWidth(k);
      if (kw + vw + 12 <= CW) {
        lines.push({
          h: lh,
          paint(ctx, y) {
            drawText(ctx, k, P, y + lh / 2, { size, color: INK_FAINT, weight: 400 });
            drawText(ctx, vstr, W - P, y + lh / 2, { size, color: o.color || INK, align: 'right', weight: 400 });
          }
        });
      } else {
        const vs = wrapText(vstr, CW - 26, size, 400);
        lines.push({
          h: lh + vs.length * lh,
          paint(ctx, y) {
            drawText(ctx, k, P, y + lh / 2, { size, color: INK_FAINT, weight: 400 });
            for (let i = 0; i < vs.length; i++) {
              drawText(ctx, vs[i], W - P, y + lh / 2 + lh * (i + 1),
                { size, color: o.color || INK, align: 'right', weight: 400 });
            }
          }
        });
      }
    };

    const primaryMoney = (k, v, o) => {
      o = o || {};
      const size = (o.size || 11.6) * D.size;
      const amountSize = (o.amountSize || 18) * D.size;
      const lh = Math.round((o.lh || 1.8) * size * D.lh);
      const amountLh = Math.round(1.1 * amountSize * D.lh);
      const vstr = String(v == null || v === '' ? '—' : v);
      const m = M();
      const tracking = FONT === FONTS.mono ? MONO_TRACKING : 0;
      setFont(m, size, 400);
      const kw = measureSpaced(m, k, tracking);
      const wrapped = wrapText(vstr, Math.max(48, CW - kw - 12), amountSize, 700);
      const h = Math.max(lh * 2, amountLh * wrapped.length);
      lines.push({
        h,
        paint(ctx, y) {
          drawText(ctx, k, P, y + h / 2, { size, color: INK_FAINT, weight: 400 });
          const total = amountLh * wrapped.length;
          const firstY = y + (h - total) / 2 + amountLh / 2;
          for (let i = 0; i < wrapped.length; i++) {
            drawText(ctx, wrapped[i], W - P, firstY + i * amountLh,
              { size: amountSize, color: o.color || INK, align: 'right', weight: 700 });
          }
        }
      });
    };

    return { lines, gap, row, rule, kv, primaryMoney, W, P, CW };
  }

  /* ---------- 品牌区 ---------- */
  function buildBrand(kit, brand) {
    const { row, gap } = kit;
    gap(0);
    if (brand && brand.en) row(brand.en, { size: 8.6, align: 'center', ls: 3.2, color: INK_FAINT, lh: 1.4 });
    if (brand && brand.cn) row(brand.cn, { size: 14, weight: 600, align: 'center', ls: 2.4, lh: 1.4 });
    return kit.lines;
  }

  /* ---------- 正文（固定四板块模板） ---------- */
  function buildBody(tpl, values, W, dense) {
    const kit = makeKit(W, dense);
    const { gap, row, rule, kv, primaryMoney } = kit;
    const rawSections = (tpl && tpl.sections) || [];
    const legacySections = rawSections.length > 0 && !rawSections.some((s) => s.role);
    const section = (role) => {
      if (!legacySections) return rawSections.find((s) => s.role === role) || { fields: [] };
      // 旧历史票是三块：把前两块合并为正文，第三块作为金额区。
      if (role === 'body') return { fields: [].concat(...rawSections.slice(0, 2).map((s) => s.fields || [])) };
      if (role === 'amount') return rawSections[2] || { fields: [] };
      return { fields: [] };
    };
    const drawMoney = (f, value) => {
      if (value == null || String(value).trim() === '') return;
      const label = f.label || '定金';
      const amount = '¥ ' + money(value);
      if (f.emphasis === 'primary') primaryMoney(label, amount, { size: 11.6, amountSize: 18 });
      else kv(label, amount, { size: 11.6 });
    };

    gap(5);
    row(tpl.name || '定金凭证', { size: 26, weight: 700, align: 'center', ls: 1.5, lh: 1.5 });
    gap(4);

    rule();
    (section('body').fields || []).forEach((f) => {
      const v = values[f.id];
      if (f.type === 'money') {
        drawMoney(f, v);
      } else {
        kv(f.label || '', v, { size: 11.6 });
      }
    });

    rule();
    (section('amount').fields || []).forEach((f) => {
      const v = values[f.id];
      if (f.type === 'money') {
        drawMoney(f, v);
      } else {
        kv(f.label || '', v, { size: 11.6 });
      }
    });
    return kit.lines;
  }

  /* ---------- 页脚 ---------- */
  function buildFooter(rec, W, dense) {
    const kit = makeKit(W, dense);
    const oldFooter = rec.template && rec.template.footer;
    const f = typeof oldFooter === 'string' ? { line1: '', line2: '', slogan2: oldFooter } : (oldFooter || {});
    const slogan1 = f.slogan1 || '';
    const slogan2 = f.slogan2 || f.slogan || '';
    kit.rule();
    kit.gap(6);
    const drawParagraph = (text, options) => {
      if (!text) return;
      const size = (options && options.size) || 9.2;
      const wrapped = wrapText(text, W - PAD * 2, size * (dense && dense.size || 1), 400);
      wrapped.forEach((line) => kit.row(line, Object.assign({ size, align: 'center', color: INK_SOFT, lh: 1.6 }, options || {})));
    };
    drawParagraph(f.line1, { size: 9.6, lh: 1.65 });
    drawParagraph(f.line2, { size: 9.6, lh: 1.65 });
    kit.gap(4);
    if (slogan1) kit.row(slogan1, { size: 9.6, align: 'center', color: INK_FAINT, ls: 1.5, lh: 1.75 });
    if (slogan2) kit.row(slogan2, { size: 9.6, align: 'center', color: INK_FAINT, ls: 1.5, lh: 1.75 });
    if (rec.demo) kit.row('演 示 样 张 · 不 作 为 真 实 凭 证', { size: 7.6, align: 'center', color: '#C0B9A9', lh: 1.65 });
    return kit.lines;
  }

  /* ---------- 渲染 ---------- */
  const FIT_LEVELS = [
    { lh: 1.00, rule: 20 },
    { lh: 0.92, rule: 17 },
    { lh: 0.86, rule: 14 }
  ];

  function render(rec, opts) {
    opts = opts || {};
    rec = rec || {};
    const tpl = rec.template || {};
    const values = rec.values || {};
    const W = opts.width || BASE_W;
    const ratio = opts.ratio || 0;
    const dpr = Math.min(opts.dpr || (global.devicePixelRatio || 2), 3);
    const frameTarget = ratio ? Math.round(W * ratio) : 0;
    const fontScale = opts.fontSize === 'small' ? 0.92 : opts.fontSize === 'large' ? 1.08 : 1;
    const densityScale = opts.density === 'compact' ? 0.92 : opts.density === 'loose' ? 1.10 : 1;

    FONT = FONTS[opts.font] || FONTS.sans;
    noisePattern = null;
    const look = {
      paper: PAPERS[opts.paper] || PAPERS.cream,
      texture: opts.texture || 'fine',
      tear: opts.tear || 'zigzag'
    };

    let chosen = null;
    for (let i = 0; i < FIT_LEVELS.length; i++) {
      const L = FIT_LEVELS[i];
      const dense = {
        lh: L.lh * densityScale, rule: Math.max(6, Math.round(L.rule * densityScale)),
        size: fontScale, dividerStyle: opts.dividerStyle || 'solid'
      };
      const head = buildBrand(makeKit(W, dense), tpl.brand);
      const body = buildBody(tpl, values, W, dense);
      const foot = buildFooter(rec, W, dense);
      const total = head.concat(body, foot).reduce((a, l) => a + l.h, 0) + TOOTH + V_PAD + BOTTOM_PAD;
      chosen = { head, body, foot };
      if (!frameTarget || total <= frameTarget) break;
    }

    const naturalH0 = chosen.head.concat(chosen.body, chosen.foot).reduce((a, l) => a + l.h, 0) + TOOTH;
    const spare = frameTarget ? Math.max(0, frameTarget - V_PAD - BOTTOM_PAD - naturalH0) : 0;
    const lines = chosen.head.concat(chosen.body)
      .concat(spare ? [{ h: spare, paint() {} }] : [])
      .concat(chosen.foot);

    const naturalH = lines.reduce((a, l) => a + l.h, 0) + TOOTH;
    const availableContentH = frameTarget ? Math.max(1, frameTarget - V_PAD - BOTTOM_PAD) : naturalH;
    const scale = frameTarget && naturalH > availableContentH ? availableContentH / naturalH : 1;
    const h = frameTarget ? frameTarget : Math.round(naturalH + V_PAD + BOTTOM_PAD);

    const mk = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = W + 'px';
      c.style.height = h + 'px';
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      return { c, g };
    };
    const paintContent = (g, topOffset) => {
      let y = topOffset || 0;
      for (const l of lines) { l.paint(g, y); y += l.h; }
    };

    const full = mk();
    paintPaper(full.g, W, h, look);

    if (scale < 1) {
      const tmp = document.createElement('canvas');
      tmp.width = Math.round(W * dpr);
      tmp.height = Math.round(naturalH * dpr);
      const tg = tmp.getContext('2d');
      tg.scale(dpr, dpr);
      paintContent(tg, 0);
      full.g.drawImage(tmp, (W - W * scale) / 2, V_PAD, W * scale, naturalH * scale);
    } else {
      paintContent(full.g, V_PAD);
    }

    const mask = mk();
    paintPaper(mask.g, W, h, look);

    return { canvas: full.c, mask: mask.c, w: W, h, dpr, contentH: naturalH, scale };
  }

  global.Receipt = { render, amountCN, money, WIDTH: BASE_W, PAPERS, FONTS };
})(window);
