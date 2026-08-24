/* ============================================================================
   God's Eyes · Financial Model — B2C Homecare (Children)
   Rendering + interaction. Uses state/calcModel from script.js.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   Format helpers
   --------------------------------------------------------------------------- */
function fmtUSD(v, decimals) {
  decimals = decimals === undefined ? 0 : decimals;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v || 0);
  return sign + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtNum(v, decimals) {
  decimals = decimals === undefined ? 0 : decimals;
  return (v || 0).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPctNum(v, decimals) {
  decimals = decimals === undefined ? 1 : decimals;
  return (v * 100).toFixed(decimals) + "%";
}
function fmtCompact(v) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return sign + "$" + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + "k";
  return sign + "$" + abs.toFixed(0);
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

/* Chart colors (plain hex, not CSS vars, inside SVG for broader browser compatibility) */
const COLOR_SERIES_1 = "#2a78d6";
const COLOR_SERIES_2 = "#eb6834";
const COLOR_GRID = "#e1e0d9";
const COLOR_MUTED = "#898781";
const COLOR_BASELINE = "#c3c2b7";

/* ---------------------------------------------------------------------------
   Unified "view" — ONE control drives the KPI cards, both charts, the
   revenue-mix pie, AND the Monthly P&L section all at once:
     "total" -> whole 2-year plan (KPIs/charts use the 2-year total; the
                Monthly P&L section shows the compact Year1|Year2|2-Yr Total
                summary table instead of a per-month grid, since a 24-column
                table would need horizontal scrolling)
     1 or 2  -> that single year (KPIs/charts scoped to its 12 months; the
                Monthly P&L section shows that year's 12-month detail table)
   --------------------------------------------------------------------------- */
let currentView = "total"; // "total" | 1 | 2

function getViewSlice(model) {
  if (currentView === "total") {
    return { months: model.months, agg: model.total2yr, label: "2-Year Total" };
  }
  const idx = currentView - 1;
  return { months: model.months.slice(idx * 12, idx * 12 + 12), agg: model.years[idx], label: "Year " + currentView };
}

/* ---------------------------------------------------------------------------
   Simple field bindings (input id <-> state path)
   --------------------------------------------------------------------------- */
const SIMPLE_FIELDS = [
  { id: "volBase", path: "volume.baseVolume" },
  { id: "volGrowth", path: "volume.quarterlyGrowth", percent: true },
  { id: "volAnnualGrowth", path: "volume.annualGrowth", percent: true },
  { id: "volCapacity", path: "volume.capacityPerDayPerTeam" },
  { id: "volTeams", path: "volume.teams" },
  { id: "examFeePrimary", path: "revenue.examFeePrimary" },
  { id: "pCompanion", path: "revenue.pCompanion", percent: true },
  { id: "examFeeCompanion", path: "revenue.examFeeCompanion" },
  { id: "cvr", path: "revenue.cvr", percent: true },
  { id: "logisticsPerVisit", path: "costRates.logisticsPerVisit" },
  { id: "cogsPct", path: "costRates.cogsPct", percent: true },
  { id: "conservativeAdj", path: "scenario.conservativeAdj", percent: true },
  { id: "optimisticAdj", path: "scenario.optimisticAdj", percent: true },
  { id: "totalInvestment", path: "capital.totalInvestment" }
];

const PERCENT_LIST_FIELDS = { mix: ["share"], headcount: [], capex: [], fixedOverhead: [] };

/* Fixed categorical order for the revenue-mix pie chart (blue, aqua, yellow, magenta,
   violet, red, green — orange is skipped here since it already means "EBITDA" in the
   other chart on this page). Never cycled — categories beyond this list fall back to muted gray. */
const PIE_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948", "#008300"];
const PIE_OVERFLOW_COLOR = "#898781";

function roundForInput(v) {
  return Math.round(v * 10000) / 10000;
}

function setSimpleFieldValues() {
  SIMPLE_FIELDS.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;
    let v = getPath(state, f.path);
    if (f.percent) v = v * 100;
    el.value = roundForInput(v);
  });
}

function bindSimpleFields() {
  SIMPLE_FIELDS.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;
    el.addEventListener("input", () => {
      let v = parseFloat(el.value);
      if (isNaN(v)) v = 0;
      if (f.percent) v = v / 100;
      setPath(state, f.path, v);
      recalcAndRender();
    });
  });
}

/* ---------------------------------------------------------------------------
   Active-months toggle grid (holiday / closure modeling) — 24 months across
   2 years, rendered as 2 labeled groups of 12 so it still reads as "months
   within a year" instead of a wall of 24 undifferentiated buttons.
   --------------------------------------------------------------------------- */
