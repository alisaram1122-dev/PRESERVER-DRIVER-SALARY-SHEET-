
/* PRESERVER TRANS LLC - DRIVER SALARY APP */

const $ = id => document.getElementById(id);
const DEFAULT_RATE = 0.52;
const CACHE_KEY = "preserver_salary_cache_v2";

let sb = null;
let user = null;
let db = {
  rate: DEFAULT_RATE,
  drivers: [],
  history: [],
  deletedRecords: [],
  settings: {
    company: "PRESERVER TRANS LLC",
    manager: "Saim Ali",
    username: "Saim Ali",
    designation: "Account Manager",
    phone: "",
    details: "",
    managerPhoto: "",
    location: "USA California",
    currency: "$",
    theme: "navy",
    displayStyle: "modern",
    fontSize: "normal"
  }
};

let currentStatement = null;
let saveTimer = null;
let managerPhotoData = "";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function money(value) {
  const currency = db.settings.currency || "$";
  return currency + Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function number(value) {
  return Number(value || 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function toast(message) {
  const el = $("appToast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function setMessage(message, good = false) {
  const el = $("loginMessage");
  if (!el) return;
  el.textContent = message;
  el.style.color = good ? "#16835f" : "#d94b55";
}

function normalizeMonth(m) {
  if (!m || typeof m !== "object") m = {};
  m.rows = Array.isArray(m.rows) ? m.rows : [];
  m.adds = Array.isArray(m.adds) ? m.adds : [];
  m.fines = Array.isArray(m.fines) ? m.fines : [];
  m.advances = Array.isArray(m.advances) ? m.advances : [];
  m.recoveries = Array.isArray(m.recoveries) ? m.recoveries : [];
  m.payments = Array.isArray(m.payments) ? m.payments : [];
  return m;
}

function normalizeData(payload) {
  const old = payload && typeof payload === "object" ? payload : {};
  db.rate = number(old.rate) || DEFAULT_RATE;
  db.drivers = Array.isArray(old.drivers) ? old.drivers : [];
  db.history = Array.isArray(old.history) ? old.history : [];
  db.deletedRecords = Array.isArray(old.deletedRecords) ? old.deletedRecords : [];

  const oldSettings = old.settings || {};
  db.settings = {
    ...db.settings,
    ...oldSettings,
    company: oldSettings.company || "PRESERVER TRANS LLC",
    manager: oldSettings.manager || "Saim Ali",
    username: oldSettings.username || oldSettings.manager || "Saim Ali",
    theme: oldSettings.theme || "navy",
    displayStyle: oldSettings.displayStyle || "modern",
    fontSize: oldSettings.fontSize || "normal",
    currency: oldSettings.currency || "$"
  };

  db.drivers.forEach(d => {
    d.id = d.id || uid();
    d.name = d.name || d.driverName || "Unnamed Driver";
    d.truck = d.truck || d.truckNo || "";
    d.phone = d.phone || "";
    d.address = d.address || "";
    d.notes = d.notes || "";
    d.months = d.months || {};
    Object.keys(d.months).forEach(k => {
      d.months[k] = normalizeMonth(d.months[k]);
    });
  });
}

function monthFor(driver, month) {
  if (!driver.months) driver.months = {};
  if (!driver.months[month]) {
    driver.months[month] = normalizeMonth({});
  }
  return normalizeMonth(driver.months[month]);
}

function getSelectedDriver() {
  return db.drivers.find(d => d.id === $("salaryDriver").value) || null;
}

function getSelectedMonth() {
  return $("salaryMonth").value || currentMonth();
}

function monthFigures(m) {
  m = normalizeMonth(m);
  let miles = 0;
  let mileagePay = 0;

  m.rows.forEach(r => {
    const rowMiles = Math.max(0, number(r.next) - number(r.prev));
    const rate = number(r.rate);
    miles += rowMiles;
    mileagePay += rowMiles * rate;
  });

  const additions = m.adds.reduce((s, x) => s + number(x.amount), 0);
  const fines = m.fines.reduce((s, x) => s + number(x.amount), 0);
  const advances = m.advances.reduce((s, x) => s + number(x.amount), 0);
  const recoveries = m.recoveries.reduce((s, x) => s + number(x.amount), 0);
  const paid = m.payments.reduce((s, x) => s + number(x.amount), 0);

  const net = mileagePay + additions - fines - advances - recoveries;
  return {
    miles, mileagePay, additions, fines, advances, recoveries,
    net, paid, remaining: net - paid
  };
}

function monthName(month) {
  if (!month) return "";
  const d = new Date(month + "-01T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function allMonthRecords() {
  const result = [];
  db.drivers.forEach(driver => {
    Object.keys(driver.months || {}).forEach(month => {
      const m = normalizeMonth(driver.months[month]);
      const f = monthFigures(m);
      result.push({
        driverId: driver.id,
        driverName: driver.name,
        truck: driver.truck,
        month,
        data: JSON.parse(JSON.stringify(m)),
        figures: f
      });
    });
  });
  return result.sort((a,b) => b.month.localeCompare(a.month));
}

function applyTheme() {
  document.body.className = "";
  document.body.classList.add("theme-" + (db.settings.theme || "navy"));
  document.body.classList.add("style-" + (db.settings.displayStyle || "modern"));
  document.body.classList.add("font-" + (db.settings.fontSize || "normal"));

  document.querySelectorAll(".theme-choice").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.theme === db.settings.theme);
  });
}

function cacheSave() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn("Local cache is full:", e);
    toast("Storage is full. Please reduce photo size.");
  }
}

