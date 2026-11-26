const $=id=>document.getElementById(id);
const SUPABASE_URL=String(window.PRESERVER_SUPABASE_URL||"").trim();
const SUPABASE_KEY=String(window.PRESERVER_SUPABASE_ANON_KEY||"").trim();

let sb=null,user=null;
let db={
  rate:.52,basic:0,drivers:[],deleted:[],
  settings:{manager:"Saim Ali",designation:"Account Manager",company:"Preserver Trans LLC",theme:0,wallpaper:0,historyDesign:"simple"}
};
let activeId=null;
let currentMonth=new Date().toISOString().slice(0,7);
let saveTimer=null;
let toastTimer=null;

const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const number=n=>(Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function toast(message){
  $("toast").textContent=message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800);
}
function authMessage(message){$("authMessage").textContent=message}
function save(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveCloud,500);
}
async function saveCloud(){
  if(!user||!sb)return;
  const {error}=await sb.from("driver_salary_data").upsert({
    user_id:user.id,payload:db,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error)toast("Cloud save error: "+error.message);
}

function normalize(){
  db.drivers||=[];db.deleted||=[];
  db.settings=Object.assign({
    manager:"Saim Ali",designation:"Account Manager",company:"Preserver Trans LLC",
    theme:0,wallpaper:0,historyDesign:"simple"
  },db.settings||{});
  db.rate=Number(db.rate??.52);db.basic=Number(db.basic??0);
  db.drivers.forEach(d=>{
    d.months||={};d.photo||="";d.name||="";d.truck||="";
    Object.values(d.months).forEach(m=>{
     ["rows","adds","fines","advances","recoveries","layovers","payments"].forEach(k=>m[k] ||= []);
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
  $("userLabel").textContent=db.settings.manager||"Saim Ali";
  applyAppearance();
  render();
}

function driver(){return db.drivers.find(d=>d.id===activeId)}
function monthData(d,month=currentMonth){
  d.months||={};
  d.months[month]||={rows:[],adds:[],fines:[],advances:[],recoveries:[],layovers:[],payments:[],closed:false};
  const m=d.months[month];
  ["rows","adds","fines","advances","recoveries","layovers","payments"].forEach(k=>m[k]||[]);
  return m;
}
function monthsOf(d){return Object.entries(d.months||{}).sort((a,b)=>a[0].localeCompare(b[0]))}
function total(m,key){return(m[key]||[]).reduce((s,x)=>s+(Number(x.amount)||0),0)}
function mileage(m){
  return(m.rows||[]).reduce((s,r)=>s+Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0))*(Number(r.rate)||0),0);
}
function milesTotal(m){
  return(m.rows||[]).reduce((s,r)=>s+Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0)),0);
}
function layoverNet(m){
  return(m.layovers||[]).reduce((s,x)=>s+(x.type==="deduct"?-Number(x.amount||0):Number(x.amount||0)),0);
}
function monthNet(m){
  return mileage(m)+db.basic+total(m,"adds")+layoverNet(m)-total(m,"fines")-total(m,"recoveries");
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
  monthsOf(d).forEach(([,m])=>{adv+=total(m,"advances");rec+=total(m,"recoveries")});
  return Math.max(0,adv-rec);
}
function financial(m,d){
  const previous=previousDue(d);
  const gross=monthNet(m);
  const due=previous+gross;
  const paid=total(m,"payments");
  return{previous,gross,due,paid,balance:Math.max(0,due-paid)};
}

/* 120 preset color combinations */
const themes=[];
const themeBases=[
  ["Navy Gold","#101d35","#1c3455","#d5a947"],
  ["Royal Blue","#102c54","#245b91","#f0bd55"],
  ["Emerald","#123b32","#236b54","#d7b65a"],
  ["Burgundy","#461c32","#78314d","#e2b46d"],
  ["Purple","#30204f","#59417c","#d8b4fe"],
  ["Charcoal","#20252c","#414a56","#e4b84c"],
  ["Ocean","#073b4c","#118ab2","#ffd166"],
  ["Teal","#123c43","#207b78","#e2c078"],
  ["Forest","#183b27","#326b42","#c7a65b"],
  ["Ruby","#4a1720","#8b2635","#f0b35b"],
  ["Copper","#493024","#88583c","#e4ad68"],
  ["Midnight","#111827","#29364c","#8fb7ff"]
];
for(let i=0;i<120;i++){
  const b=themeBases[i%themeBases.length];
  themes.push({name:`${b[0]} ${Math.floor(i/themeBases.length)+1}`,navy:b[1],navy2:b[2],gold:b[3]});
}

/* 120 wallpaper styles */
const wallpapers=[];
const wallpaperColors=[
  ["#f3f6fa","#e5edf7"],["#f7f0e6","#ead9c1"],["#eaf5f0","#cde5d9"],
  ["#f2ecfa","#ded2f0"],["#fff0f0","#f4d5d8"],["#edf5fa","#cbdfea"],
  ["#f5f5f5","#d9dde5"],["#fff8e8","#f3e3b8"],["#e8f3f4","#c8e4e2"],
  ["#f0efff","#d9d6fa"],["#f6efe9","#e8d0bd"],["#e9eef5","#c8d4e3"]
];
for(let i=0;i<120;i++){
  const c=wallpaperColors[i%wallpaperColors.length];
  const angle=(i*37)%360;
  wallpapers.push({name:`Wallpaper ${String(i+1).padStart(3,"0")}`,css:`linear-gradient(${angle}deg,${c[0]},${c[1]})`});
}

function applyAppearance(){
  const t=themes[Math.max(0,Math.min(119,Number(db.settings.theme)||0))];
  const w=wallpapers[Math.max(0,Math.min(119,Number(db.settings.wallpaper)||0))];
  document.documentElement.style.setProperty("--navy",t.navy);
  document.documentElement.style.setProperty("--navy2",t.navy2);
  document.documentElement.style.setProperty("--gold",t.gold);
  document.documentElement.style.setProperty("--gold2",t.gold);
  document.documentElement.style.setProperty("--wallpaper",w.css);
  $("topCompanyName").textContent=db.settings.company||"PRESERVER TRANS LLC";
  $("topDesignation").textContent=db.settings.designation||"Account Manager";
  $("userLabel").textContent=db.settings.manager||"Saim Ali";
  $("printCompany").textContent=(db.settings.company||"PRESERVER TRANS LLC").toUpperCase();
  $("printManager").textContent=db.settings.manager||"Saim Ali";
  $("printDesignation").textContent=db.settings.designation||"Account Manager";
}

function fillAppearanceSettings(){
  $("themePicker").innerHTML=themes.map((t,i)=>`<option value="${i}">${i+1}. ${t.name}</option>`).join("");
  $("wallpaperPicker").innerHTML=wallpapers.map((w,i)=>`<option value="${i}">${w.name}</option>`).join("");
  $("themeCount").textContent=`${themes.length} available`;
  $("wallpaperCount").textContent=`${wallpapers.length} available`;
  $("themePicker").value=db.settings.theme||0;
  $("wallpaperPicker").value=db.settings.wallpaper||0;
  $("defaultHistoryDesign").value=db.settings.historyDesign||"simple";
  previewTheme();previewWallpaper();
}
function previewTheme(){
  const t=themes[Number($("themePicker").value)||0];
  $("themePreview").style.background=`linear-gradient(100deg,${t.navy},${t.navy2},${t.gold})`;
}
function previewWallpaper(){
  const w=wallpapers[Number($("wallpaperPicker").value)||0];
  $("wallpaperPreview").style.background=w.css;
}

function setView(view){
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
  $("driverName").value=d.name;$("truckNumber").value=d.truck||"";
  $("driverPhoto").src=d.photo||"";
  $("monthDisplay").value=mo;$("yearDisplay").value=y;
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
  const wrap=$("driverTabs"),query=$("salarySearch").value.toLowerCase();
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
  $("layoverTotal").textContent=money(layoverNet(m));
  $("finalSalary").textContent=money(f.due);
}
function renderRows(m,key,container){
  const el=$(container);el.innerHTML="";
  if(!m[key].length){el.innerHTML='<tr><td colspan="7">No mileage entries yet.</td></tr>';return}
  m[key].forEach(r=>{
    const tr=document.createElement("tr");
    const diff=Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0));
    tr.innerHTML=`<td><input type="date" value="${esc(r.date||"")}" data-f="date"></td>
    <td><input type="number" value="${r.prev??0}" data-f="prev"></td>
    <td><input type="number" value="${r.next??0}" data-f="next"></td>
    <td class="amount">${number(diff)}</td>
    <td><input type="number" step=".01" value="${r.rate??db.rate}" data-f="rate"></td>
    <td class="amount">${money(diff*(Number(r.rate)||0))}</td>
    <td><button class="delete-row">×</button></td>`;
    tr.querySelectorAll("input").forEach(inp=>inp.onchange=()=>{
      const field=inp.dataset.f;r[field]=field==="date"?inp.value:Number(inp.value)||0;
      save();render();
    });
    tr.querySelector("button").onclick=()=>removeRecord(m,key,r);
    el.append(tr);
  });
}
function renderMoney(m,key,container,layover=false){
  const el=$(container);el.innerHTML="";
  m[key].forEach(r=>{
    const row=document.createElement("div");row.className="money-row";
    row.innerHTML=`<input placeholder="${layover?"Layover description":"Description"}" value="${esc(r.desc||"")}">
    ${layover?'<select><option value="add">Add to salary</option><option value="deduct">Deduct from salary</option></select>':""}
    <input type="number" min="0" step=".01" placeholder="Amount" value="${r.amount??0}">
    <button class="delete-row">×</button>`;
    const inputs=row.querySelectorAll("input"),desc=inputs[0],amount=inputs[inputs.length-1],select=row.querySelector("select");
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
  m[key]=m[key].filter(x=>x!==r);save();render();toast("Record moved to Deleted Records.");
}
function addMoney(key){
  const d=driver();if(!d)return;
  const m=monthData(d);if(m.closed)return toast("This salary sheet is closed.");
  m[key].push({id:uid(),date:today(),desc:"",amount:0,type:"add"});save();render();
}

$("addMileageBtn").onclick=()=>{
  const d=driver();if(!d)return;
  const m=monthData(d);if(m.closed)return toast("Salary sheet is closed.");
  m.rows.push({id:uid(),date:today(),prev:0,next:0,rate:db.rate});save();render();
};
$("addAdditionBtn").onclick=()=>addMoney("adds");
$("addFineBtn").onclick=()=>addMoney("fines");
$("addAdvanceBtn").onclick=()=>addMoney("advances");
$("addRecoveryBtn").onclick=()=>addMoney("recoveries");
$("addLayoverBtn").onclick=()=>addMoney("layovers");

$("driverName").onchange=e=>{const d=driver();if(!d)return;d.name=e.target.value.trim()||d.name;save();render()};
$("truckNumber").onchange=e=>{const d=driver();if(!d)return;d.truck=e.target.value.trim();save();renderTabs()};

function readPhoto(file,callback){
  if(!file)return callback("");
  if(!file.type.startsWith("image/"))return toast("Please select an image file.");
  if(file.size>2*1024*1024)return toast("Photo must be 2 MB or smaller.");
  const reader=new FileReader();
  reader.onload=()=>callback(reader.result);
  reader.onerror=()=>toast("Could not read this photo.");
  reader.readAsDataURL(file);
}
$("photoInput").onchange=e=>{
  const d=driver();if(!d)return;
  readPhoto(e.target.files[0],data=>{
    if(!data)return;
    d.photo=data;save();render();toast("Driver photo saved.");
  });
};

$("addDriverBtn").onclick=()=>$("driverModal").classList.remove("hidden");
$("closeModal").onclick=()=>$("driverModal").classList.add("hidden");
$("createDriver").onclick=()=>{
  const name=$("newDriverName").value.trim(),truck=$("newTruckNumber").value.trim(),file=$("newDriverPhoto").files[0];
  if(!name)return toast("Enter driver name.");
  const create=photo=>{
    const d={id:uid(),name,truck,photo:photo||"",months:{}};
    db.drivers.push(d);activeId=d.id;
    $("driverModal").classList.add("hidden");
    $("newDriverName").value="";$("newTruckNumber").value="";$("newDriverPhoto").value="";
    save();render();toast("Driver profile created.");
  };
  if(file)readPhoto(file,create);else create("");
};

$("monthPicker").onchange=e=>{currentMonth=e.target.value||currentMonth;render()};
$("salarySearch").oninput=renderTabs;
$("paySalaryBtn").onclick=()=>{
  const d=driver();if(!d)return;
  const m=monthData(d),f=financial(m,d);
  if(m.closed)return toast("This salary is already closed.");
  if(f.balance<=0)return toast("There is no remaining salary to pay.");
  const amount=Number(prompt("Enter payment amount:",f.balance.toFixed(2)));
  if(!Number.isFinite(amount)||amount<=0)return;
  if(amount>f.balance+.005)return toast("Payment cannot exceed the balance.");
  m.payments.push({id:uid(),date:today(),desc:"Salary payment",amount});
  if(amount>=f.balance-.005){m.closed=true;m.closedAt=today();m.finalPaid=amount}
  save();render();toast(m.closed?"Salary paid and moved to history.":"Partial payment saved.");
};
$("printBtn").onclick=()=>window.print();

/* HISTORY: driver selection + date range + four visual layouts */
function periodBounds(period){
  const now=new Date();now.setHours(0,0,0,0);
  let start=new Date(now),end=new Date(now);
  if(period==="daily"){}
  else if(period==="weekly"){start.setDate(start.getDate()-6)}
  else if(period==="biweekly"){start.setDate(start.getDate()-13)}
  else if(period==="monthly"){start.setDate(1)}
  else if(period==="yearly"){start=new Date(now.getFullYear(),0,1)}
  else return null;
  return{start:todayString(start),end:todayString(end)};
}
function todayString(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function recordDateInRange(date,start,end){
  if(!date)return false;
  return(!start||date>=start)&&(!end||date<=end);
}
function historyEntries(){
  const driverId=$("historyDriver").value;
  const query=$("historySearch").value.toLowerCase();
  const period=$("historyPeriod").value;
  let start="",end="";
  if(period==="custom"){start=$("historyStart").value;end=$("historyEnd").value}
  else if(period!=="all"){const b=periodBounds(period);start=b.start;end=b.end}
  const list=[];
  db.drivers.forEach(d=>{
    if(driverId!=="all"&&d.id!==driverId)return;
    if(!(d.name+" "+d.truck).toLowerCase().includes(query))return;
    monthsOf(d).forEach(([month,m])=>{
      const items=[];
      (m.rows||[]).forEach(r=>items.push({date:r.date||month+"-01",kind:"Mileage",description:`${number(Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0)))} miles`,amount:Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0))*(Number(r.rate)||0)}));
      ["adds","fines","advances","recoveries","layovers","payments"].forEach(k=>{
        (m[k]||[]).forEach(r=>items.push({
          date:r.date||month+"-01",
          kind:k==="adds"?"Addition":k==="fines"?"Fine":k==="advances"?"Advance":k==="recoveries"?"Advance Recovery":k==="layovers"?"Layover":"Payment",
          description:r.desc||r.type||k,
          amount:Number(r.amount)||0,
          type:r.type||""
        }));
      });
      const matching=items.filter(x=>recordDateInRange(x.date,start,end));
      if(matching.length||(!items.length&&period==="all")){
        list.push({d,month,m,items:matching});
      }
    });
  });
  return list.sort((a,b)=>b.month.localeCompare(a.month));
}
function renderHistory(){
  const driverSelect=$("historyDriver"),previous=driverSelect.value||"all";
  driverSelect.innerHTML='<option value="all">All Drivers</option>'+db.drivers.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.truck||"No Truck")}</option>`).join("");
  if([...driverSelect.options].some(o=>o.value===previous))driverSelect.value=previous;
  const list=historyEntries(),design=$("historyDesign").value||db.settings.historyDesign||"simple";
  const wrap=$("historyList");
  wrap.className="record-list history-design-"+design;
  wrap.innerHTML=list.map(x=>{
    const f=financial(x.m,x.d);
    const detail=x.items.slice(0,5).map(i=>`<p>${esc(i.date)} · ${esc(i.kind)}: ${esc(i.description)} · ${money(i.amount)}</p>`).join("");
    return `<div class="record-card">
      <div><h3>${esc(x.d.name)} · Truck ${esc(x.d.truck||"N/A")}</h3>
      <p><b>${esc(x.month)}</b> · ${x.m.closed?"Closed":"Open"} · Paid: ${money(total(x.m,"payments"))}</p>
      <p>Miles: ${number(milesTotal(x.m))} · Payable: ${money(f.due)} · Remaining: ${money(f.balance)}</p>
      ${detail||"<p>No dated entries in this period.</p>"}</div>
      <div class="record-actions">
        <button data-driver-history="${esc(x.d.id)}|${esc(x.month)}">Open Salary Sheet</button>
        <button data-detail="${esc(x.d.id)}|${esc(x.month)}">View Full Record</button>
      </div></div>`;
  }).join("")||'<div class="empty">No records found for this driver/date range.</div>';

  wrap.querySelectorAll("[data-driver-history]").forEach(b=>b.onclick=()=>{
    const [id,month]=b.dataset.driverHistory.split("|");activeId=id;currentMonth=month;setView("salary");
  });
  wrap.querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>{
    const [id,month]=b.dataset.detail.split("|");showHistoryDetail(id,month);
  });
}
function showHistoryDetail(id,month){
  const d=db.drivers.find(x=>x.id===id);if(!d)return;
  const m=monthData(d,month),f=financial(m,d);
  const rows=(m.rows||[]).map(r=>`<tr><td>${esc(r.date||"")}</td><td>Mileage</td><td>${number(Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0)))}</td><td>${money(Math.max(0,(Number(r.next)||0)-(Number(r.prev)||0))*(Number(r.rate)||0))}</td></tr>`).join("");
  const moneyRows=["adds","fines","advances","recoveries","layovers","payments"].flatMap(k=>(m[k]||[]).map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(k)}</td><td>${esc(r.desc||r.type||"")}</td><td>${money(r.amount)}</td></tr>`)).join("");
  const detail=$("historyDetail");detail.classList.remove("hidden");
  detail.innerHTML=`<button class="secondary" id="closeHistoryDetail">Close Details</button>
  <h3>${esc(d.name)} · Truck ${esc(d.truck||"N/A")}</h3><p>${esc(month)} salary record</p>
  <div class="totals-strip"><div><span>TOTAL MILES</span><strong>${number(milesTotal(m))}</strong></div>
  <div><span>PAYABLE</span><strong>${money(f.due)}</strong></div>
  <div><span>PAID</span><strong>${money(f.paid)}</strong></div>
  <div><span>BALANCE</span><strong>${money(f.balance)}</strong></div></div>
  <h3>Detailed Transactions</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description / Miles</th><th>Amount</th></tr></thead><tbody>${rows}${moneyRows}</tbody></table></div>`;
  $("closeHistoryDetail").onclick=()=>detail.classList.add("hidden");
  detail.scrollIntoView({behavior:"smooth",block:"start"});
}
["historySearch","historyDriver","historyPeriod","historyStart","historyEnd","historyDesign"].forEach(id=>{
  $(id).addEventListener("input",renderHistory);
  $(id).addEventListener("change",renderHistory);
});

