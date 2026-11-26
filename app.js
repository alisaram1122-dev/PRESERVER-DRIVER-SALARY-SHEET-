
/* PRESERVER TRANS LLC - DRIVER PAYROLL */

"use strict";

const $ = id => document.getElementById(id);
const CACHE = "preserver_salary_cache_v2";
const DEFAULT_RATE = 0.52;

const DEFAULT_SETTINGS = {
  company: "PRESERVER TRANS LLC",
  manager: "Saim Ali",
  username: "Saim Ali",
  designation: "Account Manager",
  location: "USA California",
  currency: "$",
  theme: "navy",
  displayStyle: "modern",
  fontSize: "normal",
  sidebarStyle: "gradient"
};

let sb = null;
let user = null;
let saveTimer = null;
let currentStatement = null;
let managerPhotoData = "";
let newDriverPhotoData = "";
let reportColumns = ["driver","truck","months","miles","salary","fines","paid","due"];

let db = {
  rate: DEFAULT_RATE,
  drivers: [],
  history: [],
  deletedRecords: [],
  settings: {...DEFAULT_SETTINGS}
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const today = () => new Date().toISOString().slice(0,10);
const thisMonth = () => today().slice(0,7);
const money = v => (db.settings.currency || "$") + n(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const monthLabel = m => {
  if(!m) return "";
  const d = new Date(m + "-01T12:00:00");
  return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString("en-US",{month:"long",year:"numeric"});
};

function toast(message){
  const el = $("appToast");
  if(!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>el.classList.remove("show"),3000);
}

function msg(message,success=false){
  $("loginMessage").textContent = message;
  $("loginMessage").style.color = success ? "#16835f" : "#d94b55";
}

function normalizeMonth(m={}){
  if(!m || typeof m !== "object") m = {};
  m.rows = Array.isArray(m.rows) ? m.rows : [];
  m.adds = Array.isArray(m.adds) ? m.adds : [];
  m.fines = Array.isArray(m.fines) ? m.fines : [];
  m.advances = Array.isArray(m.advances) ? m.advances : [];
  m.recoveries = Array.isArray(m.recoveries) ? m.recoveries : [];
  m.payments = Array.isArray(m.payments) ? m.payments : [];

  // Migrate older mileage records without removing their data.
  m.rows.forEach(r=>{
    if(r.miles === undefined || r.miles === null){
      r.miles = Math.max(0,n(r.next)-n(r.prev));
    }
    if(r.rate === undefined || r.rate === null) r.rate = n(db.rate) || DEFAULT_RATE;
    r.miles = Math.max(0,n(r.miles));
  });

  m.adds.forEach(x=>x.amount=n(x.amount));
  m.fines.forEach(x=>x.amount=n(x.amount));
  m.recoveries.forEach(x=>x.amount=n(x.amount));
  m.payments.forEach(x=>x.amount=n(x.amount));
  return m;
}

function normalize(){
  db.rate = Math.max(0,n(db.rate) || DEFAULT_RATE);
  db.drivers = Array.isArray(db.drivers) ? db.drivers : [];
  db.history = Array.isArray(db.history) ? db.history : [];
  db.deletedRecords = Array.isArray(db.deletedRecords) ? db.deletedRecords : [];
  db.settings = {...DEFAULT_SETTINGS,...(db.settings || {})};

  db.drivers.forEach(d=>{
    d.id = d.id || uid();
    d.name = d.name || d.driverName || "Unnamed Driver";
    d.truck = d.truck || d.truckNo || "";
    d.months = d.months && typeof d.months === "object" ? d.months : {};
    d.advanceBalance = Math.max(0,n(d.advanceBalance));
    d.advanceLedger = Array.isArray(d.advanceLedger) ? d.advanceLedger : [];
    Object.keys(d.months).forEach(k=>{
      d.months[k] = normalizeMonth(d.months[k]);
    });
  });
}

function saveCache(){
  try{
    localStorage.setItem(CACHE,JSON.stringify(db));
  }catch(e){
    console.error(e);
    toast("Local storage is full. Consider using a smaller photo.");
  }
}

async function saveData(show=false){
  saveCache();

  if(!sb || !user){
    if(show) toast("Saved on this device. Cloud sign-in is not active.");
    return false;
  }

  $("saveStatus").textContent = "Saving to cloud...";

  try{
    const {error} = await sb.from("driver_salary_data").upsert({
      user_id:user.id,
      payload:db,
      updated_at:new Date().toISOString()
    },{onConflict:"user_id"});

    if(error) throw error;

    $("saveStatus").textContent = "Saved successfully.";
    if(show) toast("Changes saved successfully.");
    return true;
  }catch(error){
    console.error("Cloud save:",error);
    $("saveStatus").textContent = "Cloud save failed.";
    toast("Cloud save failed: " + error.message);
    return false;
  }
}

function scheduleSave(){
  saveCache();
  $("saveStatus").textContent = "Saving changes...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>saveData(),700);
}

async function loadData(){
  try{
    const local = localStorage.getItem(CACHE);
    if(local){
      const localData = JSON.parse(local);
      db = {...db,...localData};
      normalize();
    }
  }catch(e){
    console.warn("Local data load:",e);
  }

  if(!sb || !user) return;

  try{
    const {data,error} = await sb.from("driver_salary_data")
      .select("payload")
      .eq("user_id",user.id)
      .maybeSingle();

    if(error) throw error;

    if(data && data.payload){
      db = {...db,...data.payload};
      normalize();
      saveCache();
    }else{
      await saveData();
    }
  }catch(error){
    console.error(error);
    toast("Cloud data could not be loaded: " + error.message);
  }
}

function getMonth(d,month){
  d.months = d.months || {};
  if(!d.months[month]){
    d.months[month] = normalizeMonth({});
  }
  return normalizeMonth(d.months[month]);
}

function selectedDriver(){
  const el = $("salaryDriver");
  if(!el) return null;
  return db.drivers.find(d=>d.id===el.value) || null;
}

function selectedMonth(){
  return $("salaryMonth").value || thisMonth();
}

function previousEndingMiles(d,month){
  const earlier = Object.keys(d.months || {}).filter(k=>k<month).sort().reverse();

  for(const key of earlier){
    const rows = getMonth(d,key).rows;
    if(rows.length){
      const last = rows[rows.length-1];
      return n(last.prev) + n(last.miles);
    }
  }
  return 0;
}

function monthFigures(m,opening=0){
  m = normalizeMonth(m);

  const miles = m.rows.reduce((s,r)=>s+n(r.miles),0);
  const mileagePay = m.rows.reduce((s,r)=>s+n(r.miles)*n(r.rate),0);
  const additions = m.adds.reduce((s,x)=>s+n(x.amount),0);
  const fines = m.fines.reduce((s,x)=>s+n(x.amount),0);
  const advanceGiven = m.advances.reduce((s,x)=>s+n(x.amount),0);
  const recovered = m.recoveries.reduce((s,x)=>s+n(x.amount),0);
  const paid = m.payments.reduce((s,x)=>s+n(x.amount),0);

  const net = mileagePay + additions - fines;
  const totalDue = n(opening) + net - recovered;

  return {
    miles,mileagePay,additions,fines,advanceGiven,recovered,
    paid,opening:n(opening),net,totalDue,
    remaining:totalDue-paid
  };
}

// Carry forward the latest earlier month's remaining balance.
// Each month's balance already includes its own previous balance.
function previousDue(d,month){
  const earlier = Object.keys(d.months || {}).filter(k=>k<month).sort();
  if(!earlier.length) return 0;

  let balance = 0;
  earlier.forEach(key=>{
    const m = getMonth(d,key);
    balance = monthFigures(m,balance).remaining;
  });
  return balance;
}

function figuresFor(d,month){
  return monthFigures(getMonth(d,month),previousDue(d,month));
}

function applyTheme(){
  document.body.className = "";
  document.body.classList.add("theme-"+(db.settings.theme || "navy"));
  document.body.classList.add("style-"+(db.settings.displayStyle || "modern"));
  document.body.classList.add("font-"+(db.settings.fontSize || "normal"));
  document.body.classList.add("sidebar-"+(db.settings.sidebarStyle || "gradient"));

  document.querySelectorAll(".theme-choice").forEach(b=>{
    b.classList.toggle("selected",b.dataset.theme===db.settings.theme);
  });
}

function branding(){
  const name = db.settings.username || db.settings.manager || "Account Manager";
  $("topCompany").textContent = db.settings.company || "PRESERVER TRANS LLC";
  $("topUsername").textContent = name;
  $("sideManagerName").textContent = name;
  $("sideAvatar").textContent = name.split(/\s+/).map(x=>x[0] || "").join("").slice(0,2).toUpperCase();
  $("deletedCount").textContent = db.deletedRecords.length;
}

function view(id){
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active-view"));
  $(id).classList.add("active-view");

  document.querySelectorAll(".nav-btn[data-view]").forEach(x=>{
    x.classList.toggle("active",x.dataset.view===id);
  });

  const labels = {
    salaryView:"Salary Sheets",
    historyView:"Salary History",
    statementView:"Salary Statement",
    duesView:"Outstanding Dues",
    paymentsView:"Payment History",
    deletedView:"Deleted Records",
    analyticsView:"Driver Performance",
    driversView:"Drivers",
    settingsView:"Settings"
  };

  $("pageTitle").textContent = labels[id] || "Payroll";
  $("sidebar").classList.remove("open");
}

function driverOptions(){
  const old = $("salaryDriver").value;
  $("salaryDriver").innerHTML = db.drivers.length
    ? db.drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}${d.truck?" · "+esc(d.truck):""}</option>`).join("")
    : '<option value="">No drivers</option>';

  if(db.drivers.some(d=>d.id===old)) $("salaryDriver").value=old;
}

function renderAll(){
  driverOptions();
  renderSalary();
  renderHistory();
  renderDues();
  renderPayments();
  renderDeleted();
  renderDrivers();
  fillSettings();
  branding();
  applyTheme();
  renderColumnChoices();
  renderAnalytics();
}

function renderSalary(){
  const d = selectedDriver();
  const month = selectedMonth();

  if(!d){
    $("salaryDriverInfo").textContent = "Add a driver to start.";
    $("mileageBody").innerHTML = '<tr><td colspan="9" class="empty-row">No driver selected.</td></tr>';

    ["statMiles","statMileage","statPreviousDue","statDue","statAdvance","statRecovered","statAdvanceBalance","statPaid"].forEach(id=>{
      $(id).textContent = id==="statMiles" ? "0" : money(0);
    });

    $("additionsBody").innerHTML = '<tr><td colspan="3" class="empty-row">No driver selected.</td></tr>';
    $("finesBody").innerHTML = '<tr><td colspan="3" class="empty-row">No driver selected.</td></tr>';
    $("advanceLedgerBody").innerHTML = '<tr><td colspan="4" class="empty-row">No driver selected.</td></tr>';
    $("salaryTotals").innerHTML = "";
    $("paymentSummary").textContent = "Select a driver.";
    return;
  }

  const m = getMonth(d,month);
  const opening = previousDue(d,month);
  const f = monthFigures(m,opening);
  const previousMiles = previousEndingMiles(d,month);

  $("salaryDriverInfo").innerHTML = `
    ${d.photo ? `<img class="driver-photo" src="${d.photo}" alt="Driver">` : `<div class="mini-avatar">${esc(d.name.slice(0,2).toUpperCase())}</div>`}
    <div><b>${esc(d.name)}</b><br>
    Truck: ${esc(d.truck || "—")} | Phone: ${esc(d.phone || "—")}<br>
    <small>${esc(monthLabel(month))} · Previous odometer: ${previousMiles.toLocaleString()} miles</small></div>`;

  $("mileageRate").value = db.rate;

  $("mileageBody").innerHTML = m.rows.length ? m.rows.map((r,i)=>{
    const prev = i===0 ? previousMiles : n(m.rows[i-1].prev)+n(m.rows[i-1].miles);
    r.prev = prev;
    r.next = prev+n(r.miles);

    return `<tr>
      <td>${i+1}</td>
      <td><input type="date" data-row="${i}" data-field="date" value="${esc(r.date || "")}"></td>
      <td><input data-row="${i}" data-field="note" value="${esc(r.note || "")}" placeholder="Load / note"></td>
      <td>${prev.toLocaleString()}</td>
      <td><input type="number" min="0" step="0.1" data-row="${i}" data-field="miles" value="${n(r.miles)}"></td>
      <td>${r.next.toLocaleString()}</td>
      <td>${money(r.rate)}</td>
      <td><b>${money(n(r.miles)*n(r.rate))}</b></td>
      <td><button class="btn danger small" data-delrow="${i}">Delete</button></td>
    </tr>`;
  }).join("") : '<tr><td colspan="9" class="empty-row">No mileage entered. Add only new miles travelled.</td></tr>';

  renderItems("additionsBody",m.adds,"adds");
  renderItems("finesBody",m.fines,"fines");

  $("statMiles").textContent = f.miles.toLocaleString();
  $("statMileage").textContent = money(f.net);
  $("statPreviousDue").textContent = money(f.opening);
  $("statDue").textContent = money(f.remaining);
  $("statAdvance").textContent = money(d.advanceLedger.filter(x=>x.type==="Advance").reduce((s,x)=>s+n(x.amount),0));
  $("statRecovered").textContent = money(d.advanceLedger.filter(x=>x.type==="Recovery").reduce((s,x)=>s+n(x.amount),0));
  $("statAdvanceBalance").textContent = money(d.advanceBalance);
  $("statPaid").textContent = money(f.paid);

  $("advanceBalanceInfo").innerHTML = `<b>Current outstanding advance: ${money(d.advanceBalance)}</b><br>Give advances when required and recover any amount up to the remaining balance.`;

  $("advanceLedgerBody").innerHTML = d.advanceLedger.length
    ? d.advanceLedger.slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.note || "")}</td><td>${money(x.amount)}</td></tr>`).join("")
    : '<tr><td colspan="4" class="empty-row">No advance activity.</td></tr>';

  $("paymentSummary").innerHTML = `
    Previous balance: <b>${money(f.opening)}</b><br>
    Current month net salary: <b>${money(f.net)}</b><br>
    Total outstanding: <b>${money(f.remaining)}</b><br>
    Paid this month: <b>${money(f.paid)}</b>`;

  $("salaryTotals").innerHTML = `
    <div class="totals-line"><span>Previous unpaid salary</span><b>${money(f.opening)}</b></div>
    <div class="totals-line"><span>New mileage earnings</span><b>${money(f.mileagePay)}</b></div>
    <div class="totals-line"><span>Extra amounts / bonus</span><b>${money(f.additions)}</b></div>
    <div class="totals-line"><span>Fines / deductions</span><b>− ${money(f.fines)}</b></div>
    <div class="totals-line"><span>Advance recovery</span><b>− ${money(f.recovered)}</b></div>
    <div class="totals-line total"><span>Remaining salary due</span><b>${money(f.remaining)}</b></div>
    <div class="totals-line"><span>Payments recorded</span><b>${money(f.paid)}</b></div>`;

  $("paymentDate").value = $("paymentDate").value || today();
}

