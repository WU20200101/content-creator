// -------------------- DOM --------------------
const workerUrlEl = document.getElementById("workerUrl");
const tokenEl = document.getElementById("token");
const outputEl = document.getElementById("output");
const jobsEl = document.getElementById("jobs");

const baselineMount = document.getElementById("baselineMount");
const baselineMeta = document.getElementById("baselineMeta");
const connStatus = document.getElementById("connStatus");

const userProfileMount = document.getElementById("userProfileMount");
const userProfileJsonEl = document.getElementById("userProfileJson");

// -------------------- Admin Schema (embedded) --------------------
// 你发的 JSON 太大，这里只嵌入 “user_form_schema.properties” 相关字段即可。
// （我们只做 user_profile 表单，baseline UI 仍然从 /api/ui/baseline 取）
const USER_PROFILE_SCHEMA = {
  module_id: "user_profile",
  title: "客户信息（可扩展）",
  type: "object",
  required: ["platform", "content_count", "word_count_range"],
  properties: {
    platform: { type: "string", title: "平台", enum: ["xiaohongshu","moments","weibo","douyin_copy","general"] },
    content_count: { type: "integer", title: "内容数量", minimum: 1, maximum: 200, default: 10 },
    word_count_range: {
      type: "object",
      title: "单条字数范围",
      required: ["min","max"],
      properties: {
        min: { type: "integer", minimum: 50, maximum: 2000, default: 300 },
        max: { type: "integer", minimum: 50, maximum: 2000, default: 500 }
      }
    },
    age_band: { type: "string", title: "客户年龄段", enum: ["18-25","26-30","31-35","36-40","40+"], default: "26-30" },
    education: { type: "string", title: "受教育程度", enum: ["high_school","college","bachelor","master","phd"], default: "bachelor" },
    account_age: { type: "string", title: "小红书运营时长", enum: ["<1m","1m","3m","6m","12m","24m+"], default: "3m" },
    creator_positioning: { type: "string", title: "个人定位", maxLength: 60, default: "" },
    keywords: { type: "array", title: "关键词", items: { type: "string", maxLength: 20 }, maxItems: 30, default: [] },
    target_audience: {
      type: "object",
      title: "面向受众",
      properties: {
        gender: { type: "string", enum: ["all","female","male"], default: "all" },
        age_band: { type: "string", enum: ["18-25","20-30","25-35","30-40","40+"], default: "20-30" },
        interest: { type: "string", title: "兴趣/领域", maxLength: 40, default: "" }
      }
    },
    tone_notes: { type: "string", title: "客户补充要求（自由文本）", maxLength: 800, default: "" },
    future_monetization: {
      type: "object",
      title: "未来变现方向（可选）",
      properties: {
        might_sell_products: { type: "boolean", default: false },
        product_types: { type: "array", items: { type: "string", maxLength: 20 }, default: [] },
        current_stage: { type: "string", enum: ["no_monetization","account_warming","soft_hint_only","lightly_promote","active_sales"], default: "account_warming" }
      }
    }
  }
};

// -------------------- Utils --------------------
function normBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}
function authHeaders() {
  const t = String(tokenEl.value || "").trim();
  return t ? { Authorization: "Bearer " + t } : {};
}
function setOutput(text) { outputEl.textContent = text || ""; }
function setConn(text) { connStatus.textContent = text || ""; }
function setMeta(text) { baselineMeta.textContent = text || ""; }

function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}
function now() { return new Date().toLocaleString(); }

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
}

// -------------------- Persist conn --------------------
document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrlEl.value);
  localStorage.setItem("cc_token", tokenEl.value);
  setConn("已保存 · " + now());
};

workerUrlEl.value = localStorage.getItem("cc_url") || "";
tokenEl.value = localStorage.getItem("cc_token") || "";

// -------------------- Ping --------------------
document.getElementById("ping").onclick = async () => {
  setConn("Ping…");
  const base = normBase(workerUrlEl.value);
  if (!base) { setConn("Worker URL 为空"); return; }

  try {
    const res = await fetch(base + "/", { method:"GET" });
    const txt = await res.text();
    setConn(`Ping ${res.status}: ${txt}`);
  } catch (e) {
    setConn("Ping failed: " + String(e?.message || e));
  }
};

// -------------------- USER PROFILE FORM --------------------
renderUserProfileForm(USER_PROFILE_SCHEMA);
syncUserProfileJson(); // init