async function saveData(showMessage = false) {
  cacheSave();

  if (!sb || !user) {
    if (showMessage) toast("Saved on this device. Sign in to sync online.");
    return;
  }

  $("saveStatus").textContent = "Saving to cloud...";
  const { error } = await sb.from("driver_salary_data").upsert({
    user_id: user.id,
    payload: db,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });

  if (error) {
    console.error(error);
    $("saveStatus").textContent = "Cloud save failed: " + error.message;
    toast("Cloud save failed. Check Supabase table and policies.");
  } else {
    $("saveStatus").textContent = "Saved successfully.";
    if (showMessage) toast("All changes saved successfully.");
  }
}

function scheduleSave() {
  cacheSave();
  $("saveStatus").textContent = "Changes pending...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveData(false), 700);
}

async function loadData() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try { normalizeData(JSON.parse(cached)); } catch (e) { console.error(e); }
  }

  if (sb && user) {
    const { data, error } = await sb
      .from("driver_salary_data")
      .select("payload")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast("Could not load cloud data: " + error.message);
    } else if (data && data.payload) {
      normalizeData(data.payload);
      cacheSave();
    } else {
      await saveData(false);
    }
  }
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("settingEmail").value = user?.email || "";
  applyTheme();
  fillSettings();
  renderAll();
  showView("salaryView");
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  const view = $(viewId);
  if (view) view.classList.add("active-view");

  document.querySelectorAll(".nav-btn[data-view]").forEach(b => {
    b.classList.toggle("active", b.dataset.view === viewId);
  });

  const names = {
    salaryView:"Salary Sheets",
    historyView:"Salary History",
    statementView:"Salary Statement",
    duesView:"Outstanding Dues",
    paymentsView:"Payment History",
    deletedView:"Deleted Records",
    driversView:"Drivers",
    settingsView:"Settings"
  };
  $("pageTitle").textContent = names[viewId] || "Dashboard";
  $("sidebar").classList.remove("open");
}

function renderAll() {
  renderDriverSelect();
  renderSalary();
  renderHistory();
  renderDues();
  renderPayments();
  renderDeleted();
  renderDrivers();
  updateBranding();
}

function updateBranding() {
  const name = db.settings.username || db.settings.manager || "Account Manager";
  $("topCompany").textContent = db.settings.company || "PRESERVER TRANS LLC";
  $("topUsername").textContent = name;
  $("sideManagerName").textContent = name;
  $("sideAvatar").textContent = name.split(/\s+/).map(x => x[0]).join("").slice(0,2).toUpperCase() || "AM";
  $("deletedCount").textContent = db.deletedRecords.length;
}

function renderDriverSelect() {
  const select = $("salaryDriver");
  const old = select.value;
  select.innerHTML = db.drivers.length
    ? db.drivers.map(d => `<option value="${esc(d.id)}">${esc(d.name)}${d.truck ? " · " + esc(d.truck) : ""}</option>`).join("")
    : `<option value="">No drivers added</option>`;

  if (db.drivers.some(d => d.id === old)) select.value = old;
  if (!select.value && db.drivers.length) select.value = db.drivers[0].id;
}

