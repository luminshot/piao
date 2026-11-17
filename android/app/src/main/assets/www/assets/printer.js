/* ===========================================================
   printer.js —— 出纸动画
   纸从机口一点点滚出来，字一行行被「打」上去。
   两层 canvas 叠放：下层画纸，上层画纸+字，用 mask 按出纸进度裁开。
   =========================================================== */
(function (global) {
  'use strict';

  const HEAD = 26;      // 打印头到出纸口的距离（还没打到的白纸）
  const EXTRA = 10;     // 打完之后再送一点纸

  let el = {};
  let state = null;

  function mount(els) { el = els; }

  function renderArgs(opts, dpr) {
    return {
      dpr: dpr,
      width: opts.width,
      ratio: opts.ratio,
      font: opts.font,
      fontSize: opts.fontSize,
      density: opts.density,
      dividerStyle: opts.dividerStyle,
      paper: opts.paper,
      texture: opts.texture,
      tear: opts.tear
    };
  }

  function hardReset() {
    if (state && state.raf) cancelAnimationFrame(state.raf);
    if (state && state.stopSound) { try { state.stopSound(); } catch (e) { /* ignore */ } }
    state = null;
    if (!el.slot) return;
    el.slot.style.height = '0px';
    el.slot.classList.remove('printing', 'done', 'tearing', 'gone');
    if (el.head) el.head.style.opacity = '0';
    if (el.wrap) el.wrap.style.setProperty('--ph', '0px');
    el.slot.style.opacity = '1';
  }

  function setupCanvases(r) {
    [el.paper, el.ink].forEach(function (c) {
      c.width = r.canvas.width;
      c.height = r.canvas.height;
      c.style.width = r.w + 'px';
      c.style.height = r.h + 'px';
    });
    el.paperCtx = el.paper.getContext('2d');
    el.paperCtx.clearRect(0, 0, el.paper.width, el.paper.height);
    el.paperCtx.drawImage(r.mask, 0, 0);
    el.inkCtx = el.ink.getContext('2d');
    el.inkCtx.clearRect(0, 0, el.ink.width, el.ink.height);
    el.inkCtx.drawImage(r.canvas, 0, 0);
    el.slot.style.width = r.w + 'px';
    el.wrap.style.width = r.w + 'px';
    el.wrap.style.height = r.h + 'px';
  }

  /**
   * 打印。返回 Promise，出纸完成时 resolve(receiptRender)。
   */
  function print(data, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      hardReset();
      const dpr = Math.min(global.devicePixelRatio || 2, 3);
      const r = global.Receipt.render(data, renderArgs(opts, dpr));
      setupCanvases(r);

      const H = r.h;
      const total = H + EXTRA;
      // 走纸速度 ~205px/s，接近真热敏机的节奏
      const dur = opts.duration || Math.max(1600, Math.round(total / 205 * 1000));

      el.slot.classList.add('printing');
      el.slot.style.height = '0px';
      if (opts.onStart) opts.onStart();

      const stopSound = global.Sound ? global.Sound.printStart() : function () {};
      const t0 = performance.now();
      let lastTick = -1;
      state = { raf: 0, stopSound: stopSound };

      function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        // 起步的软加速，收尾自然停下
        const prog = p < 0.08 ? Math.pow(p / 0.08, 2) * 0.08 : p;
        const visH = prog * total;
        const printH = Math.max(0, Math.min(H, visH - HEAD));

        el.slot.style.height = Math.min(total, visH) + 'px';
        el.wrap.style.setProperty('--ph', printH + 'px');

        if (el.head) {
          el.head.style.transform = 'translateY(' + Math.max(0, printH - 1) + 'px)';
          el.head.style.opacity = visH > 2 ? String(Math.min(1, (visH - 2) / 22) * (p >= 1 ? 0 : 1)) : '0';
        }

        const step = Math.floor(printH / 22);
        if (step !== lastTick && printH > HEAD && global.Sound) {
          lastTick = step;
          global.Sound.tick(0.75 + Math.random() * 0.5);
        }

        if (opts.onProgress) opts.onProgress(p, printH);

        if (p < 1) {
          state.raf = requestAnimationFrame(frame);
        } else {
          finish();
        }
      }

      function finish() {
        try { stopSound(); } catch (e) { /* ignore */ }
        state.stopSound = null;
        el.slot.classList.remove('printing');
        el.slot.classList.add('done');
        el.wrap.style.setProperty('--ph', H + 'px');
        if (el.head) el.head.style.opacity = '0';
        el.slot.style.height = Math.min(total, H) + 'px';
        if (opts.onEnd) opts.onEnd();
        if (global.Sound) global.Sound.done();
        setTimeout(function () {
          if (state) state.raf = 0;
          resolve(r);
        }, 240);
      }

      state.raf = requestAnimationFrame(frame);
    });
  }

  /**
   * 直接把一张小票「摆」在机口外面（首页的默认模板就用这个）
   * 不走动画，纸是完整打好的状态。
   */
  function show(data, opts) {
    opts = opts || {};
    hardReset();
    const dpr = Math.min(global.devicePixelRatio || 2, 3);
    const r = global.Receipt.render(data, renderArgs(opts, dpr));
    setupCanvases(r);
    el.slot.style.height = r.h + 'px';
    el.wrap.style.setProperty('--ph', r.h + 'px');
    el.slot.classList.add('done');
    if (el.head) el.head.style.opacity = '0';
    return r;
  }

  /** 撕纸：纸被往上抽走 */
  function tear() {
    return new Promise(function (resolve) {
      if (!el.slot) { resolve(); return; }
      if (global.Sound) global.Sound.tear();
      el.slot.classList.add('tearing');
      setTimeout(function () {
        el.slot.classList.add('gone');
        setTimeout(function () {
          hardReset();
          resolve();
        }, 120);
      }, 360);
    });
  }

  function reset() { hardReset(); }

  global.Printer = {
    mount, print, show, tear, reset, HEAD
  };
})(window);