function renderMonthActiveGrid() {
  const el = document.getElementById("monthActiveGrid");
  if (!el) return;
  const arr = state.volume.monthActive;
  let html = "";
  for (let y = 0; y < 2; y++) {
    html += `<div class="month-group"><div class="month-group-label">Year ${y + 1}</div><div class="month-toggle-grid">`;
    for (let mi = 0; mi < 12; mi++) {
      const idx = y * 12 + mi;
      const active = arr[idx];
      html += `<button type="button" class="month-toggle-btn ${active ? "" : "inactive"}" data-month-index="${idx}" title="${active ? "Operating — click to mark as closed" : "Closed (holiday) — click to reopen"}">M${mi + 1}</button>`;
    }
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

function bindMonthActiveGrid() {
  const el = document.getElementById("monthActiveGrid");
  if (!el) return;
  el.addEventListener("click", e => {
    const btn = e.target.closest(".month-toggle-btn");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-month-index"));
    state.volume.monthActive[idx] = !state.volume.monthActive[idx];
    renderMonthActiveGrid();
    recalcAndRender();
  });
}

/* ---------------------------------------------------------------------------
   Marketing monthly budget grid — 24 free $ inputs (2 years x 12), grouped
   the same way as the Active Months grid. Fixed schedule, not tied to
   revenue/volume, and deliberately NOT wired to the Active Months toggle
   (marketing keeps running through a closed month).
   --------------------------------------------------------------------------- */
function renderMarketingMonthlyGrid() {
  const el = document.getElementById("marketingMonthlyGrid");
  if (!el) return;
  const arr = state.marketing.monthlyBudget;
  let html = "";
  for (let y = 0; y < 2; y++) {
    html += `<div class="month-group"><div class="month-group-label">Year ${y + 1}</div><div class="month-budget-grid">`;
    for (let mi = 0; mi < 12; mi++) {
      const idx = y * 12 + mi;
      const val = arr[idx];
      html += `
        <div class="month-budget-field">
          <label for="mktM${idx + 1}">M${mi + 1}</label>
          <input type="number" step="100" id="mktM${idx + 1}" data-month-index="${idx}" class="marketing-month-input" value="${roundForInput(val)}">
        </div>
      `;
    }
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

function bindMarketingMonthlyGrid() {
  const el = document.getElementById("marketingMonthlyGrid");
  if (!el) return;
  el.addEventListener("input", e => {
    const t = e.target;
    if (!t.matches(".marketing-month-input")) return;
    const idx = Number(t.getAttribute("data-month-index"));
    let v = parseFloat(t.value);
    if (isNaN(v)) v = 0;
    state.marketing.monthlyBudget[idx] = v;
    recalcAndRender();
  });
}

/* ---------------------------------------------------------------------------
   Dynamic tables: mix / headcount / capex / fixedOverhead
   --------------------------------------------------------------------------- */
function renderMixRows() {
  const tbody = document.getElementById("mixRows");
  tbody.innerHTML = state.revenue.mix.map((row, i) => `
    <tr>
      <td><input type="text" data-list="mix" data-index="${i}" data-field="label" value="${escapeHtml(row.label)}"></td>
      <td class="col-share"><input type="number" step="0.1" data-list="mix" data-index="${i}" data-field="share" value="${roundForInput(row.share * 100)}"></td>
      <td class="col-price"><input type="number" step="0.1" data-list="mix" data-index="${i}" data-field="price" value="${roundForInput(row.price)}"></td>
      <td class="col-remove">${state.revenue.mix.length > 1 ? `<button class="row-remove-btn" data-remove="mix" data-index="${i}" type="button" title="Remove row">✕</button>` : ""}</td>
    </tr>
  `).join("");
}

function headcountRowTotalText(row) {
  const isExam = row.basis === "exam";
  return isExam
    ? fmtUSD(Number(row.count || 0) * Number(row.examRate || 0), 2) + "/exam"
    : fmtUSD(Number(row.count || 0) * Number(row.monthlyRate || 0)) + "/mo";
}

function renderHeadcountRows() {
  const tbody = document.getElementById("headcountRows");
  tbody.innerHTML = state.headcount.map((row, i) => {
    const isExam = row.basis === "exam";
    const rateField = isExam ? "examRate" : "monthlyRate";
    const rateValue = isExam ? row.examRate : row.monthlyRate;
    return `
    <tr>
      <td><input type="text" data-list="headcount" data-index="${i}" data-field="role" value="${escapeHtml(row.role)}"></td>
      <td class="col-basis-check"><input type="checkbox" data-list="headcount" data-index="${i}" data-field="basis" ${isExam ? "checked" : ""} title="Ticked = paid per child examined (a visit with a companion counts as 2 exams). Unticked = fixed monthly salary."></td>
      <td class="col-count"><input type="number" step="1" data-list="headcount" data-index="${i}" data-field="count" value="${roundForInput(row.count)}"></td>
      <td class="col-rate">
        <div class="rate-cell">
          <input type="number" step="${isExam ? "0.1" : "10"}" data-list="headcount" data-index="${i}" data-field="${rateField}" value="${roundForInput(rateValue)}">
          <span class="rate-unit">${isExam ? "$/exam" : "$/month"}</span>
        </div>
      </td>
      <td class="col-start">
        <div class="start-cell" title="Role costs $0 before this Year/Month — use it to phase in hires as volume grows">
          <span class="start-label">Y</span><input type="number" step="1" min="1" max="2" data-list="headcount" data-index="${i}" data-field="startYear" value="${roundForInput(row.startYear || 1)}">
          <span class="start-label">M</span><input type="number" step="1" min="1" max="12" data-list="headcount" data-index="${i}" data-field="startMonth" value="${roundForInput(row.startMonth || 1)}">
        </div>
      </td>
      <td class="col-amount" id="hcTotal-${i}">${headcountRowTotalText(row)}</td>
      <td class="col-remove">${state.headcount.length > 1 ? `<button class="row-remove-btn" data-remove="headcount" data-index="${i}" type="button" title="Remove row">✕</button>` : ""}</td>
    </tr>`;
  }).join("");
}

function updateHeadcountRowTotals() {
  state.headcount.forEach((row, i) => {
    const el = document.getElementById(`hcTotal-${i}`);
    if (el) el.textContent = headcountRowTotalText(row);
  });
}

function renderCapexRows() {
  const tbody = document.getElementById("capexRows");
  tbody.innerHTML = state.capital.capexItems.map((row, i) => `
    <tr>
      <td><input type="text" data-list="capex" data-index="${i}" data-field="label" value="${escapeHtml(row.label)}"></td>
      <td class="col-amount"><input type="number" step="100" data-list="capex" data-index="${i}" data-field="amount" value="${roundForInput(row.amount)}"></td>
      <td class="col-year"><input type="number" step="1" min="1" max="2" data-list="capex" data-index="${i}" data-field="year" value="${roundForInput(row.year || 1)}"></td>
      <td class="col-month"><input type="number" step="1" min="1" max="12" data-list="capex" data-index="${i}" data-field="month" value="${roundForInput(row.month)}"></td>
      <td class="col-remove">${state.capital.capexItems.length > 1 ? `<button class="row-remove-btn" data-remove="capex" data-index="${i}" type="button" title="Remove row">✕</button>` : ""}</td>
    </tr>
  `).join("");
}

function renderFixedOverheadRows() {
  const tbody = document.getElementById("fixedOverheadRows");
  tbody.innerHTML = state.fixedOverhead.map((row, i) => `
    <tr>
      <td><input type="text" data-list="fixedOverhead" data-index="${i}" data-field="label" value="${escapeHtml(row.label)}"></td>
      <td class="col-amount"><input type="number" step="10" data-list="fixedOverhead" data-index="${i}" data-field="amount" value="${roundForInput(row.amount)}"></td>
      <td class="col-remove">${state.fixedOverhead.length > 1 ? `<button class="row-remove-btn" data-remove="fixedOverhead" data-index="${i}" type="button" title="Remove row">✕</button>` : ""}</td>
    </tr>
  `).join("");
}

function listArrayFor(list) {
  if (list === "mix") return state.revenue.mix;
  if (list === "headcount") return state.headcount;
  if (list === "capex") return state.capital.capexItems;
  if (list === "fixedOverhead") return state.fixedOverhead;
  return null;
}

function bindDynamicTableEvents() {
  const body = document.getElementById("assumptionsBody");

  body.addEventListener("input", e => {
    const t = e.target;
    if (!t.matches("[data-list]")) return;
    const list = t.getAttribute("data-list");
    const idx = Number(t.getAttribute("data-index"));
    const field = t.getAttribute("data-field");
    const arr = listArrayFor(list);
    if (!arr || !arr[idx]) return;

    // The headcount "basis" checkbox swaps which rate field (monthlyRate vs
    // examRate) is shown/editable for that row, so it needs a full
    // re-render rather than just patching a value in place.
    if (t.type === "checkbox") {
      arr[idx][field] = t.checked ? "exam" : "month";
      if (list === "headcount") renderHeadcountRows();
      recalcAndRender();
      return;
    }

    let value;
    if (t.type === "number") {
      value = parseFloat(t.value);
      if (isNaN(value)) value = 0;
      if (PERCENT_LIST_FIELDS[list] && PERCENT_LIST_FIELDS[list].includes(field)) value = value / 100;
    } else {
      value = t.value;
    }
    arr[idx][field] = value;

    if (list === "headcount") updateHeadcountRowTotals();
    recalcAndRender();
  });

  body.addEventListener("click", e => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const list = btn.getAttribute("data-remove");
    const idx = Number(btn.getAttribute("data-index"));
    const arr = listArrayFor(list);
    if (!arr || arr.length <= 1) return;
    arr.splice(idx, 1);
    if (list === "mix") renderMixRows();
    else if (list === "headcount") renderHeadcountRows();
    else if (list === "fixedOverhead") renderFixedOverheadRows();
    else renderCapexRows();
    recalcAndRender();
  });

  document.getElementById("addMixRow").addEventListener("click", () => {
    state.revenue.mix.push({ label: "New type", share: 0, price: 0 });
    renderMixRows();
    recalcAndRender();
  });
  document.getElementById("addHeadcountRow").addEventListener("click", () => {
    state.headcount.push({ role: "New role", count: 1, basis: "month", monthlyRate: 0, examRate: 0, startYear: 1, startMonth: 1 });
    renderHeadcountRows();
    recalcAndRender();
  });
  document.getElementById("addCapexRow").addEventListener("click", () => {
    state.capital.capexItems.push({ label: "New item", amount: 0, year: 1, month: 1 });
    renderCapexRows();
    recalcAndRender();
  });
  document.getElementById("addFixedOverheadRow").addEventListener("click", () => {
    state.fixedOverhead.push({ label: "New overhead item", amount: 0 });
    renderFixedOverheadRows();
    recalcAndRender();
  });
}

/* ---------------------------------------------------------------------------
   Computed displays: rev boxes, fixed/staff/capex totals, mix total check
   --------------------------------------------------------------------------- */
function renderRevBoxes(rev) {
  const el = document.getElementById("revBoxes");
  el.innerHTML = `
    <div class="rev-box">
      <div class="label">Expected children examined/visit</div>
      <div class="value">${fmtNum(rev.expectedChildrenPerVisit, 2)}</div>
    </div>
    <div class="rev-box">
      <div class="label">Exam revenue/visit</div>
      <div class="value">${fmtUSD(rev.examRevenuePerVisit, 2)}</div>
    </div>
    <div class="rev-box">
      <div class="label">Avg. treatment value (when indicated)</div>
      <div class="value">${fmtUSD(rev.avgTreatmentValue, 2)}</div>
    </div>
    <div class="rev-box">
      <div class="label">Treatment revenue/visit</div>
      <div class="value">${fmtUSD(rev.treatmentRevenuePerVisit, 2)}</div>
    </div>
    <div class="rev-box total">
      <div class="label">TOTAL REVENUE / VISIT</div>
      <div class="value">${fmtUSD(rev.totalRevenuePerVisit, 2)}</div>
    </div>
  `;
}

function renderMixTotalCheck() {
  const total = state.revenue.mix.reduce((s, r) => s + Number(r.share || 0), 0);
  const el = document.getElementById("mixTotalRow");
  const pct = total * 100;
  const ok = Math.abs(pct - 100) < 0.5;
  el.textContent = `Total share: ${pct.toFixed(1)}% ${ok ? "✓ (sums to 100%)" : "⚠ must equal 100%"}`;
  el.className = "mix-total-row" + (ok ? "" : " warn");
}

function updateFixedTotalDisplay() {
  const total = state.fixedOverhead.reduce((s, r) => s + Number(r.amount || 0), 0);
  document.getElementById("fixedTotalDisplay").textContent = fmtUSD(total);
}
function updateStaffTotalDisplay() {
  let fixedTotal = 0, examTotal = 0;
  state.headcount.forEach(row => {
    if (row.basis === "exam") examTotal += Number(row.count || 0) * Number(row.examRate || 0);
    else fixedTotal += Number(row.count || 0) * Number(row.monthlyRate || 0);
  });
  const parts = [];
  parts.push(fmtUSD(fixedTotal) + "/mo fixed (once every fixed role has started)");
  if (examTotal > 0) parts.push(fmtUSD(examTotal, 2) + "/exam combined stipend");
  document.getElementById("staffTotalDisplay").textContent = parts.join(" + ");
}
function updateCapexTotalDisplay() {
  const total = state.capital.capexItems.reduce((s, r) => s + Number(r.amount || 0), 0);
  document.getElementById("capexTotalDisplay").textContent = fmtUSD(total);
}

/* ---------------------------------------------------------------------------
   View tabs — the single control driving KPI cards, both charts, the
   revenue-mix pie, and the Monthly P&L section (see getViewSlice() above).
   --------------------------------------------------------------------------- */
function bindViewTabs() {
  document.querySelectorAll(".view-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-tab-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const v = btn.getAttribute("data-view");
      currentView = v === "total" ? "total" : Number(v);
      recalcAndRender();
    });
  });
}

