/* Admin v4 — follow user's mock.
   Requires Worker endpoints:
   /api/schema/{user_profile|baseline|tuning}
   /api/ui/{user_profile|baseline|tuning}
   /api/preview
   /api/generate
   /api/presets , /api/presets/{id}, /api/presets/save , /api/presets/delete
*/

const $ = (sel) => document.querySelector(sel);

const state = {
  conn: { baseUrl: "", token: "" },
  schemas: { user_profile:null, baseline:null, tuning:null, ui_user:null, ui_baseline:null, ui_tuning:null },
  data: { user_profile:{}, baseline:{}, tuning:{} },
  presets: [],
  ui: { simpleMode:false, activeSecId:null },
};

function setStatus(msg){ $("#statusLine").textContent = msg || ""; }

function loadConn(){
  const saved = JSON.parse(localStorage.getItem("cc_admin_conn") || "{}");
  state.conn.baseUrl = saved.baseUrl || "https://content-creator.wuxiaofei1985.workers.dev";
  state.conn.token = saved.token || "";
  $("#workerBaseUrl").value = state.conn.baseUrl;
  $("#adminToken").value = state.conn.token;
}
function saveConn(){
  state.conn.baseUrl = $("#workerBaseUrl").value.trim().replace(/\/+$/, "");
  state.conn.token = $("#adminToken").value.trim();
  localStorage.setItem("cc_admin_conn", JSON.stringify(state.conn));
  setStatus("连接已保存");
}
function authHeaders(){
  const h = { "Content-Type": "application/json" };
  if (state.conn.token) h["Authorization"] = `Bearer ${state.conn.token}`;
  return h;
}
async function apiGet(path){
  const url = `${state.conn.baseUrl}${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}
async function apiPost(path, body){
  const url = `${state.conn.baseUrl}${path}`;
  const res = await fetch(url, { method:"POST", headers: authHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

/* deep get/set */
function deepGet(obj, path){
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts){
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function deepSet(obj, path, value){
  const parts = path.split(".");
  let cur = obj;
  for (let i=0;i<parts.length-1;i++){
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length-1]] = value;
}
function isNonEmpty(v){
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return true;
  if (typeof v === "boolean") return true;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return !!v;
}
function clamp(n, min, max){
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function el(tag, attrs = {}, children = []){
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k==="class") node.className = v;
    else if (k==="text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

/* Draft autosave */
function saveDraft(){
  try{ localStorage.setItem("cc_admin_draft_v4", JSON.stringify(state.data)); }catch(_){}
}
function loadDraft(){
  try{
    const raw = localStorage.getItem("cc_admin_draft_v4");
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object"){
      state.data.user_profile = obj.user_profile || state.data.user_profile;
      state.data.baseline = obj.baseline || state.data.baseline;
      state.data.tuning = obj.tuning || state.data.tuning;
      return true;
    }
  }catch(_){}
  return false;
}
function clearDraft(){
  localStorage.removeItem("cc_admin_draft_v4");
  setStatus("草稿已清除");
}
function markDirty(msg){
  saveDraft();
  setStatus(msg || "草稿中（自动保存）");
}

function collectPayload(){
  return { user_profile: state.data.user_profile||{}, baseline: state.data.baseline||{}, tuning: state.data.tuning||{} };
}

/* Sections index */
function buildSectionIndex(){
  const idx = [];
  const add = (moduleKey, uiSchema) => {
    const sections = (uiSchema && uiSchema.sections) ? uiSchema.sections : [];
    sections.forEach((sec, i)=>{
      idx.push({
        id: `${moduleKey}:${i}`,
        moduleKey,
        secIndex: i,
        title: sec.title || `Section ${i+1}`,
        subtitle: sec.subtitle || "",
        fields: sec.fields || [],
      });
    });
  };
  add("user_profile", state.schemas.ui_user);
  add("baseline", state.schemas.ui_baseline);
  add("tuning", state.schemas.ui_tuning);
  return idx;
}
function sectionHasSignal(sec){
  const dataObj = state.data[sec.moduleKey] || {};
  for (const f of sec.fields){
    const p = f.bind?.path;
    if (!p) continue;
    const v = deepGet(dataObj, p);
    if (isNonEmpty(v)) return true;
  }
  return false;
}

/* Render left list + editor */
function renderSectionList(){
  const mount = $("#secList");
  mount.innerHTML = "";
  const secs = buildSectionIndex();
  if (!state.ui.activeSecId && secs.length) state.ui.activeSecId = secs[0].id;

  for (const sec of secs){
    const active = sec.id === state.ui.activeSecId;
    const has = sectionHasSignal(sec);
    const item = el("div", { class: "secItem" + (active ? " secItem--active":"") });

    item.appendChild(el("div", { class:"secItem__chev", text: active && !state.ui.simpleMode ? "▾" : "▸" }));
    item.appendChild(el("div", { class:"secItem__title", text: sec.title }));
    item.appendChild(el("div", { class:"secItem__badge" + (has ? " secItem__badge--on":""), text: has ? "✓" : "" }));

    item.addEventListener("click", ()=>{
      state.ui.activeSecId = sec.id;
      renderLeft();
    });

    mount.appendChild(item);
  }
}

function renderFieldControl(moduleKey, field, dataObj){
  const bindPath = field.bind?.path;
  if (!bindPath) return null;

  const ctlType = field.control?.type || "text";
  const label = field.label || bindPath;
  const help = field.help || "";

  if (deepGet(dataObj, bindPath)===undefined && field.default!==undefined){
    deepSet(dataObj, bindPath, field.default);
  }

  let controlNode;

  if (ctlType==="select"){
    const sel = el("select");
    for (const opt of (field.control.options || [])){
      sel.appendChild(el("option", { value:String(opt.value), text: opt.label || String(opt.value) }));
    }
    sel.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
		sel.addEventListener("change", ()=>{
			deepSet(dataObj, bindPath, sel.value);

			// 平台切换：自动加载对应 schema pack（只影响 UI/schema，不强制清空用户已填数据）
			if (moduleKey === "user_profile" && bindPath === "platform"){
				state.data.user_profile = state.data.user_profile || {};
				state.data.user_profile.platform = sel.value;
				maybeSwitchPack(sel.value).catch(()=>{});
			}

			syncAllJsonFromState(); markDirty(); renderSectionList();
		});
    controlNode = el("div", { class:"ctl" }, [sel]);

  } else if (ctlType==="number"){
    const input = el("input", { type:"number", min: field.control.min ?? 0, max: field.control.max ?? 99999, step: field.control.step ?? 1 });
    input.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
    input.addEventListener("change", ()=>{
      const v = clamp(input.value, Number(input.min), Number(input.max));
      input.value = String(v);
      deepSet(dataObj, bindPath, v);
      syncAllJsonFromState(); markDirty(); renderSectionList();
    });
    controlNode = el("div", { class:"ctl" }, [input]);

  } else if (ctlType==="textarea"){
    const ta = el("textarea");
    ta.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
    ta.addEventListener("change", ()=>{
      deepSet(dataObj, bindPath, ta.value);
      syncAllJsonFromState(); markDirty(); renderSectionList();
    });
    controlNode = el("div", { class:"ctl" }, [ta]);

  } else if (ctlType==="switch"){
    const chk = el("input", { type:"checkbox" });
    chk.checked = !!(deepGet(dataObj, bindPath) ?? field.default);
    const lab = el("span", { class:"mini", text: chk.checked ? "ON":"OFF" });
    chk.addEventListener("change", ()=>{
      deepSet(dataObj, bindPath, !!chk.checked);
      lab.textContent = chk.checked ? "ON":"OFF";
      syncAllJsonFromState(); markDirty(); renderSectionList();
    });
    controlNode = el("div", { class:"ctl row" }, [chk, lab]);

  } else if (ctlType==="multicheck"){
    const cur = new Set(deepGet(dataObj, bindPath) || field.default || []);
    const options = field.control.options || [];
    const tags = el("div", { class:"tags" });
    for (const opt of options){
      const val = opt.value;
      const t = el("div", { class:"tag", text: opt.label || val });
      if (cur.has(val)) t.classList.add("tag--on");
      t.addEventListener("click", ()=>{
        if (cur.has(val)) cur.delete(val); else cur.add(val);
        t.classList.toggle("tag--on");
        deepSet(dataObj, bindPath, Array.from(cur));
        syncAllJsonFromState(); markDirty(); renderSectionList();
      });
      tags.appendChild(t);
    }
    controlNode = el("div", { class:"ctl" }, [tags]);

  } else if (ctlType==="taglist"){
    const input = el("input", { type:"text", placeholder:"用逗号分隔：例如 词1,词2,词3" });
    const v = deepGet(dataObj, bindPath);
    input.value = Array.isArray(v) ? v.join(",") : (v ? String(v) : "");
    input.addEventListener("change", ()=>{
      const arr = input.value.split(",").map(s=>s.trim()).filter(Boolean);
      deepSet(dataObj, bindPath, arr);
      syncAllJsonFromState(); markDirty(); renderSectionList();
    });
    controlNode = el("div", { class:"ctl" }, [input]);

  } else if (ctlType==="kv_percent"){
    const keys = field.control.keys || [];
    const obj = deepGet(dataObj, bindPath) || field.default || {};
    const grid = el("div", { class:"ctl" });
    for (const k of keys){
      const row = el("div", { class:"kv" });
      row.appendChild(el("div", { class:"mini", text:k }));
      const input = el("input", { type:"number", min:0, max:100, step:1 });
      input.value = String(obj[k] ?? 0);
      input.addEventListener("change", ()=>{
        const v = clamp(input.value, 0, 100);
        input.value = String(v);
        obj[k] = v;
        deepSet(dataObj, bindPath, obj);
        syncAllJsonFromState(); markDirty(); renderSectionList();
      });
      row.appendChild(input);
      grid.appendChild(row);
    }
    controlNode = grid;

  } else {
    const input = el("input", { type:"text" });
    input.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
    input.addEventListener("change", ()=>{
      deepSet(dataObj, bindPath, input.value);
      syncAllJsonFromState(); markDirty(); renderSectionList();
    });
    controlNode = el("div", { class:"ctl" }, [input]);
  }

  const wrap = el("div", { class:"f" });
  wrap.appendChild(el("div", { class:"f__label", text: label }));
  if (help) wrap.appendChild(el("div", { class:"f__help", text: help }));
  wrap.appendChild(controlNode);
  return wrap;
}

function renderActiveSection(){
  const mount = $("#secEditor");
  mount.innerHTML = "";
  if (state.ui.simpleMode) return;

  const secs = buildSectionIndex();
  const sec = secs.find(s=>s.id===state.ui.activeSecId) || secs[0];
  if (!sec) return;

  const dataObj = state.data[sec.moduleKey] || {};
  const secEl = el("div", { class:"section" });
  secEl.appendChild(el("div", { class:"section__title", text: sec.title }));
  if (sec.subtitle) secEl.appendChild(el("div", { class:"section__sub", text: sec.subtitle }));

  for (const field of sec.fields){
    const node = renderFieldControl(sec.moduleKey, field, dataObj);
    if (node) secEl.appendChild(node);
  }
  mount.appendChild(secEl);
}

function renderLeft(){
  renderSectionList();
  renderActiveSection();
  syncAllJsonFromState();
}

/* JSON mode */
function syncAllJsonFromState(){
  $("#json_all").value = JSON.stringify(collectPayload(), null, 2);
}
function syncStateFromAllJson(){
  try{
    const obj = JSON.parse($("#json_all").value || "{}");
    state.data.user_profile = obj.user_profile || {};
    state.data.baseline = obj.baseline || {};
    state.data.tuning = obj.tuning || {};
    saveDraft();
    setStatus("已同步 JSON（草稿中）");
    renderLeft();
  }catch(e){
    setStatus(`JSON 解析失败：${e.message}`);
  }
}

function setupSeg(){
  document.querySelectorAll(".seg__btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      btn.parentElement.querySelectorAll(".seg__btn").forEach(b=>b.classList.remove("seg__btn--active"));
      btn.classList.add("seg__btn--active");
      const pane = btn.dataset.pane;
      $("#pane_left_form").classList.toggle("pane--active", pane==="form");
      $("#pane_left_json").classList.toggle("pane--active", pane==="json");
    });
  });
  $("#json_all").addEventListener("keydown", (e)=>{ if (e.ctrlKey && e.key==="Enter") syncStateFromAllJson(); });
  $("#json_all").addEventListener("blur", ()=> syncStateFromAllJson());
}

function setupAcc(){
  document.querySelectorAll(".acc__head").forEach(h=>{
    h.addEventListener("click", ()=>{
      const acc = h.closest(".acc");
      acc.classList.toggle("acc--collapsed");
    });
  });
}

/* Load schemas + presets */
async function loadSchemas(platform){
  const p = (platform || state.data.user_profile?.platform || "xiaohongshu");
  setStatus(`加载 schema pack... (${p})`);
  const pack = await apiGet(`/api/ui/schema?platform=${encodeURIComponent(p)}`);

  // 方案A：ui_schema 同时作为渲染用的 schema（包含 type/enum/default 等）
  state.schemas.user_profile = pack.user_profile_schema;
  state.schemas.baseline = pack.baseline_schema;
  state.schemas.tuning = pack.tuning_schema;
  state.schemas.pack_name = pack.pack || "";

  // 与旧渲染逻辑兼容：ui_* 指向同一个 schema
  state.schemas.ui_user = pack.user_profile_schema;
  state.schemas.ui_baseline = pack.baseline_schema;
  state.schemas.ui_tuning = pack.tuning_schema;

  // 首次初始化时才填默认值；切包时尽量保留用户已有输入
  if (!state.__hasInitData) {
    state.data.user_profile = {};
    state.data.baseline = (pack.baseline_schema && pack.baseline_schema.default_payload) ? pack.baseline_schema.default_payload : {};
    state.data.tuning = { text: "" };
    state.__hasInitData = true;
  }

  const usedDraft = loadDraft();
  renderLeft();
  setStatus(usedDraft ? "已加载草稿" : "已加载空表单");
}

// 方案A：无预设。保留占位避免旧按钮/旧逻辑报错。
async function loadPresets(){
  return;
}

let __switchPackLock = false;
async function maybeSwitchPack(nextPlatform){
  if (__switchPackLock) return;
  const current = state.data.user_profile?.platform || "xiaohongshu";
  const next = (nextPlatform || current || "xiaohongshu");
  if (next === current && state.schemas.pack_name) return;

  __switchPackLock = true;
  try{
    await loadSchemas(next);
  } finally {
    __switchPackLock = false;
  }
}


async function presetSave(){
  const name = ($("#presetName").value || "").trim();
  if (!name) return setStatus("请填写预设名称");
  setStatus("保存预设...");
  const res = await apiPost("/api/presets/save", { name, payload: collectPayload() });
    $("#presetSelect").value = res.id;
  setStatus("预设已保存");
}
async function presetLoad(){
  const id = $("#presetSelect").value;
  if (!id) return setStatus("请选择预设");
  setStatus("加载预设...");
  const res = await apiGet(`/api/presets/${encodeURIComponent(id)}`);
  const p = res.preset;
  $("#presetName").value = p.name || "";
  const payload = JSON.parse(p.payload_json || "{}");
  state.data.user_profile = payload.user_profile || {};
  state.data.baseline = payload.baseline || {};
  state.data.tuning = payload.tuning || {};
  renderLeft();
  setStatus("预设已加载");
}
async function presetDelete(){
  const id = $("#presetSelect").value;
  if (!id) return setStatus("请选择预设");
  setStatus("删除预设...");
  await apiPost("/api/presets/delete", { id });
  $("#presetName").value = "";
    setStatus("预设已删除");
}


async function previewPrompt(){
  setStatus("预览脚本...");
  const payload = collectPayload();
  const p = payload.user_profile?.platform || "xiaohongshu";
  await maybeSwitchPack(p);

  const res = await apiPost("/api/preview", payload);
  $("#promptText").value = res.prompt_text || "";
  setStatus("预览就绪");
}

async function generate(){
  setStatus("生成中...");
  const payload = collectPayload();
  const p = payload.user_profile?.platform || "xiaohongshu";
  await maybeSwitchPack(p);

  const res = await apiPost("/api/generate", payload);
  $("#promptText").value = res.prompt_text || "";
  const out = res.output_json ?? res.output ?? null;
  if (typeof out === "string") {
    $("#outputText").value = out;
  } else if (out != null) {
    try{
      $("#outputText").value = JSON.stringify(out, null, 2);
    }catch(e){
      $("#outputText").value = String(out);
    }
  } else {
    $("#outputText").value = "";
  }
  setStatus("生成完成");
}

function setupButtons(){
  $("#btnSaveConn").addEventListener("click", saveConn);
  $("#btnReloadSchemas").addEventListener("click", async ()=>{
    try{ await loadSchemas(); await loadPresets(); }catch(e){ setStatus(`重新加载失败：${e.message}`); }
  });
  $("#btnPreview").addEventListener("click", async ()=>{ try{ await previewPrompt(); }catch(e){ setStatus(`预览失败：${e.message}`); } });
  $("#btnGenerate").addEventListener("click", async ()=>{ try{ await generate(); }catch(e){ setStatus(`生成失败：${e.message}`); } });

  $("#btnPresetSave").addEventListener("click", async ()=>{ try{ await presetSave(); }catch(e){ setStatus(`保存失败：${e.message}`); } });
  $("#btnPresetLoad").addEventListener("click", async ()=>{ try{ await presetLoad(); }catch(e){ setStatus(`加载失败：${e.message}`); } });
  $("#btnPresetDelete").addEventListener("click", async ()=>{ try{ await presetDelete(); }catch(e){ setStatus(`删除失败：${e.message}`); } });

  $("#btnResetBaseline").addEventListener("click", ()=>{
    state.data.baseline = state.schemas.baseline?.default_payload || {};
    renderLeft();
    markDirty("已重置 Baseline（草稿中）");
  });

  $("#btnClearDraft").addEventListener("click", ()=> clearDraft());

  $("#btnSimpleMode").addEventListener("click", ()=>{
    state.ui.simpleMode = !state.ui.simpleMode;
    document.body.classList.toggle("mode-simple", state.ui.simpleMode);
    $("#btnSimpleMode").textContent = state.ui.simpleMode ? "全部模式" : "简洁模式";
    setStatus(state.ui.simpleMode ? "简洁模式：只显示导航" : "全部模式：可编辑字段");
    renderLeft();
  });
}

async function init(){
  loadConn();
  setupSeg();
  setupAcc();
  setupButtons();

  try{
    await loadSchemas();
        setStatus("就绪");
  }catch(e){
    setStatus(`初始化失败：${e.message}（检查 Worker 地址与 Token）`);
  }
}
init();