/* OUTSTANDING */
function renderOutstanding(){
  const query=$("outstandingSearch").value.toLowerCase(),entries=[];
  db.drivers.forEach(d=>{
    const due=monthsOf(d).reduce((s,[,m])=>s+Math.max(0,monthNet(m)-total(m,"payments")),0);
    const adv=advanceBalance(d);
    if(due<=0&&adv<=0)return;
    if(!(d.name+" "+d.truck).toLowerCase().includes(query))return;
    entries.push({d,due,adv});
  });
  $("outstandingList").innerHTML=entries.map(x=>`<div class="record-card"><div><h3>${esc(x.d.name)} · Truck ${esc(x.d.truck)}</h3><p>Unpaid salary: ${money(x.due)}</p><p>Advance balance: ${money(x.adv)}</p></div><button data-open="${esc(x.d.id)}">Open Driver</button></div>`).join("")||'<div class="empty">No outstanding dues.</div>';
  $("outstandingList").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{activeId=b.dataset.open;setView("salary")});
}
$("outstandingSearch").oninput=renderOutstanding;

/* REPORTS */
function inPeriod(month,period,base){
  const [y,m]=month.split("-").map(Number);
  if(period==="all")return true;
  if(period==="year")return y===base.getFullYear();
  if(period==="month")return y===base.getFullYear()&&m===base.getMonth()+1;
  const start=new Date(base);start.setDate(start.getDate()-6);
  return y===start.getFullYear()&&m===start.getMonth()+1;
}
function renderReports(){
  const period=$("reportPeriod").value,base=new Date(($("reportDate").value||today())+"T12:00:00");
  const query=$("reportSearch").value.toLowerCase(),list=[];
  db.drivers.forEach(d=>{
    let miles=0,fines=0,lay=0,salary=0;
    monthsOf(d).forEach(([month,m])=>{
      if(!inPeriod(month,period,base))return;
      miles+=milesTotal(m);fines+=total(m,"fines");lay+=layoverNet(m);salary+=total(m,"payments");
    });
    if((d.name+" "+d.truck).toLowerCase().includes(query))list.push({d,miles,fines,lay,salary});
  });
  const sum=k=>list.reduce((s,x)=>s+x[k],0);
  $("reportCards").innerHTML=`<div class="report-stat"><span>TOTAL MILES</span><strong>${number(sum("miles"))}</strong></div>
  <div class="report-stat"><span>TOTAL FINES</span><strong>${money(sum("fines"))}</strong></div>
  <div class="report-stat"><span>LAYOVER NET</span><strong>${money(sum("lay"))}</strong></div>
  <div class="report-stat"><span>SALARY PAID</span><strong>${money(sum("salary"))}</strong></div>`;
  $("reportList").innerHTML=`<table><thead><tr><th>DRIVER</th><th>TRUCK</th><th>MILES</th><th>FINES</th><th>LAYOVER</th><th>SALARY PAID</th><th></th></tr></thead><tbody>
  ${list.map(x=>`<tr><td>${esc(x.d.name)}</td><td>${esc(x.d.truck)}</td><td>${number(x.miles)}</td><td>${money(x.fines)}</td><td>${money(x.lay)}</td><td>${money(x.salary)}</td><td><button class="secondary" data-report="${esc(x.d.id)}">Open</button></td></tr>`).join("")}</tbody></table>`;
  $("reportList").querySelectorAll("[data-report]").forEach(b=>b.onclick=()=>{activeId=b.dataset.report;setView("salary")});
}
$("reportSearch").oninput=renderReports;$("reportPeriod").onchange=renderReports;
$("reportDate").value=today();$("reportDate").onchange=renderReports;