function renderItems(id,arr,group){
  $(id).innerHTML = arr.length
    ? arr.map((x,i)=>`<tr><td>${esc(x.description || "")}</td><td>${money(x.amount)}</td><td><button class="btn danger small" data-group="${group}" data-index="${i}">Delete</button></td></tr>`).join("")
    : '<tr><td colspan="3" class="empty-row">No records.</td></tr>';
}

function addMileage(){
  const d = selectedDriver();
  if(!d) return toast("Add a driver first.");

  getMonth(d,selectedMonth()).rows.push({
    id:uid(),date:today(),note:"",miles:0,rate:n(db.rate)
  });

  scheduleSave();
  renderSalary();
}

function addItem(group,title){
  const d = selectedDriver();
  if(!d) return toast("Select a driver first.");

  const description = prompt(title+" description:");
  if(description===null) return;

  const amount = Number(prompt("Enter amount:"));
  if(!description.trim() || !Number.isFinite(amount) || amount<=0){
    return toast("Enter a valid description and amount.");
  }

  getMonth(d,selectedMonth())[group].push({
    id:uid(),description:description.trim(),amount
  });

  scheduleSave();
  renderSalary();
}

function recordPayment(){
  const d = selectedDriver();
  if(!d) return toast("Select a driver.");

  const month = selectedMonth();
  const m = getMonth(d,month);
  const f = figuresFor(d,month);
  const amount = Number($("paymentAmount").value);

  if(!Number.isFinite(amount) || amount<=0){
    return toast("Enter a valid payment amount.");
  }

  if(amount>f.remaining+0.001 && !confirm("Payment is greater than the outstanding balance. Continue?")){
    return;
  }

  const payment = {
    id:uid(),
    date:$("paymentDate").value || today(),
    amount,
    method:$("paymentMethod").value,
    reference:$("paymentReference").value.trim(),
    note:$("paymentNote").value.trim(),
    driverId:d.id,
    driverName:d.name,
    truck:d.truck,
    month
  };

  m.payments.push(payment);
  db.history.push({...payment});

  $("paymentAmount").value="";
  $("paymentReference").value="";
  $("paymentNote").value="";

  scheduleSave();
  renderAll();
  toast("Payment recorded. Receipt saved in Payment History.");
}

