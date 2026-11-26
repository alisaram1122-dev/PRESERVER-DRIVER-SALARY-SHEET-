const $=id=>document.getElementById(id);
const URL=String(window.PRESERVER_SUPABASE_URL || "").trim();
const KEY=String(window.PRESERVER_SUPABASE_ANON_KEY || "").trim();

let sb=null,user=null;
let db={rate:.52,basic:0,drivers:[],deleted:[],settings:{manager:"Saim Ali",designation:"Account Manager",company:"Preserver Trans LLC"}};
let activeId=null;
let currentMonth=new Date().toISOString().slice(0,7);
let saveTimer=null;
let currentView="salary";

const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const number=n=>(Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function toast(message){
  $("toast").textContent=message;
  $("toast").classList.add("show");
  setTimeout(()=>$("toast").classList.remove("show"),2500);
}

function authMessage(message){
  $("authMessage").textContent=message;
}

function save(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveCloud,500);
}

async function saveCloud(){
  if(!user||!sb)return;
  const {error}=await sb.from("driver_salary_data").upsert({
    user_id:user.id,
    payload:db,
    updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error)toast("Cloud save error: "+error.message);
}

function normalize(){
  db.drivers||=[];
  db.deleted||=[];
  db.settings||={manager:"Saim Ali",designation:"Account Manager",company:"Preserver Trans LLC"};
  db.rate=Number(db.rate??.52);
  db.basic=Number(db.basic??0);

  db.drivers.forEach(d=>{
    d.months||={};
    d.photo||="";
    d.name||="";
    d.truck||="";
    Object.values(d.months).forEach(m=>{
      ["rows","adds","fines","advances","recoveries","layovers","payments"].forEach(k=>m[k]||=[]);
      m.closed=!!m.closed;
    });
  });
}

async function loadCloud(){
  const {data,error}=await sb.from("driver_salary_data")
    .select("payload").eq("user_id",user.id).maybeSingle();
  if(error)throw error;

  if(data?.payload)db=data.payload;
  normalize();
  activeId=db.drivers[0]?.id||null;

  $("loginScreen").classList.add("hidden");
  $("userLabel").textContent=user.email||"Account";
  render();
}

function driver(){return db.drivers.find(d=>d.id===activeId)}

function monthData(d,month=currentMonth){
  d.months||={};
  d.months[month]||={
    rows:[],adds:[],fines:[],advances:[],recoveries:[],layovers:[],payments:[],closed:false
  };
  const m=d.months[month];
  ["rows","adds","fines","advances","recoveries","layovers","payments"].forEach(k=>m[k]||=[]);
  return m;
}

function monthsOf(d){
  return Object.entries(d.months||{}).sort((a,b)=>a[0].localeCompare(b[0]));
}

function total(m,key){
  return (m[key]||[]).reduce((s,x)=>s+(Number(x.amount)||0),0);
}

function mileage(m){
  return (m.rows||[]).reduce((s,r)=>{
    const miles=Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0));
    return s+miles*(Number(r.rate)||0);
  },0);
}

function milesTotal(m){
  return (m.rows||[]).reduce((s,r)=>s+Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0)),0);
}

function monthNet(m){
  const lay=total(m,"layovers");
  const layNet=(m.layovers||[]).reduce((s,x)=>s+(x.type==="deduct"?-Number(x.amount||0):Number(x.amount||0)),0);
  return mileage(m)+db.basic+total(m,"adds")+layNet-total(m,"fines")-total(m,"recoveries");
}

function previousDue(d,month=currentMonth){
  let due=0;
  monthsOf(d).forEach(([key,m])=>{
    if(key>=month)return;
    due+=Math.max(0,monthNet(m)-total(m,"payments"));
  });
  return due;
}

function advanceBalance(d){
  let adv=0,rec=0;
  monthsOf(d).forEach(([,m])=>{
    adv+=total(m,"advances");
    rec+=total(m,"recoveries");
  });
  return Math.max(0,adv-rec);
}

function financial(m,d){
  const previous=previousDue(d);
  const gross=monthNet(m);
  const due=previous+gross;
  const paid=total(m,"payments");
  return {previous,gross,due,paid,balance:Math.max(0,due-paid)};
}

