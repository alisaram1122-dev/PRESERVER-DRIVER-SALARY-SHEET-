
/* app.js - PRESERVER TRANS PAYROLL PRO */

const $ = id => document.getElementById(id);
const CACHE = "preserver_salary_cache_v2";
const DEFAULT_RATE = 0.52;
let sb=null,user=null,db={rate:DEFAULT_RATE,drivers:[],history:[],deletedRecords:[],settings:{company:"PRESERVER TRANS LLC",manager:"Saim Ali",username:"Saim Ali",designation:"Account Manager",location:"USA California",currency:"$",theme:"navy",displayStyle:"modern",fontSize:"normal",sidebarStyle:"gradient"}};
let currentStatement=null,managerPhotoData="",newDriverPhotoData="",saveTimer=null;
let reportColumns=["driver","truck","months","miles","salary","fines","paid","due"];

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const n=v=>Number(v||0);
const today=()=>new Date().toISOString().slice(0,10);
const thisMonth=()=>new Date().toISOString().slice(0,7);
const money=v=>(db.settings.currency||"$")+n(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const monthLabel=m=>m?new Date(m+"-01T12:00:00").toLocaleDateString("en-US",{month:"long",year:"numeric"}):"";
function toast(t){const e=$("appToast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2800)}
function msg(t,ok=false){$("loginMessage").textContent=t;$("loginMessage").style.color=ok?"#16835f":"#d94b55"}

function normalizeMonth(m={}){
  m.rows=Array.isArray(m.rows)?m.rows:[];
  m.adds=Array.isArray(m.adds)?m.adds:[];
  m.fines=Array.isArray(m.fines)?m.fines:[];
  m.advances=Array.isArray(m.advances)?m.advances:[];
  m.recoveries=Array.isArray(m.recoveries)?m.recoveries:[];
  m.payments=Array.isArray(m.payments)?m.payments:[];
  m.openingDue=n(m.openingDue);
  return m;
}
function normalize(){
  db.drivers=Array.isArray(db.drivers)?db.drivers:[];
  db.history=Array.isArray(db.history)?db.history:[];
  db.deletedRecords=Array.isArray(db.deletedRecords)?db.deletedRecords:[];
  db.settings={...db.settings,...(db.settings||{})};
  db.drivers.forEach(d=>{
    d.id=d.id||uid();d.name=d.name||d.driverName||"Unnamed Driver";
    d.truck=d.truck||d.truckNo||"";d.months=d.months||{};
    d.advanceBalance=n(d.advanceBalance);
    d.advanceLedger=Array.isArray(d.advanceLedger)?d.advanceLedger:[];
    Object.keys(d.months).forEach(k=>d.months[k]=normalizeMonth(d.months[k]));
  });
}
function getMonth(d,m){d.months=d.months||{};if(!d.months[m])d.months[m]=normalizeMonth({});return normalizeMonth(d.months[m])}
function selectedDriver(){return db.drivers.find(d=>d.id===$("salaryDriver").value)||null}
function selectedMonth(){return $("salaryMonth").value||thisMonth()}
function previousEndingMiles(d,month){
  const earlier=Object.keys(d.months||{}).filter(k=>k<month).sort().reverse();
  for(const key of earlier){
    const rows=getMonth(d,key).rows;
    if(rows.length)return n(rows[rows.length-1].next);
  }
  return 0;
}
function previousDue(d,month){
  const earlier=Object.keys(d.months||{}).filter(k=>k<month).sort();
  let due=0;
  earlier.forEach(k=>{const m=getMonth(d,k);due=monthFigures(m,false).remaining});
  return due;
}
function monthFigures(m,includeOpening=true){
  m=normalizeMonth(m);
  const miles=m.rows.reduce((s,r)=>s+n(r.miles),0);
  const mileagePay=m.rows.reduce((s,r)=>s+n(r.miles)*n(r.rate),0);
  const additions=m.adds.reduce((s,x)=>s+n(x.amount),0);
  const fines=m.fines.reduce((s,x)=>s+n(x.amount),0);
  const advanceGiven=m.advances.reduce((s,x)=>s+n(x.amount),0);
  const recovered=m.recoveries.reduce((s,x)=>s+n(x.amount),0);
  const paid=m.payments.reduce((s,x)=>s+n(x.amount),0);
  const opening=includeOpening?n(m.openingDue):0;
  const net=mileagePay+additions-fines;
  const totalDue=opening+net-recovered;
  return {miles,mileagePay,additions,fines,advanceGiven,recovered,paid,opening,net,totalDue,remaining:totalDue-paid};
}
function saveCache(){try{localStorage.setItem(CACHE,JSON.stringify(db))}catch(e){toast("Local storage is full. Try a smaller profile photo.")}}
async function saveData(show=false){
  saveCache();
  if(!sb||!user){if(show)toast("Saved on this device only. Sign in for cloud sync.");return}
  $("saveStatus").textContent="Saving to cloud...";
  const {error}=await sb.from("driver_salary_data").upsert({user_id:user.id,payload:db,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(error){console.error(error);$("saveStatus").textContent="Cloud save error: "+error.message;toast("Cloud save failed: "+error.message)}
  else{$("saveStatus").textContent="Saved successfully.";if(show)toast("Changes saved successfully.")}
}
function scheduleSave(){saveCache();$("saveStatus").textContent="Saving changes...";clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveData(),650)}
async function loadData(){
  try{const local=localStorage.getItem(CACHE);if(local){const x=JSON.parse(local);db={...db,...x};normalize()}}catch(e){console.warn(e)}
  if(!sb||!user)return;
  const {data,error}=await sb.from("driver_salary_data").select("payload").eq("user_id",user.id).maybeSingle();
  if(error){toast("Could not load cloud data: "+error.message);return}
  if(data?.payload){db={...db,...data.payload};normalize();saveCache()}else await saveData();
}
function applyTheme(){
  document.body.className="";
  document.body.classList.add("theme-"+(db.settings.theme||"navy"));
  document.body.classList.add("style-"+(db.settings.displayStyle||"modern"));
  document.body.classList.add("font-"+(db.settings.fontSize||"normal"));
  document.body.classList.add("sidebar-"+(db.settings.sidebarStyle||"gradient"));
  document.querySelectorAll(".theme-choice").forEach(b=>b.classList.toggle("selected",b.dataset.theme===db.settings.theme));
}
function branding(){
  const name=db.settings.username||db.settings.manager||"Account Manager";
  $("topCompany").textContent=db.settings.company||"PRESERVER TRANS LLC";
  $("topUsername").textContent=name;$("sideManagerName").textContent=name;
  $("sideAvatar").textContent=name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
  $("deletedCount").textContent=db.deletedRecords.length;
}
function view(id){
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active-view"));
  $(id).classList.add("active-view");
  document.querySelectorAll(".nav-btn[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===id));
  const labels={salaryView:"Salary Sheets",historyView:"Salary History",statementView:"Salary Statement",duesView:"Outstanding Dues",paymentsView:"Payment History",deletedView:"Deleted Records",analyticsView:"Driver Performance",driversView:"Drivers",settingsView:"Settings"};
  $("pageTitle").textContent=labels[id]||"Payroll";
  $("sidebar").classList.remove("open");
}
function driverOptions(){
  const old=$("salaryDriver").value;
  $("salaryDriver").innerHTML=db.drivers.length?db.drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}${d.truck?" · "+esc(d.truck):""}</option>`).join(""):`<option value="">No drivers</option>`;
  if(db.drivers.some(d=>d.id===old))$("salaryDriver").value=old;
}
function renderAll(){driverOptions();renderSalary();renderHistory();renderDues();renderPayments();renderDeleted();renderDrivers();fillSettings();branding();applyTheme();renderAnalytics()}

function renderSalary(){
  const d=selectedDriver(),month=selectedMonth();
  if(!d){$("salaryDriverInfo").textContent="Add a driver to start."; $("mileageBody").innerHTML='<tr><td colspan="9" class="empty-row">No driver selected.</td></tr>';return}
  const m=getMonth(d,month);
  if(m.openingDue===0)m.openingDue=previousDue(d,month);
  const previousMiles=previousEndingMiles(d,month);
  const f=monthFigures(m);
  const photo=d.photo?`<img class="driver-photo" src="${d.photo}">`:`<div class="mini-avatar">${esc(d.name.slice(0,2).toUpperCase())}</div>`;
  $("salaryDriverInfo").innerHTML=`${photo}<div><b>${esc(d.name)}</b><br>Truck: ${esc(d.truck||"—")} &nbsp; | &nbsp; Phone: ${esc(d.phone||"—")}<br><small>${esc(monthLabel(month))} · Previous odometer: ${previousMiles.toLocaleString()} miles</small></div>`;
  $("mileageRate").value=db.rate;
  $("mileageBody").innerHTML=m.rows.length?m.rows.map((r,i)=>{
    const prev=i===0?previousMiles:n(m.rows[i-1].next);
    r.prev=prev;r.next=prev+n(r.miles);
    return `<tr><td>${i+1}</td><td><input type="date" data-row="${i}" data-field="date" value="${esc(r.date||"")}"></td><td><input data-row="${i}" data-field="note" value="${esc(r.note||"")}" placeholder="Load / note"></td><td>${prev.toLocaleString()}</td><td><input type="number" min="0" data-row="${i}" data-field="miles" value="${n(r.miles)}"></td><td>${n(r.next).toLocaleString()}</td><td>${money(r.rate)}</td><td><b>${money(n(r.miles)*n(r.rate))}</b></td><td><button class="btn danger small" data-delrow="${i}">Delete</button></td></tr>`;
  }).join(""):`<tr><td colspan="9" class="empty-row">No mileage entered. Add only the new miles travelled this month.</td></tr>`;
  renderItems("additionsBody",m.adds,"adds");renderItems("finesBody",m.fines,"fines");
  $("statMiles").textContent=f.miles.toLocaleString();$("statMileage").textContent=money(f.net);
  $("statPreviousDue").textContent=money(f.opening);$("statDue").textContent=money(f.remaining);
  $("statAdvance").textContent=money(d.advanceLedger.filter(x=>x.type==="Advance").reduce((s,x)=>s+n(x.amount),0));
  $("statRecovered").textContent=money(d.advanceLedger.filter(x=>x.type==="Recovery").reduce((s,x)=>s+n(x.amount),0));
  $("statAdvanceBalance").textContent=money(d.advanceBalance);$("statPaid").textContent=money(f.paid);
  $("advanceBalanceInfo").innerHTML=`<b>Current outstanding advance: ${money(d.advanceBalance)}</b><br>Give advances when required. Recover any amount you choose; the remaining advance is recalculated automatically.`;
  $("advanceLedgerBody").innerHTML=d.advanceLedger.length?d.advanceLedger.slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.note||"")}</td><td>${money(x.amount)}</td></tr>`).join(""):`<tr><td colspan="4" class="empty-row">No advance activity.</td></tr>`;
  $("paymentSummary").innerHTML=`Previous balance: <b>${money(f.opening)}</b><br>Current month net salary: <b>${money(f.net)}</b><br>Total outstanding: <b>${money(f.remaining)}</b><br>Paid this month: <b>${money(f.paid)}</b>`;
  $("salaryTotals").innerHTML=`
    <div class="totals-line"><span>Previous unpaid salary</span><b>${money(f.opening)}</b></div>
    <div class="totals-line"><span>New mileage earnings</span><b>${money(f.mileagePay)}</b></div>
    <div class="totals-line"><span>Extra amounts / bonus</span><b>${money(f.additions)}</b></div>
    <div class="totals-line"><span>Fines / deductions</span><b>− ${money(f.fines)}</b></div>
    <div class="totals-line"><span>Advance recovery this month</span><b>− ${money(f.recovered)}</b></div>
    <div class="totals-line total"><span>Total amount due</span><b>${money(f.totalDue-f.paid)}</b></div>
    <div class="totals-line"><span>Payments already recorded</span><b>${money(f.paid)}</b></div>`;
  $("paymentDate").value=today();
}
function renderItems(id,arr,group){
  $(id).innerHTML=arr.length?arr.map((x,i)=>`<tr><td>${esc(x.description||"")}</td><td>${money(x.amount)}</td><td><button class="btn danger small" data-group="${group}" data-index="${i}">Delete</button></td></tr>`).join(""):`<tr><td colspan="3" class="empty-row">No records.</td></tr>`;
}
function addMileage(){
  const d=selectedDriver();if(!d)return toast("Add a driver first.");
  const m=getMonth(d,selectedMonth());
  m.rows.push({id:uid(),date:today(),note:"",miles:0,rate:n(db.rate)||DEFAULT_RATE});
  scheduleSave();renderSalary();
}
function addItem(group,title){
  const d=selectedDriver();if(!d)return toast("Select a driver first.");
  const description=prompt(title+" description:");if(description===null)return;
  const amount=Number(prompt("Enter amount:"));if(!description.trim()||!Number.isFinite(amount)||amount<0)return toast("Enter a valid description and amount.");
  getMonth(d,selectedMonth())[group].push({id:uid(),description:description.trim(),amount});
  scheduleSave();renderSalary();
}
function recordPayment(){
  const d=selectedDriver();if(!d)return toast("Select a driver.");
  const m=getMonth(d,selectedMonth()),f=monthFigures(m);
  const amount=Number($("paymentAmount").value);
  if(!Number.isFinite(amount)||amount<=0)return toast("Enter a valid payment amount.");
  if(amount>f.remaining+0.001&&!confirm("Payment is greater than the outstanding balance. Continue?"))return;
  const payment={id:uid(),date:$("paymentDate").value||today(),amount,method:$("paymentMethod").value,reference:$("paymentReference").value.trim(),note:$("paymentNote").value.trim(),driverId:d.id,driverName:d.name,truck:d.truck,month:selectedMonth()};
  m.payments.push(payment);
  db.history.push({...payment});
  $("paymentAmount").value="";$("paymentReference").value="";$("paymentNote").value="";
  scheduleSave();renderAll();toast("Payment recorded and moved to Payment History.");
}
function advanceAction(type){
  const d=selectedDriver();if(!d)return toast("Select a driver.");
  const isGive=type==="Advance";
  const amount=Number($(isGive?"advanceAmount":"recoverAmount").value);
  const note=$(isGive?"advanceNote":"recoverNote").value.trim();
  if(!Number.isFinite(amount)||amount<=0)return toast("Enter a valid amount.");
  if(!isGive&&amount>d.advanceBalance)return toast("Recovery cannot exceed the remaining advance.");
  if(isGive)d.advanceBalance+=amount;else d.advanceBalance-=amount;
  d.advanceLedger.push({id:uid(),date:today(),type,amount,note});
  if(!isGive)getMonth(d,selectedMonth()).recoveries.push({id:uid(),date:today(),amount,description:note||"Advance recovery"});
  $(isGive?"advanceAmount":"recoverAmount").value="";$(isGive?"advanceNote":"recoverNote").value="";
  scheduleSave();renderSalary();toast(isGive?"Advance added to driver account.":"Advance recovery recorded.");
}
function recordSnapshot(d,month){
  const m=JSON.parse(JSON.stringify(getMonth(d,month)));
  return {driverId:d.id,driverName:d.name,truck:d.truck,phone:d.phone,address:d.address,photo:d.photo||"",month,data:m,figures:monthFigures(m),company:db.settings.company,location:db.settings.location,createdAt:new Date().toISOString()};
}
function renderStatement(s){
  const m=normalizeMonth(s.data),f=s.figures||monthFigures(m);
  $("statementSubtitle").textContent=`${s.driverName} · ${monthLabel(s.month)} · Read-only`;
  const rows=m.rows.map((r,i)=>{const prev=n(r.prev),miles=n(r.miles);return `<tr><td>${i+1}</td><td>${esc(r.date)}</td><td>${esc(r.note)}</td><td>${prev.toLocaleString()}</td><td>${miles.toLocaleString()}</td><td>${(prev+miles).toLocaleString()}</td><td>${money(r.rate)}</td><td>${money(miles*n(r.rate))}</td></tr>`}).join("");
  const items=(title,a)=>`<div class="statement-section"><h3>${title}</h3><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>${a.length?a.map(x=>`<tr><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>`).join(""):`<tr><td colspan="2">None</td></tr>`}</tbody></table></div>`;
  const pays=m.payments.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.method||"")}</td><td>${esc(p.reference||"")}</td><td>${esc(p.note||"")}</td><td>${money(p.amount)}</td></tr>`).join("");
  $("statementContent").innerHTML=`
    <div class="statement-header"><h2>${esc(s.company)}</h2><p>${esc(s.location||"")}</p><p>DRIVER MONTHLY SALARY STATEMENT</p></div>
    <div class="statement-meta"><div><b>DRIVER</b>${esc(s.driverName)}</div><div><b>TRUCK</b>${esc(s.truck||"—")}</div><div><b>MONTH</b>${esc(monthLabel(s.month))}</div><div><b>PHONE</b>${esc(s.phone||"—")}</div><div><b>ADDRESS</b>${esc(s.address||"—")}</div><div><b>MONTH MILES</b>${n(f.miles).toLocaleString()}</div></div>
    <div class="statement-section"><h3>Mileage Record</h3><table><thead><tr><th>#</th><th>Date</th><th>Load / Note</th><th>Previous</th><th>New Miles</th><th>Ending</th><th>Rate</th><th>Pay</th></tr></thead><tbody>${rows||'<tr><td colspan="8">No mileage.</td></tr>'}</tbody></table></div>
    ${items("Extra Amounts",m.adds)}${items("Fines / Deductions",m.fines)}${items("Advance Recovery",m.recoveries)}
    <div class="statement-section"><h3>Payment Receipts</h3><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Note</th><th>Amount</th></tr></thead><tbody>${pays||'<tr><td colspan="5">No payments.</td></tr>'}</tbody></table></div>
    <div class="statement-total"><div><span>Previous Due</span><b>${money(f.opening)}</b></div><div><span>Mileage Salary</span><b>${money(f.mileagePay)}</b></div><div><span>Extra Amounts</span><b>${money(f.additions)}</b></div><div><span>Fines</span><b>− ${money(f.fines)}</b></div><div><span>Advance Recovery</span><b>− ${money(f.recovered)}</b></div><div><span>Payments</span><b>${money(f.paid)}</b></div><div><strong>Remaining Due</strong><strong>${money(f.remaining)}</strong></div></div>`;
}
function openStatement(id,month){
  const d=db.drivers.find(x=>x.id===id);if(!d||!d.months[month])return;
  currentStatement=recordSnapshot(d,month);renderStatement(currentStatement);view("statementView");
}
function deleteStatement(){
  if(!currentStatement||!confirm("Move this salary sheet to Deleted Records?"))return;
  const d=db.drivers.find(x=>x.id===currentStatement.driverId);
  if(!d||!d.months[currentStatement.month])return toast("Record not found.");
  const snap=recordSnapshot(d,currentStatement.month);snap.deletedId=uid();snap.deletedAt=new Date().toISOString();
  db.deletedRecords.push(snap);delete d.months[currentStatement.month];
  currentStatement=null;scheduleSave();renderAll();view("historyView");toast("Moved to Deleted Records.");
}
function renderHistory(){
  const search=($("historySearch").value||"").toLowerCase();
  const list=[];
  db.drivers.forEach(d=>Object.keys(d.months||{}).forEach(month=>list.push({d,month,f:monthFigures(getMonth(d,month))})));
  const rows=list.filter(x=>(x.d.name+" "+x.month).toLowerCase().includes(search)).sort((a,b)=>b.month.localeCompare(a.month));
  $("historyBody").innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.d.name)}</td><td>${esc(x.d.truck)}</td><td>${monthLabel(x.month)}</td><td>${x.f.miles.toLocaleString()}</td><td>${money(x.f.net)}</td><td>${money(x.f.paid)}</td><td>${money(x.f.remaining)}</td><td><button class="btn outline small" data-open="${esc(x.d.id)}" data-month="${esc(x.month)}">Open</button></td></tr>`).join(""):`<tr><td colspan="8" class="empty-row">No salary sheets.</td></tr>`;
}
function renderDues(){
  const rows=db.drivers.map(d=>{let due=0,months=0;Object.values(d.months).forEach(m=>{const f=monthFigures(m);due+=f.remaining;if(f.remaining>0.009)months++});return {d,due,months}}).filter(x=>x.due>0.009);
  $("duesBody").innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.d.name)}</td><td>${esc(x.d.truck)}</td><td>${x.months}</td><td><b>${money(x.due)}</b></td><td><button class="btn primary small" data-paydriver="${esc(x.d.id)}">Open & Pay</button></td></tr>`).join(""):`<tr><td colspan="5" class="empty-row">No outstanding dues.</td></tr>`;
}
function renderPayments(){
  const rows=[...db.history];
  $("paymentsBody").innerHTML=rows.length?rows.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.driverName)}</td><td>${esc(monthLabel(p.month))}</td><td>${money(p.amount)}</td><td>${esc(p.method||"")}</td><td>${esc(p.reference||"")}</td><td>${esc(p.note||"")}</td></tr>`).join(""):`<tr><td colspan="7" class="empty-row">No payment receipts.</td></tr>`;
}
function renderDeleted(){
  $("deletedCount").textContent=db.deletedRecords.length;
  $("deletedBody").innerHTML=db.deletedRecords.length?db.deletedRecords.map(r=>`<tr><td>${esc(r.driverName)}</td><td>${monthLabel(r.month)}</td><td>${esc((r.deletedAt||"").slice(0,10))}</td><td><button class="btn outline small" data-restore="${esc(r.deletedId)}">Restore</button> <button class="btn danger small" data-permanent="${esc(r.deletedId)}">Permanent Delete</button></td></tr>`).join(""):`<tr><td colspan="4" class="empty-row">No deleted records.</td></tr>`;
}
function restoreRecord(id){
  const i=db.deletedRecords.findIndex(x=>x.deletedId===id);if(i<0)return;
  const r=db.deletedRecords[i],d=db.drivers.find(x=>x.id===r.driverId);
  if(!d)return toast("Original driver profile not found.");
  if(d.months[r.month])return toast("A sheet already exists for this driver and month.");
  d.months[r.month]=normalizeMonth(JSON.parse(JSON.stringify(r.data)));db.deletedRecords.splice(i,1);
  scheduleSave();renderAll();toast("Record restored.");
}
async function verifyPassword(p){
  if(!sb||!user?.email||!p)return false;
  const {error}=await sb.auth.signInWithPassword({email:user.email,password:p});
  if(error){toast("Password verification failed.");return false}
  const {data}=await sb.auth.getUser();if(data?.user)user=data.user;return true;
}
async function permanentDelete(id){
  if(!confirm("Permanently delete this record? This cannot be undone."))return;
  const p=prompt("Enter your current login password:");
  if(p===null||!(await verifyPassword(p)))return;
  db.deletedRecords=db.deletedRecords.filter(x=>x.deletedId!==id);
  await saveData(true);renderDeleted();toast("Permanently deleted.");
}
function renderDrivers(){
  $("driversBody").innerHTML=db.drivers.length?db.drivers.map(d=>`<tr><td>${d.photo?`<img class="table-photo" src="${d.photo}">`:"—"}</td><td><b>${esc(d.name)}</b></td><td>${esc(d.truck)}</td><td>${esc(d.phone)}</td><td>${esc(d.address)}</td></tr>`).join(""):`<tr><td colspan="5" class="empty-row">No drivers added.</td></tr>`;
}
function fillSettings(){
  const s=db.settings;
  $("settingUsername").value=s.username||s.manager||"";
  $("settingEmail").value=user?.email||"";
  $("settingCompany").value=s.company||"";
  $("settingLocation").value=s.location||"";
  $("settingRate").value=db.rate;
  $("settingCurrency").value=s.currency||"$";
  $("managerName").value=s.manager||"";
  $("managerDesignation").value=s.designation||"Account Manager";
  $("managerPhone").value=s.phone||"";
  $("managerDetails").value=s.details||"";
  $("displayStyle").value=s.displayStyle||"modern";
  $("fontSize").value=s.fontSize||"normal";
  $("sidebarStyle").value=s.sidebarStyle||"gradient";
  $("managerPhotoPreview").style.backgroundImage=s.managerPhoto?`url("${s.managerPhoto}")`:"";
  $("managerPhotoPreview").textContent=s.managerPhoto?"":(s.manager||"SA").split(/\s+/).map(x=>x[0]).join("").slice(0,2);
  applyTheme();
}
async function compressImage(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,360/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=img.width*scale;c.height=img.height*scale;c.getContext("2d").drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL("image/jpeg",.68))};img.onerror=reject;img.src=reader.result};reader.onerror=reject;reader.readAsDataURL(file)});
}
function addDriver(){
  const name=$("newDriverName").value.trim();if(!name)return toast("Driver name is required.");
  const d={id:uid(),name,truck:$("newDriverTruck").value.trim(),phone:$("newDriverPhone").value.trim(),address:$("newDriverAddress").value.trim(),notes:$("newDriverNotes").value.trim(),photo:newDriverPhotoData,months:{},advanceBalance:0,advanceLedger:[]};
  db.drivers.push(d);newDriverPhotoData="";$("driverModal").classList.add("hidden");
  ["newDriverName","newDriverTruck","newDriverPhone","newDriverAddress","newDriverNotes"].forEach(id=>$(id).value="");
  $("newDriverPhoto").value="";renderAll();$("salaryDriver").value=d.id;renderSalary();scheduleSave();toast("Driver profile added.");
}
async function saveUsername(){
  const name=$("settingUsername").value.trim();if(!name)return toast("Enter a username.");
  db.settings.username=name;scheduleSave();branding();toast("Display username updated.");
}
async function changePassword(){
  const old=$("currentPassword").value,next=$("newPassword").value,again=$("confirmPassword").value;
  if(!old||!next)return toast("Complete the password fields.");
  if(next.length<6||next!==again)return toast("New passwords must match and be at least 6 characters.");
  if(!(await verifyPassword(old)))return;
  const {error}=await sb.auth.updateUser({password:next});
  if(error)return toast(error.message);
  ["currentPassword","newPassword","confirmPassword"].forEach(id=>$(id).value="");toast("Password updated.");
}
async function saveManager(){
  if(!(await verifyPassword($("managerVerifyPassword").value)))return;
  const s=db.settings;s.manager=$("managerName").value.trim();s.designation=$("managerDesignation").value.trim();s.phone=$("managerPhone").value.trim();s.details=$("managerDetails").value.trim();
  if(managerPhotoData)s.managerPhoto=managerPhotoData;
  managerPhotoData="";$("managerVerifyPassword").value="";branding();await saveData(true);fillSettings();toast("Manager profile saved.");
}
async function saveCompany(){
  db.settings.company=$("settingCompany").value.trim()||"PRESERVER TRANS LLC";
  db.settings.location=$("settingLocation").value.trim();
  db.settings.currency=$("settingCurrency").value;
  db.rate=Math.max(0,n($("settingRate").value));
  branding();renderSalary();await saveData(true);
}
async function saveTheme(){
  db.settings.displayStyle=$("displayStyle").value;db.settings.fontSize=$("fontSize").value;db.settings.sidebarStyle=$("sidebarStyle").value;
  applyTheme();await saveData(true);
}

