/* Content-Creator Admin v2
 * - 3 modules: user_profile (left), baseline (right), tuning (right)
 * - Form UI + Raw JSON advanced mode (bidirectional sync)
 * - Prompt Preview (server-assembled) before generate
 * - Presets CRUD via D1 (server endpoints)
 * - Apple/iOS minimal white UI
 */

const $ = (sel) => document.querySelector(sel);

const state = {
  conn: { baseUrl: "", token: "" },
  schemas: {
    user_profile: null, baseline: null, tuning: null,
    ui_user: null, ui_baseline: null, ui_tuning: null,
  },
  data: { user_profile: {}, baseline: {}, tuning: {} },
  presets: [],
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
  $("#connHint").textContent = "已保存。";
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

/* ---------- tiny deep get/set ---------- */
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
    else if (k.startsWith("on") && typeof v==="function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}
function ensureFormStyles(){
  if ($("#__formstyle")) return;
  const style = document.createElement("style");
  style.id="__formstyle";
  style.textContent = `
    .section{ border:1px solid var(--line); border-radius:14px; padding:12px; margin-bottom:12px; }
    .section__title{ font-weight:750; font-size:13px; margin-bottom:4px; }
    .section__sub{ color:var(--muted); font-size:12px; margin-bottom:10px; }
    .f{ margin-bottom:12px; }
    .f__label{ font-size:12px; font-weight:650; }
    .f__help{ font-size:11px; color:var(--muted); margin:4px 0 6px; }
    .ctl{ width:100%; }
    .ctl input[type="text"], .ctl input[type="number"], .ctl textarea, .ctl select{
      width:100%; height:36px; border:1px solid var(--line); border-radius:12px; padding:0 10px; outline:none; background:#fff;
    }
    .ctl textarea{ height:auto; min-height:72px; padding:10px; }
    .ctl input:focus, .ctl textarea:focus, .ctl select:focus{
      border-color:rgba(0,122,255,.45); box-shadow:0 0 0 4px rgba(0,122,255,.10);
    }
    .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .mini{ font-size:11px; color:var(--muted); }
    .tags{ display:flex; gap:8px; flex-wrap:wrap; }
    .tag{ border:1px solid var(--line); border-radius:999px; padding:6px 10px; cursor:pointer; user-select:none; }
    .tag--on{ background:rgba(0,122,255,.10); border-color:rgba(0,122,255,.25); }
    .kv{ display:grid; grid-template-columns: 1fr 120px; gap:8px; }
  `;
  document.head.appendChild(style);
}

let dirty=false;
function markDirty(){ dirty=true; setStatus("● 未保存（可保存 preset）"); }

function syncJsonFromState(moduleKey){
  const ta = moduleKey==="user_profile" ? $("#json_user") : moduleKey==="baseline" ? $("#json_baseline") : $("#json_tuning");
  ta.value = JSON.stringify(state.data[moduleKey], null, 2);
}
function syncStateFromJson(moduleKey){
  const ta = moduleKey==="user_profile" ? $("#json_user") : moduleKey==="baseline" ? $("#json_baseline") : $("#json_tuning");
  try{
    const obj = JSON.parse(ta.value || "{}");
    state.data[moduleKey] = obj;
    dirty=true;
    setStatus("● JSON 已更新（未保存 preset）");

    if (moduleKey==="user_profile") renderModule("user_profile", $("#render_user"), state.schemas.ui_user, state.data.user_profile);
    if (moduleKey==="baseline") renderModule("baseline", $("#render_baseline"), state.schemas.ui_baseline, state.data.baseline);
    if (moduleKey==="tuning") renderModule("tuning", $("#render_tuning"), state.schemas.ui_tuning, state.data.tuning);
  }catch(e){
    setStatus(`JSON 解析失败：${e.message}`);
  }
}

function renderModule(moduleKey, mountEl, uiSchema, dataObj){
  ensureFormStyles();
  mountEl.innerHTML="";
  const sections = uiSchema.sections || [];
  for (const sec of sections){
    const secEl = el("div", { class:"section" });
    secEl.appendChild(el("div", { class:"section__title", text: sec.title || "" }));
    if (sec.subtitle) secEl.appendChild(el("div", { class:"section__sub", text: sec.subtitle }));

    for (const field of (sec.fields || [])){
      const bindPath = field.bind?.path;
      if (!bindPath) continue;

      const ctlType = field.control?.type || "text";
      const label = field.label || bindPath;
      const help = field.help || "";
      const curVal = deepGet(dataObj, bindPath);
      if (curVal===undefined && field.default!==undefined) deepSet(dataObj, bindPath, field.default);

      let controlNode;

      if (ctlType==="select"){
        const sel = el("select", {});
        for (const opt of (field.control.options || [])){
          sel.appendChild(el("option", { value:String(opt.value), text: opt.label || String(opt.value) }));
        }
        sel.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
        sel.addEventListener("change", ()=>{
          deepSet(dataObj, bindPath, sel.value);
          syncJsonFromState(moduleKey); markDirty();
        });
        controlNode = el("div", { class:"ctl" }, [sel]);

      } else if (ctlType==="slider"){
        const min = field.control.min ?? 0;
        const max = field.control.max ?? 100;
        const step = field.control.step ?? 1;
        const input = el("input", { type:"range", min, max, step });
        const valueLabel = el("div", { class:"mini", text:String(deepGet(dataObj, bindPath) ?? field.default ?? "") });
        input.value = String(deepGet(dataObj, bindPath) ?? field.default ?? min);
        input.addEventListener("input", ()=>{
          deepSet(dataObj, bindPath, Number(input.value));
          valueLabel.textContent = String(input.value);
          syncJsonFromState(moduleKey); markDirty();
        });
        controlNode = el("div", { class:"ctl" }, [input, valueLabel]);

      } else if (ctlType==="switch"){
        const chk = el("input", { type:"checkbox" });
        chk.checked = !!(deepGet(dataObj, bindPath) ?? field.default);
        const lab = el("span", { class:"mini", text: chk.checked ? "ON":"OFF" });
        chk.addEventListener("change", ()=>{
          deepSet(dataObj, bindPath, !!chk.checked);
          lab.textContent = chk.checked ? "ON":"OFF";
          syncJsonFromState(moduleKey); markDirty();
        });
        controlNode = el("div", { class:"ctl row" }, [chk, lab]);

      } else if (ctlType==="number"){
        const input = el("input", { type:"number", min: field.control.min ?? 0, max: field.control.max ?? 99999, step: field.control.step ?? 1 });
        input.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
        input.addEventListener("change", ()=>{
          const v = clamp(input.value, Number(input.min), Number(input.max));
          input.value = String(v);
          deepSet(dataObj, bindPath, v);
          syncJsonFromState(moduleKey); markDirty();
        });
        controlNode = el("div", { class:"ctl" }, [input]);

      } else if (ctlType==="textarea"){
        const ta = el("textarea", {});
        ta.value = String(deepGet(dataObj, bindPath) ?? field.default ?? "");
        ta.addEventListener("change", ()=>{
          deepSet(dataObj, bindPath, ta.value);
          syncJsonFromState(moduleKey); markDirty();
        });
        controlNode = el("div", { class:"ctl" }, [ta]);

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
            syncJsonFromState(moduleKey); markDirty();
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
          syncJsonFromState(moduleKey); markDirty();
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
            syncJsonFromState(moduleKey); markDirty();
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
          syncJsonFromState(moduleKey); markDirty();
        });
        controlNode = el("div", { class:"ctl" }, [input]);
      }

      const wrap = el("div", { class:"f" });
      wrap.appendChild(el("div", { class:"f__label", text: label }));
      if (help) wrap.appendChild(el("div", { class:"f__help", text: help }));
      wrap.appendChild(controlNode);

      secEl.appendChild(wrap);
    }

    mountEl.appendChild(secEl);
  }

  syncJsonFromState(moduleKey);
}