function setView(view){
  currentView=view;
  document.querySelectorAll(".view").forEach(el=>el.classList.add("hidden"));
  $(view+"View").classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.view===view));

  if(view==="salary")render();
  if(view==="history")renderHistory();
  if(view==="reports")renderReports();
  if(view==="outstanding")renderOutstanding();
  if(view==="deleted")renderDeleted();
  if(view==="settings")renderSettings();
}

document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>setView(b.dataset.view));

function render(){
  $("monthPicker").value=currentMonth;
  renderTabs();

  const d=driver();
  $("emptyState").classList.toggle("hidden",!!d);
  $("sheetArea").classList.toggle("hidden",!d);
  if(!d)return;

  const m=monthData(d);
  const [y,mo]=currentMonth.split("-");
  $("sheetDriverName").textContent=d.name;
  $("sheetPeriod").textContent=new Date(+y,+mo-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"})+" Salary Sheet";

  $("driverName").value=d.name;
  $("truckNumber").value=d.truck||"";
  $("driverPhoto").src=d.photo||"";
  $("monthDisplay").value=mo;
  $("yearDisplay").value=y;

  $("printManager").textContent=db.settings.manager;
  $("printDesignation").textContent=db.settings.designation;

  renderRows(m,"rows","mileageRows");
  renderMoney(m,"adds","additionRows");
  renderMoney(m,"fines","fineRows");
  renderMoney(m,"advances","advanceRows");
  renderMoney(m,"recoveries","recoveryRows");
  renderMoney(m,"layovers","layoverRows",true);
  calculate(m,d);
}

function renderTabs(){
  const wrap=$("driverTabs");
  const query=$("salarySearch").value.toLowerCase();
  wrap.innerHTML="";

  db.drivers.filter(d=>(d.name+" "+d.truck).toLowerCase().includes(query)).forEach(d=>{
    const b=document.createElement("button");
    b.className="driver-tab"+(d.id===activeId?" active":"");
    b.textContent=d.name+" · "+(d.truck||"No Truck");
    b.onclick=()=>{activeId=d.id;render()};
    wrap.append(b);
  });
}

function calculate(m,d){
  const f=financial(m,d);
  $("totalMiles").textContent=number(milesTotal(m));
  $("mileageTotal").textContent=money(mileage(m));
  $("previousDues").textContent=money(f.previous);
  $("previousBalance").textContent=money(f.previous);
  $("advanceBalance").textContent=money(advanceBalance(d));
  $("advanceRemaining").textContent=money(advanceBalance(d));

  $("additionTotal").textContent=money(total(m,"adds"));
  $("fineTotal").textContent=money(total(m,"fines"));
  $("advanceTotal").textContent=money(total(m,"advances"));
  $("recoveryTotal").textContent=money(total(m,"recoveries"));
  $("layoverTotal").textContent=money(
    (m.layovers||[]).reduce((s,x)=>s+(x.type==="deduct"?-Number(x.amount||0):Number(x.amount||0)),0)
  );
  $("finalSalary").textContent=money(f.due);
}

function renderRows(m,key,container){
  const el=$(container);
  el.innerHTML="";
  if(!m[key].length){
    el.innerHTML='<tr><td colspan="7" class="empty-cell">No mileage entries yet.</td></tr>';
    return;
  }

  m[key].forEach(r=>{
    const tr=document.createElement("tr");
    const diff=Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0));
    tr.innerHTML=`
      <td><input type="date" value="${esc(r.date||"")}" data-f="date"></td>
      <td><input type="number" value="${r.prev??0}" data-f="prev"></td>
      <td><input type="number" value="${r.next??0}" data-f="next"></td>
      <td class="amount">${number(diff)}</td>
      <td><input type="number" step=".01" value="${r.rate??db.rate}" data-f="rate"></td>
      <td class="amount">${money(diff*(Number(r.rate)||0))}</td>
      <td><button class="delete-row">×</button></td>`;

    tr.querySelectorAll("input").forEach(inp=>inp.onchange=()=>{
      const field=inp.dataset.f;
      r[field]=field==="date"?inp.value:Number(inp.value)||0;
      save();render();
    });

    tr.querySelector("button").onclick=()=>removeRecord(m,key,r);
    el.append(tr);
  });
}

