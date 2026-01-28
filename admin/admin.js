// -------------------- DOM --------------------
const workerUrlEl = document.getElementById("workerUrl");
const tokenEl = document.getElementById("token");
const outputEl = document.getElementById("output");
const jobsEl = document.getElementById("jobs");
const userProfileEl = document.getElementById("userProfile");
const baselineMount = document.getElementById("baselineMount");
const baselineMeta = document.getElementById("baselineMeta");
const connStatus = document.getElementById("connStatus");

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

function now() {
  return new Date().toLocaleString();
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

// -------------------- Load UI Schema --------------------
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
    setOutput("Schema 已加载并渲染");
  } catch (e) {
    baselineMount.innerHTML = "";
    setOutput("UI schema fetch failed: " + String(e?.message || e));
  }
};

// -------------------- Render --------------------
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
      sec.appendChild(renderField(field));
    });

    baselineMount.appendChild(sec);
  });
}

function renderField(field) {
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
    el.value = field.default != null
      ? String(field.default)
      : String(ctrl.options?.[0]?.value ?? "");
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
  setOutput("生成中…");

  const base = normBase(workerUrlEl.value);
  if (!base) {
    setOutput("Worker URL 为空");
    return;
  }

  const profile = safeJsonParse(userProfileEl.value || "{}");
  if (!profile) {
    setOutput("user_profile 不是合法 JSON");
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
    setOutput(text);
  } catch (e) {
    setOutput("generate fetch failed: " + String(e?.message || e));
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