function renderUserProfileForm(schema) {
  userProfileMount.innerHTML = "";

  // helper small sections
  const box = el("div", { });

  // platform
  box.appendChild(renderFieldFromSchema("platform", schema.properties.platform, "platform"));

  // content_count
  box.appendChild(renderFieldFromSchema("content_count", schema.properties.content_count, "content_count"));

  // word_count_range (min/max)
  box.appendChild(el("div", { className: "field" }, [
    el("div", { className: "f-label", text: schema.properties.word_count_range.title || "字数范围" }),
    el("div", { className: "ctrl" }, [
      el("div", { className: "row" }, [
        renderInlineNumber("word_count_range.min", "min", schema.properties.word_count_range.properties.min),
        renderInlineNumber("word_count_range.max", "max", schema.properties.word_count_range.properties.max)
      ])
    ])
  ]));

  // rest
  const keys = [
    "age_band","education","account_age","creator_positioning","keywords",
    "target_audience.gender","target_audience.age_band","target_audience.interest",
    "tone_notes",
    "future_monetization.might_sell_products","future_monetization.product_types","future_monetization.current_stage"
  ];

  keys.forEach(path => {
    const { prop, title } = resolveSchemaPath(schema, path);
    if (!prop) return;
    box.appendChild(renderFieldFromSchema(path, prop, title || path));
  });

  // actions
  const row = el("div", { className: "row" }, [
    el("button", { className: "btn", id: "resetUserProfile", type: "button", text: "重置为默认" }),
    el("button", { className: "btn btn-ghost", id: "copyUserProfile", type: "button", text: "复制 JSON" })
  ]);

  userProfileMount.appendChild(box);
  userProfileMount.appendChild(row);

  document.getElementById("resetUserProfile").onclick = () => {
    // re-render resets defaults
    renderUserProfileForm(USER_PROFILE_SCHEMA);
    syncUserProfileJson();
  };

  document.getElementById("copyUserProfile").onclick = async () => {
    try {
      await navigator.clipboard.writeText(userProfileJsonEl.value || "");
      setConn("已复制 user_profile JSON");
    } catch {
      setConn("复制失败（浏览器权限）");
    }
  };

  // listen changes
  userProfileMount.addEventListener("input", syncUserProfileJson);
  userProfileMount.addEventListener("change", syncUserProfileJson);
}

function resolveSchemaPath(rootSchema, path) {
  const parts = String(path).split(".");
  let cur = rootSchema;
  let lastTitle = "";
  for (const p of parts) {
    if (!cur) return { prop: null, title: "" };
    if (cur.type === "object" && cur.properties && cur.properties[p]) {
      cur = cur.properties[p];
      lastTitle = cur.title || p;
    } else {
      return { prop: null, title: "" };
    }
  }
  return { prop: cur, title: lastTitle };
}

function renderInlineNumber(dataPath, labelText, prop) {
  const wrap = el("div", { style: "flex:1" }, [
    el("div", { className: "hint", text: labelText }),
    (() => {
      const inp = el("input", {
        type: "number",
        value: prop.default ?? "",
        min: prop.minimum ?? "",
        max: prop.maximum ?? "",
        "data-upath": dataPath,
        "data-ukind": "number"
      });
      return inp;
    })()
  ]);
  return wrap;
}

function renderFieldFromSchema(path, prop, labelFallback) {
  const wrap = el("div", { className: "field" });
  wrap.appendChild(el("div", { className: "f-label", text: prop.title || labelFallback }));

  if (prop.description) {
    wrap.appendChild(el("div", { className: "f-help", text: prop.description }));
  }

  const ctrl = el("div", { className: "ctrl" });

  // enum -> select
  if (prop.enum) {
    const sel = el("select", { "data-upath": path, "data-ukind": "string" });
    prop.enum.forEach(v => sel.appendChild(el("option", { value: v, text: v })));
    sel.value = prop.default ?? prop.enum[0];
    ctrl.appendChild(sel);
  }
  // boolean -> checkbox
  else if (prop.type === "boolean") {
    const cb = el("input", { type:"checkbox", "data-upath": path, "data-ukind":"boolean" });
    cb.checked = !!prop.default;
    ctrl.appendChild(cb);
  }
  // integer/number -> number input
  else if (prop.type === "integer" || prop.type === "number") {
    const inp = el("input", {
      type:"number",
      value: prop.default ?? "",
      min: prop.minimum ?? "",
      max: prop.maximum ?? "",
      "data-upath": path,
      "data-ukind":"number"
    });
    ctrl.appendChild(inp);
  }
  // array -> taglist
  else if (prop.type === "array") {
    const ta = el("textarea", {
      rows:"2",
      placeholder:"用逗号分隔，例如：关键词1, 关键词2",
      "data-upath": path,
      "data-ukind":"taglist"
    });
    const def = Array.isArray(prop.default) ? prop.default : [];
    ta.value = def.join(", ");
    ctrl.appendChild(ta);
  }
  // string -> textarea (short string also ok)
  else {
    const ta = el("textarea", {
      rows: (prop.maxLength && prop.maxLength <= 80) ? "2" : "4",
      "data-upath": path,
      "data-ukind":"string"
    });
    ta.value = prop.default ?? "";
    ctrl.appendChild(ta);
  }

  wrap.appendChild(ctrl);
  return wrap;
}

