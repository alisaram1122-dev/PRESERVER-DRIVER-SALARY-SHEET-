const $ = id => document.getElementById(id);

const SUPABASE_URL = String(window.PRESERVER_SUPABASE_URL || "").trim();
const SUPABASE_KEY = String(window.PRESERVER_SUPABASE_ANON_KEY || "").trim();

let sb = null;
let user = null;
let activeDriverId = null;
let activeMonth = "";
let activeCycle = "1";
let selectedWallpaper = "1";
let photoData = "";

let db = {
    rate: 0.52,
    drivers: [],
    history: [],
    deleted: [],
    settings: {
        company: "Preserver Trans LLC",
        manager: "Saim Ali",
        designation: "Account Manager",
        wallpaper: "1",
        language: "en",
        textStyle: {}
    }
};

const wallpapers = [
    { id: "1", name: "Classic Navy", color: "linear-gradient(135deg,#101b2c,#263e5e)" },
    { id: "2", name: "Blue", color: "linear-gradient(135deg,#193b67,#7da6d6)" },
    { id: "3", name: "Green", color: "linear-gradient(135deg,#164d3b,#79b99b)" },
    { id: "4", name: "Purple", color: "linear-gradient(135deg,#42245f,#a785c7)" },
    { id: "5", name: "Gold", color: "linear-gradient(135deg,#77551d,#d8b96e)" },
    { id: "6", name: "Silver", color: "linear-gradient(135deg,#35404b,#aab6c2)" },
    { id: "7", name: "Royal Blue", color: "linear-gradient(135deg,#172d70,#7389db)" },
    { id: "8", name: "Rose", color: "linear-gradient(135deg,#713d4b,#d99ba8)" },
    { id: "9", name: "Ocean", color: "linear-gradient(135deg,#123c55,#5c9cb0)" },
    { id: "10", name: "Sand", color: "linear-gradient(135deg,#786047,#c9ad8a)" },
    { id: "11", name: "Forest", color: "linear-gradient(135deg,#183d2b,#75a88a)" },
    { id: "12", name: "Lavender", color: "linear-gradient(135deg,#4b3b68,#b4a5d3)" }
];

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() :
        Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function money(n) {
    return "$" + Number(n || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function num(id) {
    return Number($(id)?.value || 0);
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function normalize() {
    db = db || {};
    db.drivers = Array.isArray(db.drivers) ? db.drivers : [];
    db.history = Array.isArray(db.history) ? db.history : [];
    db.deleted = Array.isArray(db.deleted) ? db.deleted : [];
    db.settings = db.settings || {};
    db.rate = Number(db.rate || 0.52);

    db.drivers.forEach(driver => {
        driver.months = driver.months || {};
        driver.openingDue = Number(driver.openingDue || 0);
    });
}

function getDriver(id) {
    return db.drivers.find(d => d.id === id);
}

function getMonth(driver, month) {
    driver.months = driver.months || {};

    if (!driver.months[month]) {
        driver.months[month] = {
            cycles: {
                "1": newCycle(),
                "2": newCycle()
            }
        };
    }

    const record = driver.months[month];

    if (!record.cycles) {
        const old = record;
        record.cycles = {
            "1": { ...newCycle(), ...old },
            "2": newCycle()
        };
    }

    if (!record.cycles["1"]) record.cycles["1"] = newCycle();
    if (!record.cycles["2"]) record.cycles["2"] = newCycle();

    return record;
}

function newCycle() {
    return {
        rows: [],
        basic: 0,
        adds: 0,
        fines: 0,
        advances: 0,
        recoveries: 0,
        layover: 0,
        payments: [],
        closed: false,
        saved: false
    };
}

function getCycle(driver, month, cycle) {
    return getMonth(driver, month).cycles[String(cycle)];
}

function allMonths(driver) {
    return Object.keys(driver.months || {}).sort();
}

function cycleDate(month, cycle) {
    return month + (cycle === "1" ? "-01" : "-16");
}

function openingDue(driver, month, cycle) {
    const target = month + "-" + (cycle === "1" ? "01" : "16");
    let due = Number(driver.openingDue || 0);

    db.history
        .filter(h => h.driverId === driver.id)
        .sort((a, b) => (a.closedAt || "").localeCompare(b.closedAt || ""))
        .forEach(h => {
            const closedDate = h.closedAt || "";
            const hMonth = h.month || "";
            const hCycle = String(h.cycle || "1");
            const hEnd = hMonth + (hCycle === "1" ? "-15" : "-31");

            if (hEnd < target) {
                due = Number(h.remaining || 0);
            }
        });

    // Also include a previous unclosed salary cycle if it is saved.
    const monthKeys = allMonths(driver);
    monthKeys.forEach(m => {
        ["1", "2"].forEach(c => {
            const key = m + (c === "1" ? "-01" : "-16");
            if (key < target) {
                const record = driver.months[m]?.cycles?.[c];
                if (record && !record.closed && record.saved) {
                    const result = calculateCycle(driver, m, c, false);
                    due = result.remaining;
                }
            }
        });
    });

    return Math.max(0, due);
}

function calculateCycle(driver, month, cycle, includeOpening = true) {
    const data = getCycle(driver, month, cycle);
    const rows = data.rows || [];

    const miles = rows.reduce((sum, row) => sum + Number(row.miles || 0), 0);
    const rate = Number(db.rate || 0.52);
    const mileage = miles * rate;

    const basic = Number(data.basic || 0);
    const adds = Number(data.adds || 0);
    const layover = Number(data.layover || 0);
    const fines = Number(data.fines || 0);
    const advances = Number(data.advances || 0);
    const recoveries = Number(data.recoveries || 0);

    const opening = includeOpening ? openingDue(driver, month, String(cycle)) : 0;
    const gross = mileage + basic + adds + layover;
    const deductions = fines + advances + recoveries;
    const due = Math.max(0, opening + gross - deductions);

    const paid = (data.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const remaining = Math.max(0, due - paid);

    return {
        miles,
        mileage,
        basic,
        adds,
        layover,
        gross,
        fines,
        advances,
        recoveries,
        deductions,
        opening,
        due,
        paid,
        remaining
    };
}

async function loadCloudData() {
    const { data, error } = await sb
        .from("driver_salary_data")
        .select("payload")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) throw error;

    if (data?.payload) {
        db = data.payload;
    }

    normalize();
}

let saveTimer = null;

async function saveCloudData() {
    if (!sb || !user) return;

    clearTimeout(saveTimer);

    saveTimer = setTimeout(async () => {
        try {
            const { error } = await sb
                .from("driver_salary_data")
                .upsert({
                    user_id: user.id,
                    payload: db,
                    updated_at: new Date().toISOString()
                }, { onConflict: "user_id" });

            if (error) {
                console.error(error);
                toast("Cloud save failed: " + error.message);
            }
        } catch (error) {
            console.error(error);
            toast("Cloud connection error");
        }
    }, 400);
}

async function login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;

    user = data.user;
    await loadCloudData();
    showApp();
}

function showApp() {
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");

    $("currentUser").textContent = user?.email || "Account";
    $("headerManager").textContent =
        (db.settings.manager || "Saim Ali").toUpperCase();

    applySavedTextStyle();
    document.body.dataset.wallpaper = db.settings.wallpaper || "1";

    setupNavigation();
    renderAll();
}

function setupNavigation() {
    document.querySelectorAll(".nav-btn").forEach(button => {
        button.onclick = () => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

            button.classList.add("active");
            $(button.dataset.page).classList.add("active");

            renderAll();
        };
    });
}

function renderAll() {
    renderDashboard();
    renderDriverOptions();
    renderDrivers();
    renderHistory();
    renderReports();
    renderDeleted();
    renderSettings();
}

function getDriverTotalPaid(driver) {
    return db.history
        .filter(h => h.driverId === driver.id)
        .reduce((sum, h) => sum + Number(h.paid || 0), 0);
}

function getDriverDue(driver) {
    const records = db.history
        .filter(h => h.driverId === driver.id)
        .sort((a, b) => {
            const ak = (a.month || "") + (a.cycle || "1");
            const bk = (b.month || "") + (b.cycle || "1");
            return ak.localeCompare(bk);
        });

    if (records.length) {
        return Number(records[records.length - 1].remaining || 0);
    }

    return Number(driver.openingDue || 0);
}

function renderDashboard() {
    $("statDrivers").textContent = db.drivers.length;

    const paid = db.history.reduce((s, h) => s + Number(h.paid || 0), 0);
    const due = db.drivers.reduce((s, d) => s + getDriverDue(d), 0);

    $("statPaid").textContent = money(paid);
    $("statDue").textContent = money(due);
    $("statRecords").textContent = db.history.length;

    $("dashboardDrivers").innerHTML = db.drivers.map(driver => {
        const last = db.history
            .filter(h => h.driverId === driver.id)
            .sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0];

        return `
            <tr>
                <td>${escapeHTML(driver.name)}</td>
                <td>${escapeHTML(driver.truck || "-")}</td>
                <td>${last ? escapeHTML(last.month + " / Cycle " + last.cycle) : "No salary yet"}</td>
                <td><strong>${money(getDriverDue(driver))}</strong></td>
            </tr>`;
    }).join("") || `<tr><td colspan="4">No drivers added yet</td></tr>`;
}

