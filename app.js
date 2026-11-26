
/* PRESERVER TRANS LLC - DRIVER PAYROLL */

const $ = id => document.getElementById(id);
const money = n => "$" + Number(n || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => new Date().toISOString().slice(0,7);

let sb = null;
let user = null;
let db = {
  rate: 0.52,
  company: "PRESERVER TRANS LLC",
  location: "USA California",
  drivers: []
};

let selectedDriver = "";
let selectedMonth = monthNow();
let saving = false;

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function toast(message){
  const el = $("appToast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2600);
}

function message(id,text){
  if($(id)) $(id).textContent = text;
}

function escapeHTML(value){
  return String(value ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function currentDriver(){
  return db.drivers.find(d=>d.id===selectedDriver);
}

function monthData(driver,month,create=false){
  if(!driver.months) driver.months={};
  if(!driver.months[month] && create){
    driver.months[month]={
      endMiles:0,
      rate:Number(db.rate)||0.52,
      additions:[],
      fines:[],
      advances:[],
      recoveries:[],
      payments:[]
    };
  }
  return driver.months[month] || null;
}

function previousMiles(driver,month){
  if(!driver || !driver.months) return 0;
  const earlier=Object.keys(driver.months).filter(m=>m<month).sort();
  if(!earlier.length) return 0;
  return Number(driver.months[earlier[earlier.length-1]].endMiles)||0;
}

function monthMiles(driver,month){
  const data=monthData(driver,month);
  if(!data || !Number(data.endMiles)) return 0;
  return Math.max(0,Number(data.endMiles)-previousMiles(driver,month));
}

function total(list){
  return (list||[]).reduce((s,x)=>s+Number(x.amount||0),0);
}

function advanceBalance(driver){
  let advances=0,recovered=0;
  Object.values(driver.months||{}).forEach(m=>{
    advances+=total(m.advances);
    recovered+=total(m.recoveries);
  });
  return Math.max(0,advances-recovered);
}

function salaryNumbers(driver,month){
  const d=monthData(driver,month)||{};
  const miles=monthMiles(driver,month);
  const rate=Number(d.rate ?? db.rate)||0;
  const mileage=miles*rate;
  const additions=total(d.additions);
  const fines=total(d.fines);
  const recoveries=total(d.recoveries);
  const paid=total(d.payments);
  const gross=mileage+additions-fines;
  const due=gross-recoveries;
  const remaining=due-paid;

  return {miles,rate,mileage,additions,fines,recoveries,paid,gross,due,remaining};
}

function allMonths(){
  const set=new Set();
  db.drivers.forEach(d=>Object.keys(d.months||{}).forEach(m=>set.add(m)));
  return [...set].sort();
}

function previousDue(driver,month){
  return Object.keys(driver.months||{})
    .filter(m=>m<month)
    .sort()
    .reduce((sum,m)=>sum+salaryNumbers(driver,m).remaining,0);
}

async function saveData(){
  if(saving) return;
  saving=true;
  $("saveStatus").textContent="Saving...";
  try{
    localStorage.setItem("preserverPayrollCache",JSON.stringify(db));
    if(sb && user){
      const {error}=await sb.from("driver_salary_data").upsert({
        user_id:user.id,
        payload:db,
        updated_at:new Date().toISOString()
      },{onConflict:"user_id"});
      if(error) throw error;
    }
    $("saveStatus").textContent="Saved";
  }catch(error){
    console.error(error);
    $("saveStatus").textContent="Local save";
    toast("Cloud save error: "+error.message);
  }finally{
    saving=false;
  }
}

async function loadData(){
  if(sb && user){
    const {data,error}=await sb.from("driver_salary_data")
      .select("payload")
      .eq("user_id",user.id)
      .maybeSingle();
    if(error) throw error;
    if(data && data.payload) db={...db,...data.payload};
  }else{
    try{
      const local=JSON.parse(localStorage.getItem("preserverPayrollCache")||"null");
      if(local) db={...db,...local};
    }catch(e){console.error(e);}
  }

  db.drivers=Array.isArray(db.drivers)?db.drivers:[];
  db.rate=Number(db.rate)||0.52;
  db.drivers.forEach(d=>{
    d.months=d.months||{};
    Object.values(d.months).forEach(m=>{
      m.additions=m.additions||[];
      m.fines=m.fines||[];
      m.advances=m.advances||[];
      m.recoveries=m.recoveries||[];
      m.payments=m.payments||[];
    });
  });
}

function showApp(){
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("settingEmail").textContent=user?.email||"Local mode";
  $("topUsername").textContent=user?.email||"Account Manager";
  renderAll();
}

function showLogin(){
  $("app").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
}

async function login(event){
  event.preventDefault();
  if(!sb){
    message("loginMessage","Supabase configuration is missing.");
    return;
  }
  const email=$("loginEmail").value.trim();
  const password=$("loginPassword").value;
  message("loginMessage","Signing in...");
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){message("loginMessage",error.message);return;}
  user=data.user;
  await loadData();
  showApp();
}

async function signup(event){
  event.preventDefault();
  if(!sb){message("signupMessage","Supabase configuration is missing.");return;}
  const name=$("signupName").value.trim();
  const email=$("signupEmail").value.trim();
  const password=$("signupPassword").value;
  if(password.length<6){message("signupMessage","Password must be at least 6 characters.");return;}
  message("signupMessage","Creating account...");
  const {data,error}=await sb.auth.signUp({
    email,password,
    options:{data:{full_name:name}}
  });
  if(error){message("signupMessage",error.message);return;}
  if(data.session){
    user=data.user;
    await loadData();
    showApp();
  }else{
    message("signupMessage","Account created. Check your email for confirmation, then log in.");
  }
}

async function logout(){
  if(sb) await sb.auth.signOut();
  user=null;
  showLogin();
}

function openPage(page){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(page)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const btn=document.querySelector(`[data-page="${page}"]`);
  $("pageTitle").textContent=btn?btn.textContent.trim():"Payroll";
  $("sidebar").classList.remove("open");
  renderAll();
}

function renderDriverSelect(){
  const select=$("salaryDriver");
  const old=selectedDriver;
  select.innerHTML='<option value="">Select driver</option>'+
    db.drivers.map(d=>`<option value="${d.id}">${escapeHTML(d.name)} · ${escapeHTML(d.truck)}</option>`).join("");
  if(db.drivers.some(d=>d.id===old)) select.value=old;
  else if(db.drivers.length){selectedDriver=db.drivers[0].id;select.value=selectedDriver;}
  else selectedDriver="";
}

function renderSalary(){
  const driver=currentDriver();
  if(!driver){
    $("salaryDriverInfo").textContent="Add a driver to begin.";
    ["statMiles","statMileage","statPreviousDue","statDue","statAdvanceBalance","statPaid"].forEach(id=>$(id).textContent=id==="statMiles"?"0":money(0));
    $("previousMiles").value=0;
    $("currentMiles").value="";
    $("additionsList").innerHTML="";
    $("finesList").innerHTML="";
    $("salaryTotals").innerHTML="";
    $("advanceBalanceInfo").textContent=money(0);
    return;
  }

  const data=monthData(driver,selectedMonth,true);
  const n=salaryNumbers(driver,selectedMonth);
  const prev=previousMiles(driver,selectedMonth);
  $("salaryDriverInfo").innerHTML=`<strong>${escapeHTML(driver.name)}</strong> · Truck ${escapeHTML(driver.truck||"—")} · ${escapeHTML(driver.phone||"")}`;
  $("previousMiles").value=prev;
  $("currentMiles").value=data.endMiles||"";
  $("mileageRate").value=data.rate??db.rate;

  $("statMiles").textContent=n.miles.toLocaleString();
  $("statMileage").textContent=money(n.mileage);
  $("statPreviousDue").textContent=money(previousDue(driver,selectedMonth));
  $("statDue").textContent=money(n.remaining);
  $("statAdvanceBalance").textContent=money(advanceBalance(driver));
  $("statPaid").textContent=money(n.paid);
  $("advanceBalanceInfo").textContent=money(advanceBalance(driver));

  renderItems("additionsList",data.additions,"addition");
  renderItems("finesList",data.fines,"fine");

  $("salaryTotals").innerHTML=`
    <div class="summary-row"><span>Previous Odometer</span><b>${prev.toLocaleString()}</b></div>
    <div class="summary-row"><span>Current Odometer</span><b>${Number(data.endMiles||0).toLocaleString()}</b></div>
    <div class="summary-row"><span>Total Miles</span><b>${n.miles.toLocaleString()}</b></div>
    <div class="summary-row"><span>Mileage Salary</span><b>${money(n.mileage)}</b></div>
    <div class="summary-row"><span>Additions</span><b>${money(n.additions)}</b></div>
    <div class="summary-row"><span>Fines / Deductions</span><b>-${money(n.fines)}</b></div>
    <div class="summary-row"><span>Advance Recovery</span><b>-${money(n.recoveries)}</b></div>
    <div class="summary-row"><span>Salary Before Payments</span><b>${money(n.due)}</b></div>
    <div class="summary-row"><span>Payments</span><b>-${money(n.paid)}</b></div>
    <div class="summary-row"><span>Remaining Salary</span><b>${money(n.remaining)}</b></div>`;
}

function renderItems(container,list,type){
  $(container).innerHTML=list.length?list.map(item=>`
    <div class="item-row">
      <div><strong>${escapeHTML(item.title||type)}</strong><small>${money(item.amount)}</small></div>
      <button class="delete-btn" data-remove="${type}" data-id="${item.id}">Remove</button>
    </div>`).join(""):'<p class="hint">No records added.</p>';
}

function renderDrivers(){
  $("driversBody").innerHTML=db.drivers.length?db.drivers.map(d=>`
    <tr>
      <td><strong>${escapeHTML(d.name)}</strong></td>
      <td>${escapeHTML(d.truck||"—")}</td>
      <td>${escapeHTML(d.phone||"—")}</td>
      <td>${escapeHTML(d.address||"—")}</td>
      <td>
        <button class="action-btn" data-select-driver="${d.id}">Salary</button>
        <button class="action-btn delete-btn" data-delete-driver="${d.id}">Delete</button>
      </td>
    </tr>`).join(""):'<tr><td colspan="5" class="empty-row">No drivers added.</td></tr>';
}

function renderOutstanding(){
  const rows=[];
  db.drivers.forEach(d=>{
    Object.keys(d.months||{}).sort().forEach(month=>{
      const n=salaryNumbers(d,month);
      if(n.remaining>0.009) rows.push({d,month,n});
    });
  });
  $("outstandingBody").innerHTML=rows.length?rows.map(x=>`
    <tr>
      <td>${escapeHTML(x.d.name)}</td>
      <td>${escapeHTML(x.d.truck||"—")}</td>
      <td>${x.month}</td>
      <td>${money(x.n.due)}</td>
      <td>${money(x.n.paid)}</td>
      <td><strong>${money(x.n.remaining)}</strong></td>
      <td><button class="action-btn pay-btn" data-pay-driver="${x.d.id}" data-pay-month="${x.month}">Pay</button></td>
    </tr>`).join(""):'<tr><td colspan="7" class="empty-row">No outstanding salary.</td></tr>';
}

function renderHistory(){
  const rows=[];
  db.drivers.forEach(d=>{
    Object.keys(d.months||{}).forEach(month=>rows.push({d,month,n:salaryNumbers(d,month)}));
  });
  rows.sort((a,b)=>b.month.localeCompare(a.month));
  $("historyBody").innerHTML=rows.length?rows.map(x=>`
    <tr>
      <td>${x.month}</td><td>${escapeHTML(x.d.name)}</td>
      <td>${escapeHTML(x.d.truck||"—")}</td>
      <td>${x.n.miles.toLocaleString()}</td><td>${money(x.n.gross)}</td>
      <td>${money(x.n.recoveries)}</td><td>${money(x.n.paid)}</td>
      <td>${money(x.n.remaining)}</td>
    </tr>`).join(""):'<tr><td colspan="8" class="empty-row">No salary history.</td></tr>';
}

function renderPayments(){
  const rows=[];
  db.drivers.forEach(d=>{
    Object.entries(d.months||{}).forEach(([month,m])=>{
      (m.payments||[]).forEach(p=>rows.push({d,month,p}));
    });
  });
  rows.sort((a,b)=>(b.p.date||"").localeCompare(a.p.date||""));
  $("paymentsBody").innerHTML=rows.length?rows.map(x=>`
    <tr>
      <td>${escapeHTML(x.p.date||"")}</td>
      <td>${escapeHTML(x.d.name)}</td>
      <td>${escapeHTML(x.d.truck||"—")}</td>
      <td>${x.month}</td>
      <td>${escapeHTML(x.p.method||"")}</td>
      <td>${escapeHTML(x.p.reference||"—")}</td>
      <td><strong>${money(x.p.amount)}</strong></td>
    </tr>`).join(""):'<tr><td colspan="7" class="empty-row">No payments recorded.</td></tr>';
}

function renderAll(){
  renderDriverSelect();
  renderSalary();
  renderDrivers();
  renderOutstanding();
  renderHistory();
  renderPayments();
  $("settingCompany").value=db.company||"PRESERVER TRANS LLC";
  $("settingLocation").value=db.location||"USA California";
  $("settingRate").value=db.rate||0.52;
}

function addDriver(){
  const name=$("newDriverName").value.trim();
  const truck=$("newDriverTruck").value.trim();
  if(!name){toast("Please enter driver name.");return;}
  const driver={
    id:uid(),name,truck,
    phone:$("newDriverPhone").value.trim(),
    address:$("newDriverAddress").value.trim(),
    months:{}
  };
  db.drivers.push(driver);
  selectedDriver=driver.id;
  $("driverModal").classList.add("hidden");
  ["newDriverName","newDriverTruck","newDriverPhone","newDriverAddress"].forEach(id=>$(id).value="");
  saveData();
  renderAll();
  toast("Driver added successfully.");
}

async function addListItem(type){
  const driver=currentDriver();
  if(!driver)return toast("Select a driver first.");
  const data=monthData(driver,selectedMonth,true);
  const isAddition=type==="addition";
  const title=$(isAddition?"additionTitle":"fineTitle").value.trim()||type;
  const amount=Number($(isAddition?"additionAmount":"fineAmount").value);
  if(!(amount>0))return toast("Enter a valid amount.");
  const key=isAddition?"additions":"fines";
  data[key].push({id:uid(),title,amount,date:today()});
  $(isAddition?"additionTitle":"fineTitle").value="";
  $(isAddition?"additionAmount":"fineAmount").value="";
  await saveData();renderAll();toast("Record added.");
}

async function saveMileage(){
  const driver=currentDriver();
  if(!driver)return toast("Select a driver.");
  const end=Number($("currentMiles").value);
  const prev=previousMiles(driver,selectedMonth);
  if(!(end>=prev))return toast("Current odometer cannot be less than previous miles.");
  const data=monthData(driver,selectedMonth,true);
  data.endMiles=end;
  data.rate=Number($("mileageRate").value)||db.rate;
  await saveData();renderAll();toast("Mileage saved.");
}

async function giveAdvance(){
  const driver=currentDriver();
  if(!driver)return toast("Select a driver.");
  const amount=Number($("advanceAmount").value);
  if(!(amount>0))return toast("Enter advance amount.");
  const data=monthData(driver,selectedMonth,true);
  data.advances.push({id:uid(),amount,note:$("advanceNote").value.trim(),date:today()});
  $("advanceAmount").value="";$("advanceNote").value="";
  await saveData();renderAll();toast("Advance saved.");
}

async function recoverAdvance(){
  const driver=currentDriver();
  if(!driver)return toast("Select a driver.");
  const amount=Number($("recoverAmount").value);
  if(!(amount>0))return toast("Enter recovery amount.");
  if(amount>advanceBalance(driver)+0.001)return toast("Recovery is greater than remaining advance.");
  const data=monthData(driver,selectedMonth,true);
  data.recoveries.push({id:uid(),amount,note:$("recoverNote").value.trim(),date:today()});
  $("recoverAmount").value="";$("recoverNote").value="";
  await saveData();renderAll();toast("Advance recovery saved.");
}

async function recordPayment(driverId=selectedDriver,month=selectedMonth,amountInput=null){
  const driver=db.drivers.find(d=>d.id===driverId);
  if(!driver)return;
  const n=salaryNumbers(driver,month);
  const amount=amountInput===null?Number($("paymentAmount").value):Number(amountInput);
  if(!(amount>0))return toast("Enter a valid payment amount.");
  if(amount>n.remaining+0.001)return toast("Payment cannot exceed remaining salary.");
  const data=monthData(driver,month,true);
  data.payments.push({
    id:uid(),amount,
    date:amountInput===null?($("paymentDate").value||today()):today(),
    method:amountInput===null?$("paymentMethod").value:"Manual",
    reference:amountInput===null?$("paymentReference").value.trim():""
  });
  if(driverId===selectedDriver && month===selectedMonth){
    $("paymentAmount").value="";
    $("paymentReference").value="";
  }
  await saveData();renderAll();toast("Payment recorded successfully.");
}

function payOutstanding(driverId,month){
  const driver=db.drivers.find(d=>d.id===driverId);
  if(!driver)return;
  const n=salaryNumbers(driver,month);
  const value=prompt(`Remaining salary for ${driver.name}: ${money(n.remaining)}\nEnter payment amount:`,n.remaining.toFixed(2));
  if(value===null)return;
  recordPayment(driverId,month,Number(value));
}

async function saveSettings(){
  db.company=$("settingCompany").value.trim()||"PRESERVER TRANS LLC";
  db.location=$("settingLocation").value.trim();
  db.rate=Number($("settingRate").value)||0.52;
  await saveData();renderAll();toast("Settings saved.");
}

async function deleteDriver(id){
  const driver=db.drivers.find(d=>d.id===id);
  if(!driver)return;
  if(!confirm(`Delete driver ${driver.name} and all their payroll records? This cannot be undone.`))return;
  db.drivers=db.drivers.filter(d=>d.id!==id);
  if(selectedDriver===id)selectedDriver=db.drivers[0]?.id||"";
  await saveData();renderAll();toast("Driver deleted.");
}

function bindEvents(){
  $("loginForm").addEventListener("submit",login);
  $("signupForm").addEventListener("submit",signup);
  $("logoutBtn").addEventListener("click",logout);

  $("showSignup").addEventListener("click",e=>{
    e.preventDefault();
    $("loginForm").classList.add("hidden");
    $("signupForm").classList.remove("hidden");
    $("showSignup").classList.add("hidden");
    $("showLogin").classList.remove("hidden");
  });
  $("showLogin").addEventListener("click",e=>{
    e.preventDefault();
    $("signupForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    $("showLogin").classList.add("hidden");
    $("showSignup").classList.remove("hidden");
  });

  document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.page)));
  $("menuToggle").addEventListener("click",()=>$("sidebar").classList.toggle("open"));

  $("salaryDriver").addEventListener("change",e=>{
    selectedDriver=e.target.value;renderSalary();
  });
  $("salaryMonth").addEventListener("change",e=>{
    selectedMonth=e.target.value||monthNow();renderSalary();
  });
  $("saveMileageBtn").addEventListener("click",saveMileage);
  $("addAdditionBtn").addEventListener("click",()=>addListItem("addition"));
  $("addFineBtn").addEventListener("click",()=>addListItem("fine"));
  $("giveAdvanceBtn").addEventListener("click",giveAdvance);
  $("recoverAdvanceBtn").addEventListener("click",recoverAdvance);
  $("recordPaymentBtn").addEventListener("click",()=>recordPayment());
  $("saveSettingsBtn").addEventListener("click",saveSettings);
  $("saveNowBtn").addEventListener("click",async()=>{await saveData();toast("Data sync completed.");});
  $("printSalaryBtn").addEventListener("click",()=>window.print());

  $("addDriverBtn").addEventListener("click",()=>$("driverModal").classList.remove("hidden"));
  $("closeDriverModal").addEventListener("click",()=>$("driverModal").classList.add("hidden"));
  $("saveDriverBtn").addEventListener("click",addDriver);

  document.addEventListener("click",async e=>{
    const remove=e.target.closest("[data-remove]");
    if(remove){
      const driver=currentDriver();
      if(!driver)return;
      const data=monthData(driver,selectedMonth,true);
      const key=remove.dataset.remove==="addition"?"additions":"fines";
      data[key]=data[key].filter(x=>x.id!==remove.dataset.id);
      await saveData();renderAll();toast("Record removed.");
    }

    const select=e.target.closest("[data-select-driver]");
    if(select){
      selectedDriver=select.dataset.selectDriver;
      $("salaryDriver").value=selectedDriver;
      openPage("salaryView");
    }

    const del=e.target.closest("[data-delete-driver]");
    if(del)deleteDriver(del.dataset.deleteDriver);

    const pay=e.target.closest("[data-pay-driver]");
    if(pay)payOutstanding(pay.dataset.payDriver,pay.dataset.payMonth);
  });
}

async function start(){
  bindEvents();
  $("salaryMonth").value=selectedMonth;
  $("paymentDate").value=today();

  const config=window.SUPABASE_CONFIG||{};
  if(window.supabase && config.url && config.anonKey &&
     !config.anonKey.includes("PASTE_YOUR")){
    sb=window.supabase.createClient(config.url,config.anonKey);
    const {data}=await sb.auth.getSession();
    if(data.session){
      user=data.session.user;
      try{await loadData();showApp();}
      catch(e){console.error(e);toast("Could not load cloud data: "+e.message);}
    }else{
      showLogin();
    }
  }else{
    user=null;
    await loadData();
    showLogin();
    message("loginMessage","Supabase key missing. Add your anon/publishable key to supabase-config.js.");
  }

  const {data:authListener}=sb?.auth?.onAuthStateChange(async(event,session)=>{
    if(event==="SIGNED_OUT"){user=null;showLogin();}
    if(event==="SIGNED_IN" && session && !user){
      user=session.user;
      try{await loadData();showApp();}catch(e){console.error(e);}
    }
  })||{data:{subscription:null}};

  window.addEventListener("beforeunload",()=>{
    authListener?.subscription?.unsubscribe();
  });
}

document.addEventListener("DOMContentLoaded",start);
