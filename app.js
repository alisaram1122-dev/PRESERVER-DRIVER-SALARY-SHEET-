const $ = id => document.getElementById(id);

const STORAGE_KEY = "preserver_salary_cache_v2";
const SUPABASE_URL = window.PRESERVER_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.PRESERVER_SUPABASE_ANON_KEY;

let sb = null;
let user = null;
let db = { rate: 0.52, drivers: [] };
let activeId = null;
let currentMonth = new Date().toISOString().slice(0, 7);
let saveTimer = null;

const money = n =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(n) || 0);

const num = n =>
  (Number(n) || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2
  });

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2400);
}

function setAuthMessage(msg, good = false) {
  $("authMessage").textContent = msg;
  $("authMessage").style.color = good ? "#16845b" : "#b44343";
}

function cache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Local cache error:", e);
  }
}

function restoreCache() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
      { rate: 0.52, drivers: [] };
  } catch {
    return { rate: 0.52, drivers: [] };
  }
}

function scheduleSave() {
  cache();

  if (!user || !sb) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCloud, 650);
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
    db = data.payload;
    db.drivers ||= [];
    db.rate = Number(db.rate ?? 0.52);
  } else {
    db = { rate: 0.52, drivers: [] };
    await saveCloud();
  }

  cache();
  activeId = db.drivers[0]?.id || null;

  render();

  $("loginScreen").classList.add("hidden");
  $("userLabel").textContent = user.email || "Account";
}

function monthData(d) {
  d.months ||= {};

  d.months[currentMonth] ||= {
    rows: [],
    adds: [],
    fines: [],
    advances: [],
    recoveries: [],
    payments: []
  };

  const m = d.months[currentMonth];

  m.rows ||= [];
  m.adds ||= [];
  m.fines ||= [];
  m.advances ||= [];
  m.recoveries ||= [];
  m.payments ||= [];

  return m;
}

function driver() {
  return db.drivers.find(d => d.id === activeId);
}

function allDriverMonths(d) {
  return Object.values(d.months || {});
}

function totalsFor(d) {
  let adv = 0;
  let rec = 0;

  allDriverMonths(d).forEach(m => {
    (m.advances || []).forEach(x => {
      adv += Number(x.amount) || 0;
    });

    (m.recoveries || []).forEach(x => {
      rec += Number(x.amount) || 0;
    });
  });

  return {
    adv,
    rec,
    balance: adv - rec
  };
}

function renderTabs() {
  const wrap = $("driverTabs");
  wrap.innerHTML = "";

  db.drivers.forEach(d => {
    const b = document.createElement("button");

    b.className =
      "driver-tab" + (d.id === activeId ? " active" : "");

    b.textContent = d.name || "Unnamed Driver";

    b.onclick = () => {
      activeId = d.id;
      render();
    };

    wrap.append(b);
  });
}

function render() {
  renderTabs();

  const d = driver();
  const empty = !d;

  $("emptyState").classList.toggle("hidden", !empty);
  $("sheetArea").classList.toggle("hidden", empty);

  if (empty) return;

  const m = monthData(d);
  const [y, mo] = currentMonth.split("-");

  $("sheetDriverName").textContent = d.name;

  $("sheetPeriod").textContent =
    new Date(+y, +mo - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }) + " salary statement";

  $("driverName").value = d.name;
  $("truckNumber").value = d.truck || "";

  $("monthDisplay").value =
    new Date(+y, +mo - 1, 1).toLocaleDateString("en-US", {
      month: "long"
    });

  $("yearDisplay").value = y;

  renderMileage(m);

  renderMoneyRows(
    m,
    "adds",
    "deductionRows",
    "Salary addition description"
  );

  renderMoneyRows(
    m,
    "fines",
    "fineRows",
    "Fine description"
  );

  renderMoneyRows(
    m,
    "advances",
    "advanceRows",
    "Advance purpose / note"
  );

  renderMoneyRows(
    m,
    "recoveries",
    "recoveryRows",
    "Advance recovery note"
  );

  renderMoneyRows(
    m,
    "payments",
    "paymentRows",
    "Payment note"
  );

  calc(m, d);
}