function renderDriverOptions() {
    const select = $("salaryDriver");
    const old = select.value;

    select.innerHTML = `<option value="">Select Driver</option>` +
        db.drivers.map(d =>
            `<option value="${d.id}">${escapeHTML(d.name)} - ${escapeHTML(d.truck || "")}</option>`
        ).join("");

    if (db.drivers.some(d => d.id === old)) select.value = old;
}

function renderDrivers() {
    $("driversGrid").innerHTML = db.drivers.map(driver => `
        <div class="driver-card">
            <div class="driver-card-top">
                <img class="driver-avatar" src="${driver.photo || ""}" alt=""
                     onerror="this.style.display='none'">
                <div>
                    <h3>${escapeHTML(driver.name)}</h3>
                    <p>Truck: ${escapeHTML(driver.truck || "-")}</p>
                </div>
            </div>
            <p>Phone: ${escapeHTML(driver.phone || "-")}</p>
            <p>Outstanding: <strong>${money(getDriverDue(driver))}</strong></p>
            <div class="action-row">
                <button class="btn outline" onclick="editDriver('${driver.id}')">Edit</button>
                <button class="btn gold" onclick="selectDriverForSalary('${driver.id}')">Salary</button>
                <button class="btn danger" onclick="deleteDriver('${driver.id}')">Delete</button>
            </div>
        </div>
    `).join("") || `<div class="panel">No drivers added yet.</div>`;
}