function advanceAction(type){
  const d = selectedDriver();
  if(!d) return toast("Select a driver.");

  const isGive = type==="Advance";
  const amount = Number($(isGive?"advanceAmount":"recoverAmount").value);
  const note = $(isGive?"advanceNote":"recoverNote").value.trim();

  if(!Number.isFinite(amount) || amount<=0){
    return toast("Enter a valid amount.");
  }

  if(!isGive && amount>d.advanceBalance+0.001){
    return toast("Recovery cannot exceed remaining advance.");
  }

  if(isGive){
    d.advanceBalance += amount;
    getMonth(d,selectedMonth()).advances.push({id:uid(),date:today(),amount,description:note});
  }else{
    d.advanceBalance = Math.max(0,d.advanceBalance-amount);
    getMonth(d,selectedMonth()).recoveries.push({id:uid(),date:today(),amount,description:note || "Advance recovery"});
  }

  d.advanceLedger.push({id:uid(),date:today(),type,amount,note});

  $(isGive?"advanceAmount":"recoverAmount").value="";
  $(isGive?"advanceNote":"recoverNote").value="";

  scheduleSave();
  renderSalary();
  renderHistory();
  renderDues();
  renderAnalytics();
  toast(isGive?"Advance added to driver account.":"Advance recovery recorded.");
}