/* ---------- Tabs ---------- */
function setupSeg(){
  document.querySelectorAll(".seg__btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.dataset.target;
      const pane = btn.dataset.pane;

      btn.parentElement.querySelectorAll(".seg__btn").forEach(b=>b.classList.remove("seg__btn--active"));
      btn.classList.add("seg__btn--active");

      const formId = `#pane_${target}_form`;
      const jsonId = `#pane_${target}_json`;
      document.querySelector(formId).classList.toggle("pane--active", pane==="form");
      document.querySelector(jsonId).classList.toggle("pane--active", pane==="json");
    });
  });

  ["user","baseline","tuning"].forEach(t=>{
    const ta = $(`#json_${t}`);
    const key = t==="user" ? "user_profile" : t;
    ta.addEventListener("keydown", (e)=>{ if (e.ctrlKey && e.key==="Enter") syncStateFromJson(key); });
    ta.addEventListener("blur", ()=> syncStateFromJson(key));
  });
}

/* ---------- Data ---------- */
function collectPayload(){
  return {
    user_profile: state.data.user_profile || {},
    baseline: state.data.baseline || {},
    tuning: state.data.tuning || {},
  };
}

async function loadSchemas(){
  setStatus("加载 schemas...");
  const [userSchema, baselineSchema, tuningSchema, uiUser, uiBaseline, uiTuning] = await Promise.all([
    apiGet("/api/schema/user_profile"),
    apiGet("/api/schema/baseline"),
    apiGet("/api/schema/tuning"),
    apiGet("/api/ui/user_profile"),
    apiGet("/api/ui/baseline"),
    apiGet("/api/ui/tuning"),
  ]);

  state.schemas.user_profile = userSchema;
  state.schemas.baseline = baselineSchema;
  state.schemas.tuning = tuningSchema;
  state.schemas.ui_user = uiUser;
  state.schemas.ui_baseline = uiBaseline;
  state.schemas.ui_tuning = uiTuning;

  state.data.user_profile = userSchema.default_payload || {};
  state.data.baseline = baselineSchema.default_payload || {};
  state.data.tuning = tuningSchema.default_payload || {};

  renderModule("user_profile", $("#render_user"), uiUser, state.data.user_profile);
  renderModule("baseline", $("#render_baseline"), uiBaseline, state.data.baseline);
  renderModule("tuning", $("#render_tuning"), uiTuning, state.data.tuning);

  dirty=false;
  setStatus("schemas 已加载");
}