function selectDriverForSalary(id) {
    $("salaryDriver").value = id;
    document.querySelector('[data-page="salary"]').click();
    loadSalary();
}

function openDriverModal(id = "") {
    $("driverModal").classList.remove("hidden");
    $("driverMessage").textContent = "";
    $("driverModalTitle").textContent = id ? "Edit Driver" : "Add Driver";
    $("editDriverId").value = id;
    photoData = "";

    const driver = id ? getDriver(id) : null;

    $("driverName").value = driver?.name || "";
    $("driverTruck").value = driver?.truck || "";
    $("driverPhone").value = driver?.phone || "";

    if (driver?.photo) {
        $("driverPhotoPreview").src = driver.photo;
        $("driverPhotoPreview").classList.remove("hidden");
        photoData = driver.photo;
    } else {
        $("driverPhotoPreview").classList.add("hidden");
    }

    $("driverPhoto").value = "";
}

function closeDriverModal() {
    $("driverModal").classList.add("hidden");
}

function editDriver(id) {
    openDriverModal(id);
}

$("driverPhoto").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        $("driverMessage").textContent = "Photo must be 2 MB or smaller.";
        event.target.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        photoData = reader.result;
        $("driverPhotoPreview").src = photoData;
        $("driverPhotoPreview").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
});

