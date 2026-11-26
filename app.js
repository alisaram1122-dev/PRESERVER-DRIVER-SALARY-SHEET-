
const $ = id => document.getElementById(id);

const STORAGE_KEY = "preserver_salary_cache_v2";
const SUPABASE_URL = window.PRESERVER_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.PRESERVER_SUPABASE_ANON_KEY;

let sb = null;
let user = null;
let db = {
  rate: 0.52,
  drivers: [],
  history: [],
  settings: {}
};

let activeId = null;
let currentMonth = new Date().toISOString().slice(0, 7);
let saveTimer = null;

const defaultSettings = {
  company: "Preserver Trans LLC",
  manager: "Saim Ali",
  location: "USA California",
  currency: "USD",
  decimals: 0,
  paymentMethod: "Cash",
  addition: "Extra payment",
  fine: "Fine",
  advance: "Driver advance",
  autoMiles: true,
  confirmPay: true,
  showZero: false
};

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const money = n => {
  const currency = db.settings?.currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(Number(n) || 0);
  } catch {
    return "$" + (Number(n) || 0).toFixed(2);
  }
};

const num = n =>
  (Number(n) || 0).toLocaleString("en-US", {
    maximumFractionDigits: Number(db.settings?.decimals ?? 0)
  });

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function setAuthMessage(message, good = false) {
  $("authMessage").textContent = message;
  $("authMessage").style.color = good ? "#16845b" : "#c84b4b";
}

function cache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Local save error", e);
    toast("Local storage is full. Try a smaller driver photo.");
  }
}

function normalizeDB(data) {
  const result = data && typeof data === "object"
    ? data
    : { rate: 0.52, drivers: [] };

  result.rate = Number(result.rate ?? 0.52);
  result.drivers = Array.isArray(result.drivers) ? result.drivers : [];
  result.history = Array.isArray(result.history) ? result.history : [];
  result.settings = {
    ...defaultSettings,
    ...(result.settings || {})
  };

  result.drivers.forEach(d => {
    d.months = d.months || {};
    d.photo = d.photo || "";
    d.phone = d.phone || "";
    d.address = d.address || "";
    d.notes = d.notes || "";

    Object.values(d.months).forEach(m => {
      m.rows ||= [];
      m.adds ||= [];
      m.fines ||= [];
      m.advances ||= [];
      m.recoveries ||= [];
      m.payments ||= [];
    });
  });

  return result;
}

function scheduleSave() {
  cache();
  if (!user || !sb) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCloud, 700);
}

async function saveCloud() {
  if (!user || !sb) return;

  const { error } = await sb
    .from("driver_salary_data")
    .upsert({
      user_id: user.id,
      payload: db,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "user_id"
    });

  if (error) {
    console.error(error);
    toast("Cloud save failed: " + error.message);
  }
}

async function loadCloud() {
  const { data, error } = await sb
    .from("driver_salary_data")
    .select("payload")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (data?.payload) {
    db = normalizeDB(data.payload);
  } else {
    db = normalizeDB({
      rate: 0.52,
      drivers: [],
      history: [],
      settings: defaultSettings
    });
    await saveCloud();
  }

  cache();
  activeId = db.drivers[0]?.id || null;

  $("monthPicker").value = currentMonth;
  $("loginScreen").classList.add("hidden");
  $("userLabel").textContent = db.settings.manager || user.email || "Account";

  render();
}

function driver() {
  return db.drivers.find(d => d.id === activeId);
}

function monthData(d, month = currentMonth) {
  d.months ||= {};

  d.months[month] ||= {
    rows: [],
    adds: [],
    fines: [],
    advances: [],
    recoveries: [],
    payments: []
  };

  const m = d.months[month];

  m.rows ||= [];
  m.adds ||= [];
  m.fines ||= [];
  m.advances ||= [];
  m.recoveries ||= [];
  m.payments ||= [];

  return m;
}

function allMonths(d) {
  return Object.keys(d.months || {})
    .sort()
    .map(key => ({ key, data: d.months[key] }));
}

function mileageEntries(d) {
  const entries = [];

  allMonths(d).forEach(({ key, data }) => {
    (data.rows || []).forEach(r => {
      entries.push({
        ...r,
        monthKey: key
      });
    });
  });

  return entries.sort((a, b) =>
    String(a.date || a.monthKey).localeCompare(String(b.date || b.monthKey))
  );
}

function lastMilesFor(d) {
  const entries = mileageEntries(d);
  if (!entries.length) return 0;

  const latest = entries[entries.length - 1];
  return Number(latest.next) || 0;
}

