const workerUrl = document.getElementById("workerUrl");
const token = document.getElementById("token");
const output = document.getElementById("output");
const jobs = document.getElementById("jobs");

const baselineContainer = document.getElementById("baseline");
const userProfile = document.getElementById("userProfile");

document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrl.value);
  localStorage.setItem("cc_token", token.value);
  alert("已保存");
};

workerUrl.value = localStorage.getItem("cc_url") || "";
token.value = localStorage.getItem("cc_token") || "";

// Load UI Schema + Render Form
document.getElementById("loadSchema").onclick = async () => {
  const res = await fetch(workerUrl.value + "/api/ui/baseline", {
    headers: { Authorization: "Bearer " + token.value }
  });
  const schema = await res.json();
  renderBaselineForm(schema);
};

// Render UI from schema
function renderBaselineForm(schema) {
  baselineContainer.innerHTML = "";
  const form = document.createElement("div");

  schema.sections.forEach(section => {
    const block = document.createElement("div");
    block.className = "card";

    const title = document.createElement("h3");
    title.textContent = section.title;
    block.appendChild(title);

    section.controls.forEach(control => {
      const wrapper = document.createElement("div");
      wrapper.style.marginBottom = "12px";

      const label = document.createElement("label");
      label.textContent = control.label;
      wrapper.appendChild(label);

      let input;

      // SELECT
      if (control.type === "select") {
        input = document.createElement("select");
        control.options.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          input.appendChild(o);
        });
      }

      // SLIDER
      if (control.type === "slider") {
        input = document.createElement("input");
        input.type = "range";
        input.min = control.min;
        input.max = control.max;
        input.value = control.default ?? control.min;
      }

      // CHECKBOX GROUP
      if (control.type === "checkbox_group") {
        input = document.createElement("div");
        control.options.forEach(opt => {
          const row = document.createElement("label");
          row.style.display = "block";

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = opt.value;
          cb.checked = opt.default || false;

          row.appendChild(cb);
          row.append(" " + opt.label);
          input.appendChild(row);
        });
      }

      input.dataset.path = control.bind_path;
      wrapper.appendChild(input);
      block.appendChild(wrapper);
    });

    form.appendChild(block);
  });

  baselineContainer.appendChild(form);
}

// Build baseline patch from UI
function collectBaselinePatch() {
  const patch = {};

  baselineContainer.querySelectorAll("[data-path]").forEach(el => {
    const path = el.dataset.path;

    // Checkbox group
    if (el.tagName === "DIV") {
      const values = [...el.querySelectorAll("input:checked")].map(i => i.value);
      setDeep(patch, path, values);
      return;
    }

    // Select / slider
    setDeep(patch, path, el.value);
  });

  return patch;
}

// Deep set helper
function setDeep(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  while (keys.length > 1) {
    const k = keys.shift();
    if (!cur[k]) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[0]] = value;
}

// Generate content
document.getElementById("generate").onclick = async () => {
  output.textContent = "生成中…";

  const patch = collectBaselinePatch();
  const payload = {
    user_profile: JSON.parse(userProfile.value || "{}"),
    tuning: { override_enabled: true, override_patch: patch }
  };

  const res = await fetch(workerUrl.value + "/api/generate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.value,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  output.textContent = await res.text();
};

// Jobs history
document.getElementById("loadJobs").onclick = async () => {
  const res = await fetch(workerUrl.value + "/api/jobs", {
    headers: { Authorization: "Bearer " + token.value }
  });
  jobs.textContent = await res.text();
};