$("saveDriverBtn").onclick = () => {
    const name = $("driverName").value.trim();

    if (!name) {
        $("driverMessage").textContent = "Driver name is required.";
        return;
    }

    const id = $("editDriverId").value;
    const existing = id ? getDriver(id) : null;

    const record = {
        id: id || uid(),
        name,
        truck: $("driverTruck").value.trim(),
        phone: $("driverPhone").value.trim(),
        photo: photoData || existing?.photo || "",
        months: existing?.months || {},
        openingDue: existing?.openingDue || 0
    };

    if (existing) {
        Object.assign(existing, record);
    } else {
        db.drivers.push(record);
    }

    saveCloudData();
    closeDriverModal();
    renderAll();
    toast("Driver saved successfully");
};

function deleteDriver(id) {
    const driver = getDriver(id);
    if (!driver || !confirm("Move this driver to Deleted Records?")) return;

    db.deleted.push({
        id: uid(),
        type: "driver",
        label: driver.name,
        data: driver,
        deletedAt: new Date().toISOString()
    });

    db.drivers = db.drivers.filter(d => d.id !== id);
    saveCloudData();
    renderAll();
    toast("Driver moved to recycle bin");
}

function loadSalary() {
    const id = $("salaryDriver").value;
    const month = $("salaryMonth").value;
    const cycle = $("salaryCycle").value;

    if (!id || !month) {
        toast("Select driver and month first");
        return;
    }

    const driver = getDriver(id);
    if (!driver) return;

    activeDriverId = id;
    activeMonth = month;
    activeCycle = cycle;

    const data = getCycle(driver, month, cycle);
    const result = calculateCycle(driver, month, cycle);

    $("salaryWorkspace").classList.remove("hidden");
    $("salaryDriverName").textContent = driver.name;
    $("salaryDriverTruck").textContent = "Truck: " + (driver.truck || "-");
    $("salaryOutstanding").textContent = money(getDriverDue(driver));

    $("basicAmount").value = data.basic || 0;
    $("addAmount").value = data.adds || 0;
    $("layoverAmount").value = data.layover || 0;
    $("fineAmount").value = data.fines || 0;
    $("advanceAmount").value = data.advances || 0;
    $("recoveryAmount").value = data.recoveries || 0;

    $("paymentAmount").value = "";
    $("paymentDate").value = today();
    $("paymentNote").value = "";

    $("mileDate").value = today();
    updateOdometerPreview();
    renderSalaryCalculation();
    renderMileageRows();
}

function currentCycleData() {
    const driver = getDriver(activeDriverId);
    return driver ? getCycle(driver, activeMonth, activeCycle) : null;
}

function previousOdometer(driver, month, cycle) {
    let latest = 0;
    const target = month + (cycle === "1" ? "-01" : "-16");

    db.drivers.forEach(d => {
        allMonths(d).forEach(m => {
            ["1", "2"].forEach(c => {
                const key = m + (c === "1" ? "-01" : "-16");
                if (key >= target) return;

                (d.months[m].cycles[c].rows || []).forEach(row => {
                    if (Number(row.newOdometer || 0) > latest) {
                        latest = Number(row.newOdometer);
                    }
                });
            });
        });
    });

    return latest;
}

function updateOdometerPreview() {
    if (!activeDriverId) return;

    const driver = getDriver(activeDriverId);
    const prev = previousOdometer(driver, activeMonth, activeCycle);

    $("previousOdometer").value = prev;
    const next = num("newOdometer");
    $("calculatedMiles").value = next > prev ? next - prev : 0;
}

$("newOdometer").addEventListener("input", updateOdometerPreview);