function recordSnapshot(d,month){
  const m = JSON.parse(JSON.stringify(getMonth(d,month)));
  const f = figuresFor(d,month);

  return {
    driverId:d.id,
    driverName:d.name,
    truck:d.truck,
    phone:d.phone,
    address:d.address,
    photo:d.photo || "",
    month,
    data:m,
    figures:f,
    company:db.settings.company,
    location:db.settings.location,
    createdAt:new Date().toISOString()
  };
}

function renderStatement(s){
  const m = normalizeMonth(s.data);
  const f = s.figures || monthFigures(m);

  $("statementSubtitle").textContent = `${s.driverName} · ${monthLabel(s.month)} · Read-only`;

  const rows = m.rows.map((r,i)=>{
    const prev = n(r.prev);
    const miles = n(r.miles);
    return `<tr><td>${i+1}</td><td>${esc(r.date)}</td><td>${esc(r.note)}</td><td>${prev.toLocaleString()}</td><td>${miles.toLocaleString()}</td><td>${(prev+miles).toLocaleString()}</td><td>${money(r.rate)}</td><td>${money(miles*n(r.rate))}</td></tr>`;
  }).join("");

  const items = (title,a)=>`
    <div class="statement-section"><h3>${title}</h3>
    <table><thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>${a.length?a.map(x=>`<tr><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>`).join(""):'<tr><td colspan="2">None</td></tr>'}</tbody></table></div>`;

  const pays = m.payments.map(p=>`
    <tr><td>${esc(p.date)}</td><td>${esc(p.method || "")}</td><td>${esc(p.reference || "")}</td><td>${esc(p.note || "")}</td><td>${money(p.amount)}</td></tr>`).join("");

  $("statementContent").innerHTML = `
    <div class="statement-header"><h2>${esc(s.company)}</h2><p>${esc(s.location || "")}</p><h3>DRIVER MONTHLY SALARY STATEMENT</h3></div>
    <div class="statement-meta">
      <div><b>DRIVER</b>${esc(s.driverName)}</div><div><b>TRUCK</b>${esc(s.truck || "—")}</div>
      <div><b>MONTH</b>${esc(monthLabel(s.month))}</div><div><b>PHONE</b>${esc(s.phone || "—")}</div>
      <div><b>ADDRESS</b>${esc(s.address || "—")}</div><div><b>MONTH MILES</b>${n(f.miles).toLocaleString()}</div>
    </div>
    <div class="statement-section"><h3>Mileage Record</h3><table>
      <thead><tr><th>#</th><th>Date</th><th>Load / Note</th><th>Previous</th><th>New Miles</th><th>Ending</th><th>Rate</th><th>Pay</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">No mileage.</td></tr>'}</tbody>
    </table></div>
    ${items("Extra Amounts",m.adds)}
    ${items("Fines / Deductions",m.fines)}
    ${items("Advance Recovery",m.recoveries)}
    <div class="statement-section"><h3>Payment Receipts</h3><table>
      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Note</th><th>Amount</th></tr></thead>
      <tbody>${pays || '<tr><td colspan="5">No payments.</td></tr>'}</tbody>
    </table></div>
    <div class="statement-total">
      <div><span>Previous Due</span><b>${money(f.opening)}</b></div>
      <div><span>Mileage Salary</span><b>${money(f.mileagePay)}</b></div>
      <div><span>Extra Amounts</span><b>${money(f.additions)}</b></div>
      <div><span>Fines</span><b>− ${money(f.fines)}</b></div>
      <div><span>Advance Recovery</span><b>− ${money(f.recovered)}</b></div>
      <div><span>Payments</span><b>${money(f.paid)}</b></div>
      <div><strong>Remaining Due</strong><strong>${money(f.remaining)}</strong></div>
    </div>`;
}

function openStatement(id,month){
  const d = db.drivers.find(x=>x.id===id);
  if(!d || !d.months[month]) return;
  currentStatement = recordSnapshot(d,month);
  renderStatement(currentStatement);
  view("statementView");
}

function deleteStatement(){
  if(!currentStatement || !confirm("Move this salary sheet to Deleted Records?")) return;

  const d = db.drivers.find(x=>x.id===currentStatement.driverId);
  if(!d || !d.months[currentStatement.month]) return toast("Record not found.");

  const snap = recordSnapshot(d,currentStatement.month);
  snap.deletedId = uid();
  snap.deletedAt = new Date().toISOString();

  db.deletedRecords.push(snap);
  delete d.months[currentStatement.month];

  currentStatement = null;
  scheduleSave();
  renderAll();
  view("historyView");
  toast("Moved to Deleted Records.");
}