function collectUserProfile() {
  // start from defaults
  const base = buildDefaultsFromSchema(USER_PROFILE_SCHEMA);

  // apply current inputs
  userProfileMount.querySelectorAll("[data-upath]").forEach(node => {
    const path = node.dataset.upath;
    const kind = node.dataset.ukind || "string";
    let value;

    if (kind === "boolean") value = !!node.checked;
    else if (kind === "number") value = Number(node.value);
    else if (kind === "taglist") {
      value = String(node.value || "").split(",").map(s => s.trim()).filter(Boolean);
    } else value = String(node.value ?? "");

    setDeep(base, path, value);
  });

  // required safety: ensure word_count_range min/max exist
  if (!base.word_count_range) base.word_count_range = { min: 300, max: 500 };
  if (typeof base.word_count_range.min !== "number") base.word_count_range.min = 300;
  if (typeof base.word_count_range.max !== "number") base.word_count_range.max = 500;

  return base;
}

function buildDefaultsFromSchema(schema) {
  if (!schema || schema.type !== "object") return {};
  const out = {};
  const props = schema.properties || {};
  for (const [k, p] of Object.entries(props)) {
    if (p.type === "object") out[k] = buildDefaultsFromSchema(p);
    else if (p.type === "array") out[k] = Array.isArray(p.default) ? p.default.slice() : [];
    else if (p.type === "boolean") out[k] = !!p.default;
    else if (p.type === "integer" || p.type === "number") out[k] = (p.default != null) ? Number(p.default) : 0;
    else out[k] = (p.default != null) ? p.default : "";
  }
  return out;
}

function syncUserProfileJson() {
  const obj = collectUserProfile();
  userProfileJsonEl.value = JSON.stringify(obj, null, 2);
}

// -------------------- BASELINE UI (from worker) --------------------
document.getElementById("loadSchema").onclick = async () => {
  setOutput("");
  setMeta("");
  baselineMount.innerHTML = "加载中…";

  const base = normBase(workerUrlEl.value);
  if (!base) {
    baselineMount.innerHTML = "";
    setOutput("Worker URL 为空");
    return;
  }

  try {
    const res = await fetch(base + "/api/ui/baseline", {
      method: "GET",
      headers: { ...authHeaders() }
    });

    const text = await res.text();
    if (!res.ok) {
      baselineMount.innerHTML = "";
      setOutput(`UI schema load failed: ${res.status}\n${text}`);
      return;
    }

    const ui = safeJsonParse(text);
    if (!ui) {
      baselineMount.innerHTML = "";
      setOutput(`UI schema JSON parse failed\n${text.slice(0, 1000)}`);
      return;
    }

    renderBaselineUI(ui);
    setMeta(`ui_schema_version: ${ui.ui_schema_version || "-"} · sections: ${(ui.sections || []).length}`);
    setOutput("Baseline UI 已加载并渲染");
  } catch (e) {
    baselineMount.innerHTML = "";
    setOutput("UI schema fetch failed: " + String(e?.message || e));
  }
};

function renderBaselineUI(ui) {
  baselineMount.innerHTML = "";

  (ui.sections || []).forEach(section => {
    const sec = document.createElement("div");
    sec.className = "section";

    const t = document.createElement("div");
    t.className = "section-title";
    t.textContent = section.title || section.section_id || "Section";
    sec.appendChild(t);

    if (section.subtitle) {
      const sub = document.createElement("div");
      sub.className = "section-sub";
      sub.textContent = section.subtitle;
      sec.appendChild(sub);
    }

    (section.fields || []).forEach(field => {
      sec.appendChild(renderBaselineField(field));
    });

    baselineMount.appendChild(sec);
  });
}

