const workerUrl = document.getElementById("workerUrl");
const token = document.getElementById("token");
const baselineMount = document.getElementById("baselineMount");
const userProfile = document.getElementById("userProfile");
const overrideText = document.getElementById("overrideText");
const output = document.getElementById("output");
const promptPreview = document.getElementById("promptPreview");

const presetName = document.getElementById("presetName");
const presetList = document.getElementById("presetList");

workerUrl.value = localStorage.getItem("cc_url") || "";
token.value = localStorage.getItem("cc_token") || "";

// Save connection
document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrl.value);
  localStorage.setItem("cc_token", token.value);
  alert("已保存");
};

// Load Baseline UI Schema
document.getElementById("loadSchema").onclick = async () => {
  baselineMount.innerHTML = "加载中…";

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/ui/baseline", {
    headers: { Authorization: "Bearer " + token.value }
  });

  const text = await res.text();
  if (!res.ok) {
    baselineMount.innerHTML = "加载失败\n" + text;
    return;
  }

  const ui = JSON.parse(text);
  renderBaselineUI(ui);
};

// Render Baseline
function renderBaselineUI(ui) {
  baselineMount.innerHTML = "";

  (ui.sections || []).forEach(section => {
    const card = document.createElement("div");
    card.className = "panel";

    const title = document.createElement("h3");
    title.textContent = section.title || section.section_id;
    card.appendChild(title);

    (section.fields || []).forEach(field => {
      card.appendChild(renderField(field));
    });

    baselineMount.appendChild(card);
  });
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.style.marginTop = "10px";

  const label = document.createElement("div");
  label.textContent = field.label || field.field_id;
  label.style.fontWeight = "600";
  wrap.appendChild(label);

  const bindPath = field.bind?.path;
  const ctrl = field.control || {};
  let el;

  if (ctrl.type === "select") {
    el = document.createElement("select");
    (ctrl.options || []).forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label || opt.value;
      el.appendChild(o);
    });
    el.value = field.default ?? "";
  }
  else {
    el = document.createElement("input");
    el.value = JSON.stringify(field.default ?? "");
  }

  el.dataset.path = bindPath;
  wrap.appendChild(el);
  return wrap;
}

// Collect Baseline Patch
function collectBaselinePatch() {
  const patch = {};

  baselineMount.querySelectorAll("[data-path]").forEach(el => {
    const path = el.dataset.path;
    setDeep(patch, path, el.value);
  });

  return patch;
}

function setDeep(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] ||= {};
    cur = cur[keys[i]];
  }
  cur[keys.at(-1)] = value;
}

// Prompt Preview
document.getElementById("previewPrompt").onclick = async () => {
  const profile = JSON.parse(userProfile.value || "{}");
  const patch = collectBaselinePatch();

  const body = {
    user_profile: profile,
    tuning: {
      override_enabled: true,
      override_patch: patch,
      override_text: overrideText.value
    }
  };

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/generate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.value,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ...body, preview_only: true })
  });

  promptPreview.textContent = await res.text();
};

// Generate
document.getElementById("generate").onclick = async () => {
  output.textContent = "生成中…";

  const profile = JSON.parse(userProfile.value || "{}");
  const patch = collectBaselinePatch();

  const payload = {
    user_profile: profile,
    tuning: {
      override_enabled: true,
      override_patch: patch,
      override_text: overrideText.value
    }
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

// Presets
document.getElementById("savePreset").onclick = () => {
  const presets = JSON.parse(localStorage.getItem("cc_presets") || "{}");

  presets[presetName.value] = {
    userProfile: userProfile.value,
    overrideText: overrideText.value
  };

  localStorage.setItem("cc_presets", JSON.stringify(presets));
  loadPresets();
};

document.getElementById("loadPresets").onclick = loadPresets;

function loadPresets() {
  presetList.innerHTML = "";
  const presets = JSON.parse(localStorage.getItem("cc_presets") || "{}");

  for (const name in presets) {
    const row = document.createElement("div");
    row.style.marginTop = "8px";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "载入 " + name;
    loadBtn.onclick = () => {
      userProfile.value = presets[name].userProfile;
      overrideText.value = presets[name].overrideText;
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "删除";
    delBtn.style.marginLeft = "6px";
    delBtn.onclick = () => {
      delete presets[name];
      localStorage.setItem("cc_presets", JSON.stringify(presets));
      loadPresets();
    };

    row.appendChild(loadBtn);
    row.appendChild(delBtn);
    presetList.appendChild(row);
  }
}