function renderHistory(){
  const search = ($("historySearch").value || "").toLowerCase();
  const rows = [];

  db.drivers.forEach(d=>{
    Object.keys(d.months || {}).forEach(month=>{
      const f = figuresFor(d,month);
      rows.push({d,month,f});
    });
  });

  const filtered = rows.filter(x=>
    (x.d.name+" "+x.month).toLowerCase().includes(search)
  ).sort((a,b)=>b.month.localeCompare(a.month));

  $("historyBody").innerHTML = filtered.length
    ? filtered.map(x=>`<tr>
      <td>${esc(x.d.name)}</td><td>${esc(x.d.truck)}</td><td>${monthLabel(x.month)}</td>
      <td>${x.f.miles.toLocaleString()}</td><td>${money(x.f.net)}</td>
      <td>${money(x.f.paid)}</td><td>${money(x.f.remaining)}</td>
      <td><button class="btn outline small" data-open="${esc(x.d.id)}" data-month="${esc(x.month)}">Open</button></td>
    </tr>`).join("")
    : '<tr><td colspan="8" class="empty-row">No salary sheets.</td></tr>';
}

function renderDues(){
  const rows = db.drivers.map(d=>{
    let due = 0;
    let months = 0;
    Object.keys(d.months || {}).sort().forEach(month=>{
      const f = figuresFor(d,month);
      due = f.remaining;
      if(f.remaining>0.009) months++;
    });
    return {d,due,months};
  }).filter(x=>x.due>0.009);

  $("duesBody").innerHTML = rows.length
    ? rows.map(x=>`<tr><td>${esc(x.d.name)}</td><td>${esc(x.d.truck)}</td><td>${x.months}</td><td><b>${money(x.due)}</b></td><td><button class="btn primary small" data-paydriver="${esc(x.d.id)}">Open & Pay</button></td></tr>`).join("")
    : '<tr><td colspan="5" class="empty-row">No outstanding dues.</td></tr>';
}

function renderPayments(){
  const rows = [...db.history].sort((a,b)=>(b.date || "").localeCompare(a.date || ""));

  $("paymentsBody").innerHTML = rows.length
    ? rows.map(p=>{
      const d = db.drivers.find(x=>x.id===p.driverId);
      const photo = d && d.photo ? `<img class="table-photo" src="${d.photo}" alt="">` : "";
      return `<tr><td>${esc(p.date)}</td><td>${photo} ${esc(p.driverName)}</td><td>${monthLabel(p.month)}</td><td>${money(p.amount)}</td><td>${esc(p.method || "")}</td><td>${esc(p.reference || "")}</td><td>${esc(p.note || "")}</td></tr>`;
    }).join("")
    : '<tr><td colspan="7" class="empty-row">No payment receipts.</td></tr>';
}

function renderDeleted(){
  $("deletedCount").textContent = db.deletedRecords.length;

  $("deletedBody").innerHTML = db.deletedRecords.length
    ? db.deletedRecords.map(r=>`<tr>
      <td>${esc(r.driverName)}</td><td>${monthLabel(r.month)}</td>
      <td>${esc((r.deletedAt || "").slice(0,10))}</td>
      <td><button class="btn outline small" data-restore="${esc(r.deletedId)}">Restore</button>
      <button class="btn danger small" data-permanent="${esc(r.deletedId)}">Permanent Delete</button></td>
    </tr>`).join("")
    : '<tr><td colspan="4" class="empty-row">No deleted records.</td></tr>';
}

function restoreRecord(id){
  const i = db.deletedRecords.findIndex(x=>x.deletedId===id);
  if(i<0) return;

  const r = db.deletedRecords[i];
  const d = db.drivers.find(x=>x.id===r.driverId);

  if(!d) return toast("Original driver profile not found.");
  if(d.months[r.month]) return toast("A sheet already exists for this driver and month.");

  d.months[r.month] = normalizeMonth(JSON.parse(JSON.stringify(r.data)));
  db.deletedRecords.splice(i,1);

  scheduleSave();
  renderAll();
  toast("Record restored.");
}

async function verifyPassword(password){
  if(!sb || !user?.email || !password) return false;

  const {error} = await sb.auth.signInWithPassword({
    email:user.email,
    password
  });

  if(error){
    toast("Password verification failed.");
    return false;
  }

  const {data} = await sb.auth.getUser();
  if(data?.user) user=data.user;
  return true;
}

async function permanentDelete(id){
  if(!confirm("Permanently delete this record? This cannot be undone.")) return;

  const password = prompt("Enter your current login password:");
  if(password===null) return;
  if(!(await verifyPassword(password))) return;

  db.deletedRecords = db.deletedRecords.filter(x=>x.deletedId!==id);
  await saveData(true);
  renderDeleted();
  toast("Permanently deleted.");
}

function renderDrivers(){
  $("driversBody").innerHTML = db.drivers.length
    ? db.drivers.map(d=>`<tr>
      <td>${d.photo ? `<img class="table-photo" src="${d.photo}" alt="">` : "—"}</td>
      <td><b>${esc(d.name)}</b></td><td>${esc(d.truck)}</td>
      <td>${esc(d.phone)}</td><td>${esc(d.address)}</td>
    </tr>`).join("")
    : '<tr><td colspan="5" class="empty-row">No drivers added.</td></tr>';
}

