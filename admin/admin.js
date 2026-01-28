const workerUrl = document.getElementById("workerUrl");
const token = document.getElementById("token");
const userProfile = document.getElementById("userProfile");
const baseline = document.getElementById("baseline");
const output = document.getElementById("output");
const jobs = document.getElementById("jobs");

document.getElementById("saveConn").onclick = () => {
  localStorage.setItem("cc_url", workerUrl.value);
  localStorage.setItem("cc_token", token.value);
  alert("已保存");
};

workerUrl.value = localStorage.getItem("cc_url") || "";
token.value = localStorage.getItem("cc_token") || "";

document.getElementById("loadSchema").onclick = async () => {
  const res = await fetch(workerUrl.value + "/api/schema", {
    headers: { Authorization: "Bearer " + token.value }
  });
  baseline.value = await res.text();
};

document.getElementById("generate").onclick = async () => {
  output.textContent = "生成中…";

  const payload = {
    user_profile: JSON.parse(userProfile.value),
    baseline: JSON.parse(baseline.value),
    tuning: { override_enabled:false, override_patch:{} }
  };

  const res = await fetch(workerUrl.value + "/api/generate", {
    method:"POST",
    headers:{
      Authorization:"Bearer " + token.value,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(payload)
  });

  output.textContent = await res.text();
};

document.getElementById("loadJobs").onclick = async () => {
  const res = await fetch(workerUrl.value + "/api/jobs", {
    headers:{ Authorization:"Bearer " + token.value }
  });
  jobs.textContent = await res.text();
};
