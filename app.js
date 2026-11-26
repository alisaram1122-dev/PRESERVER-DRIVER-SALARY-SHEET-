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
let currentView = "salary";

const money = n => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD"
}).format(Number(n) || 0);

const num = n => (Number(n) || 0).toLocaleString("en-US", {
  maximumFractionDigits: 2
});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
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
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {rate:.52,drivers:[]};
  } catch {
    return {rate:.52,drivers:[]};
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

  const { error } = await sb.from("driver_salary_data").upsert({
    user_id:user.id,
    payload:db,
    updated_at:new Date().toISOString()
  }, {onConflict:"user_id"});

  if (error) {
    console.error(error);
    toast("Cloud save failed: " + error.message);
  }
}

async function loadCloud() {
  const {data,error} = await sb.from("driver_salary_data")
    .select("payload").eq("user_id",user.id).maybeSingle();

  if (error) throw error;

  if (data?.payload) {
    db = data.payload;
    db.drivers ||= [];
    db.rate = Number(db.rate ?? .52);
  } else {
    db = {rate:.52,drivers:[]};
    await saveCloud();
  }

  db.drivers.forEach(d => {
    d.months ||= {};
    Object.values(d.months).forEach(m => {
      m.rows ||= [];
      m.adds ||= [];
      m.fines ||= [];
      m.advances ||= [];
      m.recoveries ||= [];
      m.payments ||= [];
    });
  });

  cache();
  activeId = db.drivers[0]?.id || null;
  render();
  $("loginScreen").classList.add("hidden");
  $("userLabel").textContent = user.email || "Account";
}

function monthData(d, month = currentMonth) {
  d.months ||= {};
  d.months[month] ||= {
    rows:[],adds:[],fines:[],advances:[],recoveries:[],payments:[]
  };

  const m = d.months[month];

  ["rows","adds","fines","advances","recoveries","payments"]
    .forEach(k => m[k] ||= []);

  return m;
}

function driver() {
  return db.drivers.find(d => d.id === activeId);
}

function allDriverMonths(d) {
  return Object.entries(d.months || {});
}

function totalsFor(d) {
  let adv=0, rec=0;

  allDriverMonths(d).forEach(([,m]) => {
    (m.advances||[]).forEach(x => adv += Number(x.amount)||0);
    (m.recoveries||[]).forEach(x => rec += Number(x.amount)||0);
  });

  return {adv,rec,balance:adv-rec};
}

function monthGross(m) {
  const mileage = (m.rows||[]).reduce((s,r) => {
    const diff = Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0));
    return s + diff*(Number(r.rate)||0);
  },0);

  const sum = key => (m[key]||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);

  return mileage + sum("adds") - sum("fines") - sum("recoveries");
}