async function loadPresets(){
  const res = await apiGet("/api/presets");
  state.presets = res.rows || [];
  const sel = $("#presetSelect");
  sel.innerHTML = "";
  sel.appendChild(el("option", { value:"", text:"— 选择 preset —" }));
  for (const p of state.presets){
    sel.appendChild(el("option", { value:p.id, text:p.name }));
  }
}

async function previewPrompt(){
  setStatus("生成 prompt preview...");
  const res = await apiPost("/api/preview", collectPayload());
  $("#promptPreview").value = res.prompt || "";
  $("#previewMeta").textContent = res.meta ? JSON.stringify(res.meta) : "";
  setStatus("prompt preview 已生成（未调用 OpenAI）");
}

async function generate(){
  setStatus("生成中...");
  const res = await apiPost("/api/generate", collectPayload());
  $("#outputBox").value = typeof res.output === "string" ? res.output : JSON.stringify(res.output, null, 2);
  $("#jobMeta").textContent = `job_id: ${res.job_id || ""}`;
  setStatus("生成完成");
}

async function presetSave(){
  const name = ($("#presetName").value || "").trim();
  if (!name) return setStatus("请填写 preset 名称");
  setStatus("保存 preset...");
  const res = await apiPost("/api/presets/save", { name, payload: collectPayload() });
  await loadPresets();
  $("#presetSelect").value = res.id;
  dirty=false;
  setStatus("preset 已保存");
}
async function presetLoad(){
  const id = $("#presetSelect").value;
  if (!id) return setStatus("请选择 preset");
  setStatus("加载 preset...");
  const res = await apiGet(`/api/presets/${encodeURIComponent(id)}`);
  const p = res.preset;
  $("#presetName").value = p.name || "";
  const payload = JSON.parse(p.payload_json || "{}");
  state.data.user_profile = payload.user_profile || {};
  state.data.baseline = payload.baseline || {};
  state.data.tuning = payload.tuning || {};
  renderModule("user_profile", $("#render_user"), state.schemas.ui_user, state.data.user_profile);
  renderModule("baseline", $("#render_baseline"), state.schemas.ui_baseline, state.data.baseline);
  renderModule("tuning", $("#render_tuning"), state.schemas.ui_tuning, state.data.tuning);
  dirty=false;
  setStatus("preset 已加载");
}
async function presetDelete(){
  const id = $("#presetSelect").value;
  if (!id) return setStatus("请选择 preset");
  setStatus("删除 preset...");
  await apiPost("/api/presets/delete", { id });
  $("#presetName").value = "";
  await loadPresets();
  setStatus("preset 已删除");
}

function setupButtons(){
  $("#btnSaveConn").addEventListener("click", saveConn);
  $("#btnReloadSchemas").addEventListener("click", async ()=>{
    try{ await loadSchemas(); await loadPresets(); }catch(e){ setStatus(`Reload 失败：${e.message}`); }
  });
  $("#btnPreview").addEventListener("click", async ()=>{ try{ await previewPrompt(); }catch(e){ setStatus(`Preview 失败：${e.message}`); } });
  $("#btnGenerate").addEventListener("click", async ()=>{ try{ await generate(); }catch(e){ setStatus(`Generate 失败：${e.message}`); } });

  $("#btnPresetSave").addEventListener("click", async ()=>{ try{ await presetSave(); }catch(e){ setStatus(`Preset 保存失败：${e.message}`); } });
  $("#btnPresetLoad").addEventListener("click", async ()=>{ try{ await presetLoad(); }catch(e){ setStatus(`Preset 加载失败：${e.message}`); } });
  $("#btnPresetDelete").addEventListener("click", async ()=>{ try{ await presetDelete(); }catch(e){ setStatus(`Preset 删除失败：${e.message}`); } });

  $("#btnLoadBaselineDefaults").addEventListener("click", ()=>{
    state.data.baseline = state.schemas.baseline.default_payload || {};
    renderModule("baseline", $("#render_baseline"), state.schemas.ui_baseline, state.data.baseline);
    markDirty();
    setStatus("已加载 Baseline 默认值");
  });
}

async function init(){
  loadConn();
  setupSeg();
  setupButtons();
  try{
    await loadSchemas();
    await loadPresets();
    setStatus("就绪");
  }catch(e){
    setStatus(`初始化失败：${e.message}（请检查 Worker 地址与 Token）`);
  }
}
init();