$("addMileageBtn").onclick = () => {
    const data = currentCycleData();
    if (!data) return;

    if (data.closed) {
        toast("This salary cycle is already closed");
        return;
    }

    const next = num("newOdometer");
    const previous = num("previousOdometer");
    const miles = next - previous;

    if (!next || miles <= 0) {
        toast("Enter a valid new odometer reading");
        return;
    }

    data.rows.push({
        id: uid(),
        date: $("mileDate").value || today(),
        previousOdometer: previous,
        newOdometer: next,
        miles
    });

    data.saved = true;
    saveCloudData();
    updateOdometerPreview();
    renderSalaryCalculation();
    renderMileageRows();
    toast("Mileage saved");
};

function renderSalaryCalculation() {
    const driver = getDriver(activeDriverId);
    if (!driver) return;

    const result = calculateCycle(driver, activeMonth, activeCycle);

    $("totalMiles").textContent = result.miles.toLocaleString();
    $("mileageEarnings").textContent = money(result.mileage);
    $("grossEarnings").textContent = money(result.gross);
    $("remainingBalance").textContent = money(result.remaining);

    $("calcOpening").textContent = money(result.opening);
    $("calcMileage").textContent = money(result.mileage);
    $("calcOther").textContent = money(result.basic + result.adds + result.layover);
    $("calcDeductions").textContent = money(result.deductions);
    $("calcDue").textContent = money(result.due);
}

$("saveAdjustmentsBtn").onclick = () => {
    const data = currentCycleData();
    if (!data) return;

    if (data.closed) {
        toast("This salary cycle is already closed");
        return;
    }

    data.basic = num("basicAmount");
    data.adds = num("addAmount");
    data.layover = num("layoverAmount");
    data.fines = num("fineAmount");
    data.advances = num("advanceAmount");
    data.recoveries = num("recoveryAmount");
    data.saved = true;

    saveCloudData();
    renderSalaryCalculation();
    toast("Salary adjustments saved");
};

$("saveSalaryBtn").onclick = () => {
    const data = currentCycleData();
    if (!data) return;

    if (data.closed) {
        toast("This salary cycle is already closed");
        return;
    }

    saveAdjustmentsWithoutToast();
    data.saved = true;
    saveCloudData();
    renderSalaryCalculation();
    toast("Salary saved successfully");
};

function saveAdjustmentsWithoutToast() {
    const data = currentCycleData();
    if (!data) return;

    data.basic = num("basicAmount");
    data.adds = num("addAmount");
    data.layover = num("layoverAmount");
    data.fines = num("fineAmount");
    data.advances = num("advanceAmount");
    data.recoveries = num("recoveryAmount");
}

$("closeSalaryBtn").onclick = () => {
    const driver = getDriver(activeDriverId);
    const data = currentCycleData();

    if (!driver || !data) {
        toast("Select a driver and salary cycle");
        return;
    }

    if (data.closed) {
        toast("This salary cycle is already closed");
        return;
    }

    saveAdjustmentsWithoutToast();

    const payment = num("paymentAmount");
    if (payment < 0) {
        toast("Invalid payment amount");
        return;
    }

    if (payment > 0) {
        data.payments.push({
            id: uid(),
            amount: payment,
            date: $("paymentDate").value || today(),
            note: $("paymentNote").value.trim()
        });
    }

    const result = calculateCycle(driver, activeMonth, activeCycle);

    const historyRecord = {
        id: uid(),
        driverId: driver.id,
        driverName: driver.name,
        truck: driver.truck,
        month: activeMonth,
        cycle: activeCycle,
        miles: result.miles,
        rate: db.rate,
        opening: result.opening,
        mileage: result.mileage,
        gross: result.gross,
        deductions: result.deductions,
        due: result.due,
        paid: result.paid,
        remaining: result.remaining,
        closedAt: new Date().toISOString(),
        rows: structuredClone(data.rows || []),
        payments: structuredClone(data.payments || [])
    };

    data.closed = true;
    data.saved = true;

    db.history.push(historyRecord);

    saveCloudData();
    renderAll();
    renderSalaryCalculation();

    toast("Salary cycle closed and saved to History");
};