function monthFigures(d, month) {
  const m = monthData(d, month);

  let miles = 0;
  let mileagePay = 0;
  let prev = 0;
  let next = 0;

  m.rows.forEach(r => {
    const difference = Math.max(
      0,
      (Number(r.next) || 0) - (Number(r.prev) || 0)
    );

    prev += Number(r.prev) || 0;
    next += Number(r.next) || 0;
    miles += difference;
    mileagePay += difference * (Number(r.rate) || 0);
  });

  const additions = m.adds.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const fines = m.fines.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const advances = m.advances.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const recoveries = m.recoveries.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const paid = m.payments.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const gross = mileagePay + additions - fines - recoveries;

  return {
    prev,
    next,
    miles,
    mileagePay,
    additions,
    fines,
    advances,
    recoveries,
    paid,
    gross,
    balance: gross - paid
  };
}

function driverFigures(d) {
  let earned = 0;
  let paid = 0;
  let miles = 0;

  allMonths(d).forEach(({ key }) => {
    const f = monthFigures(d, key);
    earned += f.gross;
    paid += f.paid;
    miles += f.miles;
  });

  return {
    earned,
    paid,
    miles,
    balance: Math.max(0, earned - paid)
  };
}

function previousDues(d) {
  let total = 0;

  allMonths(d).forEach(({ key }) => {
    if (key < currentMonth) {
      total += monthFigures(d, key).balance;
    }
  });

  return Math.max(0, total);
}

function renderTabs() {
  const wrap = $("driverTabs");
  wrap.innerHTML = "";

  db.drivers.forEach(d => {
    const button = document.createElement("button");
    button.className = "driver-tab" + (d.id === activeId ? " active" : "");
    button.textContent = d.name || "Unnamed Driver";

    button.onclick = () => {
      activeId = d.id;
      render();
    };

    wrap.append(button);
  });
}

function render() {
  renderTabs();

  const d = driver();
  const empty = !d;

  $("emptyState").classList.toggle("hidden", !empty);
  $("sheetArea").classList.toggle("hidden", empty);

  if (!d) return;

  const m = monthData(d);
  const f = monthFigures(d, currentMonth);
  const total = driverFigures(d);
  const dues = previousDues(d);

  const [year, month] = currentMonth.split("-");
  const monthName = new Date(
    Number(year),
    Number(month) - 1,
    1
  ).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  $("sheetDriverName").textContent = d.name;
  $("sheetPeriod").textContent = monthName + " Salary Statement";

  $("driverName").value = d.name || "";
  $("truckNumber").value = d.truck || "";
  $("driverPhone").value = d.phone || "";
  $("driverAddress").value = d.address || "";
  $("driverNotes").value = d.notes || "";

  $("lastMiles").textContent = num(lastMilesFor(d));
  $("currentMiles").textContent = num(f.miles);
  $("previousDues").textContent = money(dues);
  $("driverOutstanding").textContent = money(total.balance);
  $("dueBoxBalance").textContent = money(total.balance);

  const photo = d.photo || "";
  $("profilePreview").src = photo || defaultPhoto();
  $("profileLarge").src = photo || defaultPhoto();

  renderMileage(m);
  renderMoneyRows(m, "adds", "additionRows", db.settings.addition);
  renderMoneyRows(m, "fines", "fineRows", db.settings.fine);
  renderMoneyRows(m, "advances", "advanceRows", db.settings.advance);
  renderMoneyRows(m, "recoveries", "recoveryRows", "Advance recovery");

  $("totalPrev").textContent = num(f.prev);
  $("totalNew").textContent = num(f.next);
  $("totalMiles").textContent = num(f.miles);

  $("mileageTotal").textContent = money(f.mileagePay);
  $("additionTotal").textContent = money(f.additions);
  $("fineTotal").textContent = money(f.fines);
  $("advanceTotal").textContent = money(f.advances);
  $("recoveryTotal").textContent = money(f.recoveries);
  $("finalSalary").textContent = money(f.gross);

  $("footerCompany").textContent =
    db.settings.company + " · " + db.settings.location;
}