function renderBaselineField(field) {
  const wrap = document.createElement("div");
  wrap.className = "field";

  const label = document.createElement("div");
  label.className = "f-label";
  label.textContent = field.label || field.field_id || "field";
  wrap.appendChild(label);

  if (field.help) {
    const help = document.createElement("div");
    help.className = "f-help";
    help.textContent = field.help;
    wrap.appendChild(help);
  }

  const ctrlWrap = document.createElement("div");
  ctrlWrap.className = "ctrl";
  wrap.appendChild(ctrlWrap);

  const ctrl = field.control || {};
  const bindPath = field.bind?.path;
  if (!bindPath) {
    const warn = document.createElement("div");
    warn.style.color = "#b45309";
    warn.textContent = "⚠ bind.path missing";
    ctrlWrap.appendChild(warn);
    return wrap;
  }

  let el;

  if (ctrl.type === "select") {
    el = document.createElement("select");
    (ctrl.options || []).forEach(opt => {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label ?? String(opt.value);
      el.appendChild(o);
    });
    el.value = field.default != null ? String(field.default) : String(ctrl.options?.[0]?.value ?? "");
    el.dataset.kind = "string";
  }

  else if (ctrl.type === "slider") {
    const row = document.createElement("div");
    row.className = "slider-row";

    el = document.createElement("input");
    el.type = "range";
    el.min = ctrl.min ?? 0;
    el.max = ctrl.max ?? 100;
    el.step = ctrl.step ?? 1;
    el.value = field.default ?? el.min;
    el.dataset.kind = "number";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = el.value;
    el.oninput = () => (badge.textContent = el.value);

    row.appendChild(el);
    row.appendChild(badge);
    ctrlWrap.appendChild(row);

    el.dataset.path = bindPath;
    return wrap;
  }

  else if (ctrl.type === "number") {
    el = document.createElement("input");
    el.type = "number";
    el.min = ctrl.min ?? "";
    el.max = ctrl.max ?? "";
    el.step = ctrl.step ?? "1";
    el.value = field.default ?? "";
    el.dataset.kind = "number";
  }

  else if (ctrl.type === "switch") {
    el = document.createElement("input");
    el.type = "checkbox";
    el.checked = !!field.default;
    el.dataset.kind = "boolean";
  }

  else if (ctrl.type === "multicheck") {
    el = document.createElement("div");
    el.dataset.kind = "array";

    (ctrl.options || []).forEach(opt => {
      const row = document.createElement("label");
      row.style.display = "block";
      row.style.marginTop = "8px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = String(opt.value);

      const def = field.default || [];
      cb.checked = Array.isArray(def) && def.map(String).includes(String(opt.value));

      row.appendChild(cb);
      row.append(" " + (opt.label ?? opt.value));
      el.appendChild(row);
    });
  }

  else if (ctrl.type === "taglist") {
    el = document.createElement("textarea");
    el.rows = 3;
    const def = field.default || [];
    el.value = Array.isArray(def) ? def.join(", ") : String(def || "");
    el.dataset.kind = "taglist";
  }

  else if (ctrl.type === "kv_percent") {
    el = document.createElement("textarea");
    el.rows = 4;
    el.value = JSON.stringify(field.default || {}, null, 2);
    el.dataset.kind = "json";
  }

  else {
    el = document.createElement("textarea");
    el.rows = 3;
    el.value = field.default == null ? "" : JSON.stringify(field.default);
    el.dataset.kind = "json";
  }

  el.dataset.path = bindPath;
  ctrlWrap.appendChild(el);
  return wrap;
}

// -------------------- Collect baseline patch --------------------
function collectBaselinePatch() {
  const patch = {};

  baselineMount.querySelectorAll("[data-path]").forEach(node => {
    const path = node.dataset.path;
    const kind = node.dataset.kind || "string";

    let value;

    if (kind === "boolean") value = !!node.checked;
    else if (kind === "number") value = Number(node.value);
    else if (kind === "array") value = [...node.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
    else if (kind === "taglist") value = String(node.value || "").split(",").map(s => s.trim()).filter(Boolean);
    else if (kind === "json") {
      const v = String(node.value || "");
      const parsed = safeJsonParse(v);
      value = parsed == null ? v : parsed;
    } else value = node.value;

    setDeep(patch, path, value);
  });

  return patch;
}

function setDeep(obj, path, value) {
  const keys = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

// -------------------- Generate --------------------
document.getElementById("generate").onclick = async () => {
  setOutput("生成中…");

  const base = normBase(workerUrlEl.value);
  if (!base) { setOutput("Worker URL 为空"); return; }

  const user_profile = safeJsonParse(userProfileJsonEl.value);
  if (!user_profile) { setOutput("user_profile JSON 生成失败"); return; }

  const patch = collectBaselinePatch();
  const payload = {
    user_profile,
    tuning: { override_enabled: true, override_patch: patch }
  };

  try {
    const res = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setOutput(await res.text());
  } catch (e) {
    setOutput("generate fetch failed: " + String(e?.message || e));
  }
};

// -------------------- Jobs --------------------
document.getElementById("loadJobs").onclick = async () => {
  const base = normBase(workerUrlEl.value);
  if (!base) { jobsEl.textContent = "Worker URL 为空"; return; }

  try {
    const res = await fetch(base + "/api/jobs", {
      method: "GET",
      headers: { ...authHeaders() }
    });

    jobsEl.textContent = await res.text();
  } catch (e) {
    jobsEl.textContent = "jobs fetch failed: " + String(e?.message || e);
  }
};