function renderMileageRows() {
    const data = currentCycleData();
    if (!data) return;

    $("mileageRows").innerHTML = (data.rows || []).map(row => `
        <tr>
            <td>${escapeHTML(row.date)}</td>
            <td>${Number(row.previousOdometer).toLocaleString()}</td>
            <td>${Number(row.newOdometer).toLocaleString()}</td>
            <td>${Number(row.miles).toLocaleString()}</td>
            <td><button class="btn danger" onclick="deleteMileage('${row.id}')">Delete</button></td>
        </tr>
    `).join("") || `<tr><td colspan="5">No mileage records</td></tr>`;
}

function deleteMileage(id) {
    const data = currentCycleData();
    if (!data || data.closed) return;

    const row = data.rows.find(r => r.id === id);
    if (!row || !confirm("Delete this mileage record?")) return;

    db.deleted.push({
        id: uid(),
        type: "mileage",
        label: "Mileage " + row.miles + " miles",
        data: {
            driverId: activeDriverId,
            month: activeMonth,
            cycle: activeCycle,
            row
        },
        deletedAt: new Date().toISOString()
    });

    data.rows = data.rows.filter(r => r.id !== id);

    saveCloudData();
    renderSalaryCalculation();
    renderMileageRows();
    renderDeleted();
    toast("Mileage moved to Deleted Records");
}

function renderHistory() {
    $("historyRows").innerHTML = db.history.slice().reverse().map(h => `
        <tr>
            <td>${escapeHTML(h.driverName)}</td>
            <td>${escapeHTML(h.truck || "-")}</td>
            <td>${escapeHTML(h.month)}</td>
            <td>${h.cycle === "1" ? "1–15" : "16–End"}</td>
            <td>${money(h.due)}</td>
            <td>${money(h.paid)}</td>
            <td>${money(h.remaining)}</td>
            <td>${escapeHTML((h.closedAt || "").slice(0, 10))}</td>
            <td><button class="btn danger" onclick="deleteHistory('${h.id}')">Delete</button></td>
        </tr>
    `).join("") || `<tr><td colspan="9">No salary history available</td></tr>`;
}

function deleteHistory(id) {
    const h = db.history.find(x => x.id === id);
    if (!h || !confirm("Move this history record to Deleted Records?")) return;

    db.deleted.push({
        id: uid(),
        type: "history",
        label: "Salary History - " + h.driverName + " - " + h.month,
        data: h,
        deletedAt: new Date().toISOString()
    });

    db.history = db.history.filter(x => x.id !== id);

    const driver = getDriver(h.driverId);
    const data = driver?.months?.[h.month]?.cycles?.[String(h.cycle)];

    if (data) data.closed = false;

    saveCloudData();
    renderAll();
    toast("History record moved to Deleted Records");
}

function renderReports() {
    const paid = db.history.reduce((s, h) => s + Number(h.paid || 0), 0);
    const earnings = db.history.reduce((s, h) => s + Number(h.gross || 0), 0);
    const miles = db.history.reduce((s, h) => s + Number(h.miles || 0), 0);

    $("reportPaid").textContent = money(paid);
    $("reportEarnings").textContent = money(earnings);
    $("reportMiles").textContent = miles.toLocaleString();
    $("reportCycles").textContent = db.history.length;

    $("reportRows").innerHTML = db.drivers.map(d => {
        const records = db.history.filter(h => h.driverId === d.id);
        const driverPaid = records.reduce((s, h) => s + Number(h.paid || 0), 0);

        return `
            <tr>
                <td>${escapeHTML(d.name)}</td>
                <td>${escapeHTML(d.truck || "-")}</td>
                <td>${money(driverPaid)}</td>
                <td>${money(getDriverDue(d))}</td>
                <td>${records.length}</td>
            </tr>`;
    }).join("") || `<tr><td colspan="5">No report data</td></tr>`;
}