/* DELETED RECORDS */
function renderDeleted(){
  const query=$("deletedSearch").value.toLowerCase(),wrap=$("deletedList");
  const list=db.deleted.filter(x=>(x.driverName||db.drivers.find(d=>d.id===x.driverId)?.name||"").toLowerCase().includes(query));
  wrap.innerHTML=list.map(x=>`<div class="record-card"><div><h3>${esc(x.driverName||db.drivers.find(d=>d.id===x.driverId)?.name||"Driver record")}</h3><p>${esc(x.month||"")} · Deleted ${esc(x.deletedAt||"")}</p></div><div class="record-actions"><button data-restore="${esc(x.id)}">Restore</button><button data-permanent="${esc(x.id)}">Permanently Delete</button></div></div>`).join("")||'<div class="empty">Recycle bin is empty.</div>';
  wrap.querySelectorAll("[data-restore]").forEach(b=>b.onclick=()=>{
    const x=db.deleted.find(r=>r.id===b.dataset.restore);if(!x)return;
    if(x.type==="month"){const d=db.drivers.find(d=>d.id===x.driverId);if(d)d.months[x.month]=x.record}
    else{const d=db.drivers.find(d=>d.id===x.driverId);if(d){const m=monthData(d,x.month);if(m[x.category])m[x.category].push(x.record)}}
    db.deleted=db.deleted.filter(r=>r.id!==x.id);save();renderDeleted();toast("Record restored.");
  });
  wrap.querySelectorAll("[data-permanent]").forEach(b=>b.onclick=async()=>{
    const password=prompt("Enter your account password to permanently delete this record:");
    if(password===null)return;
    const {error}=await sb.auth.signInWithPassword({email:user.email,password});
    if(error)return toast("Incorrect password.");
    db.deleted=db.deleted.filter(r=>r.id!==b.dataset.permanent);save();renderDeleted();toast("Permanently deleted.");
  });
}
$("deletedSearch").oninput=renderDeleted;