function renderMoney(m,key,container,layover=false){
  const el=$(container);
  el.innerHTML="";

  m[key].forEach(r=>{
    const row=document.createElement("div");
    row.className="money-row";
    row.innerHTML=`
      <input placeholder="${layover?"Layover description":"Description"}" value="${esc(r.desc||"")}">
      ${layover?`<select><option value="add">Add to salary</option><option value="deduct">Deduct from salary</option></select>`:""}
      <input type="number" min="0" step=".01" placeholder="Amount" value="${r.amount??0}">
      <button class="delete-row">×</button>`;

    const inputs=row.querySelectorAll("input");
    const desc=inputs[0];
    const amount=inputs[inputs.length-1];
    const select=row.querySelector("select");

    if(select)select.value=r.type||"add";
    desc.onchange=()=>{r.desc=desc.value;save()};
    amount.onchange=()=>{r.amount=Number(amount.value)||0;save();render()};
    if(select)select.onchange=()=>{r.type=select.value;save();render()};
    row.querySelector("button").onclick=()=>removeRecord(m,key,r);
    el.append(row);
  });
}

function removeRecord(m,key,r){
  if(!confirm("Move this record to Deleted Records?"))return;
  db.deleted.push({id:uid(),type:"entry",record:structuredClone(r),category:key,driverId:activeId,month:currentMonth,deletedAt:today()});
  m[key]=m[key].filter(x=>x!==r);
  save();render();toast("Record moved to Deleted Records.");
}

function addMoney(key){
  const d=driver();if(!d)return;
  const m=monthData(d);
  if(m.closed){toast("This salary sheet is closed.");return}
  m[key].push({id:uid(),date:today(),desc:"",amount:0,type:"add"});
  save();render();
}

$("addMileageBtn").onclick=()=>{
  const d=driver();if(!d)return;
  const m=monthData(d);
  if(m.closed)return toast("Salary sheet is closed.");
  m.rows.push({id:uid(),date:today(),prev:0,next:0,rate:db.rate});
  save();render();
};

$("addAdditionBtn").onclick=()=>addMoney("adds");
$("addFineBtn").onclick=()=>addMoney("fines");
$("addAdvanceBtn").onclick=()=>addMoney("advances");
$("addRecoveryBtn").onclick=()=>addMoney("recoveries");
$("addLayoverBtn").onclick=()=>addMoney("layovers");

$("driverName").onchange=e=>{
  const d=driver();if(!d)return;
  d.name=e.target.value.trim()||d.name;save();render();
};
$("truckNumber").onchange=e=>{
  const d=driver();if(!d)return;
  d.truck=e.target.value.trim();save();renderTabs();
};

function readPhoto(file,callback){
  if(!file)return;
  if(file.size>1500000){toast("Photo must be smaller than 1.5 MB.");return}
  const reader=new FileReader();
  reader.onload=()=>callback(reader.result);
  reader.readAsDataURL(file);
}

$("photoInput").onchange=e=>{
  const d=driver();if(!d)return;
  readPhoto(e.target.files[0],data=>{
    d.photo=data;save();render();toast("Driver photo saved.");
  });
};

$("addDriverBtn").onclick=()=>$("driverModal").classList.remove("hidden");
$("closeModal").onclick=()=>$("driverModal").classList.add("hidden");

$("createDriver").onclick=()=>{
  const name=$("newDriverName").value.trim();
  const truck=$("newTruckNumber").value.trim();
  const file=$("newDriverPhoto").files[0];
  if(!name)return toast("Enter driver name.");

  readPhoto(file,photo=>create(photo));
  if(!file)create("");

  function create(photo){
    const d={id:uid(),name,truck,photo,months:{}};
    db.drivers.push(d);activeId=d.id;
    $("driverModal").classList.add("hidden");
    $("newDriverName").value="";
    $("newTruckNumber").value="";
    $("newDriverPhoto").value="";
    save();render();toast("Driver profile created.");
  }
};

$("monthPicker").onchange=e=>{
  currentMonth=e.target.value||currentMonth;
  render();
};