function renderDeleted() {
    $("deletedRows").innerHTML = db.deleted.slice().reverse().map(item => `
        <tr>
            <td>${escapeHTML(item.label)}</td>
            <td>${escapeHTML(item.type)}</td>
            <td>${escapeHTML((item.deletedAt || "").slice(0, 10))}</td>
            <td>
                <button class="btn gold" onclick="restoreDeleted('${item.id}')">Restore</button>
                <button class="btn danger" onclick="permanentlyDelete('${item.id}')">Delete Forever</button>
            </td>
        </tr>
    `).join("") || `<tr><td colspan="4">Recycle bin is empty</td></tr>`;
}

function restoreDeleted(id) {
    const item = db.deleted.find(x => x.id === id);
    if (!item) return;

    if (item.type === "driver") {
        db.drivers.push(item.data);
    }

    if (item.type === "history") {
        db.history.push(item.data);

        const driver = getDriver(item.data.driverId);
        const cycleData = driver?.months?.[item.data.month]?.cycles?.[String(item.data.cycle)];
        if (cycleData) cycleData.closed = true;
    }

    if (item.type === "mileage") {
        const d = getDriver(item.data.driverId);
        const cycleData = d?.months?.[item.data.month]?.cycles?.[item.data.cycle];

        if (cycleData) cycleData.rows.push(item.data.row);
    }

    db.deleted = db.deleted.filter(x => x.id !== id);
    saveCloudData();
    renderAll();
    toast("Record restored");
}

function permanentlyDelete(id) {
    if (!confirm("Permanently delete this record? This cannot be undone.")) return;

    db.deleted = db.deleted.filter(x => x.id !== id);
    saveCloudData();
    renderDeleted();
    toast("Record permanently deleted");
}

$("emptyTrashBtn").onclick = () => {
    if (!confirm("Permanently delete ALL records in recycle bin?")) return;

    db.deleted = [];
    saveCloudData();
    renderDeleted();
    toast("Recycle bin emptied");
};

function renderSettings() {
    $("settingCompany").value = db.settings.company || "Preserver Trans LLC";
    $("settingManager").value = db.settings.manager || "Saim Ali";
    $("settingDesignation").value = db.settings.designation || "Account Manager";
    $("settingRate").value = db.rate;

    $("languageSetting").value = db.settings.language || "en";

    renderWallpaperOptions();

    const style = db.settings.textStyle || {};

    $("fontFamily").value = style.family || "Arial, sans-serif";
    $("fontStyle").value = style.style || "normal";
    $("fontWeight").value = style.weight || "400";
    $("fontSize").value = style.size || "14px";
    $("fontDecoration").value = style.decoration || "none";

    previewTextStyle();
}

$("saveCompanyBtn").onclick = () => {
    db.settings.company = $("settingCompany").value.trim() || "Preserver Trans LLC";
    db.settings.manager = $("settingManager").value.trim() || "Saim Ali";
    db.settings.designation = $("settingDesignation").value.trim() || "Account Manager";
    db.rate = Math.max(0, num("settingRate"));

    $("headerManager").textContent = db.settings.manager.toUpperCase();

    saveCloudData();
    toast("Company settings saved");
};

function readTextStyle() {
    return {
        family: $("fontFamily").value,
        style: $("fontStyle").value,
        weight: $("fontWeight").value,
        size: $("fontSize").value,
        decoration: $("fontDecoration").value
    };
}

function applyTextStyle(style) {
    const root = document.documentElement;

    root.style.setProperty("--app-font", style.family);
    root.style.setProperty("--app-font-style", style.style);
    root.style.setProperty("--app-font-weight", style.weight);
    root.style.setProperty("--app-font-size", style.size);
    root.style.setProperty("--app-text-decoration", style.decoration);
}

function applySavedTextStyle() {
    const style = db.settings.textStyle || {};
    applyTextStyle({
        family: style.family || "Arial, sans-serif",
        style: style.style || "normal",
        weight: style.weight || "400",
        size: style.size || "14px",
        decoration: style.decoration || "none"
    });
}