function defaultPhoto() {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
      <rect width="100%" height="100%" fill="#e8edf4"/>
      <circle cx="60" cy="43" r="22" fill="#aab7c8"/>
      <path d="M18 115c3-28 19-42 42-42s39 14 42 42" fill="#aab7c8"/>
    </svg>`
  );
}

function renderMileage(m) {
  const body = $("mileageRows");
  body.innerHTML = "";

  if (!m.rows.length) {
    body.innerHTML = `
      <tr><td colspan="7" class="empty-cell">
        No mileage entries. Click Add Mileage to start.
      </td></tr>`;
    return;
  }

  m.rows.forEach(r => {
    const tr = document.createElement("tr");
    const diff = Math.max(
      0,
      (Number(r.next) || 0) - (Number(r.prev) || 0)
    );
    const amount = diff * (Number(r.rate) || 0);

    tr.innerHTML = `
      <td><input type="date" value="${esc(r.date || "")}" data-field="date"></td>
      <td><input type="number" value="${r.prev ?? 0}" readonly></td>
      <td><input type="number" min="0" step="0.1"
        value="${r.next ?? ""}" placeholder="Enter new miles" data-field="next"></td>
      <td><span class="calculated">${num(diff)}</span></td>
      <td><input type="number" min="0" step="0.01"
        value="${r.rate ?? db.rate}" data-field="rate"></td>
      <td class="amount">${money(amount)}</td>
      <td><button class="delete-row" title="Delete row">×</button></td>
    `;

    tr.querySelectorAll("[data-field]").forEach(input => {
      input.onchange = () => {
        const field = input.dataset.field;
        const value = input.value;

        if (field === "date") {
          r.date = value;
        } else {
          r[field] = value === "" ? "" : Number(value);
        }

        scheduleSave();
        render();
      };
    });

    tr.querySelector(".delete-row").onclick = () => {
      if (!confirm("Delete this mileage row?")) return;
      m.rows = m.rows.filter(x => x !== r);
      scheduleSave();
      render();
    };

    body.append(tr);
  });
}

function renderMoneyRows(m, key, container, placeholder) {
  const el = $(container);
  el.innerHTML = "";

  m[key].forEach(r => {
    const row = document.createElement("div");
    row.className = "money-row";

    row.innerHTML = `
      <input value="${esc(r.desc || "")}" placeholder="${esc(placeholder)}">
      <input type="number" min="0" step="0.01"
        value="${r.amount ?? ""}" placeholder="0.00">
      <button class="delete-row">×</button>
    `;

    const [description, amount] = row.querySelectorAll("input");

    description.onchange = () => {
      r.desc = description.value;
      scheduleSave();
    };

    amount.onchange = () => {
      r.amount = Number(amount.value) || 0;
      scheduleSave();
      render();
    };

    row.querySelector("button").onclick = () => {
      m[key] = m[key].filter(x => x !== r);
      scheduleSave();
      render();
    };

    el.append(row);
  });
}

function addMoneyRow(key) {
  const d = driver();
  if (!d) return;

  monthData(d)[key].push({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    desc: "",
    amount: 0
  });

  scheduleSave();
  render();
}

function addMileage() {
  const d = driver();
  if (!d) return;

  const previous = db.settings.autoMiles
    ? lastMilesFor(d)
    : 0;

  monthData(d).rows.push({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    prev: previous,
    next: "",
    rate: db.rate
  });

  scheduleSave();
  render();
}

function renderOutstanding() {
  const body = $("outstandingRows");
  body.innerHTML = "";

  const drivers = db.drivers.filter(d => {
    const balance = driverFigures(d).balance;
    return db.settings.showZero || balance > 0;
  });

  if (!drivers.length) {
    body.innerHTML = `<tr><td colspan="7">No outstanding balances.</td></tr>`;
    return;
  }

  drivers.forEach(d => {
    const f = driverFigures(d);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${esc(d.name)}</strong></td>
      <td>${esc(d.truck || "")}</td>
      <td>${num(lastMilesFor(d))}</td>
      <td>${money(f.earned)}</td>
      <td>${money(f.paid)}</td>
      <td class="amount">${money(f.balance)}</td>
      <td><button class="primary small">Open / Pay</button></td>
    `;

    tr.querySelector("button").onclick = () => {
      activeId = d.id;
      showView("salary");
      render();
      $("duePaymentAmount").focus();
    };

    body.append(tr);
  });
}

