/* ===========================================================
   template.js —— 四板块小票模板数据模型
   顶部 / 正文 / 金额 / 底部；板块固定，字段和文案可自定义。
   =========================================================== */
(function (global) {
  'use strict';

  const TYPES = {
    no:      { name: '单号（自动）', auto: true },
    text:    { name: '文本' },
    date:    { name: '日期' },
    select:  { name: '选项' },
    money:   { name: '金额' },
    payment: { name: '收款方式' },
    time:    { name: '开具时间（自动）', auto: true }
  };
  const uid = (p) => (p || 'f') + Math.random().toString(36).slice(2, 8);
  const ROLES = [
    { id: 'top', name: '顶部' },
    { id: 'body', name: '正文' },
    { id: 'amount', name: '金额' },
    { id: 'bottom', name: '底部' }
  ];
  const TIME_OPTIONS = ['午宴', '晚宴'];
  const CITY_OPTIONS = ['深圳', '广州'];
  const CONTENT_OPTIONS = ['周岁', '求婚'];
  const PAYMENT_OPTIONS = ['微信', '支付宝'];

  function section(role, fields) {
    return { id: 'sec-' + role, role, name: ROLES.find((r) => r.id === role).name, fields: fields || [] };
  }
  function field(id, type, label, options) {
    const f = { id, type, label };
    if (options) f.options = options.slice();
    return f;
  }

  function defaultTemplate() {
    const depositField = field('f-money', 'money', '定金');
    depositField.emphasis = 'primary';
    const balanceField = field('f-balance', 'money', '剩余尾款');
    balanceField.optional = true;
    return {
      id: 't-default', schemaVersion: 6, name: '定金凭证', builtin: true,
      brand: { type: 'text', en: 'LUMINSHOT', cn: '有光入画', img: null },
      sections: [
        section('top'),
        section('body', [
          field('f-issuedAt', 'time', '开具时间'),
          field('f-customer', 'text', '客户'),
          field('f-shootdate', 'date', '拍摄日期'),
          field('f-shoottime', 'select', '拍摄时段', TIME_OPTIONS),
          field('f-city', 'select', '拍摄城市', CITY_OPTIONS),
          field('f-place', 'text', '拍摄地点'),
          field('f-content', 'select', '拍摄内容', CONTENT_OPTIONS),
          field('f-tier', 'text', '拍摄档位')
        ]),
        section('amount', [
          depositField,
          balanceField,
          field('f-pay', 'payment', '收款方式', PAYMENT_OPTIONS)
        ]),
        section('bottom')
      ],
      footer: {
        line1: '收到定金，已预留拍摄档期',
        line2: '服务明细以价格单为准，请确认已仔细阅读',
        slogan1: '',
        slogan2: '时光会走远，影像能长存'
      }
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function normalizeTpl(t) {
    t = clone(t || {});
    if (!t.id) t.id = uid('t');
    if (!t.name) t.name = '未命名模板';
    t.brand = Object.assign({ type: 'text', en: '', cn: '', img: null }, t.brand || {});
    if (!Array.isArray(t.sections)) t.sections = [];

    // 升级内置默认模板时保留品牌、标题、底部自定义文案及新增字段。
    if (t.id === 't-default' && Number(t.schemaVersion || 0) < 5) {
      const old = t;
      const fresh = defaultTemplate();
      fresh.name = old.name || fresh.name;
      fresh.brand = Object.assign(fresh.brand, old.brand || {});
      const priorFooter = typeof old.footer === 'string' ? { slogan: old.footer } : Object.assign({}, old.footer || {});
      if (!Object.prototype.hasOwnProperty.call(priorFooter, 'slogan2') && priorFooter.slogan != null) priorFooter.slogan2 = priorFooter.slogan;
      delete priorFooter.slogan;
      fresh.footer = Object.assign({}, fresh.footer, priorFooter);
      const oldFields = new Map();
      (old.sections || []).forEach((s) => (s.fields || []).forEach((f) => oldFields.set(f.id, f)));
      const defaults = defaultTemplate();
      const defaultLabels = new Map();
      defaults.sections.forEach((s) => (s.fields || []).forEach((f) => defaultLabels.set(f.id, f.label)));
      fresh.sections.forEach((s) => (s.fields || []).forEach((f) => {
        const prior = oldFields.get(f.id);
        if (!prior) return;
        const legacyDefaultLabel = f.id === 'f-money' ? '定金：人民币' : '';
        if (prior.label && prior.label !== defaultLabels.get(f.id) && prior.label !== legacyDefaultLabel) f.label = prior.label;
        if (prior.type && prior.type !== (defaults.sections.flatMap((x) => x.fields || []).find((x) => x.id === f.id) || {}).type) f.type = prior.type;
        if (Array.isArray(prior.options)) f.options = prior.options.slice();
      }));
      const defaultIds = new Set(defaults.sections.flatMap((s) => (s.fields || []).map((f) => f.id)));
      (old.sections || []).forEach((s) => (s.fields || []).forEach((f) => {
        if (defaultIds.has(f.id) || f.id === 'f-no') return;
        const copy = clone(f);
        const target = copy.type === 'money' || copy.type === 'payment' ? 'amount' : 'body';
        fresh.sections.find((x) => x.role === target).fields.push(copy);
      }));
      t = fresh;
    }

    // 老自定义模板的动态板块迁移到固定四板块。
    if (t.sections.length !== 4 || !t.sections.every((s) => s.role)) {
      const old = t.sections;
      const bodyFields = [];
      const amountFields = [];
      old.forEach((s) => (s.fields || []).forEach((f) => {
        (f.type === 'money' || f.type === 'payment' ? amountFields : bodyFields).push(f);
      }));
      t.sections = [section('top'), section('body', bodyFields), section('amount', amountFields), section('bottom')];
    }
    const roleMap = {};
    t.sections.forEach((s) => {
      if (!s.role) s.role = s.id && s.id.replace(/^sec-/, '') || 'body';
      if (!['top', 'body', 'amount', 'bottom'].includes(s.role)) s.role = 'body';
      roleMap[s.role] = s;
    });
    t.sections = ROLES.map((r) => {
      const s = roleMap[r.id] || section(r.id);
      s.id = 'sec-' + r.id;
      s.role = r.id;
      s.name = r.name;
      if (!Array.isArray(s.fields)) s.fields = [];
      s.fields.forEach((f) => {
        if (!f.id) f.id = uid('f');
        if (!TYPES[f.type]) f.type = 'text';
        if (!f.label) f.label = TYPES[f.type].name;
        if (['select', 'payment'].includes(f.type) && !Array.isArray(f.options)) f.options = [];
      });
      return s;
    });
    const defaultFooter = defaultTemplate().footer;
    const priorFooter = typeof t.footer === 'string' ? { slogan: t.footer } : (t.footer || {});
    t.footer = Object.assign({}, defaultFooter, priorFooter);
    if (!Object.prototype.hasOwnProperty.call(priorFooter, 'slogan2') && Object.prototype.hasOwnProperty.call(priorFooter, 'slogan')) {
      t.footer.slogan2 = priorFooter.slogan;
    }
    if (!Object.prototype.hasOwnProperty.call(priorFooter, 'slogan1')) t.footer.slogan1 = '';
    delete t.footer.slogan;
    delete t.footer.intro;
    if (Number(t.schemaVersion || 0) < 5) {
      const amountSection = t.sections.find((s) => s.role === 'amount');
      const fields = t.sections.flatMap((s) => s.fields || []);
      fields.forEach((f) => {
        if (f.type === 'money' && ['定金：人民币', '定金（人民币）'].includes(f.label)) f.label = '定金';
        if (f.id === 'f-balance' || f.label === '剩余尾款') f.optional = true;
      });
      const hasBalance = fields.some((f) => f.id === 'f-balance' || f.label === '剩余尾款');
      if (amountSection && !hasBalance) {
        const balance = field(t.id === 't-default' ? 'f-balance' : uid('f'), 'money', '剩余尾款');
        balance.optional = true;
        const paymentIndex = amountSection.fields.findIndex((f) => f.type === 'payment');
        amountSection.fields.splice(paymentIndex < 0 ? amountSection.fields.length : paymentIndex, 0, balance);
      }
    }
    t.sections.flatMap((s) => s.fields || []).forEach((f) => {
      if (f.type === 'money' && (f.id === 'f-money' || f.label === '定金' || f.emphasis === 'primary')) f.emphasis = 'primary';
    });
    t.schemaVersion = 6;
    return t;
  }

  function emptyTemplate() {
    const t = defaultTemplate();
    t.id = uid('t');
    t.name = '新模板';
    t.builtin = false;
    t.sections.forEach((s) => (s.fields || []).forEach((f) => { f.id = uid('f'); }));
    return normalizeTpl(t);
  }

  function fillAuto(tpl, values, no, issuedAt) {
    const out = Object.assign({}, values || {});
    (tpl.sections || []).forEach((s) => (s.fields || []).forEach((f) => {
      if (f.type === 'no') out[f.id] = no;
      if (f.type === 'time') out[f.id] = issuedAt;
    }));
    return out;
  }

  global.TPL = {
    TYPES, ROLES, defaultTemplate, emptyTemplate, normalizeTpl, clone, uid,
    fillAuto,
    TIME_OPTIONS, CITY_OPTIONS, CONTENT_OPTIONS, PAYMENT_OPTIONS
  };
})(window);
