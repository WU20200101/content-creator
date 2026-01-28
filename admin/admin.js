// -------------------- DOM --------------------
const workerUrlEl = document.getElementById("workerUrl");
const tokenEl = document.getElementById("token");
const outputEl = document.getElementById("output");
const jobsEl = document.getElementById("jobs");
const userProfileEl = document.getElementById("userProfile");

function mustEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in admin.html`);
  return el;
}

const baselineMount = mustEl("baselineMount");

// -------------------- Utils --------------------
function normBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function authHeaders() {
  const t = String(tokenEl.value || "").trim();
  return t ? { Authorization: "Bearer " + t } : {};
}

function setStatus(text) {
  outputEl.textContent = text || "";
}

function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// -------------------- Persist conn --------------------
document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrlEl.value);
  localStorage.setItem("cc_token", tokenEl.value);
  alert("已保存");
};

workerUrlEl.value = localStorage.getItem("cc_url") || "";
tokenEl.value = localStorage.getItem("cc_token") || "";

// -------------------- Load UI Schema --------------------
document.getElementById("loadSchema").onclick = async () => {
  setStatus("");
  baselineMount.innerHTML = "加载中…";

  const base = normBase(workerUrlEl.value);
  if (!base) {
    baselineMount.innerHTML = "";
    setStatus("Worker URL 为空");
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
      setStatus(`UI schema load failed: ${res.status}\n${text}`);
      return;
    }

    const ui = safeJsonParse(text);
    if (!ui) {
      baselineMount.innerHTML = "";
      setStatus(`UI schema JSON parse failed\n${text.slice(0, 1000)}`);
      return;
    }

    renderBaselineUI(ui);
    setStatus("Schema 已加载并渲染");
  } catch (e) {
    baselineMount.innerHTML = "";
    setStatus("UI schema fetch failed: " + String(e?.message || e));
  }
};

// -------------------- Render Baseline UI --------------------
function renderBaselineUI(ui) {
  baselineMount.innerHTML = "";

  const header = document.createElement("div");
  header.style.marginBottom = "10px";
  header.innerHTML = `<div style="opacity:.85">UI: <b>${ui.ui_schema_version || "-"}</b></div>`;
  baselineMount.appendChild(header);

  (ui.sections || []).forEach(section => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginTop = "12px";

    const h = document.createElement("h3");
    h.textContent = section.title || section.section_id || "Section";
    card.appendChild(h);

    if (section.subtitle) {
      const sub = document.createElement("div");
      sub.style.opacity = ".75";
      sub.style.margin = "6px 0 12px";
      sub.textContent = section.subtitle;
      card.appendChild(sub);
    }

    (section.fields || []).forEach(field => {
      card.appendChild(renderField(field));
    });

    baselineMount.appendChild(card);
  });
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.style.margin = "10px 0";

  const label = document.createElement("div");
  label.style.fontWeight = "600";
  label.textContent = field.label || field.field_id || "field";
  wrap.appendChild(label);

  if (field.help) {
    const help = document.createElement("div");
    help.style.opacity = ".7";
    help.style.fontSize = "12px";
    help.style.marginTop = "4px";
    help.textContent = field.help;
    wrap.appendChild(help);
  }

  const ctrl = field.control || {};
  const bindPath = field.bind?.path;
  if (!bindPath) {
    const warn = document.createElement("div");
    warn.style.color = "#ffcc66";
    warn.textContent = "⚠ bind.path missing";
    wrap.appendChild(warn);
    return wrap;
  }

  let el;

  // select
  if (ctrl.type === "select") {
    el = document.createElement("select");
    el.style.width = "100%";
    (ctrl.options || []).forEach(opt => {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label ?? String(opt.value);
      el.appendChild(o);
    });
    el.value = field.default != null
      ? String(field.default)
      : String(ctrl.options?.[0]?.value ?? "");
    el.dataset.kind = "string";
  }

  // slider
  else if (ctrl.type === "slider") {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    el = document.createElement("input");
    el.type = "range";
    el.min = ctrl.min ?? 0;
    el.max = ctrl.max ?? 100;
    el.step = ctrl.step ?? 1;
    el.value = field.default ?? el.min;

    const val = document.createElement("span");
    val.textContent = el.value;
    el.oninput = () => (val.textContent = el.value);

    row.appendChild(el);
    row.appendChild(val);
    wrap.appendChild(row);

    el.dataset.kind = "number";
  }

  // number
  else if (ctrl.type === "number") {
    el = document.createElement("input");
    el.type = "number";
    el.min = ctrl.min ?? "";
    el.max = ctrl.max ?? "";
    el.step = ctrl.step ?? "1";
    el.value = field.default ?? "";
    el.dataset.kind = "number";
  }

  // switch
  else if (ctrl.type === "switch") {
    el = document.createElement("input");
    el.type = "checkbox";
    el.checked = !!field.default;
    el.dataset.kind = "boolean";
  }

  // multicheck
  else if (ctrl.type === "multicheck") {
    el = document.createElement("div");
    el.dataset.kind = "array";
    (ctrl.options || []).forEach(opt => {
      const row = document.createElement("label");
      row.style.display = "block";
      row.style.marginTop = "6px";

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

  // taglist: comma separated
  else if (ctrl.type === "taglist") {
    el = document.createElement("textarea");
    el.rows = 3;
    const def = field.default || [];
    el.value = Array.isArray(def) ? def.join(", ") : String(def || "");
    el.dataset.kind = "taglist";
  }

  // kv_percent / json
  else if (ctrl.type === "kv_percent") {
    el = document.createElement("textarea");
    el.rows = 4;
    el.value = JSON.stringify(field.default || {}, null, 2);
    el.dataset.kind = "json";
  }

  // fallback
  else {
    el = document.createElement("textarea");
    el.rows = 3;
    el.value = field.default == null ? "" : JSON.stringify(field.default);
    el.dataset.kind = "json";
  }

  // bind
  el.dataset.path = bindPath;

  // default styling for controls created here
  if (el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    el.style.marginTop = "6px";
  }

  wrap.appendChild(el);
  return wrap;
}

// -------------------- Collect patch --------------------
function collectBaselinePatch() {
  const patch = {};

  baselineMount.querySelectorAll("[data-path]").forEach(node => {
    const path = node.dataset.path;
    const kind = node.dataset.kind || "string";

    let value;

    if (kind === "boolean") {
      value = !!node.checked;
    } else if (kind === "number") {
      value = Number(node.value);
    } else if (kind === "array") {
      value = [...node.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
    } else if (kind === "taglist") {
      value = String(node.value || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    } else if (kind === "json") {
      const v = String(node.value || "");
      const parsed = safeJsonParse(v);
      value = parsed == null ? v : parsed;
    } else {
      value = node.value;
    }

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
  setStatus("生成中…");

  const base = normBase(workerUrlEl.value);
  if (!base) {
    setStatus("Worker URL 为空");
    return;
  }

  const profileText = userProfileEl.value || "{}";
  const profile = safeJsonParse(profileText);
  if (!profile) {
    setStatus("user_profile 不是合法 JSON");
    return;
  }

  const patch = collectBaselinePatch();

  const payload = {
    user_profile: profile,
    tuning: { override_enabled: true, override_patch: patch }
  };

  try {
    const res = await fetch(base + "/api/generate", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    setStatus(text);
  } catch (e) {
    setStatus("generate fetch failed: " + String(e?.message || e));
  }
};

// -------------------- Jobs --------------------
document.getElementById("loadJobs").onclick = async () => {
  const base = normBase(workerUrlEl.value);
  if (!base) {
    jobsEl.textContent = "Worker URL 为空";
    return;
  }

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