function reportData(){
  const period=$("analyticsPeriod").value,month=$("analyticsMonth").value||thisMonth(),year=month.slice(0,4);
  return db.drivers.map(d=>{
    const months=Object.keys(d.months||{}).filter(m=>period==="all"||(period==="year"&&m.startsWith(year))||(period==="month"&&m===month));
    let miles=0,salary=0,fines=0,paid=0,due=0;
    months.forEach(m=>{const f=monthFigures(getMonth(d,m));miles+=f.miles;salary+=f.net;fines+=f.fines;paid+=f.paid;due+=f.remaining});
    return {d,months:months.length,miles,salary,fines,paid,due};
  }).filter(x=>x.months>0);
}
function renderColumnChoices(){
  const defs=[["driver","Driver"],["truck","Truck"],["months","Months"],["miles","Total Miles"],["salary","Salary"],["fines","Fines"],["paid","Paid"],["due","Due"]];
  $("columnChoices").innerHTML=defs.map(([k,l])=>`<label><input type="checkbox" data-col="${k}" ${reportColumns.includes(k)?"checked":""}>${l}</label>`).join("");
}
function renderAnalytics(){
  if(!$("analyticsContent"))return;
  const rows=reportData(),layout=$("reportLayout").value,color=$("reportColor").value;
  const labels={driver:"Driver",truck:"Truck",months:"Months",miles:"Total Miles",salary:"Salary",fines:"Fines",paid:"Paid",due:"Due"};
  const val=(r,k)=>({driver:esc(r.d.name),truck:esc(r.d.truck||"—"),months:r.months,miles:r.miles.toLocaleString(),salary:money(r.salary),fines:money(r.fines),paid:money(r.paid),due:money(r.due)})[k];
  if(layout==="cards"){
    $("analyticsContent").innerHTML=rows.map((r,i)=>`<div class="report-card report-${color}" data-report-driver="${esc(r.d.id)}"><h3>${esc(r.d.name)} · ${esc(r.d.truck)}</h3><div class="report-card-grid">${["miles","salary","fines","paid","due"].map(k=>`<div class="report-metric">${labels[k]}<b>${val(r,k)}</b></div>`).join("")}</div><small>Click to open complete driver report</small></div>`).join("")||"<div class='panel'>No records for this period.</div>";
  }else{
    const cols=layout==="compact"?reportColumns.filter(k=>["driver","miles","salary","due"].includes(k)):reportColumns;
    $("analyticsContent").innerHTML=`<div class="panel report-${color}"><div class="table-wrap"><table class="${layout==="wide"?"wide-report":""}"><thead><tr>${cols.map(k=>`<th>${labels[k]}</th>`).join("")}<th>Details</th></tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(k=>`<td>${val(r,k)}</td>`).join("")}<td><button class="btn outline small" data-report-driver="${esc(r.d.id)}">Open Driver</button></td></tr>`).join("")||`<tr><td colspan="${cols.length+1}" class="empty-row">No records for this period.</td></tr>`}</tbody></table></div></div>`;
  }
  $("driverDetail").classList.add("hidden");
}
function showDriverReport(id){
  const d=db.drivers.find(x=>x.id===id);if(!d)return;
  const months=Object.keys(d.months||{}).sort().reverse();
  $("driverDetail").classList.remove("hidden");
  $("driverDetail").innerHTML=`<div class="panel-heading"><div><h2>${esc(d.name)} · ${esc(d.truck)}</h2><p>Complete month-by-month performance</p></div><button class="btn outline small" id="closeDriverDetail">Close</button></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>Miles</th><th>Salary</th><th>Fines</th><th>Paid</th><th>Due</th><th>Statement</th></tr></thead><tbody>${months.map(m=>{const f=monthFigures(getMonth(d,m));return `<tr><td>${monthLabel(m)}</td><td>${f.miles.toLocaleString()}</td><td>${money(f.net)}</td><td>${money(f.fines)}</td><td>${money(f.paid)}</td><td>${money(f.remaining)}</td><td><button class="btn outline small" data-open="${esc(d.id)}" data-month="${esc(m)}">Open</button></td></tr>`}).join("")}</tbody></table></div>`;
  $("closeDriverDetail").onclick=()=>$("driverDetail").classList.add("hidden");
  $("driverDetail").scrollIntoView({behavior:"smooth"});
}

function bind(){
  $("loginForm").onsubmit=async e=>{e.preventDefault();if(!sb)return msg("Supabase settings missing.");const {data,error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error)return msg(error.message);user=data.user;await loadData();showApp()};
  $("signupForm").onsubmit=async e=>{e.preventDefault();const name=$("signupName").value.trim();const {data,error}=await sb.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value,options:{data:{full_name:name}}});if(error)return msg(error.message);if(data.session){user=data.user;db.settings.manager=name;db.settings.username=name;await saveData();showApp()}else{msg("Account created. Verify your email, then sign in.",true);$("signupForm").classList.add("hidden");$("loginForm").classList.remove("hidden");$("showSignup").classList.remove("hidden")}};
  $("showSignup").onclick=()=>{$("loginForm").classList.add("hidden");$("showSignup").classList.add("hidden");$("signupForm").classList.remove("hidden")};
  $("showLogin").onclick=()=>{$("signupForm").classList.add("hidden");$("loginForm").classList.remove("hidden");$("showSignup").classList.remove("hidden")};
  $("logoutBtn").onclick=async()=>{if(sb)await sb.auth.signOut();user=null;$("app").classList.add("hidden");$("loginScreen").classList.remove("hidden")};
  document.querySelectorAll(".nav-btn[data-view]").forEach(b=>b.onclick=()=>view(b.dataset.view));
  $("menuToggle").onclick=()=>$("sidebar").classList.toggle("open");
  $("salaryDriver").onchange=renderSalary;$("salaryMonth").onchange=renderSalary;
  $("mileageRate").onchange=()=>{db.rate=n($("mileageRate").value);getMonth(selectedDriver(),selectedMonth()).rows.forEach(r=>r.rate=db.rate);scheduleSave();renderSalary()};
  $("addMileageBtn").onclick=addMileage;
  $("addAdditionBtn").onclick=()=>addItem("adds","Extra amount");$("addFineBtn").onclick=()=>addItem("fines","Fine");
  $("giveAdvanceBtn").onclick=()=>advanceAction("Advance");$("recoverAdvanceBtn").onclick=()=>advanceAction("Recovery");
  $("recordPaymentBtn").onclick=recordPayment;
  $("mileageBody").onchange=e=>{const el=e.target.closest("[data-row]");if(!el)return;const r=getMonth(selectedDriver(),selectedMonth()).rows[Number(el.dataset.row)];const k=el.dataset.field;r[k]=k==="miles"?Math.max(0,n(el.value)):el.value;scheduleSave();renderSalary()};
  $("mileageBody").onclick=e=>{const b=e.target.closest("[data-delrow]");if(!b)return;if(confirm("Delete this mileage row?")){getMonth(selectedDriver(),selectedMonth()).rows.splice(Number(b.dataset.delrow),1);scheduleSave();renderSalary()}};
  ["additionsBody","finesBody"].forEach(id=>$(id).onclick=e=>{const b=e.target.closest("[data-group]");if(!b)return;if(confirm("Delete this item?")){getMonth(selectedDriver(),selectedMonth())[b.dataset.group].splice(Number(b.dataset.index),1);scheduleSave();renderSalary()}});
  $("addDriverBtn").onclick=$("addDriverBtn2").onclick=()=>$("driverModal").classList.remove("hidden");
  $("saveDriverBtn").onclick=addDriver;
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("driverModal").classList.add("hidden"));
  $("newDriverPhoto").onchange=async e=>{if(e.target.files[0])newDriverPhotoData=await compressImage(e.target.files[0])};
  $("managerPhoto").onchange=async e=>{if(e.target.files[0]){managerPhotoData=await compressImage(e.target.files[0]);$("managerPhotoPreview").style.backgroundImage=`url("${managerPhotoData}")`;$("managerPhotoPreview").textContent=""}};
  $("historySearch").oninput=renderHistory;
  $("historyBody").onclick=e=>{const b=e.target.closest("[data-open]");if(b)openStatement(b.dataset.open,b.dataset.month)};
  $("statementPrintBtn").onclick=()=>window.print();$("deleteStatementBtn").onclick=deleteStatement;$("backHistoryBtn").onclick=()=>view("historyView");
  $("printSalaryBtn").onclick=()=>{const d=selectedDriver();if(!d)return;currentStatement=recordSnapshot(d,selectedMonth());renderStatement(currentStatement);view("statementView");setTimeout(()=>window.print(),150)};
  $("duesBody").onclick=e=>{const b=e.target.closest("[data-paydriver]");if(b){$("salaryDriver").value=b.dataset.paydriver;view("salaryView");renderSalary()}};
  $("deletedBody").onclick=e=>{const r=e.target.closest("[data-restore]"),p=e.target.closest("[data-permanent]");if(r)restoreRecord(r.dataset.restore);if(p)permanentDelete(p.dataset.permanent)};
  $("saveNowBtn").onclick=()=>saveData(true);
  $("saveUsernameBtn").onclick=saveUsername;$("changePasswordBtn").onclick=changePassword;$("saveManagerBtn").onclick=saveManager;$("saveCompanyBtn").onclick=saveCompany;$("saveThemeBtn").onclick=saveTheme;
  $("themeChoices").onclick=e=>{const b=e.target.closest("[data-theme]");if(b){db.settings.theme=b.dataset.theme;applyTheme()}};
  $("reportLayout").onchange=renderAnalytics;$("reportColor").onchange=renderAnalytics;$("analyticsPeriod").onchange=renderAnalytics;$("analyticsMonth").onchange=renderAnalytics;
  $("columnChoices").onchange=e=>{const k=e.target.dataset.col;if(!k)return;if(e.target.checked&&!reportColumns.includes(k))reportColumns.push(k);else reportColumns=reportColumns.filter(x=>x!==k);renderAnalytics()};
  $("resetColumnsBtn").onclick=()=>{reportColumns=["driver","truck","months","miles","salary","fines","paid","due"];renderColumnChoices();renderAnalytics()};
  $("analyticsContent").onclick=e=>{const b=e.target.closest("[data-report-driver]");if(b)showDriverReport(b.dataset.reportDriver)};
  $("driverDetail").onclick=e=>{const b=e.target.closest("[data-open]");if(b)openStatement(b.dataset.open,b.dataset.month)};
  $("printAnalyticsBtn").onclick=()=>window.print();
}
function showApp(){
  $("loginScreen").classList.add("hidden");$("app").classList.remove("hidden");
  $("salaryMonth").value=thisMonth();$("analyticsMonth").value=thisMonth();$("paymentDate").value=today();
  renderColumnChoices();renderAll();view("salaryView");
}
async function start(){
  $("salaryMonth").value=thisMonth();$("analyticsMonth").value=thisMonth();
  if(window.supabase&&window.SUPABASE_CONFIG?.url&&window.SUPABASE_CONFIG?.anonKey&&!window.SUPABASE_CONFIG.anonKey.includes("PASTE_")){
    sb=window.supabase.createClient(window.SUPABASE_CONFIG.url,window.SUPABASE_CONFIG.anonKey);
    const {data}=await sb.auth.getSession();
    if(data.session){user=data.session.user;await loadData();showApp()}
    sb.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){user=null;$("app").classList.add("hidden");$("loginScreen").classList.remove("hidden")}});
  }else{msg("Add your existing Supabase URL and anon key in supabase-config.js.");try{const x=localStorage.getItem(CACHE);if(x){db={...db,...JSON.parse(x)};normalize()}}catch(e){}}
  bind();
}
document.addEventListener("DOMContentLoaded",start);