function fillSettings(){
  const s = db.settings;
  $("settingUsername").value = s.username || s.manager || "";
  $("settingEmail").value = user?.email || "";
  $("settingCompany").value = s.company || "";
  $("settingLocation").value = s.location || "";
  $("settingRate").value = db.rate;
  $("settingCurrency").value = s.currency || "$";
  $("managerName").value = s.manager || "";
  $("managerDesignation").value = s.designation || "Account Manager";
  $("managerPhone").value = s.phone || "";
  $("managerDetails").value = s.details || "";
  $("displayStyle").value = s.displayStyle || "modern";
  $("fontSize").value = s.fontSize || "normal";
  $("sidebarStyle").value = s.sidebarStyle || "gradient";
  $("managerPhotoPreview").style.backgroundImage = s.managerPhoto ? `url("${s.managerPhoto}")` : "";
  $("managerPhotoPreview").textContent = s.managerPhoto ? "" : (s.manager || "SA").split(/\s+/).map(x=>x[0]).join("").slice(0,2);
  applyTheme();
}

async function compressImage(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();

    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1,360/Math.max(img.width,img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width*scale);
        canvas.height = Math.round(img.height*scale);
        const ctx = canvas.getContext("2d");

        if(!ctx) return reject(new Error("Could not process image."));
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",0.68));
      };
      img.onerror = ()=>reject(new Error("Invalid image."));
      img.src = reader.result;
    };

    reader.onerror = ()=>reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function addDriver(){
  const name = $("newDriverName").value.trim();
  if(!name) return toast("Driver name is required.");

  const d = {
    id:uid(),
    name,
    truck:$("newDriverTruck").value.trim(),
    phone:$("newDriverPhone").value.trim(),
    address:$("newDriverAddress").value.trim(),
    notes:$("newDriverNotes").value.trim(),
    photo:newDriverPhotoData,
    months:{},
    advanceBalance:0,
    advanceLedger:[]
  };

  db.drivers.push(d);
  newDriverPhotoData = "";
  $("driverModal").classList.add("hidden");

  ["newDriverName","newDriverTruck","newDriverPhone","newDriverAddress","newDriverNotes"].forEach(id=>$(id).value="");
  $("newDriverPhoto").value="";

  renderAll();
  $("salaryDriver").value=d.id;
  renderSalary();
  scheduleSave();
  toast("Driver profile added.");
}

function saveUsername(){
  const name = $("settingUsername").value.trim();
  if(!name) return toast("Enter a username.");

  db.settings.username=name;
  scheduleSave();
  branding();
  toast("Display username updated.");
}

async function changePassword(){
  if(!sb || !user) return toast("Please sign in first.");

  const old = $("currentPassword").value;
  const next = $("newPassword").value;
  const again = $("confirmPassword").value;

  if(!old || !next) return toast("Complete the password fields.");
  if(next.length<6 || next!==again) return toast("Passwords must match and be at least 6 characters.");
  if(!(await verifyPassword(old))) return;

  const {error} = await sb.auth.updateUser({password:next});
  if(error) return toast(error.message);

  ["currentPassword","newPassword","confirmPassword"].forEach(id=>$(id).value="");
  toast("Password updated.");
}

async function saveManager(){
  if(!sb || !user) return toast("Please sign in first.");
  if(!(await verifyPassword($("managerVerifyPassword").value))) return;

  const s = db.settings;
  s.manager = $("managerName").value.trim();
  s.designation = $("managerDesignation").value.trim();
  s.phone = $("managerPhone").value.trim();
  s.details = $("managerDetails").value.trim();

  if(managerPhotoData) s.managerPhoto=managerPhotoData;

  managerPhotoData="";
  $("managerVerifyPassword").value="";
  branding();
  await saveData(true);
  fillSettings();
  toast("Manager profile saved.");
}

async function saveCompany(){
  db.settings.company = $("settingCompany").value.trim() || "PRESERVER TRANS LLC";
  db.settings.location = $("settingLocation").value.trim();
  db.settings.currency = $("settingCurrency").value.trim() || "$";
  db.rate = Math.max(0,n($("settingRate").value));

  branding();
  renderSalary();
  await saveData(true);
}

async function saveTheme(){
  db.settings.displayStyle = $("displayStyle").value;
  db.settings.fontSize = $("fontSize").value;
  db.settings.sidebarStyle = $("sidebarStyle").value;

  applyTheme();
  await saveData(true);
}

function reportData(){
  const period = $("analyticsPeriod").value;
  const month = $("analyticsMonth").value || thisMonth();
  const year = month.slice(0,4);

  return db.drivers.map(d=>{
    const months = Object.keys(d.months || {}).filter(m=>
      period==="all" ||
      (period==="year" && m.startsWith(year)) ||
      (period==="month" && m===month)
    );

    let miles=0,salary=0,fines=0,paid=0,due=0;

    months.forEach(m=>{
      const f = figuresFor(d,m);
      miles += f.miles;
      salary += f.net;
      fines += f.fines;
      paid += f.paid;
      due += f.remaining;
    });

    return {d,months:months.length,miles,salary,fines,paid,due};
  }).filter(x=>x.months>0);
}

function renderColumnChoices(){
  const defs = [
    ["driver","Driver"],["truck","Truck"],["months","Months"],
    ["miles","Total Miles"],["salary","Salary"],["fines","Fines"],
    ["paid","Paid"],["due","Due"]
  ];

  $("columnChoices").innerHTML = defs.map(([k,label])=>
    `<label><input type="checkbox" data-col="${k}" ${reportColumns.includes(k)?"checked":""}>${label}</label>`
  ).join("");
}

