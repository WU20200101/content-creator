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

// Save worker conn
document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrl.value);
  localStorage.setItem("cc_token", token.value);
  alert("Saved");
};

// Load schema
document.getElementById("loadSchema").onclick = async () => {
  baselineMount.innerHTML = "Loading…";

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/ui/baseline", {
    headers: { Authorization: "Bearer " + token.value }
  });

  const ui = await res.json();
  renderBaselineUI(ui);
};

// Render UI
function renderBaselineUI(ui) {
  baselineMount.innerHTML = "";

  (ui.sections || []).forEach(section => {
    const box = document.createElement("div");
    box.className = "panel";

    const h = document.createElement("h3");
    h.textContent = section.title;
    box.appendChild(h);

    (section.fields || []).forEach(f => box.appendChild(renderField(f)));
    baselineMount.appendChild(box);
  });
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.style.marginTop = "8px";

  const label = document.createElement("div");
  label.textContent = field.label;
  label.style.fontWeight = "600";
  wrap.appendChild(label);

  const el = document.createElement("input");
  el.value = JSON.stringify(field.default ?? "");
  el.dataset.path = field.bind?.path || "";

  wrap.appendChild(el);
  return wrap;
}

function collectBaselinePatch() {
  const patch = {};
  baselineMount.querySelectorAll("[data-path]").forEach(el => {
    setDeep(patch, el.dataset.path, el.value);
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

// Preview Prompt
document.getElementById("previewPrompt").onclick = async () => {
  const profile = JSON.parse(userProfile.value || "{}");
  const patch = collectBaselinePatch();

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/generate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.value,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      preview_only: true,
      user_profile: profile,
      tuning: { override_patch: patch, override_text: overrideText.value }
    })
  });

  const data = await res.json();
  promptPreview.textContent = data.prompt || JSON.stringify(data, null, 2);
};

// Generate
document.getElementById("generate").onclick = async () => {
  output.textContent = "Generating…";

  const profile = JSON.parse(userProfile.value || "{}");
  const patch = collectBaselinePatch();

  const res = await fetch(workerUrl.value.replace(/\/$/, "") + "/api/generate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.value,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user_profile: profile,
      tuning: { override_patch: patch, override_text: overrideText.value }
    })
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

    const btn = document.createElement("button");
    btn.textContent = name;
    btn.onclick = () => {
      userProfile.value = presets[name].userProfile;
      overrideText.value = presets[name].overrideText;
    };

    const del = document.createElement("button");
    del.textContent = "删除";
    del.style.marginLeft = "8px";
    del.onclick = () => {
      delete presets[name];
      localStorage.setItem("cc_presets", JSON.stringify(presets));
      loadPresets();
    };

    row.appendChild(btn);
    row.appendChild(del);
    presetList.appendChild(row);
  }
}
