/* content-creator admin v2
   - fixes "Identifier already declared" by guarding double-load
   - renders 3 modules: user_profile (left), baseline (right), tuning (right)
   - prompt preview before sending
   - prompt presets CRUD in localStorage
*/

(function () {
  // 防止脚本被重复加载导致 const/let 重复声明
  if (window.__CC_ADMIN_V2_LOADED__) return;
  window.__CC_ADMIN_V2_LOADED__ = true;

  const $ = (sel) => document.querySelector(sel);

  const state = {
    schemas: null,
    ui: null,
    data: {
      user_profile: {},
      baseline: {},
      tuning: {}
    },
    selectedPresetId: null
  };

  // ---------- utils ----------
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function isObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function deepMerge(a, b) {
    // a <- b
    if (!isObject(a) || !isObject(b)) return deepClone(b);
    const out = deepClone(a);
    for (const k of Object.keys(b)) {
      const bv = b[k];
      if (isObject(bv) && isObject(out[k])) out[k] = deepMerge(out[k], bv);
      else out[k] = deepClone(bv);
    }
    return out;
  }

  function getByPath(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function setByPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!isObject(cur[p])) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function nowISO() {
    const d = new Date();
    return d.toISOString();
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  // ---------- schemas ----------
  async function loadSchemas() {
    const [schemaRes, uiRes] = await Promise.all([
      fetch("./schemas/admin_schema.json", { cache: "no-store" }),
      fetch("./schemas/ui_schema.json", { cache: "no-store" })
    ]);
    if (!schemaRes.ok) throw new Error("无法加载 admin_schema.json");
    if (!uiRes.ok) throw new Error("无法加载 ui_schema.json");
    state.schemas = await schemaRes.json();
    state.ui = await uiRes.json();

    // init defaults
    state.data.user_profile = deepClone(state.schemas.modules.user_profile.default || {});
    state.data.baseline = deepClone(state.schemas.modules.baseline.default || {});
    state.data.tuning = deepClone(state.schemas.modules.tuning.default || {});

    // ensure required core values exist
    if (!state.data.user_profile.word_count_range) state.data.user_profile.word_count_range = { min: 300, max: 500 };
  }

  // ---------- render controls ----------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(c);
    return node;
  }

  function renderSection(title, subtitle) {
    const box = el("div", { class: "section" });
    box.appendChild(el("h3", { text: title }));
    if (subtitle) box.appendChild(el("div", { class: "sub", text: subtitle }));
    return box;
  }

  function renderField(moduleKey, fieldDef) {
    const wrap = el("div", { class: "field" });
    wrap.appendChild(el("label", { text: fieldDef.label }));

    const bindPath = fieldDef.bind;
    const basePath = moduleKey + "." + bindPath;

    const ctl = fieldDef.control || { type: "text" };
    let input;

    const readValue = () => getByPath(state.data[moduleKey], bindPath);
    const writeValue = (val) => {
      setByPath(state.data[moduleKey], bindPath, val);
      // auto refresh prompt preview if already built once
      // (lightweight: do nothing; user can click refresh)
    };

    if (ctl.type === "select") {
      input = el("select");
      (ctl.options || []).forEach((opt) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const lab = typeof opt === "string" ? opt : (opt.label ?? opt.value);
        input.appendChild(el("option", { value: String(val), text: lab }));
      });
      input.value = String(readValue() ?? "");
      input.addEventListener("change", () => writeValue(input.value));
    } else if (ctl.type === "number") {
      input = el("input", { type: "number" });
      if (ctl.min != null) input.min = String(ctl.min);
      if (ctl.max != null) input.max = String(ctl.max);
      if (ctl.step != null) input.step = String(ctl.step);
      input.value = String(readValue() ?? 0);
      input.addEventListener("change", () => writeValue(Number(input.value)));
    } else if (ctl.type === "slider") {
      const row = el("div", { class: "control-inline" });
      input = el("input", { type: "range" });
      input.min = String(ctl.min ?? 0);
      input.max = String(ctl.max ?? 100);
      input.step = String(ctl.step ?? 1);
      input.value = String(readValue() ?? ctl.min ?? 0);

      const valBox = el("div", { class: "hint", text: String(input.value) });
      input.addEventListener("input", () => (valBox.textContent = String(input.value)));
      input.addEventListener("change", () => writeValue(Number(input.value)));

      row.appendChild(input);
      row.appendChild(valBox);
      wrap.appendChild(row);
      return wrap;
    } else if (ctl.type === "switch") {
      input = el("input", { type: "checkbox" });
      input.checked = Boolean(readValue());
      input.addEventListener("change", () => writeValue(Boolean(input.checked)));
    } else if (ctl.type === "textarea") {
      input = el("textarea", { rows: String(ctl.rows ?? 6), placeholder: ctl.placeholder ?? "" });
      input.value = String(readValue() ?? "");
      input.addEventListener("change", () => writeValue(input.value));
    } else if (ctl.type === "taglist") {
      const container = el("div");
      const tagsWrap = el("div", { class: "pills" });
      const inp = el("input", { type: "text", placeholder: ctl.placeholder ?? "回车添加" });

      function redraw() {
        tagsWrap.innerHTML = "";
        const arr = readValue() || [];
        arr.forEach((t, idx) => {
          const pill = el("span", { class: "pill", text: t });
          pill.title = "点击删除";
          pill.addEventListener("click", () => {
            const next = arr.slice();
            next.splice(idx, 1);
            writeValue(next);
            redraw();
          });
          tagsWrap.appendChild(pill);
        });
      }

      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = inp.value.trim();
          if (!v) return;
          const arr = (readValue() || []).slice();
          if (arr.length >= 30) return;
          if (!arr.includes(v)) arr.push(v);
          writeValue(arr);
          inp.value = "";
          redraw();
        }
      });

      container.appendChild(tagsWrap);
      container.appendChild(inp);
      wrap.appendChild(container);
      redraw();
      return wrap;
    } else if (ctl.type === "multicheck") {
      const container = el("div");
      const curArr = Array.isArray(readValue()) ? readValue() : [];
      const options = ctl.options || [];

      options.forEach((opt) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const lab = typeof opt === "string" ? opt : (opt.label ?? opt.value);

        const row = el("div", { class: "switch-row" });
        const cb = el("input", { type: "checkbox" });
        cb.checked = curArr.includes(val);
        cb.addEventListener("change", () => {
          const arr = Array.isArray(readValue()) ? readValue().slice() : [];
          const has = arr.includes(val);
          if (cb.checked && !has) arr.push(val);
          if (!cb.checked && has) arr.splice(arr.indexOf(val), 1);
          writeValue(arr);
        });
        row.appendChild(cb);
        row.appendChild(el("span", { class: "hint", text: lab }));
        container.appendChild(row);
      });

      wrap.appendChild(container);
      return wrap;
    } else {
      input = el("input", { type: "text", placeholder: ctl.placeholder ?? "" });
      input.value = String(readValue() ?? "");
      if (ctl.maxLength != null) input.maxLength = ctl.maxLength;
      input.addEventListener("change", () => writeValue(input.value));
    }

    wrap.appendChild(input);
    return wrap;
  }

  function renderForm(moduleKey, mountEl, formDef) {
    mountEl.innerHTML = "";
    (formDef.sections || []).forEach((sec) => {
      const sectionBox = renderSection(sec.title, sec.subtitle);
      (sec.fields || []).forEach((f) => {
        sectionBox.appendChild(renderField(moduleKey, f));
      });
      mountEl.appendChild(sectionBox);
    });
  }

  // ---------- prompt builder ----------
  function buildPromptText() {
    const schema = state.schemas;
    const sys = schema.prompt_templates.system;

    // merge directives
    const up = state.data.user_profile;
    const bl = state.data.baseline;
    const tn = state.data.tuning;

    const count = up.content_count ?? 10;
    const minW = up.word_count_range?.min ?? 300;
    const maxW = up.word_count_range?.max ?? 500;

    const tuningText = (tn.override_text || "").trim();
    const userTpl = schema.prompt_templates.user
      .replace("{{USER_PROFILE_JSON}}", JSON.stringify(up, null, 2))
      .replace("{{BASELINE_JSON}}", JSON.stringify(bl, null, 2))
      .replace("{{TUNING_OVERRIDE_TEXT}}", tuningText ? tuningText : "（空：不覆盖）")
      .replace("{{COUNT}}", String(count))
      .replace("{{MIN_WORDS}}", String(minW))
      .replace("{{MAX_WORDS}}", String(maxW));

    const final = `### SYSTEM\n${sys}\n\n### USER\n${userTpl}\n`;
    return final;
  }

  // ---------- presets (localStorage) ----------
  const PRESET_KEY = "cc_admin_prompt_presets_v2";

  function loadPresets() {
    try {
      return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function savePresets(list) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  }

  function renderPresetList() {
    const listEl = $("#presetList");
    const search = ($("#presetSearch").value || "").trim().toLowerCase();
    const presets = loadPresets();

    listEl.innerHTML = "";
    presets
      .filter((p) => {
        if (!search) return true;
        return (p.name || "").toLowerCase().includes(search);
      })
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
      .forEach((p) => {
        const item = el("div", { class: "preset-item" + (state.selectedPresetId === p.id ? " active" : "") });
        const meta = el("div", { class: "preset-meta" });
        meta.appendChild(el("div", { class: "preset-title", text: p.name || "(unnamed)" }));
        meta.appendChild(el("div", { class: "preset-time", text: "更新: " + formatTime(p.updated_at || p.created_at || "") }));
        item.appendChild(meta);

        const btnLoad = el("button", { class: "btn btn-ghost", text: "载入" });
        btnLoad.addEventListener("click", (e) => {
          e.stopPropagation();
          applyPreset(p.id);
        });
        item.appendChild(btnLoad);

        item.addEventListener("click", () => {
          state.selectedPresetId = p.id;
          $("#presetName").value = p.name || "";
          renderPresetList();
        });

        listEl.appendChild(item);
      });
  }

  function applyPreset(id) {
    const presets = loadPresets();
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    state.selectedPresetId = id;

    state.data.user_profile = deepClone(p.data.user_profile || state.data.user_profile);
    state.data.baseline = deepClone(p.data.baseline || state.data.baseline);
    state.data.tuning = deepClone(p.data.tuning || state.data.tuning);

    // re-render
    renderAllForms();
    $("#presetName").value = p.name || "";
    $("#promptPreview").textContent = p.data.prompt_text || buildPromptText();
    renderPresetList();
  }

  function upsertPreset(mode) {
    const name = ($("#presetName").value || "").trim();
    if (!name) {
      alert("请先填写预设名称");
      return;
    }
    const presets = loadPresets();

    const payload = {
      user_profile: deepClone(state.data.user_profile),
      baseline: deepClone(state.data.baseline),
      tuning: deepClone(state.data.tuning),
      prompt_text: buildPromptText()
    };

    if (mode === "new") {
      const id = "p_" + Math.random().toString(16).slice(2) + "_" + Date.now();
      presets.push({
        id,
        name,
        created_at: nowISO(),
        updated_at: nowISO(),
        data: payload
      });
      state.selectedPresetId = id;
    } else {
      if (!state.selectedPresetId) {
        alert("请先在列表里选中一个预设，再覆盖更新");
        return;
      }
      const idx = presets.findIndex((x) => x.id === state.selectedPresetId);
      if (idx < 0) return;
      presets[idx] = {
        ...presets[idx],
        name,
        updated_at: nowISO(),
        data: payload
      };
    }

    savePresets(presets);
    renderPresetList();
  }

  function deleteSelectedPreset() {
    if (!state.selectedPresetId) {
      alert("请先选中一个预设");
      return;
    }
    const presets = loadPresets();
    const next = presets.filter((p) => p.id !== state.selectedPresetId);
    savePresets(next);
    state.selectedPresetId = null;
    $("#presetName").value = "";
    renderPresetList();
  }

  // ---------- render all ----------
  function renderAllForms() {
    renderForm("user_profile", $("#mountUserProfile"), state.ui.forms.user_profile);
    renderForm("baseline", $("#mountBaseline"), state.ui.forms.baseline);
    renderForm("tuning", $("#mountTuning"), state.ui.forms.tuning);
  }

  // ---------- generate ----------
  async function generate() {
    const output = $("#outputBox");
    output.textContent = "";

    const workerUrl = ($("#workerUrl").value || "").trim();
    const adminKey = ($("#adminKey").value || "").trim();
    const path = ($("#generatePath").value || "/admin/generate").trim();
    const previewOnly = $("#previewOnly").checked;

    const promptText = buildPromptText();
    $("#promptPreview").textContent = promptText;

    if (previewOnly) {
      output.textContent = "✅ Preview Only 已开启：只生成 Prompt 预览，不发送请求。\n";
      return;
    }

    if (!workerUrl) {
      output.textContent = "❌ 请先填写 Worker Base URL\n";
      return;
    }

    const payload = {
      user_profile: state.data.user_profile,
      baseline: state.data.baseline,
      tuning: state.data.tuning,
      prompt_preview: promptText,
      meta: {
        client: "admin_v2",
        ts: nowISO()
      }
    };

    try {
      const res = await fetch(workerUrl.replace(/\/$/, "") + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey ? { "Authorization": "Bearer " + adminKey } : {})
        },
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      if (!res.ok) {
        output.textContent = `❌ 请求失败 (${res.status})\n` + text;
        return;
      }

      // 尝试 parse json，失败则直接显示文本
      try {
        const json = JSON.parse(text);
        output.textContent = JSON.stringify(json, null, 2);
      } catch {
        output.textContent = text;
      }
    } catch (err) {
      output.textContent = "❌ 网络/请求错误：\n" + String(err);
    }
  }

  // ---------- events ----------
  function bindEvents() {
    $("#btnReloadSchemas").addEventListener("click", async () => {
      try {
        await loadSchemas();
        renderAllForms();
        $("#outputBox").textContent = "✅ 已重新加载 schema & 重置默认值\n";
        $("#promptPreview").textContent = "";
        renderPresetList();
      } catch (e) {
        $("#outputBox").textContent = "❌ Schema 加载失败：\n" + String(e);
      }
    });

    $("#btnResetAll").addEventListener("click", async () => {
      await loadSchemas();
      renderAllForms();
      $("#promptPreview").textContent = "";
      $("#outputBox").textContent = "✅ 已重置为默认值\n";
    });

    $("#btnBuildPrompt").addEventListener("click", () => {
      $("#promptPreview").textContent = buildPromptText();
    });

    $("#btnCopyPrompt").addEventListener("click", async () => {
      const txt = $("#promptPreview").textContent || buildPromptText();
      try {
        await navigator.clipboard.writeText(txt);
        $("#outputBox").textContent = "✅ 已复制 Prompt 到剪贴板\n";
      } catch {
        $("#outputBox").textContent = "❌ 复制失败（浏览器权限限制）。你可以手动选中复制。\n";
      }
    });

    $("#btnGenerate").addEventListener("click", generate);

    $("#presetSearch").addEventListener("input", renderPresetList);

    $("#btnSavePresetNew").addEventListener("click", () => upsertPreset("new"));
    $("#btnUpdatePreset").addEventListener("click", () => upsertPreset("update"));
    $("#btnDeletePreset").addEventListener("click", deleteSelectedPreset);
  }

  // ---------- boot ----------
  async function boot() {
    try {
      await loadSchemas();
      renderAllForms();
      bindEvents();
      renderPresetList();
      $("#outputBox").textContent = "✅ Admin v2 已加载\n";
    } catch (e) {
      $("#outputBox").textContent = "❌ 初始化失败：\n" + String(e);
    }
  }

  boot();
})();