function driverFinancials(d) {
  let gross=0, paid=0;

  allDriverMonths(d).forEach(([,m]) => {
    gross += monthGross(m);
    paid += (m.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
  });

  return {gross,paid,outstanding:Math.max(0,gross-paid)};
}

function renderTabs() {
  const wrap=$("driverTabs");
  wrap.innerHTML="";

  db.drivers.forEach(d=>{
    const b=document.createElement("button");
    b.className="driver-tab"+(d.id===activeId?" active":"");
    b.textContent=d.name||"Unnamed Driver";
    b.onclick=()=>{
      activeId=d.id;
      showView("salary");
      render();
    };
    wrap.append(b);
  });
}

function render() {
  renderTabs();

  const d=driver();
  const empty=!d;

  $("emptyState").classList.toggle("hidden",!empty);
  $("sheetArea").classList.toggle("hidden",empty);

  if (empty) {
    $("sheetDriverName").textContent="Driver";
  } else {
    const m=monthData(d);
    const [y,mo]=currentMonth.split("-");

    $("sheetDriverName").textContent=d.name||"Driver";
    $("sheetPeriod").textContent=new Date(+y,+mo-1,1)
      .toLocaleDateString("en-US",{month:"long",year:"numeric"})+" salary statement";

    $("driverName").value=d.name||"";
    $("truckNumber").value=d.truck||"";
    $("monthDisplay").value=new Date(+y,+mo-1,1)
      .toLocaleDateString("en-US",{month:"long"});
    $("yearDisplay").value=y;

    renderMileage(m);
    renderMoneyRows(m,"adds","deductionRows","Salary addition description");
    renderMoneyRows(m,"fines","fineRows","Fine description");
    renderMoneyRows(m,"advances","advanceRows","Advance purpose / note");
    renderMoneyRows(m,"recoveries","recoveryRows","Advance recovery note");
    renderMoneyRows(m,"payments","paymentRows","Payment note",true);

    calc(m,d);
  }

  renderOutstanding();
  renderPaymentHistory();
}

function renderMileage(m) {
  const body=$("mileageRows");
  body.innerHTML="";

  if (!m.rows.length) {
    body.innerHTML='<tr><td colspan="7" style="text-align:center;color:#8793a3;padding:22px">No mileage entries. Select “Add Mileage Row” to begin.</td></tr>';
    return;
  }

  m.rows.forEach(r=>{
    const tr=document.createElement("tr");
    const diff=Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0));

    tr.innerHTML=`
      <td><input class="date-input" type="date" value="${esc(r.date||"")}" data-field="date"></td>
      <td><input type="number" min="0" step="0.1" value="${r.prev??""}" placeholder="0" data-field="prev"></td>
      <td><input type="number" min="0" step="0.1" value="${r.next??""}" placeholder="0" data-field="next"></td>
      <td><span class="calculated">${num(diff)}</span></td>
      <td><input type="number" min="0" step="0.01" value="${r.rate??db.rate}" data-field="rate"></td>
      <td class="amount">${money(diff*(Number(r.rate)||0))}</td>
      <td><button class="delete-row">×</button></td>`;

    tr.querySelectorAll("input").forEach(inp=>inp.onchange=()=>{
      const f=inp.dataset.field;
      r[f]=f==="date"?inp.value:(inp.value===""?"":Number(inp.value));
      scheduleSave();
      render();
    });

    tr.querySelector("button").onclick=()=>{
      m.rows=m.rows.filter(x=>x!==r);
      scheduleSave();
      render();
    };

    body.append(tr);
  });
}

function renderMoneyRows(m,key,container,placeholder,withDate=false) {
  const el=$(container);
  el.innerHTML="";

  m[key].forEach(r=>{
    const row=document.createElement("div");
    row.className=withDate?"money-row payment-row":"money-row";

    row.innerHTML=`
      ${withDate?`<input type="date" class="payment-date" value="${esc(r.date||"")}">`:""}
      <input class="money-desc" value="${esc(r.desc||"")}" placeholder="${esc(placeholder)}" aria-label="Description">
      <input class="money-amount" type="number" min="0" step="0.01" value="${r.amount??""}" placeholder="0.00" aria-label="Amount">
      <button class="delete-row">×</button>`;

    const date=row.querySelector(".payment-date");
    const desc=row.querySelector(".money-desc");
    const amt=row.querySelector(".money-amount");

    if(date) date.onchange=()=>{
      r.date=date.value;
      scheduleSave();
      renderOutstanding();
      renderPaymentHistory();
    };

    desc.onchange=()=>{
      r.desc=desc.value;
      scheduleSave();
      renderPaymentHistory();
    };

    amt.onchange=()=>{
      r.amount=Number(amt.value)||0;
      scheduleSave();
      render();
    };

    row.querySelector("button").onclick=()=>{
      m[key]=m[key].filter(x=>x!==r);
      scheduleSave();
      render();
    };

    el.append(row);
  });
}