/* SETTINGS */
function renderSettings(){
  $("defaultRate").value=db.rate;$("defaultBasic").value=db.basic;
  $("managerName").value=db.settings.manager;$("managerDesignation").value=db.settings.designation;
  $("companyName").value=db.settings.company;
  fillAppearanceSettings();
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
  applyAppearance();save();toast("Manager and company information saved.");
};
$("themePicker").onchange=()=>{
  db.settings.theme=Number($("themePicker").value)||0;
  previewTheme();applyAppearance();save();toast("Color theme applied.");
};
$("wallpaperPicker").onchange=()=>{
  db.settings.wallpaper=Number($("wallpaperPicker").value)||0;
  previewWallpaper();applyAppearance();save();toast("Wallpaper applied.");
};
$("saveDisplaySettings").onclick=()=>{
  db.settings.historyDesign=$("defaultHistoryDesign").value;
  $("historyDesign").value=db.settings.historyDesign;
  save();toast("Display settings saved.");
};

$("changeAccount").onclick=async()=>{
  const current=$("currentPassword").value,email=$("newEmail").value.trim(),password=$("newPassword").value;
  if(!current)return toast("Enter current password.");
  const check=await sb.auth.signInWithPassword({email:user.email,password:current});
  if(check.error)return toast("Current password is incorrect.");
  const changes={};if(email)changes.email=email;if(password)changes.password=password;
  if(!Object.keys(changes).length)return toast("Enter a new email or password.");
  const {error}=await sb.auth.updateUser(changes);
  if(error)return toast(error.message);
  $("currentPassword").value="";$("newPassword").value="";
  toast("Account update submitted. Check email if confirmation is required.");
};

