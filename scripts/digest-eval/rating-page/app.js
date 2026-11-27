const PAGE = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(PAGE_B64), (c) => c.charCodeAt(0))));
const DATA = PAGE.bills;
const QUESTIONS = PAGE.questions;
const app = document.getElementById("app");
const LETTERS = "ABCDEFGH";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return () => ((seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) >>> 0) / 4294967296); }
function shuffled(arr, seed) { const r = rng(seed); const a = arr.map((x, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let uid = "anon";
let db = null;
let doc = null;
let state = { answers: {} };
let step = { bill: -1, phase: "intro" };

function storageKey() { return PAGE.storageKey + ":" + uid; }
function loadLocal() { try { return JSON.parse(localStorage.getItem(storageKey()) || "null"); } catch { return null; } }
function saveLocal() { try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch {} }
let saving = Promise.resolve();
function save() {
  saveLocal();
  if (!doc) return;
  saving = saving.then(() => doc.set({ ...state, updated_at: new Date().toISOString() })).catch(() => showSaveError());
}
function showSaveError() { const n = document.getElementById("savenote"); if (n) { n.hidden = false; } }

// Each bill: which summary you read first (rotated so each source leads about equally), and the A–D order.
function plan(i) {
  const b = DATA[i];
  const pool = b.compare ?? b.entries.map((_, k) => k);
  const order = shuffled(pool, hash(uid + b.id)).map((k) => pool[k]);
  const first = (hash(uid) + i) % b.entries.length;
  return { b, order, first };
}

function summaryHTML(s) {
  if (s.crs) return `<p>${esc(s.crs)}</p>`;
  const who = (s.who_it_affects || []).map((w) => `<span class="chip">${esc(w)}</span>`).join("");
  const pts = (s.key_points || []).map((k) => `<li>${esc(typeof k === "string" ? k : k.text)}${k.section ? ` <span class="sec">${esc(k.section)}</span>` : ""}</li>`).join("");
  return `<h3>${esc(s.headline)}</h3><p>${esc(s.what_it_does)}</p>` +
    (who ? `<div class="label">Who it affects</div><div class="chips">${who}</div>` : "") +
    (pts ? `<div class="label">Key points</div><ul>${pts}</ul>` : "");
}

function rail() {
  const n = DATA.length;
  return `<div class="rail" aria-label="Progress">${Array.from({ length: n }, (_, i) => `<span class="${i < step.bill || (i === step.bill && step.phase === "compare") ? "on" : ""}"></span>`).join("")}</div>`;
}
function head(i) {
  const b = DATA[i];
  return `${rail()}<div class="bill"><div class="billno">${esc(b.label)} · bill ${i + 1} of ${DATA.length}</div><h2>${esc(b.title)}</h2></div>`;
}

function render() {
  app.classList.remove("fade"); void app.offsetWidth; app.classList.add("fade");
  const banner = db ? "" : `<p class="note warn">Your answers are saved in this browser only. Open this page signed in to claude.ai so they reach the shared results.</p>`;
  if (step.phase === "intro") {
    const done = Object.keys(state.answers).length;
    app.innerHTML = `<div class="eyebrow">trackcongress · summary rating · pilot</div>
      <h1>Which summary helps you understand the bill?</h1>
      <p>You'll go through ${DATA.length} real bills. For each one:</p>
      <ul><li><b>Read one summary</b> and answer a quick question about the bill. Answer from what the summary told you; "Not sure" is a fine answer.</li>
      <li><b>Compare ${DATA[0]?.compare?.length ?? 4} summaries</b> of the same bill and pick the one you'd want to read on the site.</li></ul>
      <p class="muted">Summaries are labeled by letter and shuffled; you won't see who wrote them until the end. About ${Math.round(DATA.length * 1.6)} minutes.</p>
      ${banner}
      <div class="row"><span class="muted">${done ? `${done} of ${DATA.length} done` : ""}</span>
      <button id="go">${done && done < DATA.length ? "Continue" : done === DATA.length ? "See results" : "Start"}</button></div>`;
    document.getElementById("go").onclick = () => {
      const next = DATA.findIndex((b) => !state.answers[b.id]?.favorite);
      if (next < 0) { step = { bill: -1, phase: "results" }; }
      else { step = { bill: next, phase: state.answers[DATA[next].id]?.choice !== undefined ? "compare" : "read" }; }
      render(); scrollTo(0, 0);
    };
    return;
  }
  if (step.phase === "read") {
    const { b, first } = plan(step.bill);
    const Q = QUESTIONS[b.id];
    const opts = shuffled(Q.o, hash(uid + b.id + "q"));
    app.innerHTML = `${head(step.bill)}
      <div class="label">Step 1 · Read this summary</div>
      <div class="card">${summaryHTML(b.entries[first].summary)}</div>
      <fieldset class="q" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:10px"><b>${esc(Q.q)}</b></legend>
      ${opts.map((oi) => `<label class="opt"><input type="radio" name="ans" id="ans-${oi}" value="${oi}"><span>${esc(Q.o[oi])}</span></label>`).join("")}
      <label class="opt"><input type="radio" name="ans" id="ans-unsure" value="-1"><span>Not sure from this summary</span></label></fieldset>
      <div class="row"><button class="ghost" id="back">Back</button><button id="next" disabled>Next: compare summaries</button></div>`;
    app.querySelectorAll('input[name="ans"]').forEach((r) => (r.onchange = () => (document.getElementById("next").disabled = false)));
    document.getElementById("back").onclick = () => { step = { bill: -1, phase: "intro" }; render(); };
    document.getElementById("next").onclick = () => {
      const v = Number(app.querySelector('input[name="ans"]:checked').value);
      state.answers[b.id] = { ...(state.answers[b.id] || {}), read: b.entries[first].src, choice: v, correct: v === Q.a, answered_at: new Date().toISOString() };
      save(); step.phase = "compare"; render(); scrollTo(0, 0);
    };
    return;
  }
  if (step.phase === "compare") {
    const { b, order } = plan(step.bill);
    const prev = state.answers[b.id] || {};
    app.innerHTML = `${head(step.bill)}
      <div class="label">Step 2 · Which would you want to read on the site?</div>
      <div class="grid">${order.map((ei, k) => `<div class="card"><span class="tag">Summary ${LETTERS[k]}</span>${summaryHTML(b.entries[ei].summary)}
        <label class="pick"><input type="radio" name="fav" id="fav-${k}" value="${ei}" ${prev.favorite === b.entries[ei].src ? "checked" : ""}> This one</label></div>`).join("")}</div>
      <label for="why"><b>Why?</b> <span class="muted">Optional, one line is plenty</span></label>
      <textarea id="why" placeholder="e.g. B said who pays; C was clearer but left out the deadline">${esc(prev.why || "")}</textarea>
      <p class="note" id="savenote" hidden>Couldn't save to the shared results just now. Your answers are kept in this browser; keep going.</p>
      <div class="row"><span></span><button id="next" ${prev.favorite ? "" : "disabled"}>${step.bill === DATA.length - 1 ? "Finish" : "Save and next bill"}</button></div>`;
    app.querySelectorAll('input[name="fav"]').forEach((r) => (r.onchange = () => (document.getElementById("next").disabled = false)));
    document.getElementById("next").onclick = () => {
      const ei = Number(app.querySelector('input[name="fav"]:checked').value);
      const letters = Object.fromEntries(order.map((e, k) => [LETTERS[k], b.entries[e].src]));
      state.answers[b.id] = { ...state.answers[b.id], favorite: b.entries[ei].src, why: document.getElementById("why").value.trim(), letters, picked_at: new Date().toISOString() };
      save();
      const next = DATA.findIndex((x) => !state.answers[x.id]?.favorite);
      step = next < 0 ? { bill: -1, phase: "results" } : { bill: next, phase: "read" };
      render(); scrollTo(0, 0);
    };
    return;
  }
  if (step.phase === "results") {
    const NAMES = PAGE.names;
    const rows = DATA.map((b) => {
      const a = state.answers[b.id] || {};
      const Q = QUESTIONS[b.id];
      const res = a.choice === -1 ? `<span class="muted">Not sure</span>` : a.correct ? `<span class="ok">Right</span>` : `<span class="no">Wrong</span>`;
      return `<tr><td><span class="billno">${esc(b.label)}</span></td><td>${esc(NAMES[a.read] || "—")}<br>${res}<div class="muted" style="font-size:.85rem">${esc(Q.o[Q.a])}</div></td><td>${esc(NAMES[a.favorite] || "—")}${a.why ? `<div class="muted" style="font-size:.85rem">“${esc(a.why)}”</div>` : ""}</td></tr>`;
    }).join("");
    app.innerHTML = `${rail()}<h1>Done. Thank you.</h1>
      <p>${db ? "Your answers are saved to the shared results." : "Your answers are saved in this browser only."} Here's who wrote what.</p>
      <div class="tablewrap"><table><thead><tr><th>Bill</th><th>Summary you read first · your answer</th><th>Your favorite</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row"><button class="ghost" id="redo">Change an answer</button></div>`;
    document.getElementById("redo").onclick = () => { step = { bill: 0, phase: "read" }; render(); scrollTo(0, 0); };
  }
}

render();
(async () => {
  const local = loadLocal();
  if (local?.answers) state = local;
  render();
  try {
    const user = await window.claude?.use?.("user");
    const me = user ? await user.id() : null;
    if (me) uid = me;
    db = me ? await window.claude.use("db") : null;
    if (db) {
      doc = db.doc("ratings/" + uid);
      const timer = setTimeout(() => {}, 10000);
      const snap = await doc.get().catch(() => null);
      clearTimeout(timer);
      const remote = snap && (snap.data ? snap.data() : snap);
      const fromLocal = loadLocal();
      if (remote?.answers && Object.keys(remote.answers).length >= Object.keys(fromLocal?.answers || {}).length) state = { answers: remote.answers };
      else if (fromLocal?.answers) { state = fromLocal; save(); }
    }
  } catch { db = null; }
  if (step.phase === "intro") render();
})();