function calc(m,d) {
  let prev=0,next=0,miles=0,earn=0;

  m.rows.forEach(r=>{
    prev+=Number(r.prev)||0;
    next+=Number(r.next)||0;

    const diff=Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0));
    miles+=diff;
    earn+=diff*(Number(r.rate)||0);
  });

  const sum=k=>(m[k]||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);

  const adds=sum("adds");
  const fines=sum("fines");
  const adv=sum("advances");
  const rec=sum("recoveries");
  const paid=sum("payments");

  const gross=earn+adds-fines-rec;
  const remaining=gross-paid;

  $("totalPrev").textContent=num(prev);
  $("totalNew").textContent=num(next);
  $("totalMiles").textContent=num(miles);
  $("mileageTotal").textContent=money(earn);

  $("deductionTotal").textContent=money(adds);
  $("fineTotal").textContent=money(fines);
  $("advanceTotal").textContent=money(adv);
  $("recoveryTotal").textContent=money(rec);
  $("advanceBalance").textContent=money(totalsFor(d).balance);

  $("paidTotal").textContent=money(paid);
  $("salaryBalance").textContent=money(remaining);
  $("finalSalary").textContent=money(gross);
}

function addRow(key) {
  const d=driver();
  if(!d)return;

  monthData(d)[key].push({
    id:uid(),
    date:new Date().toISOString().slice(0,10),
    desc:"",
    amount:0
  });

  scheduleSave();
  render();
}

$("monthPicker").value=currentMonth;
$("monthPicker").onchange=e=>{
  currentMonth=e.target.value||currentMonth;
  render();
};

function addMileage() {
  const d=driver();
  if(!d)return;

  monthData(d).rows.push({
    id:uid(),
    date:new Date().toISOString().slice(0,10),
    prev:0,
    next:0,
    rate:db.rate
  });

  scheduleSave();
  render();
}

$("addMileageBtn").onclick=addMileage;
$("addDeductionBtn").onclick=()=>addRow("adds");
$("addFineBtn").onclick=()=>addRow("fines");
$("addAdvanceBtn").onclick=()=>addRow("advances");
$("addRecoveryBtn").onclick=()=>addRow("recoveries");
$("addPaymentBtn").onclick=()=>addRow("payments");

$("driverName").onchange=e=>{
  const d=driver();

  if(d){
    d.name=e.target.value.trim()||d.name;
    scheduleSave();
    renderTabs();
    $("sheetDriverName").textContent=d.name;
    renderOutstanding();
    renderPaymentHistory();
  }
};

$("truckNumber").onchange=e=>{
  const d=driver();

  if(d){
    d.truck=e.target.value.trim();
    scheduleSave();
    renderOutstanding();
    renderPaymentHistory();
  }
};

function openModal() {
  $("driverModal").classList.remove("hidden");
  $("newDriverName").focus();
}

function closeModal() {
  $("driverModal").classList.add("hidden");
  $("newDriverName").value="";
  $("newTruckNumber").value="";
}

$("addDriverBtn").onclick=openModal;
$("emptyAddBtn").onclick=openModal;
$("closeModal").onclick=closeModal;
$("cancelDriver").onclick=closeModal;

$("createDriver").onclick=()=>{
  const name=$("newDriverName").value.trim();
  const truck=$("newTruckNumber").value.trim();

  if(!name){
    toast("Please enter driver name.");
    return;
  }

  const d={id:uid(),name,truck,months:{}};

  db.drivers.push(d);
  activeId=d.id;

  scheduleSave();
  closeModal();
  showView("salary");
  render();

  toast("Driver sheet created and syncing.");
};

// Driver profiles are permanent. Do not delete driver salary history.
$("deleteDriverBtn").onclick=()=>{
  toast("Driver records are permanent and cannot be deleted here.");
};

$("printBtn").onclick=()=>window.print();

