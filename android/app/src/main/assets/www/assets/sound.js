/* ===========================================================
   sound.js —— 用代码合成热敏打印机的声音，不加载任何音频文件
     Sound.printStart() → 开始走纸，返回 stop()
     Sound.tick()       → 打印一行时的「咔」
     Sound.tear()       → 撕纸
     Sound.done()       → 打完的提示音
     Sound.click()      → 按钮声
     Sound.unlock()     → 首次触摸时调用，解锁音频
   =========================================================== */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let volume = 0.85;

  function makeNoise(ac, sec) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensure() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(ctx, 2);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (!c) return;
    // 用一段静音把 iOS 的解锁流程走完
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  }

  function noise() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  function env(node, peak, atk, hold, rel, t0) {
    const g = node.gain;
    const t = t0 || ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
    g.setValueAtTime(Math.max(peak, 0.0002), t + atk + hold);
    g.exponentialRampToValueAtTime(0.0001, t + atk + hold + rel);
  }

  /* ---------- 走纸：电机 + 齿轮 + 打印头 ---------- */
  function printStart() {
    const c = ensure();
    if (!c || muted) return function () {};
    const t = c.currentTime;
    const nodes = [];

    // 1) 步进电机：低沉的嗡嗡
    const motor = c.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 92;
    const motorF = c.createBiquadFilter();
    motorF.type = 'lowpass';
    motorF.frequency.value = 340;
    motorF.Q.value = 0.8;
    const motorG = c.createGain();
    motorG.gain.value = 0.0001;
    motor.connect(motorF).connect(motorG).connect(master);

    // 电机转速的微小抖动，听着才像真马达
    const wob = c.createOscillator();
    wob.frequency.value = 17;
    const wobG = c.createGain();
    wobG.gain.value = 5;
    wob.connect(wobG).connect(motor.frequency);

    // 2) 走纸摩擦：带通噪声，被方波调制出「嗒嗒嗒」的步进感
    const walk = noise();
    const walkF = c.createBiquadFilter();
    walkF.type = 'bandpass';
    walkF.frequency.value = 1750;
    walkF.Q.value = 1.1;
    const walkG = c.createGain();
    walkG.gain.value = 0;
    walk.connect(walkF).connect(walkG).connect(master);

    const step = c.createOscillator();
    step.type = 'square';
    step.frequency.value = 62;
    const stepG = c.createGain();
    stepG.gain.value = 0.055;
    step.connect(stepG).connect(walkG.gain);

    // 3) 打印头加热的细碎高频「滋滋」——跟着 walk 一起被调制
    const hiss = noise();
    const hissF = c.createBiquadFilter();
    hissF.type = 'highpass';
    hissF.frequency.value = 3600;
    const hissG = c.createGain();
    hissG.gain.value = 0;
    hiss.connect(hissF).connect(hissG).connect(master);
    const hissMod = c.createOscillator();
    hissMod.type = 'square';
    hissMod.frequency.value = 124;
    const hissModG = c.createGain();
    hissModG.gain.value = 0.026;
    hissMod.connect(hissModG).connect(hissG.gain);

    [motor, wob, walk, step, hiss, hissMod].forEach(function (n) { n.start(t); });
    nodes.push(motor, wob, walk, step, hiss, hissMod);

    // 淡入，免得「啪」一声
    motorG.gain.setValueAtTime(0.0001, t);
    motorG.gain.exponentialRampToValueAtTime(0.055, t + 0.12);
    walkG.gain.setValueAtTime(0.0001, t);
    walkG.gain.exponentialRampToValueAtTime(0.16, t + 0.1);
    hissG.gain.setValueAtTime(0.0001, t);
    hissG.gain.exponentialRampToValueAtTime(0.05, t + 0.14);

    let stopped = false;
    return function stop() {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      [motorG, walkG, hissG].forEach(function (g) {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        } catch (e) { /* 忽略 */ }
      });
      setTimeout(function () {
        nodes.forEach(function (n) { try { n.stop(); } catch (e) { /* 已停 */ } });
      }, 300);
    };
  }

  /* ---------- 单行打印的「咔」 ---------- */
  function tick(strength) {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime;
    const s = noise();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400 + Math.random() * 1800;
    f.Q.value = 2.2;
    const g = c.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(master);
    env(g, 0.035 * (strength || 1), 0.004, 0.012, 0.05, t);
    s.start(t);
    s.stop(t + 0.1);
  }

  /* ---------- 撕纸 ---------- */
  function tear() {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime;
    // 三下：起手、拉、断
    const segs = [
      { at: 0.0, dur: 0.14, f: 2600, q: 0.9, amp: 0.14 },
      { at: 0.10, dur: 0.18, f: 1700, q: 0.7, amp: 0.18 },
      { at: 0.22, dur: 0.10, f: 900, q: 0.5, amp: 0.10 }
    ];
    segs.forEach(function (s) {
      const t = t0 + s.at;
      const n = noise();
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(s.f, t);
      f.frequency.exponentialRampToValueAtTime(s.f * 0.55, t + s.dur);
      f.Q.value = s.q;
      const g = c.createGain();
      g.gain.value = 0;
      n.connect(f).connect(g).connect(master);
      env(g, s.amp, 0.01, s.dur * 0.3, s.dur * 0.7, t);
      n.start(t);
      n.stop(t + s.dur + 0.08);
    });
  }

  /* ---------- 打完的提示音 ---------- */
  function done() {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime;
    [880, 1320].forEach(function (f0, i) {
      const t = t0 + i * 0.085;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t);
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(g).connect(master);
      env(g, 0.075, 0.006, 0.03, 0.12, t);
      o.start(t);
      o.stop(t + 0.3);
    });
  }

  /* ---------- 按钮 ---------- */
  function click() {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.05);
    const g = c.createGain();
    g.gain.value = 0;
    o.connect(g).connect(master);
    env(g, 0.05, 0.003, 0.01, 0.06, t);
    o.start(t);
    o.stop(t + 0.12);
  }

  function applyGain() {
    if (!ctx) return;
    try {
      const g = muted ? 0.0001 : Math.max(0.02, Math.min(1, volume));
      master.gain.setValueAtTime(g, ctx.currentTime);
    } catch (e) { /* ignore */ }
  }
  function setMuted(v) { muted = !!v; applyGain(); }
  function isMuted() { return muted; }
  function setVolume(v) { volume = Math.max(0, Math.min(1, Number(v) || 0)); applyGain(); }
  function getVolume() { return volume; }

  global.Sound = {
    unlock: unlock, printStart: printStart, tick: tick, tear: tear,
    done: done, click: click, setMuted: setMuted, isMuted: isMuted,
    setVolume: setVolume, getVolume: getVolume, applyGain: applyGain
  };
})(window);