$("logoutBtn").onclick=async()=>{
  await sb.auth.signOut();user=null;
  $("loginScreen").classList.remove("hidden");
};
async function auth(mode){
  if(!sb)return authMessage("Supabase connection is not initialized. Check configuration.");
  const email=$("authEmail").value.trim(),password=$("authPassword").value;
  if(!email||!password)return authMessage("Enter email and password.");
  authMessage("Please wait...");
  const result=mode==="login"?await sb.auth.signInWithPassword({email,password}):await sb.auth.signUp({email,password});
  if(result.error)return authMessage(result.error.message);
  if(mode==="signup"&&!result.data.session)return authMessage("Check your email to confirm your account.");
  user=result.data.user;
  try{await loadCloud();toast("Payroll account connected.")}catch(e){authMessage(e.message)}
}
$("loginBtn").onclick=()=>auth("login");$("signupBtn").onclick=()=>auth("signup");

async function init(){
  try{
    if(!window.supabase){authMessage("Supabase library load nahi hui. Internet check karein.");return}
    if(!SUPABASE_URL||!SUPABASE_KEY){authMessage("Supabase URL ya public key missing hai.");return}
    let parsedURL;
    try{parsedURL=new window.URL(SUPABASE_URL)}catch{authMessage("Supabase URL invalid hai. Config file check karein.");return}
    if(parsedURL.protocol!=="https:"||parsedURL.hostname!=="lriojwlaxemghavidsjt.supabase.co"){authMessage("Supabase project URL incorrect hai.");return}
    if(!SUPABASE_KEY.startsWith("sb_publishable_")&&!SUPABASE_KEY.startsWith("eyJ")){authMessage("Supabase public key format incorrect hai.");return}
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    authMessage("Checking account connection...");
    const {data,error}=await sb.auth.getSession();if(error)throw error;
    if(data.session){user=data.session.user;authMessage("Loading payroll data...");await loadCloud();toast("Payroll account connected.")}
    else authMessage("");
  }catch(e){console.error("Initialization error:",e);authMessage("Connection error: "+e.message)}
}
init();