function injectExtraUI() {
  const sidebar=document.querySelector(".sidebar");

  if(!sidebar || $("navOutstanding"))return;

  const settings=$("navSettings");

  const addNav=(id,label)=>{
    const b=document.createElement("button");
    b.className="nav";
    b.id=id;
    b.textContent=label;
    settings.after(b);
    return b;
  };

  const out=addNav("navOutstanding","▣  Outstanding Salary");
  const hist=addNav("navHistory","▤  Payment History");

  out.onclick=()=>showView("outstanding");
  hist.onclick=()=>showView("history");

  const main=document.querySelector(".main");
  const footer=main.querySelector(".app-footer");

  const outstanding=document.createElement("section");
  outstanding.id="outstandingView";
  outstanding.className="extra-view hidden";

  outstanding.innerHTML=`
    <div class="welcome-row">
      <div>
        <h2>Outstanding Salary</h2>
        <p>Drivers with unpaid salary balances. Fully paid drivers automatically disappear from this list.</p>
      </div>
    </div>
    <div id="outstandingList" class="extra-list"></div>`;

  const history=document.createElement("section");
  history.id="historyView";
  history.className="extra-view hidden";

  history.innerHTML=`
    <div class="welcome-row">
      <div>
        <h2>Payment History</h2>
        <p>Complete record of salary payments for all drivers.</p>
      </div>
    </div>
    <div id="historyList" class="table-wrap extra-table"></div>`;

  footer.before(outstanding,history);
}

function showView(view) {
  currentView=view;

  $("salaryView").classList.toggle("hidden",view!=="salary");
  $("settingsView").classList.toggle("hidden",view!=="settings");
  $("outstandingView").classList.toggle("hidden",view!=="outstanding");
  $("historyView").classList.toggle("hidden",view!=="history");

  ["navSalary","navSettings","navOutstanding","navHistory"].forEach(id=>{
    const el=$(id);

    if(el) {
      el.classList.toggle("active",
        (id==="navSalary"&&view==="salary") ||
        (id==="navSettings"&&view==="settings") ||
        (id==="navOutstanding"&&view==="outstanding") ||
        (id==="navHistory"&&view==="history")
      );
    }
  });

  if(view==="settings") {
    $("defaultRate").value=Number(db.rate).toFixed(2);
  }

  if(view==="outstanding")renderOutstanding();
  if(view==="history")renderPaymentHistory();
}