function renderMileage(m) {
  const body = $("mileageRows");
  body.innerHTML = "";

  if (!m.rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;color:#8793a3;padding:22px">
          No mileage entries. Select “Add Mileage Row” to begin.
        </td>
      </tr>
    `;
    return;
  }

  m.rows.forEach(r => {
    const tr = document.createElement("tr");

    const difference = Math.max(
      0,
      (Number(r.next) || 0) - (Number(r.prev) || 0)
    );

    const amount = difference * (Number(r.rate) || 0);

    tr.innerHTML = `
      <td>
        <input class="date-input" type="date"
          value="${r.date || ""}" data-field="date">
      </td>

      <td>
        <input type="number" min="0" step="0.1"
          value="${r.prev ?? ""}" placeholder="0" data-field="prev">
      </td>

      <td>
        <input type="number" min="0" step="0.1"
          value="${r.next ?? ""}" placeholder="0" data-field="next">
      </td>

      <td><span class="calculated">${num(difference)}</span></td>

      <td>
        <input type="number" min="0" step="0.01"
          value="${r.rate ?? db.rate}" data-field="rate">
      </td>

      <td class="amount">${money(amount)}</td>

      <td><button class="delete-row">×</button></td>
    `;

    tr.querySelectorAll("input").forEach(inp => {
      inp.onchange = () => {
        const field = inp.dataset.field;

        r[field] = field === "date"
          ? inp.value
          : (inp.value === "" ? "" : Number(inp.value));

        scheduleSave();
        render();
      };
    });

    tr.querySelector("button").onclick = () => {
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
      <input value="${esc(r.desc || "")}"
        placeholder="${placeholder}" aria-label="Description">

      <input type="number" min="0" step="0.01"
        value="${r.amount ?? ""}" placeholder="0.00"
        aria-label="Amount">

      <button class="delete-row">×</button>
    `;

    const [desc, amt] = row.querySelectorAll("input");

    desc.onchange = () => {
      r.desc = desc.value;
      scheduleSave();
    };

    amt.onchange = () => {
      r.amount = Number(amt.value) || 0;
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

function calc(m, d) {
  let prev = 0;
  let next = 0;
  let miles = 0;
  let earn = 0;

  m.rows.forEach(r => {
    prev += Number(r.prev) || 0;
    next += Number(r.next) || 0;

    const diff = Math.max(
      0,
      (Number(r.next) || 0) - (Number(r.prev) || 0)
    );

    miles += diff;
    earn += diff * (Number(r.rate) || 0);
  });

  const adds = m.adds.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const fines = m.fines.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const adv = m.advances.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const rec = m.recoveries.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const paid = m.payments.reduce(
    (s, r) => s + (Number(r.amount) || 0), 0
  );

  const gross = earn + adds - fines - rec;
  const remaining = gross - paid;
  const advanceBalance = totalsFor(d).balance;

  $("totalPrev").textContent = num(prev);
  $("totalNew").textContent = num(next);
  $("totalMiles").textContent = num(miles);

  $("mileageTotal").textContent = money(earn);
  $("deductionTotal").textContent = money(adds);
  $("fineTotal").textContent = money(fines);

  $("advanceTotal").textContent = money(adv);
  $("recoveryTotal").textContent = money(rec);
  $("advanceBalance").textContent = money(advanceBalance);

  $("paidTotal").textContent = money(paid);
  $("salaryBalance").textContent = money(remaining);
  $("finalSalary").textContent = money(gross);
}

$("monthPicker").value = currentMonth;

$("monthPicker").onchange = e => {
  currentMonth = e.target.value || currentMonth;
  render();
};

function addRow(key) {
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

$("addMileageBtn").onclick = () => {
  const d = driver();
  if (!d) return;

  monthData(d).rows.push({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    prev: 0,
    next: 0,
    rate: db.rate
  });

  scheduleSave();
  render();
};

$("addDeductionBtn").onclick = () => addRow("adds");
$("addFineBtn").onclick = () => addRow("fines");
$("addAdvanceBtn").onclick = () => addRow("advances");
$("addRecoveryBtn").onclick = () => addRow("recoveries");
$("addPaymentBtn").onclick = () => addRow("payments");

$("driverName").onchange = e => {
  const d = driver();

  if (d) {
    d.name = e.target.value.trim() || d.name;
    scheduleSave();
    renderTabs();
    $("sheetDriverName").textContent = d.name;
  }
};

$("truckNumber").onchange = e => {
  const d = driver();

  if (d) {
    d.truck = e.target.value.trim();
    scheduleSave();
  }
};

function openModal() {
  $("driverModal").classList.remove("hidden");
  $("newDriverName").focus();
}

function closeModal() {
  $("driverModal").classList.add("hidden");
  $("newDriverName").value = "";
  $("newTruckNumber").value = "";
}

$("addDriverBtn").onclick = openModal;
$("emptyAddBtn").onclick = openModal;

$("closeModal").onclick = closeModal;
$("cancelDriver").onclick = closeModal;

$("createDriver").onclick = () => {
  const name = $("newDriverName").value.trim();
  const truck = $("newTruckNumber").value.trim();

  if (!name) {
    toast("Please enter driver name.");
    return;
  }

  const d = {
    id: uid(),
    name,
    truck,
    months: {}
  };

  db.drivers.push(d);
  activeId = d.id;

  scheduleSave();
  closeModal();
  render();

  toast("Driver sheet created and syncing.");
};

$("deleteDriverBtn").onclick = () => {
  const d = driver();

  if (
    d &&
    confirm(`Delete ${d.name} and all saved salary records?`)
  ) {
    db.drivers = db.drivers.filter(x => x.id !== d.id);
    activeId = db.drivers[0]?.id || null;

    scheduleSave();
    render();

    toast("Driver deleted.");
  }
};

$("printBtn").onclick = () => window.print();

$("navSalary").onclick = () => {
  $("salaryView").classList.remove("hidden");
  $("settingsView").classList.add("hidden");

  $("navSalary").classList.add("active");
  $("navSettings").classList.remove("active");
};

$("navSettings").onclick = () => {
  $("salaryView").classList.add("hidden");
  $("settingsView").classList.remove("hidden");

  $("navSettings").classList.add("active");
  $("navSalary").classList.remove("active");

  $("defaultRate").value = Number(db.rate).toFixed(2);
};

$("saveSettings").onclick = () => {
  const v = Number($("defaultRate").value);

  if (!Number.isFinite(v) || v < 0) {
    toast("Enter a valid rate.");
    return;
  }

  db.rate = v;
  scheduleSave();

  toast("Default rate saved: " + money(v) + " per mile.");
};

$("logoutBtn").onclick = async () => {
  if (sb) await sb.auth.signOut();

  user = null;
  $("loginScreen").classList.remove("hidden");
  setAuthMessage("Signed out.", true);
};

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

  setAuthMessage(
    mode === "login" ? "Signing in…" : "Creating account…",
    true
  );

  const result = mode === "login"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });

  if (result.error) {
    setAuthMessage(result.error.message);
    return;
  }

  if (mode === "signup" && !result.data.session) {
    setAuthMessage(
      "Account created. Check your email to confirm, then log in.",
      true
    );
    return;
  }

  user = result.data.user;

  if (user) {
    try {
      await loadCloud();
      setAuthMessage("");
      toast("Cloud account connected.");
    } catch (e) {
      setAuthMessage("Database setup error: " + e.message);
    }
  }
}

$("loginBtn").onclick = () => authAction("login");
$("signupBtn").onclick = () => authAction("signup");

async function init() {
  if (
    !window.supabase ||
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes("PASTE_")
  ) {
    setAuthMessage(
      "Setup required: add your Supabase anon/publishable key in supabase-config.js."
    );
    return;
  }

  sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const { data } = await sb.auth.getSession();

  if (data.session) {
    user = data.session.user;

    try {
      await loadCloud();
    } catch (e) {
      setAuthMessage("Database setup error: " + e.message);
    }
  }
}

init();