function renderSalary() {
  const driver = getSelectedDriver();
  const month = getSelectedMonth();
  const body = $("mileageBody");

  if (!driver) {
    $("salaryDriverInfo").textContent = "Please add a driver to start a salary sheet.";
    body.innerHTML = `<tr><td colspan="9" class="empty-row">No driver selected.</td></tr>`;
    ["additionsBody","finesBody","advancesBody"].forEach(id => $(id).innerHTML = "");
    $("salaryTotals").innerHTML = "";
    $("paymentSummary").textContent = "";
    updateStats({miles:0,mileagePay:0,net:0,remaining:0});
    return;
  }

  const m = monthFor(driver, month);
  const f = monthFigures(m);
  $("salaryDriverInfo").innerHTML =
    `<b>${esc(driver.name)}</b> &nbsp; | &nbsp; Truck: ${esc(driver.truck || "—")} &nbsp; | &nbsp; Phone: ${esc(driver.phone || "—")} &nbsp; | &nbsp; ${esc(monthName(month))}`;

  body.innerHTML = m.rows.length ? m.rows.map((r,i) => {
    const miles = Math.max(0, number(r.next) - number(r.prev));
    const amount = miles * number(r.rate);
    return `<tr>
      <td>${i+1}</td>
      <td><input type="date" data-row="${i}" data-field="date" value="${esc(r.date || "")}"></td>
      <td><input type="text" data-row="${i}" data-field="note" value="${esc(r.note || "")}" placeholder="Load / notes"></td>
      <td><input type="number" data-row="${i}" data-field="prev" value="${esc(r.prev ?? "")}"></td>
      <td><input type="number" data-row="${i}" data-field="next" value="${esc(r.next ?? "")}"></td>
      <td>${miles.toLocaleString()}</td>
      <td>${money(r.rate)}</td>
      <td><b>${money(amount)}</b></td>
      <td><button class="btn danger small" data-delete-row="${i}">Delete</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="9" class="empty-row">No mileage records for this month.</td></tr>`;

  renderItems("additionsBody", m.adds, "adds");
  renderItems("finesBody", m.fines, "fines");
  renderItems("advancesBody", m.advances, "advances");

  $("mileageRate").value = db.rate;
  $("paymentDate").value = today();
  $("paymentSummary").innerHTML =
    `Total paid: <b>${money(f.paid)}</b><br>Remaining balance: <b>${money(f.remaining)}</b>`;

  $("salaryTotals").innerHTML = `
    <div class="totals-line"><span>Total Mileage Earnings</span><b>${money(f.mileagePay)}</b></div>
    <div class="totals-line"><span>Additions / Extra Amounts</span><b>${money(f.additions)}</b></div>
    <div class="totals-line"><span>Fines / Deductions</span><b>− ${money(f.fines)}</b></div>
    <div class="totals-line"><span>Advance / Recovery</span><b>− ${money(f.advances + f.recoveries)}</b></div>
    <div class="totals-line total"><span>Net Salary</span><b>${money(f.net)}</b></div>
    <div class="totals-line"><span>Total Paid</span><b>${money(f.paid)}</b></div>
    <div class="totals-line total"><span>Remaining Due</span><b>${money(f.remaining)}</b></div>
  `;
  updateStats(f);
}

function updateStats(f) {
  $("statMiles").textContent = number(f.miles).toLocaleString();
  $("statMileage").textContent = money(f.mileagePay);
  $("statNet").textContent = money(f.net);
  $("statDue").textContent = money(f.remaining);
}

function renderItems(elementId, items, key) {
  $(elementId).innerHTML = items.length ? items.map((x,i) =>
    `<tr><td>${esc(x.description || "")}</td><td>${money(x.amount)}</td><td><button class="btn danger small" data-item-group="${key}" data-item-index="${i}">Delete</button></td></tr>`
  ).join("") : `<tr><td colspan="3" class="empty-row">No records.</td></tr>`;
}

function addMileageRow() {
  const d = getSelectedDriver();
  if (!d) return toast("Add a driver first.");
  const m = monthFor(d, getSelectedMonth());
  let previous = 0;

  if (m.rows.length) {
    previous = number(m.rows[m.rows.length - 1].next);
  } else {
    const priorMonths = Object.keys(d.months).filter(x => x < getSelectedMonth()).sort();
    for (const month of priorMonths.reverse()) {
      const rows = monthFor(d, month).rows;
      if (rows.length) {
        previous = number(rows[rows.length - 1].next);
        break;
      }
    }
  }

  m.rows.push({id:uid(),date:today(),note:"",prev:previous,next:previous,rate:number(db.rate)||DEFAULT_RATE});
  scheduleSave();
  renderSalary();
}

function addItem(group, title) {
  const d = getSelectedDriver();
  if (!d) return toast("Add a driver first.");
  const description = prompt(title + " description:");
  if (description === null) return;
  const amountText = prompt("Enter amount:");
  if (amountText === null) return;
  const amount = Number(amountText);
  if (!description.trim() || !Number.isFinite(amount) || amount < 0) {
    return toast("Please enter a valid description and amount.");
  }
  monthFor(d, getSelectedMonth())[group].push({id:uid(),description:description.trim(),amount});
  scheduleSave();
  renderSalary();
}

function renderHistory() {
  const search = ($("historySearch")?.value || "").toLowerCase();
  const records = allMonthRecords().filter(r =>
    (r.driverName + " " + r.month + " " + r.truck).toLowerCase().includes(search)
  );

  $("historyBody").innerHTML = records.length ? records.map((r,i) => `
    <tr>
      <td><b>${esc(r.driverName)}</b></td>
      <td>${esc(r.truck || "—")}</td>
      <td>${esc(monthName(r.month))}</td>
      <td>${r.figures.miles.toLocaleString()}</td>
      <td>${money(r.figures.net)}</td>
      <td>${money(r.figures.paid)}</td>
      <td>${money(r.figures.remaining)}</td>
      <td><button class="btn outline small" data-open-statement="${esc(r.driverId)}" data-open-month="${esc(r.month)}">Open Sheet</button></td>
    </tr>`).join("") : `<tr><td colspan="8" class="empty-row">No salary sheets found.</td></tr>`;

  const payments = [];
  db.drivers.forEach(d => Object.entries(d.months || {}).forEach(([month,m]) => {
    normalizeMonth(m).payments.forEach(p => payments.push({driver:d.name,month,...p}));
  }));
  $("historyPaymentsBody").innerHTML = payments.length ? payments.sort((a,b) => (b.date||"").localeCompare(a.date||"")).map(p =>
    `<tr><td>${esc(p.date || "")}</td><td>${esc(p.driver)}</td><td>${esc(monthName(p.month))}</td><td>${money(p.amount)}</td><td>${esc(p.note || "")}</td></tr>`
  ).join("") : `<tr><td colspan="5" class="empty-row">No payment transactions yet.</td></tr>`;
}

function makeStatementSnapshot(driver, month) {
  const m = JSON.parse(JSON.stringify(monthFor(driver, month)));
  return {
    driverId:driver.id,
    driverName:driver.name,
    truck:driver.truck || "",
    phone:driver.phone || "",
    address:driver.address || "",
    month,
    data:m,
    figures:monthFigures(m),
    company:db.settings.company,
    location:db.settings.location,
    createdAt:new Date().toISOString()
  };
}

function openStatement(driverId, month) {
  const driver = db.drivers.find(d => d.id === driverId);
  if (!driver || !driver.months[month]) return toast("This salary sheet is not available.");

  currentStatement = makeStatementSnapshot(driver, month);
  renderStatement(currentStatement);
  showView("statementView");
}

function renderStatement(s) {
  $("statementSubtitle").textContent = `${s.driverName} · ${monthName(s.month)} · Read-only statement`;
  const m = normalizeMonth(s.data);
  const f = s.figures || monthFigures(m);

  const rows = m.rows.map((r,i) => {
    const miles = Math.max(0,number(r.next)-number(r.prev));
    return `<tr><td>${i+1}</td><td>${esc(r.date || "")}</td><td>${esc(r.note || "")}</td><td>${number(r.prev).toLocaleString()}</td><td>${number(r.next).toLocaleString()}</td><td>${miles.toLocaleString()}</td><td>${money(r.rate)}</td><td>${money(miles*number(r.rate))}</td></tr>`;
  }).join("");

  const itemTable = (title,items) => `
    <div class="statement-section"><h3>${title}</h3>
    <table><thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>${items.length ? items.map(x => `<tr><td>${esc(x.description || "")}</td><td>${money(x.amount)}</td></tr>`).join("") : `<tr><td colspan="2">None</td></tr>`}</tbody></table></div>`;

  const paymentRows = m.payments.map(p =>
    `<tr><td>${esc(p.date || "")}</td><td>${esc(p.note || "")}</td><td>${money(p.amount)}</td></tr>`
  ).join("");

  $("statementContent").innerHTML = `
    <div class="statement-header"><h2>${esc(s.company || db.settings.company)}</h2><p>${esc(s.location || db.settings.location || "")}</p><p>DRIVER MONTHLY SALARY STATEMENT</p></div>
    <div class="statement-meta">
      <div><b>DRIVER NAME</b>${esc(s.driverName)}</div>
      <div><b>TRUCK NUMBER</b>${esc(s.truck || "—")}</div>
      <div><b>SALARY MONTH</b>${esc(monthName(s.month))}</div>
      <div><b>PHONE</b>${esc(s.phone || "—")}</div>
      <div><b>ADDRESS</b>${esc(s.address || "—")}</div>
      <div><b>TOTAL MILES</b>${number(f.miles).toLocaleString()}</div>
    </div>
    <div class="statement-section"><h3>Mileage Details</h3>
      <table><thead><tr><th>#</th><th>Date</th><th>Load / Notes</th><th>Previous</th><th>Ending</th><th>Miles</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8">No mileage records.</td></tr>`}</tbody></table>
    </div>
    ${itemTable("Additions / Extra Amounts",m.adds)}
    ${itemTable("Fines / Deductions",m.fines)}
    ${itemTable("Advance / Recovery",m.advances.concat(m.recoveries))}
    <div class="statement-section"><h3>Payment Details</h3>
      <table><thead><tr><th>Date</th><th>Note / Method</th><th>Amount</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="3">No payments.</td></tr>`}</tbody></table>
    </div>
    <div class="statement-total">
      <div><span>Mileage Earnings</span><b>${money(f.mileagePay)}</b></div>
      <div><span>Additions</span><b>${money(f.additions)}</b></div>
      <div><span>Fines</span><b>− ${money(f.fines)}</b></div>
      <div><span>Advance / Recovery</span><b>− ${money(f.advances+f.recoveries)}</b></div>
      <div><span>Net Salary</span><b>${money(f.net)}</b></div>
      <div><span>Total Paid</span><b>${money(f.paid)}</b></div>
      <div><strong>Remaining Due</strong><strong>${money(f.remaining)}</strong></div>
    </div>
    <p style="text-align:center;margin-top:25px">Generated by Preserver Trans LLC Salary Management</p>
  `;
}

function deleteCurrentStatement() {
  if (!currentStatement) return;
  if (!confirm(`Move ${currentStatement.driverName} - ${monthName(currentStatement.month)} to Deleted Records?`)) return;

  const driver = db.drivers.find(d => d.id === currentStatement.driverId);
  if (!driver || !driver.months[currentStatement.month]) return toast("Record no longer exists.");

  const snapshot = makeStatementSnapshot(driver, currentStatement.month);
  snapshot.deletedId = uid();
  snapshot.deletedAt = new Date().toISOString();
  db.deletedRecords.push(snapshot);

  delete driver.months[currentStatement.month];
  scheduleSave();
  currentStatement = null;
  renderAll();
  showView("historyView");
  toast("Salary sheet moved to Deleted Records.");
}

function renderDeleted() {
  $("deletedCount").textContent = db.deletedRecords.length;
  $("deletedBody").innerHTML = db.deletedRecords.length ? db.deletedRecords.map(r => `
    <tr>
      <td>${esc(r.driverName)}</td><td>${esc(r.truck || "—")}</td>
      <td>${esc(monthName(r.month))}</td>
      <td>${esc((r.deletedAt || "").slice(0,10))}</td>
      <td>${money(r.figures?.net)}</td>
      <td>
        <button class="btn outline small" data-restore="${esc(r.deletedId)}">Restore</button>
        <button class="btn danger small" data-permanent="${esc(r.deletedId)}">Permanent Delete</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-row">Deleted Records is empty.</td></tr>`;
}

function restoreRecord(id) {
  const index = db.deletedRecords.findIndex(r => r.deletedId === id);
  if (index < 0) return;
  const record = db.deletedRecords[index];
  const driver = db.drivers.find(d => d.id === record.driverId);

  if (!driver) return toast("Original driver profile was not found. Restore is unavailable.");
  if (driver.months[record.month]) {
    return toast("A salary sheet for this driver and month already exists. Rename or remove that month first.");
  }

  driver.months[record.month] = normalizeMonth(JSON.parse(JSON.stringify(record.data)));
  db.deletedRecords.splice(index,1);
  scheduleSave();
  renderAll();
  toast("Salary sheet restored.");
}

async function verifyPassword(password) {
  if (!user || !user.email || !password) return false;
  const { error } = await sb.auth.signInWithPassword({
    email:user.email,
    password
  });
  if (error) {
    toast("Password verification failed. Please check your password.");
    return false;
  }
  const { data } = await sb.auth.getUser();
  if (data?.user) user = data.user;
  return true;
}

async function permanentDelete(id) {
  const record = db.deletedRecords.find(r => r.deletedId === id);
  if (!record) return;
  if (!confirm(`PERMANENTLY DELETE ${record.driverName} - ${monthName(record.month)}? This cannot be undone.`)) return;

  const password = prompt("Enter your current login password to permanently delete this record:");
  if (password === null) return;
  if (!(await verifyPassword(password))) return;

  db.deletedRecords = db.deletedRecords.filter(r => r.deletedId !== id);
  await saveData(true);
  renderDeleted();
  toast("Record permanently deleted.");
}

function renderDues() {
  const totals = db.drivers.map(d => {
    let salary = 0, paid = 0, months = 0;
    Object.values(d.months || {}).forEach(m => {
      const f = monthFigures(m);
      salary += f.net;
      paid += f.paid;
      if (f.remaining > 0.009) months++;
    });
    return {d,salary,paid,due:salary-paid,months};
  }).filter(x => x.due > 0.009);

  $("duesBody").innerHTML = totals.length ? totals.map(x => `
    <tr><td>${esc(x.d.name)}</td><td>${esc(x.d.truck || "—")}</td><td>${x.months}</td><td>${money(x.salary)}</td><td>${money(x.paid)}</td><td><b>${money(x.due)}</b></td></tr>
  `).join("") : `<tr><td colspan="6" class="empty-row">No outstanding dues.</td></tr>`;
}

function renderPayments() {
  const rows = [];
  db.drivers.forEach(d => Object.entries(d.months || {}).forEach(([month,m]) => {
    normalizeMonth(m).payments.forEach(p => rows.push({
      date:p.date || "", driver:d.name, truck:d.truck, month, amount:p.amount, note:p.note
    }));
  }));
  rows.sort((a,b) => b.date.localeCompare(a.date));
  $("paymentsBody").innerHTML = rows.length ? rows.map(p =>
    `<tr><td>${esc(p.date)}</td><td>${esc(p.driver)}</td><td>${esc(p.truck || "—")}</td><td>${esc(monthName(p.month))}</td><td>${money(p.amount)}</td><td>${esc(p.note || "")}</td></tr>`
  ).join("") : `<tr><td colspan="6" class="empty-row">No payments recorded.</td></tr>`;
}

function renderDrivers() {
  $("driversBody").innerHTML = db.drivers.length ? db.drivers.map(d =>
    `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.truck || "")}</td><td>${esc(d.phone || "")}</td><td>${esc(d.address || "")}</td><td>${esc(d.notes || "")}</td></tr>`
  ).join("") : `<tr><td colspan="5" class="empty-row">No drivers added yet.</td></tr>`;
}

function addDriver() {
  const name = $("newDriverName").value.trim();
  if (!name) return toast("Driver name is required.");
  const driver = {
    id:uid(),
    name,
    truck:$("newDriverTruck").value.trim(),
    phone:$("newDriverPhone").value.trim(),
    address:$("newDriverAddress").value.trim(),
    notes:$("newDriverNotes").value.trim(),
    photo:"",
    months:{}
  };
  db.drivers.push(driver);
  $("driverModal").classList.add("hidden");
  ["newDriverName","newDriverTruck","newDriverPhone","newDriverAddress","newDriverNotes"].forEach(id => $(id).value = "");
  renderAll();
  $("salaryDriver").value = driver.id;
  renderSalary();
  scheduleSave();
  toast("Driver profile added.");
}

function recordPayment() {
  const driver = getSelectedDriver();
  if (!driver) return toast("Select a driver first.");
  const amount = Number($("paymentAmount").value);
  const date = $("paymentDate").value || today();
  const note = $("paymentNote").value.trim();

  if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a valid payment amount.");

  const m = monthFor(driver,getSelectedMonth());
  const f = monthFigures(m);
  if (amount > Math.max(0,f.remaining) && !confirm("This payment is more than the remaining salary. Record it anyway?")) return;

  m.payments.push({id:uid(),amount,date,note});
  $("paymentAmount").value = "";
  $("paymentNote").value = "";
  scheduleSave();
  renderAll();
  toast("Payment recorded.");
}

function fillSettings() {
  const s = db.settings;
  $("settingUsername").value = s.username || s.manager || "";
  $("settingEmail").value = user?.email || "";
  $("settingCompany").value = s.company || "";
  $("settingLocation").value = s.location || "";
  $("settingRate").value = db.rate;
  $("settingCurrency").value = s.currency || "$";
  $("displayStyle").value = s.displayStyle || "modern";
  $("fontSize").value = s.fontSize || "normal";
  $("managerName").value = s.manager || "";
  $("managerDesignation").value = s.designation || "Account Manager";
  $("managerPhone").value = s.phone || "";
  $("managerDetails").value = s.details || "";
  $("managerPhotoPreview").style.backgroundImage = s.managerPhoto ? `url("${s.managerPhoto}")` : "";
  $("managerPhotoPreview").textContent = s.managerPhoto ? "" : (s.manager || "SA").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
  applyTheme();
}

async function saveUsername() {
  const name = $("settingUsername").value.trim();
  if (!name) return toast("Enter a display username.");
  db.settings.username = name;
  scheduleSave();
  updateBranding();
  toast("Display username updated.");
}

async function changePassword() {
  const current = $("currentPassword").value;
  const next = $("newPassword").value;
  const confirmNext = $("confirmPassword").value;
  if (!current || !next) return toast("Fill in all password fields.");
  if (next.length < 6) return toast("New password must be at least 6 characters.");
  if (next !== confirmNext) return toast("New passwords do not match.");
  if (!(await verifyPassword(current))) return;

  const { error } = await sb.auth.updateUser({password:next});
  if (error) return toast("Password update failed: " + error.message);

  $("currentPassword").value = "";
  $("newPassword").value = "";
  $("confirmPassword").value = "";
  toast("Login password changed successfully.");
}

async function saveManagerProfile() {
  const password = $("managerVerifyPassword").value;
  if (!password) return toast("Enter your current login password.");
  if (!(await verifyPassword(password))) return;

  db.settings.manager = $("managerName").value.trim() || "Saim Ali";
  db.settings.designation = $("managerDesignation").value.trim();
  db.settings.phone = $("managerPhone").value.trim();
  db.settings.details = $("managerDetails").value.trim();
  if (managerPhotoData) db.settings.managerPhoto = managerPhotoData;

  $("managerVerifyPassword").value = "";
  managerPhotoData = "";
  fillSettings();
  updateBranding();
  await saveData(true);
  toast("Manager profile updated.");
}

async function compressPhoto(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 360;
        const scale = Math.min(1,max/Math.max(img.width,img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width*scale);
        canvas.height = Math.round(img.height*scale);
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",0.68));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveCompany() {
  db.settings.company = $("settingCompany").value.trim() || "PRESERVER TRANS LLC";
  db.settings.location = $("settingLocation").value.trim();
  db.settings.currency = $("settingCurrency").value;
  db.rate = Math.max(0,number($("settingRate").value));
  $("mileageRate").value = db.rate;
  updateBranding();
  renderSalary();
  await saveData(true);
}

async function saveTheme() {
  db.settings.displayStyle = $("displayStyle").value;
  db.settings.fontSize = $("fontSize").value;
  applyTheme();
  await saveData(true);
}

function showModal() {
  $("driverModal").classList.remove("hidden");
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!sb) return setMessage("Supabase configuration is missing.");
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const {data,error} = await sb.auth.signInWithPassword({email,password});
    if (error) return setMessage(error.message);
    user = data.user;
    await loadData();
    showApp();
  });

  $("signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const {data,error} = await sb.auth.signUp({
      email,password,
      options:{data:{full_name:name}}
    });
    if (error) return setMessage(error.message);
    if (data.session) {
      user = data.user;
      db.settings.username = name;
      db.settings.manager = name;
      await saveData(false);
      showApp();
    } else {
      setMessage("Account created. Check your email to confirm, then sign in.",true);
      $("signupForm").classList.add("hidden");
      $("loginForm").classList.remove("hidden");
    }
  });

  $("showSignup").onclick = () => {
    $("loginForm").classList.add("hidden");
    $("showSignup").classList.add("hidden");
    $("signupForm").classList.remove("hidden");
    setMessage("");
  };
  $("showLogin").onclick = () => {
    $("signupForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    $("showSignup").classList.remove("hidden");
    setMessage("");
  };

  $("logoutBtn").onclick = async () => {
    if (sb) await sb.auth.signOut();
    user = null;
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  };

  document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  $("menuToggle").onclick = () => $("sidebar").classList.toggle("open");
  $("salaryDriver").onchange = renderSalary;
  $("salaryMonth").onchange = renderSalary;

  $("mileageRate").onchange = () => {
    db.rate = Math.max(0,number($("mileageRate").value));
    const d = getSelectedDriver();
    if (d) monthFor(d,getSelectedMonth()).rows.forEach(r => r.rate = db.rate);
    scheduleSave();
    renderSalary();
  };

  $("addMileageBtn").onclick = addMileageRow;
  $("addAdditionBtn").onclick = () => addItem("adds","Addition");
  $("addFineBtn").onclick = () => addItem("fines","Fine / Deduction");
  $("addAdvanceBtn").onclick = () => addItem("advances","Advance / Recovery");
  $("recordPaymentBtn").onclick = recordPayment;

  $("mileageBody").addEventListener("change", e => {
    const input = e.target.closest("[data-row]");
    if (!input) return;
    const d = getSelectedDriver();
    if (!d) return;
    const row = monthFor(d,getSelectedMonth()).rows[Number(input.dataset.row)];
    if (!row) return;
    const field = input.dataset.field;
    row[field] = ["prev","next"].includes(field) ? number(input.value) : input.value;
    scheduleSave();
    renderSalary();
  });

  $("mileageBody").addEventListener("click", e => {
    const btn = e.target.closest("[data-delete-row]");
    if (!btn) return;
    if (!confirm("Delete this mileage row?")) return;
    const d = getSelectedDriver();
    monthFor(d,getSelectedMonth()).rows.splice(Number(btn.dataset.deleteRow),1);
    scheduleSave();
    renderSalary();
  });

  ["additionsBody","finesBody","advancesBody"].forEach(id => {
    $(id).addEventListener("click", e => {
      const btn = e.target.closest("[data-item-group]");
      if (!btn) return;
      if (!confirm("Delete this entry?")) return;
      const d = getSelectedDriver();
      monthFor(d,getSelectedMonth())[btn.dataset.itemGroup].splice(Number(btn.dataset.itemIndex),1);
      scheduleSave();
      renderSalary();
    });
  });

  $("addDriverBtn").onclick = showModal;
  $("addDriverBtn2").onclick = showModal;
  $("saveDriverBtn").onclick = addDriver;
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).classList.add("hidden"));
  $("driverModal").addEventListener("click",e => {
    if (e.target === $("driverModal")) $("driverModal").classList.add("hidden");
  });

  $("historySearch").oninput = renderHistory;
  $("historyBody").addEventListener("click",e => {
    const b = e.target.closest("[data-open-statement]");
    if (b) openStatement(b.dataset.openStatement,b.dataset.openMonth);
  });
  $("backHistoryBtn").onclick = () => showView("historyView");
  $("deleteStatementBtn").onclick = deleteCurrentStatement;
  $("statementPrintBtn").onclick = () => window.print();
  $("printSalaryBtn").onclick = () => {
    const d = getSelectedDriver();
    if (!d) return toast("Select a driver first.");
    const snapshot = makeStatementSnapshot(d,getSelectedMonth());
    renderStatement(snapshot);
    currentStatement = snapshot;
    showView("statementView");
    setTimeout(() => window.print(),150);
  };

  $("deletedBody").addEventListener("click",e => {
    const restore = e.target.closest("[data-restore]");
    const permanent = e.target.closest("[data-permanent]");
    if (restore) restoreRecord(restore.dataset.restore);
    if (permanent) permanentDelete(permanent.dataset.permanent);
  });

  $("saveNowBtn").onclick = () => saveData(true);
  $("saveUsernameBtn").onclick = saveUsername;
  $("changePasswordBtn").onclick = changePassword;
  $("saveManagerBtn").onclick = saveManagerProfile;
  $("saveCompanyBtn").onclick = saveCompany;
  $("saveThemeBtn").onclick = saveTheme;

  $("themeChoices").addEventListener("click",e => {
    const btn = e.target.closest("[data-theme]");
    if (!btn) return;
    db.settings.theme = btn.dataset.theme;
    applyTheme();
  });

  $("managerPhoto").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8*1024*1024) return toast("Please choose a photo smaller than 8 MB.");
    try {
      managerPhotoData = await compressPhoto(file);
      $("managerPhotoPreview").style.backgroundImage = `url("${managerPhotoData}")`;
      $("managerPhotoPreview").textContent = "";
    } catch {
      toast("Could not load this photo.");
    }
  };

  $("settingUsername").addEventListener("keydown",e => {
    if (e.key === "Enter") saveUsername();
  });
}

async function startApp() {
  $("salaryMonth").value = currentMonth();
  $("paymentDate").value = today();

  if (window.supabase && window.SUPABASE_CONFIG &&
      window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey &&
      !window.SUPABASE_CONFIG.anonKey.includes("PASTE_")) {
    sb = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );
  } else {
    setMessage("Please add your existing Supabase URL and anon key in supabase-config.js.");
  }

  bindEvents();

  if (sb) {
    const {data} = await sb.auth.getSession();
    if (data.session) {
      user = data.session.user;
      await loadData();
      showApp();
    }
    sb.auth.onAuthStateChange(async (event,session) => {
      if (event === "SIGNED_OUT") {
        user = null;
        $("app").classList.add("hidden");
        $("loginScreen").classList.remove("hidden");
      }
    });
  } else {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) normalizeData(JSON.parse(cached));
    } catch(e) { console.error(e); }
  }
}

document.addEventListener("DOMContentLoaded",startApp);