function renderOutstanding() {
  const wrap=$("outstandingList");
  if(!wrap)return;

  const list=db.drivers
    .map(d=>({d,...driverFinancials(d)}))
    .filter(x=>x.outstanding>0.005);

  if(!list.length) {
    wrap.innerHTML='<div class="empty-extra">No outstanding salary. All drivers are fully paid.</div>';
    return;
  }

  wrap.innerHTML=list.map(x=>`
    <div class="outstanding-card">
      <div>
        <small>DRIVER / TRUCK</small>
        <strong>${esc(x.d.name||"Unnamed Driver")}</strong>
        <span>${esc(x.d.truck||"No truck number")}</span>
      </div>
      <div>
        <small>TOTAL SALARY EARNED</small>
        <strong>${money(x.gross)}</strong>
      </div>
      <div>
        <small>OUTSTANDING BALANCE</small>
        <span class="balance">${money(x.outstanding)}</span>
      </div>
      <button class="pay-now" data-pay="${esc(x.d.id)}">＋ Pay</button>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-pay]").forEach(btn=>{
    btn.onclick=()=>payOutstanding(btn.dataset.pay);
  });
}

function payOutstanding(id) {
  const d=db.drivers.find(x=>x.id===id);
  if(!d)return;

  const balance=driverFinancials(d).outstanding;

  const raw=prompt(
    `Driver: ${d.name}\nTruck: ${d.truck||"—"}\nOutstanding: ${money(balance)}\n\nEnter payment amount (USD):`
  );

  if(raw===null)return;

  const amount=Number(raw);

  if(!Number.isFinite(amount)||amount<=0) {
    toast("Enter a valid payment amount.");
    return;
  }

  if(amount>balance+0.005) {
    toast("Payment cannot exceed outstanding balance.");
    return;
  }

  const dateRaw=prompt(
    "Payment date (YYYY-MM-DD):",
    new Date().toISOString().slice(0,10)
  );

  if(dateRaw===null)return;

  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    toast("Enter date as YYYY-MM-DD.");
    return;
  }

  const m=monthData(d,currentMonth);

  m.payments.push({
    id:uid(),
    date:dateRaw,
    desc:"Salary payment",
    amount
  });

  scheduleSave();
  render();

  toast("Payment saved. Outstanding balance updated.");
}

function renderPaymentHistory() {
  const wrap=$("historyList");
  if(!wrap)return;

  const entries=[];

  db.drivers.forEach(d=>{
    Object.entries(d.months||{}).forEach(([month,m])=>{
      (m.payments||[]).forEach(p=>{
        entries.push({
          name:d.name||"Unnamed Driver",
          truck:d.truck||"—",
          month,
          date:p.date||month+"-01",
          desc:p.desc||"Salary payment",
          amount:Number(p.amount)||0
        });
      });
    });
  });

  entries.sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  if(!entries.length) {
    wrap.innerHTML='<div class="empty-extra">No salary payments recorded yet.</div>';
    return;
  }

  wrap.innerHTML=`
    <table>
      <thead>
        <tr>
          <th>PAYMENT DATE</th>
          <th>DRIVER</th>
          <th>TRUCK</th>
          <th>SALARY MONTH</th>
          <th>DESCRIPTION</th>
          <th>AMOUNT PAID</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(p=>`
          <tr>
            <td>${esc(p.date)}</td>
            <td>${esc(p.name)}</td>
            <td>${esc(p.truck)}</td>
            <td>${esc(p.month)}</td>
            <td>${esc(p.desc)}</td>
            <td class="amount">${money(p.amount)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

$("navSalary").onclick=()=>showView("salary");
$("navSettings").onclick=()=>showView("settings");

$("saveSettings").onclick=()=>{
  const v=Number($("defaultRate").value);

  if(!Number.isFinite(v)||v<0) {
    toast("Enter a valid rate.");
    return;
  }

  db.rate=v;
  scheduleSave();

  toast("Default rate saved: "+money(v)+" per mile.");
};

$("logoutBtn").onclick=async()=>{
  if(sb)await sb.auth.signOut();

  user=null;
  $("loginScreen").classList.remove("hidden");
  setAuthMessage("Signed out.",true);
};

async function authAction(mode) {
  const email=$("authEmail").value.trim();
  const password=$("authPassword").value;

  if(!email||!password) {
    setAuthMessage("Enter your email and password.");
    return;
  }

  if(password.length<6) {
    setAuthMessage("Password must be at least 6 characters.");
    return;
  }

  setAuthMessage(
    mode==="login"?"Signing in…":"Creating account…",
    true
  );

  const result=mode==="login"
    ?await sb.auth.signInWithPassword({email,password})
    :await sb.auth.signUp({email,password});

  if(result.error) {
    setAuthMessage(result.error.message);
    return;
  }

  if(mode==="signup"&&!result.data.session) {
    setAuthMessage(
      "Account created. Check your email to confirm, then log in.",
      true
    );
    return;
  }

  user=result.data.user;

  if(user) {
    try {
      await loadCloud();
      setAuthMessage("");
      toast("Cloud account connected.");
    } catch(e) {
      setAuthMessage("Database setup error: "+e.message);
    }
  }
}

$("loginBtn").onclick=()=>authAction("login");
$("signupBtn").onclick=()=>authAction("signup");

async function init() {
  injectExtraUI();

  if(!window.supabase||!SUPABASE_URL||!SUPABASE_ANON_KEY||
    /PASTE_|remove key|your.*key/i.test(String(SUPABASE_ANON_KEY))) {
    setAuthMessage(
      "Setup required: add your real Supabase anon/publishable key in supabase-config.js."
    );
    return;
  }

  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

  const {data}=await sb.auth.getSession();

  if(data.session) {
    user=data.session.user;

    try {
      await loadCloud();
    } catch(e) {
      setAuthMessage("Database setup error: "+e.message);
    }
  }
}

init();