function renderAnalytics(){
  if(!$("analyticsContent")) return;

  const rows = reportData();
  const layout = $("reportLayout").value;
  const color = $("reportColor").value;

  const labels = {
    driver:"Driver",truck:"Truck",months:"Months",miles:"Total Miles",
    salary:"Salary",fines:"Fines",paid:"Paid",due:"Due"
  };

  const val = (r,k)=>({
    driver:esc(r.d.name),truck:esc(r.d.truck || "—"),months:r.months,
    miles:r.miles.toLocaleString(),salary:money(r.salary),
    fines:money(r.fines),paid:money(r.paid),due:money(r.due)
  })[k];

  if(layout==="cards"){
    $("analyticsContent").innerHTML = rows.map(r=>`
      <div class="report-card report-${color}" data-report-driver="${esc(r.d.id)}">
        <h3>${esc(r.d.name)} · ${esc(r.d.truck)}</h3>
        <div class="report-card-grid">
          ${["miles","salary","fines","paid","due"].map(k=>`
            <div class="report-metric">${labels[k]}<b>${val(r,k)}</b></div>
          `).join("")}
        </div><small>Click to open complete driver report</small>
      </div>`).join("") || '<div class="panel">No records for this period.</div>';
  }else{
    const cols = layout==="compact"
      ? reportColumns.filter(k=>["driver","miles","salary","due"].includes(k))
      : reportColumns;

    $("analyticsContent").innerHTML = `
      <div class="panel report-${color}"><div class="table-wrap"><table>
      <thead><tr>${cols.map(k=>`<th>${labels[k]}</th>`).join("")}<th>Details</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>${cols.map(k=>`<td>${val(r,k)}</td>`).join("")}
      <td><button class="btn outline small" data-report-driver="${esc(r.d.id)}">Open Driver</button></td></tr>`).join("")
      || `<tr><td colspan="${cols.length+1}" class="empty-row">No records for this period.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  $("driverDetail").classList.add("hidden");
}

function showDriverReport(id){
  const d = db.drivers.find(x=>x.id===id);
  if(!d) return;

  const months = Object.keys(d.months || {}).sort().reverse();
  $("driverDetail").classList.remove("hidden");

  $("driverDetail").innerHTML = `
    <div class="panel-heading"><div><h2>${esc(d.name)} · ${esc(d.truck)}</h2><p>Complete month-by-month performance</p></div><button class="btn outline small" id="closeDriverDetail">Close</button></div>
    <div class="table-wrap"><table><thead><tr><th>Month</th><th>Miles</th><th>Salary</th><th>Fines</th><th>Paid</th><th>Due</th><th>Statement</th></tr></thead>
    <tbody>${months.map(m=>{
      const f=figuresFor(d,m);
      return `<tr><td>${monthLabel(m)}</td><td>${f.miles.toLocaleString()}</td><td>${money(f.net)}</td><td>${money(f.fines)}</td><td>${money(f.paid)}</td><td>${money(f.remaining)}</td><td><button class="btn outline small" data-open="${esc(d.id)}" data-month="${esc(m)}">Open</button></td></tr>`;
    }).join("")}</tbody></table></div>`;

  $("closeDriverDetail").onclick = ()=>$("driverDetail").classList.add("hidden");
  $("driverDetail").scrollIntoView({behavior:"smooth"});
}

function bind(){
  $("loginForm").onsubmit = async e=>{
    e.preventDefault();
    if(!sb) return msg("Supabase settings are missing.");

    const {data,error} = await sb.auth.signInWithPassword({
      email:$("loginEmail").value.trim(),
      password:$("loginPassword").value
    });

    if(error) return msg(error.message);

    user=data.user;
    await loadData();
    showApp();
  };

  $("signupForm").onsubmit = async e=>{
    e.preventDefault();
    if(!sb) return msg("Supabase settings are missing.");

    const name=$("signupName").value.trim();
    const {data,error}=await sb.auth.signUp({
      email:$("signupEmail").value.trim(),
      password:$("signupPassword").value,
      options:{data:{full_name:name}}
    });

    if(error) return msg(error.message);

    if(data.session){
      user=data.user;
      db.settings.manager=name;
      db.settings.username=name;
      await saveData();
      showApp();
    }else{
      msg("Account created. Verify your email, then sign in.",true);
      $("signupForm").classList.add("hidden");
      $("loginForm").classList.remove("hidden");
      $("showSignup").classList.remove("hidden");
    }
  };

  $("showSignup").onclick=()=>{
    $("loginForm").classList.add("hidden");
    $("showSignup").classList.add("hidden");
    $("signupForm").classList.remove("hidden");
  };

  $("showLogin").onclick=()=>{
    $("signupForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    $("showSignup").classList.remove("hidden");
  };

  $("logoutBtn").onclick=async()=>{
    if(sb) await sb.auth.signOut();
    user=null;
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  };

  document.querySelectorAll(".nav-btn[data-view]").forEach(b=>{
    b.onclick=()=>view(b.dataset.view);
  });

  $("menuToggle").onclick=()=>$("sidebar").classList.toggle("open");

  $("salaryDriver").onchange=renderSalary;
  $("salaryMonth").onchange=renderSalary;

  $("mileageRate").onchange=()=>{
    const d=selectedDriver();
    if(!d) return toast("Select a driver first.");

    const rate=Math.max(0,n($("mileageRate").value));
    db.rate=rate;
    getMonth(d,selectedMonth()).rows.forEach(r=>r.rate=rate);

    scheduleSave();
    renderSalary();
  };

  $("addMileageBtn").onclick=addMileage;
  $("addAdditionBtn").onclick=()=>addItem("adds","Extra amount");
  $("addFineBtn").onclick=()=>addItem("fines","Fine");
  $("giveAdvanceBtn").onclick=()=>advanceAction("Advance");
  $("recoverAdvanceBtn").onclick=()=>advanceAction("Recovery");
  $("recordPaymentBtn").onclick=recordPayment;

  $("mileageBody").onchange=e=>{
    const el=e.target.closest("[data-row]");
    if(!el) return;

    const d=selectedDriver();
    if(!d) return;

    const r=getMonth(d,selectedMonth()).rows[Number(el.dataset.row)];
    if(!r) return;

    const key=el.dataset.field;
    if(key==="miles") r.miles=Math.max(0,n(el.value));
    else r[key]=el.value;

    scheduleSave();
    renderSalary();
  };

  $("mileageBody").onclick=e=>{
    const b=e.target.closest("[data-delrow]");
    if(!b) return;

    if(!confirm("Delete this mileage row?")) return;

    const d=selectedDriver();
    if(!d) return;

    getMonth(d,selectedMonth()).rows.splice(Number(b.dataset.delrow),1);
    scheduleSave();
    renderSalary();
  };

  ["additionsBody","finesBody"].forEach(id=>{
    $(id).onclick=e=>{
      const b=e.target.closest("[data-group]");
      if(!b) return;
      if(!confirm("Delete this item?")) return;

      const d=selectedDriver();
      if(!d) return;

      getMonth(d,selectedMonth())[b.dataset.group].splice(Number(b.dataset.index),1);
      scheduleSave();
      renderSalary();
    };
  });

  $("addDriverBtn").onclick=$("addDriverBtn2").onclick=()=>{
    $("driverModal").classList.remove("hidden");
  };

  $("saveDriverBtn").onclick=addDriver;

  document.querySelectorAll("[data-close]").forEach(b=>{
    b.onclick=()=>$("driverModal").classList.add("hidden");
  });

  $("newDriverPhoto").onchange=async e=>{
    try{
      if(e.target.files[0]) newDriverPhotoData=await compressImage(e.target.files[0]);
    }catch(error){toast(error.message);}
  };

  $("managerPhoto").onchange=async e=>{
    try{
      if(e.target.files[0]){
        managerPhotoData=await compressImage(e.target.files[0]);
        $("managerPhotoPreview").style.backgroundImage=`url("${managerPhotoData}")`;
        $("managerPhotoPreview").textContent="";
      }
    }catch(error){toast(error.message);}
  };

  $("historySearch").oninput=renderHistory;

  $("historyBody").onclick=e=>{
    const b=e.target.closest("[data-open]");
    if(b) openStatement(b.dataset.open,b.dataset.month);
  };

  $("statementPrintBtn").onclick=()=>window.print();
  $("deleteStatementBtn").onclick=deleteStatement;
  $("backHistoryBtn").onclick=()=>view("historyView");

  $("printSalaryBtn").onclick=()=>{
    const d=selectedDriver();
    if(!d) return toast("Select a driver.");

    currentStatement=recordSnapshot(d,selectedMonth());
    renderStatement(currentStatement);
    view("statementView");
    setTimeout(()=>window.print(),200);
  };

  $("duesBody").onclick=e=>{
    const b=e.target.closest("[data-paydriver]");
    if(!b) return;

    $("salaryDriver").value=b.dataset.paydriver;
    view("salaryView");
    renderSalary();
  };

  $("deletedBody").onclick=e=>{
    const r=e.target.closest("[data-restore]");
    const p=e.target.closest("[data-permanent]");
    if(r) restoreRecord(r.dataset.restore);
    if(p) permanentDelete(p.dataset.permanent);
  };

  $("saveNowBtn").onclick=()=>saveData(true);
  $("saveUsernameBtn").onclick=saveUsername;
  $("changePasswordBtn").onclick=changePassword;
  $("saveManagerBtn").onclick=saveManager;
  $("saveCompanyBtn").onclick=saveCompany;
  $("saveThemeBtn").onclick=saveTheme;

  $("themeChoices").onclick=e=>{
    const b=e.target.closest("[data-theme]");
    if(!b) return;
    db.settings.theme=b.dataset.theme;
    applyTheme();
    scheduleSave();
  };

  ["reportLayout","reportColor","analyticsPeriod","analyticsMonth"].forEach(id=>{
    $(id).onchange=renderAnalytics;
  });

  $("columnChoices").onchange=e=>{
    const k=e.target.dataset.col;
    if(!k) return;

    if(e.target.checked && !reportColumns.includes(k)) reportColumns.push(k);
    else reportColumns=reportColumns.filter(x=>x!==k);

    renderAnalytics();
  };

  $("resetColumnsBtn").onclick=()=>{
    reportColumns=["driver","truck","months","miles","salary","fines","paid","due"];
    renderColumnChoices();
    renderAnalytics();
  };

  $("analyticsContent").onclick=e=>{
    const b=e.target.closest("[data-report-driver]");
    if(b) showDriverReport(b.dataset.reportDriver);
  };

  $("driverDetail").onclick=e=>{
    const b=e.target.closest("[data-open]");
    if(b) openStatement(b.dataset.open,b.dataset.month);
  };

  $("printAnalyticsBtn").onclick=()=>window.print();
}

function showApp(){
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");

  $("salaryMonth").value=thisMonth();
  $("analyticsMonth").value=thisMonth();
  $("paymentDate").value=today();

  renderAll();
  view("salaryView");
}

async function start(){
  $("salaryMonth").value=thisMonth();
  $("analyticsMonth").value=thisMonth();
  $("paymentDate").value=today();

  try{
    if(window.supabase && window.SUPABASE_CONFIG?.url &&
       window.SUPABASE_CONFIG?.anonKey &&
       !window.SUPABASE_CONFIG.anonKey.includes("PASTE_")){

      sb=window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
      );

      const {data,error}=await sb.auth.getSession();
      if(error) console.warn(error);

      if(data?.session){
        user=data.session.user;
        await loadData();
        showApp();
      }

      sb.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"){
          user=null;
          $("app").classList.add("hidden");
          $("loginScreen").classList.remove("hidden");
        }
      });
    }else{
      msg("Add your existing Supabase URL and publishable key in supabase-config.js.");

      try{
        const local=localStorage.getItem(CACHE);
        if(local){
          db={...db,...JSON.parse(local)};
          normalize();
        }
      }catch(e){console.warn(e);}
    }
  }catch(error){
    console.error("Startup error:",error);
    msg("Could not connect. Check your Supabase settings.");
  }

  bind();
}

document.addEventListener("DOMContentLoaded",start);
