const workerUrl = document.getElementById("workerUrl");
const token = document.getElementById("token");
const output = document.getElementById("output");
const jobs = document.getElementById("jobs");

const baselineMount = document.getElementById("baselineMount"); // 你需要在html里加这个div
const userProfile = document.getElementById("userProfile");

document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrl.value);
  localStorage.setItem("cc_token", token.value);
  alert("已保存");
};

workerUrl.value = localStorage.getItem("cc_url") || "";
token.value = localStorage.getItem("cc_token") || "";

// ---- Load UI schema + render
document.getElementById("loadSchema").onclick = async () => {
  output.textContent = "";
  baselineMount.innerHTML = "加载中…";

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/ui/baseline", {
    headers: { Authorization: "Bearer " + token.value }
  });

  const text = await res.text();
  if (!res.ok) {
    baselineMount.innerHTML = "";
    output.textContent = `UI schema load failed: ${res.status}\n${text}`;
    return;
  }

  let ui;
  try { ui = JSON.parse(text); }
  catch (e) {
    baselineMount.innerHTML = "";
    output.textContent = `UI schema JSON parse failed\n${text.slice(0, 800)}`;
    return;
  }

  renderBaselineUI(ui);
};

// ---- Render
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
    h.textContent = section.title || section.section_id;
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
  label.textContent = field.label || field.field_id;
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
    el.value = field.default != null ? String(field.default) : (ctrl.options?.[0]?.value ?? "");
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

    el.dataset.path = bindPath;
    el.dataset.kind = "number";
    return wrap;
  }

  // number
  else if (ctrl.type === "number") {
    el = document.createElement("input");
    el.type = "number";
    el.min = ctrl.min ?? "";
    el.max = ctrl.max ?? "";
    el.step = ctrl.step ?? "1";
    el.value = field.default ?? "";
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

  // taglist（先用 textarea 简化，后面再做tag输入）
  else if (ctrl.type === "taglist") {
    el = document.createElement("textarea");
    el.rows = 3;
    const def = field.default || [];
    el.value = Array.isArray(def) ? def.join(", ") : String(def || "");
    el.dataset.kind = "taglist";
  }

  // kv_percent（先用 textarea 输入json，后面再做更漂亮控件）
  else if (ctrl.type === "kv_percent") {
    el = document.createElement("textarea");
    el.rows = 4;
    el.value = JSON.stringify(field.default || {}, null, 2);
    el.dataset.kind = "json";
  }

  else {
    el = document.createElement("textarea");
    el.rows = 3;
    el.value = JSON.stringify(field.default ?? null);
    el.dataset.kind = "json";
  }

  el.dataset.path = bindPath;

  // 默认 kind 推断
  if (!el.dataset.kind) {
    if (ctrl.type === "number") el.dataset.kind = "number";
    else if (ctrl.type === "select") el.dataset.kind = "string";
    else el.dataset.kind = "string";
  }

  wrap.appendChild(el);
  return wrap;
}

// ---- Collect patch (writes into baseline root)
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
      value = node.value.split(",").map(s => s.trim()).filter(Boolean);
    } else if (kind === "json") {
      try { value = JSON.parse(node.value); }
      catch { value = node.value; }
    } else {
      value = node.value;
    }

    setDeep(patch, path, value);
  });

  return patch;
}

function setDeep(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

// ---- Generate (tuning override patch)
document.getElementById("generate").onclick = async () => {
  output.textContent = "生成中…";

  let profile;
  try { profile = JSON.parse(userProfile.value || "{}"); }
  catch (e) {
    output.textContent = "user_profile 不是合法 JSON";
    return;
  }

  const patch = collectBaselinePatch();

  const payload = {
    user_profile: profile,
    tuning: { override_enabled: true, override_patch: patch }
  };

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/generate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.value,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  output.textContent = await res.text();
};

// ---- Jobs
document.getElementById("loadJobs").onclick = async () => {
  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/jobs", {
    headers: { Authorization: "Bearer " + token.value }
  });
  jobs.textContent = await res.text();
};