function renderHistory() {
  const body = $("historyRows");
  body.innerHTML = "";

  const history = [...db.history].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );

  if (!history.length) {
    body.innerHTML = `<tr><td colspan="10">No payments recorded yet.</td></tr>`;
    return;
  }

  history.forEach(h => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${esc(h.date || "")}</td>
      <td>${esc(h.driverName || "")}</td>
      <td>${esc(h.truck || "")}</td>
      <td>${esc(h.month || "")}</td>
      <td>${num(h.previousMiles)}</td>
      <td>${num(h.newMiles)}</td>
      <td>${money(h.monthSalary)}</td>
      <td class="amount">${money(h.payment)}</td>
      <td>${money(h.remaining)}</td>
      <td><strong class="paid-label">PAID</strong></td>
    `;

    body.append(tr);
  });
}

function showView(view) {
  const views = {
    salary: "salaryView",
    outstanding: "outstandingView",
    history: "historyView",
    settings: "settingsView"
  };

  Object.values(views).forEach(id => $(id).classList.add("hidden"));
  Object.values({
    salary: "navSalary",
    outstanding: "navOutstanding",
    history: "navHistory",
    settings: "navSettings"
  }).forEach(id => $(id).classList.remove("active"));

  $(views[view]).classList.remove("hidden");

  const nav = {
    salary: "navSalary",
    outstanding: "navOutstanding",
    history: "navHistory",
    settings: "navSettings"
  };

  $(nav[view]).classList.add("active");

  if (view === "outstanding") renderOutstanding();
  if (view === "history") renderHistory();
  if (view === "salary") render();
  if (view === "settings") loadSettingsForm();
}

function payDue() {
  const d = driver();
  if (!d) return;

  const amount = Number($("duePaymentAmount").value);
  const balance = driverFigures(d).balance;

  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Enter a valid payment amount.");
    return;
  }

  if (amount > balance + 0.001) {
    toast("Payment cannot be greater than outstanding balance.");
    return;
  }

  if (db.settings.confirmPay) {
    if (!confirm("Confirm payment of " + money(amount) + " for " + d.name + "?")) {
      return;
    }
  }

  const m = monthData(d);
  const f = monthFigures(d, currentMonth);
  const date = new Date().toISOString().slice(0, 10);
  const note = $("duePaymentNote").value.trim() ||
    db.settings.paymentMethod;

  m.payments.push({
    id: uid(),
    date,
    desc: note,
    amount,
    status: "Paid"
  });

  const newBalance = Math.max(0, balance - amount);

  // Save a salary-sheet snapshot with every payment.
  db.history.push({
    id: uid(),
    date,
    driverId: d.id,
    driverName: d.name,
    truck: d.truck || "",
    month: currentMonth,
    previousMiles: f.prev,
    newMiles: f.next,
    monthMiles: f.miles,
    monthSalary: f.gross,
    payment: amount,
    remaining: newBalance,
    note,
    status: "Paid"
  });

  $("duePaymentAmount").value = "";
  $("duePaymentNote").value = "";

  scheduleSave();
  render();
  renderOutstanding();
  renderHistory();

  toast("Payment saved. Updated balance: " + money(newBalance));
}

function loadSettingsForm() {
  const s = db.settings;

  $("settingCompany").value = s.company;
  $("settingManager").value = s.manager;
  $("settingLocation").value = s.location;
  $("defaultRate").value = db.rate;
  $("settingCurrency").value = s.currency;
  $("settingDecimals").value = String(s.decimals);
  $("settingPaymentMethod").value = s.paymentMethod;
  $("settingAddition").value = s.addition;
  $("settingFine").value = s.fine;
  $("settingAdvance").value = s.advance;
  $("settingAutoMiles").checked = !!s.autoMiles;
  $("settingConfirmPay").checked = !!s.confirmPay;
  $("settingShowZero").checked = !!s.showZero;
}

function saveSettings() {
  const rate = Number($("defaultRate").value);

  if (!Number.isFinite(rate) || rate < 0) {
    toast("Enter a valid mileage rate.");
    return;
  }

  db.rate = rate;

  db.settings = {
    company: $("settingCompany").value.trim() || "Preserver Trans LLC",
    manager: $("settingManager").value.trim() || "Saim Ali",
    location: $("settingLocation").value.trim() || "USA California",
    currency: $("settingCurrency").value,
    decimals: Number($("settingDecimals").value),
    paymentMethod: $("settingPaymentMethod").value,
    addition: $("settingAddition").value.trim() || "Extra payment",
    fine: $("settingFine").value.trim() || "Fine",
    advance: $("settingAdvance").value.trim() || "Driver advance",
    autoMiles: $("settingAutoMiles").checked,
    confirmPay: $("settingConfirmPay").checked,
    showZero: $("settingShowZero").checked
  };

  $("companyHeading").textContent = db.settings.company + " Payroll";
  $("userLabel").textContent = db.settings.manager;

  scheduleSave();
  render();
  toast("All settings saved.");
}

function updateDriverField(field, value) {
  const d = driver();
  if (!d) return;

  d[field] = value;
  scheduleSave();

  if (field === "name") {
    $("sheetDriverName").textContent = value;
    renderTabs();
  }
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = reject;

    reader.onload = () => {
      const img = new Image();

      img.onerror = reject;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 360;
        const scale = Math.min(1, max / Math.max(img.width, img.height));

        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

async function uploadDriverPhoto(file) {
  const d = driver();
  if (!d || !file) return;

  if (!file.type.startsWith("image/")) {
    toast("Please select an image.");
    return;
  }

  try {
    d.photo = await resizePhoto(file);
    scheduleSave();
    render();
    toast("Driver photo saved.");
  } catch (e) {
    console.error(e);
    toast("Could not load this photo.");
  }
}

function openDriverModal() {
  $("driverModal").classList.remove("hidden");
  $("newDriverName").focus();
}

function closeDriverModal() {
  $("driverModal").classList.add("hidden");
  $("newDriverName").value = "";
  $("newTruckNumber").value = "";
}

function createDriver() {
  const name = $("newDriverName").value.trim();
  const truck = $("newTruckNumber").value.trim();

  if (!name) {
    toast("Enter driver name.");
    return;
  }

  const d = {
    id: uid(),
    name,
    truck,
    phone: "",
    address: "",
    notes: "",
    photo: "",
    months: {}
  };

  db.drivers.push(d);
  activeId = d.id;

  closeDriverModal();
  scheduleSave();
  render();

  toast("Driver profile created.");
}

// Navigation
$("navSalary").onclick = () => showView("salary");
$("navOutstanding").onclick = () => showView("outstanding");
$("navHistory").onclick = () => showView("history");
$("navSettings").onclick = () => showView("settings");

// Month selector
$("monthPicker").value = currentMonth;
$("monthPicker").onchange = e => {
  currentMonth = e.target.value || currentMonth;
  render();
};

// Driver actions
$("addDriverBtn").onclick = openDriverModal;
$("emptyAddBtn").onclick = openDriverModal;
$("closeModal").onclick = closeDriverModal;
$("cancelDriver").onclick = closeDriverModal;
$("createDriver").onclick = createDriver;

$("driverName").onchange = e => updateDriverField("name", e.target.value.trim());
$("truckNumber").onchange = e => updateDriverField("truck", e.target.value.trim());
$("driverPhone").onchange = e => updateDriverField("phone", e.target.value.trim());
$("driverAddress").onchange = e => updateDriverField("address", e.target.value.trim());
$("driverNotes").onchange = e => updateDriverField("notes", e.target.value.trim());

$("photoInput").onchange = e => {
  uploadDriverPhoto(e.target.files[0]);
  e.target.value = "";
};

// Salary sheet actions
$("addMileageBtn").onclick = addMileage;
$("addAdditionBtn").onclick = () => addMoneyRow("adds");
$("addFineBtn").onclick = () => addMoneyRow("fines");
$("addAdvanceBtn").onclick = () => addMoneyRow("advances");
$("addRecoveryBtn").onclick = () => addMoneyRow("recoveries");

$("payDueBtn").onclick = payDue;
$("printBtn").onclick = () => window.print();
$("printHistoryBtn").onclick = () => window.print();
$("saveSettings").onclick = saveSettings;

// Authentication
async function authAction(mode) {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  if (!email || !password) {
    setAuthMessage("Enter your email and password.");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.");
    return;
  }

  setAuthMessage(mode === "login" ? "Signing in..." : "Creating account...", true);

  const result = mode === "login"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });

  if (result.error) {
    setAuthMessage(result.error.message);
    return;
  }

  if (mode === "signup" && !result.data.session) {
    setAuthMessage("Account created. Confirm your email, then log in.", true);
    return;
  }

  user = result.data.user;

  if (user) {
    try {
      await loadCloud();
      toast("Connected to cloud database.");
    } catch (e) {
      setAuthMessage("Database error: " + e.message);
    }
  }
}

$("loginBtn").onclick = () => authAction("login");
$("signupBtn").onclick = () => authAction("signup");

$("logoutBtn").onclick = async () => {
  if (sb) await sb.auth.signOut();
  user = null;
  $("loginScreen").classList.remove("hidden");
  setAuthMessage("You have signed out.", true);
};

async function init() {
  if (
    !window.supabase ||
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes("PASTE_")
  ) {
    setAuthMessage("Add your existing Supabase anon key in supabase-config.js.");
    return;
  }

  sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const { data, error } = await sb.auth.getSession();

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  if (data.session) {
    user = data.session.user;

    try {
      await loadCloud();
    } catch (e) {
      setAuthMessage("Database error: " + e.message);
    }
  }
}

init();