/* ---------------------------------------------------------------------------
   KPI cards — labels/scope follow the active view tab.
   --------------------------------------------------------------------------- */
function findFirstPositiveEbitdaMonth(months) {
  const found = months.find(mo => mo.ebitda > 0);
  return found ? found.m : null;
}

function renderKPIs(model) {
  const { agg, months, label } = getViewSlice(model);
  const firstPositiveAbs = findFirstPositiveEbitdaMonth(months);
  let firstPositiveLabel = "Not yet";
  if (firstPositiveAbs) {
    if (currentView === "total") {
      const yr = Math.ceil(firstPositiveAbs / 12);
      const mo = firstPositiveAbs - (yr - 1) * 12;
      firstPositiveLabel = `Y${yr} M${mo}`;
    } else {
      const mo = firstPositiveAbs - (currentView - 1) * 12;
      firstPositiveLabel = `M${mo}`;
    }
  }
  const endMonthAbs = months[months.length - 1].m;
  const el = document.getElementById("kpiGrid");
  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">${label} Revenue</div>
      <div class="kpi-value">${fmtUSD(agg.monthlyRevenue)}</div>
      <div class="kpi-sub">${fmtNum(agg.volume, 0)} visits</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${label} EBITDA</div>
      <div class="kpi-value ${agg.ebitda >= 0 ? "positive" : "negative"}">${fmtUSD(agg.ebitda)}</div>
      <div class="kpi-sub">Margin ${fmtPctNum(agg.ebitdaMargin)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">EBITDA Positive From</div>
      <div class="kpi-value ${firstPositiveAbs ? "positive" : "negative"}">${firstPositiveLabel}</div>
      <div class="kpi-sub">${firstPositiveAbs ? "First month EBITDA turns positive" : "Still negative through Month " + endMonthAbs}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ending Cash Balance</div>
      <div class="kpi-value ${agg.endingCash >= 0 ? "positive" : "negative"}">${fmtUSD(agg.endingCash)}</div>
      <div class="kpi-sub">Projected at end of Month ${endMonthAbs}</div>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
   2-Year Summary — compact Year 1 | Year 2 | 2-Year Total table. Shown ONLY
   when the "2-Year Total" view tab is active, replacing the per-month detail
   table (which would need 24 columns / horizontal scrolling in that view).
   --------------------------------------------------------------------------- */
const YEAR_SUMMARY_ROWS = [
  { key: "volume", label: "Visits", fmt: "num0" },
  { key: "monthlyRevenue", label: "Total Revenue", fmt: "usd" },
  { key: "ebitda", label: "EBITDA", fmt: "usd", signed: true },
  { key: "ebitdaMargin", label: "EBITDA Margin", fmt: "pct" },
  { key: "endingCash", label: "Ending Cash Balance", fmt: "usd", signed: true }
];

function renderYearSummary(model) {
  const el = document.getElementById("yearSummaryTable");
  if (!el) return;
  const cols = [model.years[0], model.years[1], model.total2yr];
  const colLabels = ["Year 1", "Year 2", "2-Year Total"];

  let html = `<thead><tr><th>Metric</th>${colLabels.map(l => `<th>${l}</th>`).join("")}</tr></thead><tbody>`;
  YEAR_SUMMARY_ROWS.forEach(row => {
    html += `<tr><td>${row.label}</td>`;
    cols.forEach(c => {
      const v = row.key === "endingCash" ? c.endingCash : c[row.key];
      let cellText;
      if (row.fmt === "num0") cellText = fmtNum(v, 0);
      else if (row.fmt === "pct") cellText = fmtPctNum(v);
      else cellText = fmtUSD(v);
      html += `<td class="${row.signed ? cellClass(v, true) : ""}">${cellText}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody>`;
  el.innerHTML = html;
}

/* ---------------------------------------------------------------------------
   Monthly P&L section — swaps between the 2-Year Summary table (view=total)
   and a single year's 12-month detail table (view=1 or 2), driven entirely
   by the shared view tabs above the KPI cards.
   --------------------------------------------------------------------------- */
const TABLE_ROWS = [
  { key: "volume", label: "Visits", fmt: "num0" },
  { key: "monthlyRevenue", label: "Total Revenue", fmt: "usd", bold: true },
  { key: "examRevenue", label: "Exam Revenue", fmt: "usd", sub: true },
  { key: "treatmentRevenue", label: "Glasses/Treatment Revenue", fmt: "usd", sub: true },
  { key: "marketing", label: "Marketing", fmt: "usd" },
  { key: "cogs", label: "COGS", fmt: "usd" },
  { key: "logistics", label: "Logistics", fmt: "usd" },
  { key: "grossProfit", label: "Gross Profit", fmt: "usd", signed: true },
  { key: "fixedOverheadMonthly", label: "Fixed Overhead", fmt: "usd" },
  { key: "staffCostMonthly", label: "Staff Cost", fmt: "usd" },
  { key: "ebitda", label: "EBITDA", fmt: "usd", signed: true, bold: true },
  { key: "capex", label: "CapEx", fmt: "usd" },
  { key: "netCashFlow", label: "Net Cash Flow", fmt: "usd", signed: true },
  { key: "cashBalance", label: "Cumulative Cash Balance", fmt: "usd", bold: true, annualIsEnding: true }
];

function formatCell(v, fmt) {
  if (fmt === "num0") return fmtNum(v, 0);
  if (fmt === "num1") return fmtNum(v, 1);
  return fmtUSD(v, 0);
}
function cellClass(v, signed) {
  if (!signed) return "";
  return v < 0 ? "negative" : "positive";
}

function updateTableCardSections(model) {
  const summaryWrap = document.getElementById("yearSummaryWrap");
  const tableWrap = document.getElementById("monthlyTableWrap");
  const title = document.getElementById("tableCardTitle");
  if (currentView === "total") {
    summaryWrap.style.display = "block";
    tableWrap.style.display = "none";
    title.textContent = "Monthly P&L — 2-Year Summary";
  } else {
    summaryWrap.style.display = "none";
    tableWrap.style.display = "block";
    title.textContent = "Monthly P&L — Year " + currentView;
    renderMonthlyTable(model);
  }
}

function renderMonthlyTable(model) {
  const thead = document.getElementById("monthlyTableHead");
  const tbody = document.getElementById("monthlyTableBody");
  const yearIdx = currentView - 1;
  const months = model.months.slice(yearIdx * 12, yearIdx * 12 + 12);
  const yearTotals = model.years[yearIdx];

  thead.innerHTML = `<tr><th>Metric</th>${months.map(m => m.active
    ? `<th>M${m.monthInYear}</th>`
    : `<th class="inactive-month-col" title="Closed (holiday) — modeled as 0 visits">M${m.monthInYear} ✕</th>`
  ).join("")}<th class="col-annual">Year ${currentView} Total</th></tr>`;

  tbody.innerHTML = TABLE_ROWS.map(row => {
    const cells = months.map(m => {
      const v = m[row.key];
      return `<td class="${cellClass(v, row.signed)}"${row.bold ? ' style="font-weight:700"' : ""}>${formatCell(v, row.fmt)}</td>`;
    }).join("");
    const annualVal = row.annualIsEnding ? yearTotals.endingCash : yearTotals[row.key];
    const annualCell = `<td class="col-annual ${cellClass(annualVal, row.signed)}">${formatCell(annualVal, row.fmt)}</td>`;
    return `<tr${row.sub ? ' class="sub-row"' : ""}><td>${row.label}</td>${cells}${annualCell}</tr>`;
  }).join("");
}

/* ---------------------------------------------------------------------------
   Charts (inline SVG, hand-drawn, no CDN dependency) — plot whichever months
   the active view tab scopes to (12 months for Year 1/2, 24 for 2-Year
   Total). When 24 months are shown, axis labels are thinned to one per
   quarter so it doesn't turn into unreadable clutter; a single year labels
   every month.
   --------------------------------------------------------------------------- */
function monthTooltipLabel(m, totalCount) {
  return totalCount > 12 ? `Y${m.year} M${m.monthInYear}` : `M${m.monthInYear}`;
}
function monthAxisLabel(m) {
  return `Y${m.year}Q${m.q}`;
}
function shouldDrawLabel(m, totalCount) {
  return totalCount <= 12 ? true : m.monthInYear % 3 === 1;
}

function renderRevenueEbitdaChart(months) {
  const W = 640, H = 260, padL = 46, padR = 12, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = months.length;

  const revs = months.map(m => m.monthlyRevenue);
  const ebs = months.map(m => m.ebitda);
  const allVals = revs.concat(ebs);
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(0, ...allVals);
  const range = (maxV - minV) || 1;

  const yScale = v => padT + plotH - ((v - minV) / range) * plotH;
  const zeroY = yScale(0);
  const bandW = plotW / n;
  const barW = Math.min(22, bandW * 0.6);

  let gridSvg = "";
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minV + (range * i) / steps;
    const y = yScale(v);
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${COLOR_GRID}" stroke-width="1"/>`;
    gridSvg += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${COLOR_MUTED}">${fmtCompact(v)}</text>`;
  }

  let barsSvg = "", labelsSvg = "";
  const linePts = [];
  months.forEach((m, i) => {
    const cx = padL + bandW * i + bandW / 2;
    const y = yScale(m.monthlyRevenue);
    const top = Math.min(y, zeroY);
    const h = Math.max(Math.abs(zeroY - y), 1);
    barsSvg += `<rect class="bar-mark" x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${COLOR_SERIES_1}"><title>${monthTooltipLabel(m, n)}: Revenue ${fmtUSD(m.monthlyRevenue)}</title></rect>`;
    linePts.push([cx, yScale(m.ebitda)]);
    if (shouldDrawLabel(m, n)) {
      const text = n > 12 ? monthAxisLabel(m) : "M" + m.monthInYear;
      labelsSvg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="${COLOR_MUTED}">${text}</text>`;
    }
  });

  const linePath = linePts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const dotsSvg = linePts.map((p, i) => `<circle class="pt-mark" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${COLOR_SERIES_2}"><title>${monthTooltipLabel(months[i], n)}: EBITDA ${fmtUSD(months[i].ebitda)}</title></circle>`).join("");
  const zeroLineSvg = `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="${COLOR_BASELINE}" stroke-width="1.2"/>`;

  document.getElementById("chartRevenueEbitda").innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Revenue and EBITDA by month">
    ${gridSvg}${barsSvg}${zeroLineSvg}
    <path d="${linePath}" fill="none" stroke="${COLOR_SERIES_2}" stroke-width="2"/>
    ${dotsSvg}${labelsSvg}
  </svg>`;
}

function renderCashChart(months) {
  const W = 640, H = 260, padL = 54, padR = 12, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = months.length;

  const vals = months.map(m => m.cashBalance);
  const minV = Math.min(0, ...vals);
  const maxV = Math.max(0, ...vals);
  const range = (maxV - minV) || 1;

  const yScale = v => padT + plotH - ((v - minV) / range) * plotH;
  const xScale = i => padL + (plotW * i) / (n - 1);
  const zeroY = yScale(0);

  let gridSvg = "";
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minV + (range * i) / steps;
    const y = yScale(v);
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${COLOR_GRID}" stroke-width="1"/>`;
    gridSvg += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${COLOR_MUTED}">${fmtCompact(v)}</text>`;
  }

  const pts = months.map((m, i) => [xScale(i), yScale(m.cashBalance)]);
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath = `M${pts[0][0].toFixed(1)},${zeroY.toFixed(1)} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + ` L${pts[pts.length - 1][0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  const dotsSvg = pts.map((p, i) => `<circle class="pt-mark" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${COLOR_SERIES_1}"><title>${monthTooltipLabel(months[i], n)}: Cash ${fmtUSD(months[i].cashBalance)}</title></circle>`).join("");
  let labelsSvg = "";
  months.forEach((m, i) => {
    if (shouldDrawLabel(m, n)) {
      const text = n > 12 ? monthAxisLabel(m) : "M" + m.monthInYear;
      labelsSvg += `<text x="${xScale(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="${COLOR_MUTED}">${text}</text>`;
    }
  });
  const zeroLineSvg = minV < 0 ? `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="${COLOR_BASELINE}" stroke-width="1.2"/>` : "";

  document.getElementById("chartCash").innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cumulative cash balance by month">
    ${gridSvg}
    <path d="${areaPath}" fill="${COLOR_SERIES_1}" opacity="0.12"/>
    ${zeroLineSvg}
    <path d="${linePath}" fill="none" stroke="${COLOR_SERIES_1}" stroke-width="2"/>
    ${dotsSvg}${labelsSvg}
  </svg>`;
}

function computeRevenueMixBreakdown(agg, rev) {
  const totalVolume = agg.volume;
  const items = [];
  items.push({ label: "Exam fees", value: totalVolume * rev.examRevenuePerVisit });
  state.revenue.mix.forEach(row => {
    const value = totalVolume * rev.expectedChildrenPerVisit * Number(state.revenue.cvr || 0) * Number(row.share || 0) * Number(row.price || 0);
    items.push({ label: row.label || "Untitled", value: Math.max(value, 0) });
  });
  const total = items.reduce((s, i) => s + i.value, 0);
  items.forEach(i => { i.pct = total > 0 ? i.value / total : 0; });
  return { items, total };
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    "M", startOuter.x.toFixed(2), startOuter.y.toFixed(2),
    "A", rOuter, rOuter, 0, largeArc, 0, endOuter.x.toFixed(2), endOuter.y.toFixed(2),
    "L", endInner.x.toFixed(2), endInner.y.toFixed(2),
    "A", rInner, rInner, 0, largeArc, 1, startInner.x.toFixed(2), startInner.y.toFixed(2),
    "Z"
  ].join(" ");
}

function renderRevenueMixChart(model) {
  const container = document.getElementById("chartRevenueMix");
  if (!container) return;
  const { agg, label } = getViewSlice(model);
  const titleEl = document.getElementById("chartMixTitle");
  // "2-Year Total Revenue Mix" reads awkwardly (like "Total Revenue" is the
  // category) — drop "Total" just for this title, Year 1/Year 2 unaffected.
  const mixLabel = currentView === "total" ? "2-Year" : label;
  if (titleEl) titleEl.textContent = mixLabel + " Revenue Mix";

  const { items, total } = computeRevenueMixBreakdown(agg, model.rev);
  const visible = items.filter(i => i.value > 0);

  if (total <= 0 || visible.length === 0) {
    container.innerHTML = `<div class="field-note">No revenue to break down yet.</div>`;
    return;
  }

  const cx = 80, cy = 80, rOuter = 76, rInner = 44;
  let angle = 0;
  let slicesSvg = "";
  const legendRows = [];

  visible.forEach((item, i) => {
    const color = i < PIE_COLORS.length ? PIE_COLORS[i] : PIE_OVERFLOW_COLOR;
    const span = item.pct * 360;
    const start = angle;
    const end = Math.min(angle + span, 360);
    // small 1.5deg gap between slices for a visible surface gap, skipped when it's the only slice
    const gap = visible.length > 1 ? 0.75 : 0;
    const d = donutSlicePath(cx, cy, rOuter, rInner, start + gap, Math.max(end - gap, start + gap));
    slicesSvg += `<path class="pie-slice" d="${d}" fill="${color}"><title>${escapeHtml(item.label)}: ${fmtUSD(item.value)} (${(item.pct * 100).toFixed(1)}%)</title></path>`;
    angle = end;
    legendRows.push(`
      <li>
        <span class="swatch" style="background:${color}"></span>
        <span class="name">${escapeHtml(item.label)}</span>
        <span class="stats">
          <span class="amt">${fmtUSD(item.value)}</span>
          <span class="pct">${(item.pct * 100).toFixed(1)}%</span>
        </span>
      </li>
    `);
  });

  const centerLabel = `
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="${COLOR_MUTED}">Total</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="13" font-weight="700" fill="#0b0b0b">${fmtCompact(total)}</text>
  `;

  container.innerHTML = `
    <div class="pie-chart-row">
      <svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Revenue mix by category">
        ${slicesSvg}
        ${centerLabel}
      </svg>
      <ul class="pie-legend">${legendRows.join("")}</ul>
    </div>
  `;
}

function renderCharts(model) {
  const { months, label } = getViewSlice(model);
  const ebitdaTitleEl = document.getElementById("chartRevenueEbitdaTitle");
  if (ebitdaTitleEl) ebitdaTitleEl.textContent = "Revenue & EBITDA by Month — " + label;
  const cashTitleEl = document.getElementById("chartCashTitle");
  if (cashTitleEl) cashTitleEl.textContent = "Cumulative Cash Balance — " + label;

  renderRevenueEbitdaChart(months);
  renderCashChart(months);
  renderRevenueMixChart(model);
}

/* ---------------------------------------------------------------------------
   Master recalc + render
   --------------------------------------------------------------------------- */
function recalcAndRender() {
  const model = calcModel(state, currentScenario);
  renderRevBoxes(model.rev);
  renderMixTotalCheck();
  updateFixedTotalDisplay();
  updateStaffTotalDisplay();
  updateCapexTotalDisplay();
  renderKPIs(model);
  renderYearSummary(model);
  updateTableCardSections(model);
  renderCharts(model);
}

/* ---------------------------------------------------------------------------
   Admin — Save as Default (commits an updated script.js straight to GitHub
   via the Contents API, using a user-supplied Personal Access Token).
   The PAT is only ever held in a page-local variable / the password input's
   value — it is NEVER written to localStorage or sent anywhere except
   https://api.github.com. Only owner/repo/branch/path (non-sensitive) are
   remembered in localStorage, to save re-typing them each visit.
   --------------------------------------------------------------------------- */
const GITHUB_API_BASE = "https://api.github.com";
const ADMIN_LS_KEYS = {
  owner: "geB2C_admin_owner",
  repo: "geB2C_admin_repo",
  branch: "geB2C_admin_branch",
  path: "geB2C_admin_path"
};

function adminEls() {
  return {
    owner: document.getElementById("adminOwner"),
    repo: document.getElementById("adminRepo"),
    branch: document.getElementById("adminBranch"),
    path: document.getElementById("adminPath"),
    pat: document.getElementById("adminPat"),
    pinInput: document.getElementById("adminPinInput"),
    unlockStatus: document.getElementById("adminUnlockStatus"),
    saveStatus: document.getElementById("adminSaveStatus"),
    lockedView: document.getElementById("adminLockedView"),
    unlockedView: document.getElementById("adminUnlockedView"),
    saveBtn: document.getElementById("adminSaveBtn")
  };
}

function setAdminStatus(el, message, kind) {
  if (!el) return;
  el.textContent = message || "";
  el.className = "admin-status" + (kind ? " " + kind : "");
}

function loadAdminNonSensitiveFields() {
  const e = adminEls();
  let saved = {};
  try {
    saved = {
      owner: localStorage.getItem(ADMIN_LS_KEYS.owner) || "",
      repo: localStorage.getItem(ADMIN_LS_KEYS.repo) || "",
      branch: localStorage.getItem(ADMIN_LS_KEYS.branch) || "",
      path: localStorage.getItem(ADMIN_LS_KEYS.path) || ""
    };
  } catch (err) {
    saved = { owner: "", repo: "", branch: "", path: "" };
  }
  e.owner.value = saved.owner;
  e.repo.value = saved.repo;
  e.branch.value = saved.branch || "main";
  e.path.value = saved.path || "script.js";
}

function persistAdminNonSensitiveFields() {
  const e = adminEls();
  try {
    localStorage.setItem(ADMIN_LS_KEYS.owner, e.owner.value.trim());
    localStorage.setItem(ADMIN_LS_KEYS.repo, e.repo.value.trim());
    localStorage.setItem(ADMIN_LS_KEYS.branch, e.branch.value.trim());
    localStorage.setItem(ADMIN_LS_KEYS.path, e.path.value.trim());
  } catch (err) {
    /* localStorage unavailable (e.g. private browsing) — non-fatal, just won't be remembered */
  }
}

/* UTF-8 safe base64 encode/decode (btoa/atob only handle Latin1 natively) */
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

/* Rebuild script.js's source with a freshly-serialized DEFAULTS object,
   using the DEFAULTS:START / DEFAULTS:END marker comments so the rest of
   the file (calcModel, etc.) is left untouched. Throws if the markers are
   missing, rather than guessing and risking a corrupted commit. */
function buildUpdatedScriptSource(originalSource, newDefaults) {
  const startMarkerIdx = originalSource.indexOf("DEFAULTS:START");
  const endMarkerIdx = originalSource.indexOf("DEFAULTS:END");
  if (startMarkerIdx === -1 || endMarkerIdx === -1 || endMarkerIdx < startMarkerIdx) {
    throw new Error('Could not find the "DEFAULTS:START"/"DEFAULTS:END" markers in the fetched script.js — aborting so as not to corrupt the file.');
  }
  const startCommentEnd = originalSource.indexOf("*/", startMarkerIdx);
  const endCommentStart = originalSource.lastIndexOf("/*", endMarkerIdx);
  if (startCommentEnd === -1 || endCommentStart === -1 || endCommentStart <= startCommentEnd) {
    throw new Error("The DEFAULTS marker comments look malformed — aborting so as not to corrupt the file.");
  }
  const before = originalSource.slice(0, startCommentEnd + 2);
  const after = originalSource.slice(endCommentStart);
  const newBlock = "\nconst DEFAULTS = " + JSON.stringify(newDefaults, null, 2) + ";\n";
  return before + newBlock + after;
}

function bindAdminSection() {
  const e = adminEls();
  if (!e.saveBtn) return; // section not present — nothing to bind

  loadAdminNonSensitiveFields();

  document.getElementById("adminUnlockBtn").addEventListener("click", () => {
    if (e.pinInput.value === ADMIN_CONFIG.pin) {
      e.lockedView.style.display = "none";
      e.unlockedView.style.display = "block";
      e.pinInput.value = "";
      setAdminStatus(e.unlockStatus, "", "");
    } else {
      setAdminStatus(e.unlockStatus, "Incorrect PIN.", "error");
    }
  });

  e.pinInput.addEventListener("keydown", ev => {
    if (ev.key === "Enter") document.getElementById("adminUnlockBtn").click();
  });

  document.getElementById("adminLockBtn").addEventListener("click", () => {
    e.unlockedView.style.display = "none";
    e.lockedView.style.display = "block";
    e.pat.value = "";
    setAdminStatus(e.saveStatus, "", "");
  });

  [e.owner, e.repo, e.branch, e.path].forEach(input => {
    input.addEventListener("change", persistAdminNonSensitiveFields);
  });

  e.saveBtn.addEventListener("click", saveAsDefault);
}

async function saveAsDefault() {
  const e = adminEls();
  const owner = e.owner.value.trim();
  const repo = e.repo.value.trim();
  const branch = e.branch.value.trim() || "main";
  const path = e.path.value.trim() || "script.js";
  const pat = e.pat.value.trim();

  if (!owner || !repo || !pat) {
    setAdminStatus(e.saveStatus, "Owner, repository, and Personal Access Token are all required.", "error");
    return;
  }

  persistAdminNonSensitiveFields();

  const apiPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const apiUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${apiPath}`;
  const headers = { "Authorization": "token " + pat, "Accept": "application/vnd.github+json" };

  e.saveBtn.disabled = true;
  setAdminStatus(e.saveStatus, "Fetching current file from GitHub…", "pending");

  try {
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    let existingSha = null;
    let originalSource = null;

    if (getRes.status === 200) {
      const getData = await getRes.json();
      existingSha = getData.sha;
      originalSource = base64ToUtf8(getData.content);
    } else if (getRes.status === 404) {
      throw new Error(`"${path}" was not found on branch "${branch}" of ${owner}/${repo}. This tool updates an EXISTING script.js in an already-deployed repo — push the initial 4 files first, then try Save as Default again.`);
    } else {
      const body = await getRes.text();
      throw new Error(`GitHub rejected the read (HTTP ${getRes.status}): ${body.slice(0, 200)}`);
    }

    setAdminStatus(e.saveStatus, "Building updated file…", "pending");
    const updatedSource = buildUpdatedScriptSource(originalSource, deepClone(state));

    setAdminStatus(e.saveStatus, "Committing to GitHub…", "pending");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify({
        message: "Save as default — update DEFAULTS from the live page",
        content: utf8ToBase64(updatedSource),
        sha: existingSha,
        branch: branch
      })
    });

    if (putRes.status === 200 || putRes.status === 201) {
      setAdminStatus(e.saveStatus, `Saved — new defaults committed to ${owner}/${repo} (${branch}). GitHub Pages usually redeploys within a minute or two.`, "success");
    } else {
      const body = await putRes.text();
      throw new Error(`GitHub rejected the commit (HTTP ${putRes.status}): ${body.slice(0, 200)}`);
    }
  } catch (err) {
    setAdminStatus(e.saveStatus, "Error: " + err.message, "error");
  } finally {
    e.saveBtn.disabled = false;
  }
}

/* ---------------------------------------------------------------------------
   Init
   --------------------------------------------------------------------------- */
function fullRenderAssumptionInputs() {
  renderMonthActiveGrid();
  renderMarketingMonthlyGrid();
  renderMixRows();
  renderFixedOverheadRows();
  renderHeadcountRows();
  renderCapexRows();
  setSimpleFieldValues();
}

function bindScenarioTabs() {
  document.querySelectorAll(".scenario-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".scenario-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentScenario = btn.getAttribute("data-scenario");
      recalcAndRender();
    });
  });
}

function bindAssumptionsToggle() {
  const toggleBtn = document.getElementById("assumptionsToggle");
  const body = document.getElementById("assumptionsBody");
  toggleBtn.addEventListener("click", () => {
    const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
    toggleBtn.setAttribute("aria-expanded", String(!expanded));
    body.style.display = expanded ? "none" : "block";
  });
}

function bindResetButton() {
  document.getElementById("resetDefaultsBtn").addEventListener("click", () => {
    state = deepClone(DEFAULTS);
    currentView = "total";
    document.querySelectorAll(".view-tab-btn").forEach(b => {
      const isTotal = b.getAttribute("data-view") === "total";
      b.classList.toggle("active", isTotal);
      b.setAttribute("aria-selected", String(isTotal));
    });
    fullRenderAssumptionInputs();
    recalcAndRender();
  });
}

function init() {
  fullRenderAssumptionInputs();
  bindSimpleFields();
  bindMonthActiveGrid();
  bindMarketingMonthlyGrid();
  bindDynamicTableEvents();
  bindScenarioTabs();
  bindViewTabs();
  bindAssumptionsToggle();
  bindResetButton();
  bindAdminSection();
  recalcAndRender();
}

document.addEventListener("DOMContentLoaded", init);