$("salarySearch").oninput=renderTabs;

$("paySalaryBtn").onclick=()=>{
  const d=driver();if(!d)return;
  const m=monthData(d);
  const f=financial(m,d);
  if(m.closed)return toast("This salary is already closed.");
  if(f.balance<=0)return toast("There is no remaining salary to pay.");

  const amount=Number(prompt("Enter payment amount:",f.balance.toFixed(2)));
  if(!Number.isFinite(amount)||amount<=0)return;
  if(amount>f.balance+.005)return toast("Payment cannot exceed the balance.");

  const payment={id:uid(),date:today(),desc:"Salary payment",amount};
  m.payments.push(payment);

  if(amount>=f.balance-.005){
    m.closed=true;
    m.closedAt=today();
    m.finalPaid=amount;
  }
  save();render();
  toast(m.closed?"Salary paid and moved to history.":"Partial payment saved.");
};

$("printBtn").onclick=()=>window.print();

function renderHistory(){
  const wrap=$("historyList");
  const query=$("historySearch").value.toLowerCase();
  const month=$("historyMonth").value;
  const entries=[];

  db.drivers.forEach(d=>{
    monthsOf(d).forEach(([key,m])=>{
      if(!m.closed)return;
      if(month&&key!==month)return;
      if(!(d.name+" "+d.truck+" "+key).toLowerCase().includes(query))return;
      entries.push({d,key,m});
    });
  });

  wrap.innerHTML=entries.map(x=>`
    <div class="record-card">
      <div><h3>${esc(x.d.name)} · Truck ${esc(x.d.truck)}</h3>
      <p>${esc(x.key)} · Paid: ${money(total(x.m,"payments"))}</p>
      <p>${number(milesTotal(x.m))} miles · Fines ${money(total(x.m,"fines"))} · Layover ${money(x.m.layovers.reduce((s,l)=>s+(l.type==="deduct"?-l.amount:l.amount),0))}</p></div>
      <div class="record-actions">
        <button class="secondary" data-history="${x.d.id}|${x.key}">Open Sheet</button>
        <button class="danger-outline" data-delete="${x.d.id}|${x.key}">Delete</button>
      </div>
    </div>`).join("")||'<div class="empty">No salary history found.</div>';

  wrap.querySelectorAll("[data-history]").forEach(b=>b.onclick=()=>{
    const [id,month]=b.dataset.history.split("|");
    activeId=id;currentMonth=month;setView("salary");
  });

  wrap.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{
    const [id,month]=b.dataset.delete.split("|");
    const d=db.drivers.find(x=>x.id===id);
    if(!d)return;
    db.deleted.push({id:uid(),type:"month",driverId:id,driverName:d.name,truck:d.truck,month,record:structuredClone(d.months[month]),deletedAt:today()});
    delete d.months[month];save();renderHistory();toast("Salary sheet moved to recycle bin.");
  });
}

$("historySearch").oninput=renderHistory;
$("historyMonth").onchange=renderHistory;

function renderOutstanding(){
  const query=$("outstandingSearch").value.toLowerCase();
  const entries=[];
  db.drivers.forEach(d=>{
    const due=monthsOf(d).reduce((s,[,m])=>s+Math.max(0,monthNet(m)-total(m,"payments")),0);
    const adv=advanceBalance(d);
    if(due<=0&&adv<=0)return;
    if(!(d.name+" "+d.truck).toLowerCase().includes(query))return;
    entries.push({d,due,adv});
  });

  $("outstandingList").innerHTML=entries.map(x=>`
    <div class="record-card">
      <div><h3>${esc(x.d.name)} · Truck ${esc(x.d.truck)}</h3>
      <p>Unpaid salary: ${money(x.due)}</p><p>Advance balance: ${money(x.adv)}</p></div>
      <button class="secondary" data-open="${x.d.id}">Open Driver</button>
    </div>`).join("")||'<div class="empty">No outstanding dues.</div>';

  $("outstandingList").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{
    activeId=b.dataset.open;setView("salary");
  });
}
$("outstandingSearch").oninput=renderOutstanding;