function previewTextStyle() {
    const style = readTextStyle();
    const preview = $("fontPreview");

    preview.style.fontFamily = style.family;
    preview.style.fontStyle = style.style;
    preview.style.fontWeight = style.weight;
    preview.style.fontSize = style.size;
    preview.style.textDecoration = style.decoration;
}

["fontFamily", "fontStyle", "fontWeight", "fontSize", "fontDecoration"]
    .forEach(id => {
        $(id).addEventListener("change", previewTextStyle);
    });

$("applyFontBtn").onclick = () => {
    const style = readTextStyle();

    db.settings.textStyle = style;
    applyTextStyle(style);
    saveCloudData();

    toast("Font style applied and saved");
};

$("resetFontBtn").onclick = () => {
    const style = {
        family: "Arial, sans-serif",
        style: "normal",
        weight: "400",
        size: "14px",
        decoration: "none"
    };

    db.settings.textStyle = style;
    $("fontFamily").value = style.family;
    $("fontStyle").value = style.style;
    $("fontWeight").value = style.weight;
    $("fontSize").value = style.size;
    $("fontDecoration").value = style.decoration;

    applyTextStyle(style);
    previewTextStyle();
    saveCloudData();

    toast("Default font restored");
};

function renderWallpaperOptions() {
    selectedWallpaper = db.settings.wallpaper || "1";

    $("wallpaperGrid").innerHTML = wallpapers.map(w => `
        <div class="wallpaper-option ${selectedWallpaper === w.id ? "selected" : ""}"
             style="background:${w.color}"
             onclick="previewWallpaper('${w.id}')">
            <span>${w.name}</span>
        </div>
    `).join("");
}

function previewWallpaper(id) {
    selectedWallpaper = id;
    document.body.dataset.wallpaper = id;
    renderWallpaperOptions();
}

$("applyWallpaperBtn").onclick = () => {
    db.settings.wallpaper = selectedWallpaper;
    document.body.dataset.wallpaper = selectedWallpaper;
    saveCloudData();
    toast("Wallpaper applied");
};

$("saveLanguageBtn").onclick = () => {
    db.settings.language = $("languageSetting").value;
    saveCloudData();
    toast("Language preference saved");
};

$("changePasswordBtn").onclick = async () => {
    const password = $("newPassword").value.trim();

    if (password.length < 6) {
        $("settingsMessage").textContent = "Password must be at least 6 characters.";
        return;
    }

    const { error } = await sb.auth.updateUser({ password });

    if (error) {
        $("settingsMessage").textContent = error.message;
    } else {
        $("settingsMessage").textContent = "Password updated successfully.";
        $("newPassword").value = "";
    }
};

$("loadSalaryBtn").onclick = loadSalary;

$("salaryMonth").value = new Date().toISOString().slice(0, 7);
$("mileDate").value = today();
$("paymentDate").value = today();

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    $("loginMessage").textContent = "Please wait...";

    try {
        await login(
            $("loginEmail").value.trim(),
            $("loginPassword").value
        );
    } catch (error) {
        console.error(error);
        $("loginMessage").textContent = error.message || "Login failed";
    }
});

$("logoutBtn").onclick = async () => {
    await sb.auth.signOut();
    user = null;
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
};

async function initialize() {
    if (!SUPABASE_URL || !SUPABASE_KEY ||
        SUPABASE_KEY.includes("PASTE") ||
        !SUPABASE_URL.startsWith("https://")) {
        $("loginMessage").textContent =
            "Supabase configuration is missing. Check supabase-config.js";
        return;
    }

    try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        const { data } = await sb.auth.getSession();

        if (data.session?.user) {
            user = data.session.user;
            await loadCloudData();
            showApp();
        }
    } catch (error) {
        console.error("Initialization error:", error);
        $("loginMessage").textContent = error.message;
    }
}

initialize();