function inPeriod(month,period,base){
  if(period==="all")return true;
  const [y,m]=month.split("-").map(Number);
  if(period==="year")return y===base.getFullYear();
  if(period==="month")return y===base.getFullYear()&&m===base.getMonth()+1;
  const start=new Date(base);start.setDate(start.getDate()-6);
  const date=new Date(y,m-1,1);
  return date.getFullYear()===base.getFullYear()&&date.getMonth()===base.getMonth()&&date>=new Date(start.getFullYear(),start.getMonth(),1);
}

function renderReports(){
  const period=$("reportPeriod").value;
  const base=new Date(($("reportDate").value||today())+"T12:00:00");
  const query=$("reportSearch").value.toLowerCase();
  const list=[];

  db.drivers.forEach(d=>{
    let miles=0,fines=0,lay=0,salary=0;
    monthsOf(d).forEach(([month,m])=>{
      if(!inPeriod(month,period,base))return;
      miles+=milesTotal(m);
      fines+=total(m,"fines");
      lay+=(m.layovers||[]).reduce((s,x)=>s+(x.type==="deduct"?-x.amount:x.amount),0);
      salary+=total(m,"payments");
    });
    if(!(d.name+" "+d.truck).toLowerCase().includes(query))return;
    list.push({d,miles,fines,lay,salary});
  });

  const sum=k=>list.reduce((s,x)=>s+x[k],0);
  $("reportCards").innerHTML=`
    <div class="report-stat"><span>TOTAL MILES</span><strong>${number(sum("miles"))}</strong></div>
    <div class="report-stat"><span>TOTAL FINES</span><strong>${money(sum("fines"))}</strong></div>
    <div class="report-stat"><span>LAYOVER NET</span><strong>${money(sum("lay"))}</strong></div>
    <div class="report-stat"><span>SALARY PAID</span><strong>${money(sum("salary"))}</strong></div>`;

  $("reportList").innerHTML=`<table><thead><tr><th>DRIVER</th><th>TRUCK</th><th>MILES</th><th>FINES</th><th>LAYOVER</th><th>SALARY PAID</th><th></th></tr></thead><tbody>
  ${list.map(x=>`<tr><td>${esc(x.d.name)}</td><td>${esc(x.d.truck)}</td><td>${number(x.miles)}</td><td>${money(x.fines)}</td><td>${money(x.lay)}</td><td>${money(x.salary)}</td><td><button class="secondary" data-report="${x.d.id}">Open</button></td></tr>`).join("")}
  </tbody></table>`;

  $("reportList").querySelectorAll("[data-report]").forEach(b=>b.onclick=()=>{
    activeId=b.dataset.report;setView("salary");
  });
}
$("reportSearch").oninput=renderReports;
$("reportPeriod").onchange=renderReports;
$("reportDate").value=today();
$("reportDate").onchange=renderReports;

function renderDeleted(){
  const query=$("deletedSearch").value.toLowerCase();
  const wrap=$("deletedList");
  const list=db.deleted.filter(x=>(x.driverName||db.drivers.find(d=>d.id===x.driverId)?.name||"").toLowerCase().includes(query));

  wrap.innerHTML=list.map(x=>`
    <div class="record-card">
      <div><h3>${esc(x.driverName||db.drivers.find(d=>d.id===x.driverId)?.name||"Driver record")}</h3>
      <p>${esc(x.month||"")} · Deleted ${esc(x.deletedAt||"")}</p></div>
      <div class="record-actions">
        <button class="secondary" data-restore="${x.id}">Restore</button>
        <button class="danger-outline" data-permanent="${x.id}">Permanently Delete</button>
      </div>
    </div>`).join("")||'<div class="empty">Recycle bin is empty.</div>';

  wrap.querySelectorAll("[data-restore]").forEach(b=>b.onclick=()=>{
    const x=db.deleted.find(r=>r.id===b.dataset.restore);
    if(!x)return;
    if(x.type==="month"){
      const d=db.drivers.find(d=>d.id===x.driverId);
      if(d)d.months[x.month]=x.record;
    }else{
      const d=db.drivers.find(d=>d.id===x.driverId);
      if(d){
        const m=monthData(d,x.month);
        m[x.category].push(x.record);
      }
    }
    db.deleted=db.deleted.filter(r=>r.id!==x.id);
    save();renderDeleted();toast("Record restored.");
  });

  wrap.querySelectorAll("[data-permanent]").forEach(b=>b.onclick=async()=>{
    const password=prompt("Enter your account password to permanently delete this record:");
    if(password===null)return;
    const {error}=await sb.auth.signInWithPassword({email:user.email,password});
    if(error)return toast("Incorrect password.");
    db.deleted=db.deleted.filter(r=>r.id!==b.dataset.permanent);
    save();renderDeleted();toast("Permanently deleted.");
  });
}
$("deletedSearch").oninput=renderDeleted;

function renderSettings(){
  $("defaultRate").value=db.rate;
  $("defaultBasic").value=db.basic;
  $("managerName").value=db.settings.manager;
  $("managerDesignation").value=db.settings.designation;
  $("companyName").value=db.settings.company;
}

$("saveSettings").onclick=()=>{
  db.rate=Math.max(0,Number($("defaultRate").value)||0);
  db.basic=Math.max(0,Number($("defaultBasic").value)||0);
  save();toast("Payroll settings saved.");
};

$("saveManager").onclick=()=>{
  db.settings.manager=$("managerName").value.trim()||"Saim Ali";
  db.settings.designation=$("managerDesignation").value.trim()||"Account Manager";
  db.settings.company=$("companyName").value.trim()||"Preserver Trans LLC";
  save();toast("Manager information saved.");
};

$("changeAccount").onclick=async()=>{
  const current=$("currentPassword").value;
  const email=$("newEmail").value.trim();
  const password=$("newPassword").value;
  if(!current)return toast("Enter current password.");
  const check=await sb.auth.signInWithPassword({email:user.email,password:current});
  if(check.error)return toast("Current password is incorrect.");
  const changes={};
  if(email)changes.email=email;
  if(password)changes.password=password;
  if(!Object.keys(changes).length)return toast("Enter a new email or password.");
  const {error}=await sb.auth.updateUser(changes);
  if(error)return toast(error.message);
  $("currentPassword").value="";
  $("newPassword").value="";
  toast("Account update submitted. Check email if confirmation is required.");
};

$("logoutBtn").onclick=async()=>{
  await sb.auth.signOut();
  user=null;
  $("loginScreen").classList.remove("hidden");
};

async function auth(mode){
  const email=$("authEmail").value.trim();
  const password=$("authPassword").value;
  if(!email||!password)return authMessage("Enter email and password.");
  authMessage("Please wait...");
  const result=mode==="login"
    ?await sb.auth.signInWithPassword({email,password})
    :await sb.auth.signUp({email,password});
  if(result.error)return authMessage(result.error.message);
  if(mode==="signup"&&!result.data.session)return authMessage("Check your email to confirm your account.");
  user=result.data.user;
  try{await loadCloud();toast("Payroll account connected.");}
  catch(e){authMessage(e.message);}
}

$("loginBtn").onclick=()=>auth("login");
$("signupBtn").onclick=()=>auth("signup");


async function init(){
  try {
    if (!window.supabase) {
      authMessage("Supabase library load nahi hui. Internet aur script order check karein.");
      return;
    }

    if (!URL || !KEY) {
      authMessage("Supabase URL ya Anon Key missing hai.");
      return;
    }

    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL.trim())) {
      authMessage("Supabase URL format incorrect hai. supabase-config.js check karein.");
      return;
    }

    if (KEY.includes("PASTE_") || KEY.includes("yaha key")) {
      authMessage("Please apni actual Supabase anon/public key paste karein.");
      return;
    }

    sb = window.supabase.createClient(URL.trim(), KEY.trim());

    authMessage("Checking account connection...");

    const { data, error } = await sb.auth.getSession();

    if (error) throw error;

    if (data.session) {
      user = data.session.user;
      authMessage("Loading payroll data...");

      try {
        await loadCloud();
        toast("Payroll account connected.");
      } catch (e) {
        authMessage("Database error: " + e.message);
      }
    } else {
      authMessage("");
    }

  } catch (e) {
    console.error("Initialization error:", e);
    authMessage("Connection error: " + e.message);
  }
}

init();
