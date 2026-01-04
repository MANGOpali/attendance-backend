// public/script.js
// Attendance app frontend with role-based UI polish, error messaging, and hardened auth

let currentLang = "en";
const LATE_AFTER = "10:15"; // cutoff HH:MM 24h

// Centralized auth state
let authToken = localStorage.getItem('authToken') || null;
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let _handling401 = false;

// Clear auth and refresh UI
function clearAuthState() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('session');
  try { if (typeof refreshUI === 'function') refreshUI(); } catch(e) {}
}

// Prompt login modal on 401
function promptReLogin() {
  if (_handling401) return;
  _handling401 = true;
  setTimeout(() => {
    try {
      if (typeof openAuthModal === 'function') openAuthModal('login');
      else { alert('Session expired. Please log in again.'); location.reload(); }
    } finally { _handling401 = false; }
  }, 120);
}

// Centralized fetch with token and 401 handling
async function apiFetch(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (!(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (!authToken) {
    authToken = localStorage.getItem('authToken') || authToken;
    currentUser = JSON.parse(localStorage.getItem('currentUser') || JSON.stringify(currentUser));
  }
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

  const res = await fetch('/api' + path, Object.assign({}, opts, { headers, credentials: 'same-origin' }));

  if (res.status === 401) {
    clearAuthState();
    // Only prompt re-login if user was logged in before
    if (currentUser) {
      promptReLogin();
    }
    throw new Error('Missing authorization header');
  }

  if (!res.ok) {
    let errText = res.statusText || 'API error';
    try {
      const body = await res.json();
      errText = body && (body.error || body.message) ? (body.error || body.message) : errText;
    } catch (e) {}
    throw new Error(errText);
  }

  try { return await res.json(); } catch (e) { return null; }
}


// CSV download (blob flow)
async function downloadAttendanceCsv(dateBS) {
  const token = localStorage.getItem('authToken');
  const url = '/api/attendance/export' + (dateBS ? '?date_bs=' + encodeURIComponent(dateBS) : '');
  const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
  if (res.status === 401) { clearAuthState(); promptReLogin(); throw new Error('Missing authorization header'); }
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: res.statusText }));
    throw new Error(err.error || 'Export failed');
  }
  const blob = await res.blob();
  const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || `attendance_${dateBS || 'all'}.csv`;
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObj; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(urlObj);
}

// Link employee to user
async function linkEmployeeToUser(empId, userEmail) {
  await apiFetch(`/employees/${empId}/link`, { method: 'POST', body: JSON.stringify({ user_email: userEmail }) });
}

$(document).ready(function () {
  // Cache DOM
  const $empName = $("#empName");
  const $empSelect = $("#empSelect");
  const $nepaliDate = $("#nepaliDate");
  const $table = $("#attendanceTable");
  const $loginBtn = $("#loginBtn");
  const $logoutBtn = $("#logoutBtn");
  const $currentUserDisplay = $("#currentUserDisplay");
  const $authModal = $("#authModal");
  const $authTitle = $("#authTitle");
  const $loginForm = $("#loginForm");
  const $registerForm = $("#registerForm");
  const $showRegister = $("#showRegister");
  const $showLogin = $("#showLogin");
  const $closeAuth = $("#closeAuth");
  const $addEmpBtn = $("#addEmpBtn");
  const $exportBtn = $("#exportBtn");
  const $markBtn = $("#markBtn");
  const $langBtn = $("#langBtn");

  let employees = [];
  let attendance = [];

  // Helpers
  function format12Hour(dateObj) {
    let h = dateObj.getHours();
    let m = dateObj.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; h = h ? h : 12;
    m = m < 10 ? "0" + m : m;
    return h + ":" + m + " " + ampm;
  }
  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const s = timeStr.trim();
    const ampm = s.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = parseInt(ampm[2], 10);
      const A = ampm[3].toUpperCase();
      if (A === "PM" && h !== 12) h += 12;
      if (A === "AM" && h === 12) h = 0;
      return h * 60 + m;
    }
    const hm = s.match(/(\d{1,2}):(\d{2})/);
    if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
    return 0;
  }
  function getStatusFromTimeString(timeStr) {
    const minutes = parseTimeToMinutes(timeStr);
    const cutoff = parseTimeToMinutes(LATE_AFTER);
    return minutes <= cutoff ? "Present" : "Late";
  }

  // UI renderers
  function renderEmployees() {
    $empSelect.empty();
    employees.forEach(e => $empSelect.append(`<option value="${e.id}">${e.name}</option>`));
    $("#totalEmp").text(currentLang === "en" ? "Total: " + employees.length : "कुल: " + employees.length);
    // If Employee, preselect linked employee
    if (currentUser && currentUser.role === 'Employee') {
      const own = employees.find(e => e.linked_user_id === currentUser.id);
      if (own) $empSelect.val(own.id);
    }
  }

  function renderAttendance() {
    $table.empty();
    const date = $nepaliDate.val();
    const rows = date ? attendance.filter(a => a.date_bs === date) : attendance.slice();
    rows.forEach(a => {
      const emp = employees.find(e => String(e.id) === String(a.employee_id));
      const statusClass = a.status === "Present" ? "status-present" : (a.status === "Late" ? "status-late" : "status-absent");
      const marker = a.marked_by ? `ID ${a.marked_by}` : "System";
      $table.append(`
        <tr>
          <td>${emp ? emp.name : a.employee_id}</td>
          <td>${a.date_bs}</td>
          <td>${a.time_display}</td>
          <td class="${statusClass}">${a.status}</td>
          <td>${marker}</td>
        </tr>
      `);
    });
  }

  function updateDashboard() {
    const date = $nepaliDate.val();
    let p = 0, l = 0;
    employees.forEach(e => {
      const log = attendance.find(a => String(a.employee_id) === String(e.id) && a.date_bs === date);
      if (log) { if (log.status === "Present") p++; else l++; }
    });
    $("#presentToday").text("🟢 " + p);
    $("#lateToday").text("🟡 " + l);
    $("#absentToday").text("🔴 " + (employees.length - p - l));
  }

  // Nepali datepicker init
  function initNepaliPicker() {
    if (!$nepaliDate.length) return;
    try {
      if ($.fn && $.fn.nepaliDatePicker) {
        $nepaliDate.nepaliDatePicker({
          ndpYear: true,
          ndpMonth: true,
          ndpYearCount: 100,
          onChange: function (bsDate) {
            if (bsDate) {
              $nepaliDate.val(bsDate);
              localStorage.setItem('selectedBSDate', bsDate);
            }
            loadAttendanceForDate(bsDate).catch(()=>{});
          }
        });
        return;
      }
    } catch (e) { console.warn("jQuery init failed:", e); }
    try {
      if (window.NepaliDatePicker) {
        new NepaliDatePicker({
          target: document.querySelector("#nepaliDate"),
          ndpYear: true,
          ndpMonth: true,
          ndpYearCount: 100,
          onChange: function (bsDate) {
            const el = document.querySelector("#nepaliDate");
            if (el && bsDate) {
              el.value = bsDate;
              localStorage.setItem('selectedBSDate', bsDate);
            }
            loadAttendanceForDate(bsDate).catch(()=>{});
          }
        });
        return;
      }
    } catch (e) { console.warn("Vanilla init failed:", e); }
    $nepaliDate.prop("readonly", false);
    $nepaliDate.attr("placeholder", "YYYY-MM-DD (BS)");
  }

  initNepaliPicker();

  // Restore saved date and initial load
  (function restoreDateAndLoad() {
    const saved = localStorage.getItem('selectedBSDate') || '';
    if (saved) $nepaliDate.val(saved);
    loadEmployees().catch(()=>{});
    loadAttendanceForDate(saved).catch(()=>{});
  })();

  // API calls
  async function loadEmployees() {
    try {
      const rows = await apiFetch('/employees', { method: 'GET' });
      employees = rows || [];
      renderEmployees();
      refreshUI(); // ensure role-based state uses latest employees for Employee role
    } catch (err) {
      console.error('loadEmployees', err);
    }
  }

  async function loadAttendanceForDate(dateBS) {
    try {
      const url = dateBS ? `/attendance?date_bs=${encodeURIComponent(dateBS)}` : '/attendance';
      const rows = await apiFetch(url, { method: 'GET' });
      attendance = rows || [];
      renderAttendance();
      updateDashboard();
    } catch (err) {
      console.error('loadAttendanceForDate', err);
    }
  }

  async function markAttendanceOnServer(empId, dateBS) {
    try {
      const now = new Date();
      const payload = {
        employee_id: Number(empId),
        date_bs: dateBS,
        date_ad: now.toISOString().slice(0,10),
        time_iso: now.toTimeString().split(' ')[0],
        time_display: format12Hour(now),
        status: getStatusFromTimeString(format12Hour(now))
      };
      await apiFetch('/attendance', { method: 'POST', body: JSON.stringify(payload) });
      await loadAttendanceForDate(dateBS);
    } catch (err) {
      console.error(err);
      const msg = currentLang==="en" ? "Could not mark attendance: " + err.message : "हाजिरी लगाउन सकिएन: " + err.message;
      alert(msg);
    }
  }

  // 🎨 Role-based UI polish: show but disable buttons where not allowed
  function refreshUI() {
    const user = currentUser;
    if (user) { $currentUserDisplay.text(`${user.name} (${user.role})`); $loginBtn.hide(); $logoutBtn.show(); }
    else { $currentUserDisplay.text(currentLang === "en" ? "Not signed in" : "साइन इन गरिएको छैन"); $loginBtn.show(); $logoutBtn.hide(); }

    const role = user ? user.role : null;

    // Add Employee
    if (role === "Admin") { $addEmpBtn.show().prop("disabled", false).attr("title",""); }
    else { $addEmpBtn.show().prop("disabled", true).attr("title", currentLang==="en"?"Only Admin can add":"केवल एडमिनले थप्न सक्छ"); }

    // Export
    if (role === "Admin" || role === "Manager") { $exportBtn.show().prop("disabled", false).attr("title",""); }
    else { $exportBtn.show().prop("disabled", true).attr("title", currentLang==="en"?"Only Admin/Manager can export":"केवल एडमिन/म्यानेजरले निर्यात गर्न सक्छ"); }

    // Mark attendance
    if (role) { $markBtn.show().prop("disabled", false).attr("title",""); }
    else { $markBtn.show().prop("disabled", true).attr("title", currentLang==="en"?"Login required":"लगइन आवश्यक"); }

    renderEmployees();
    renderAttendance();
    updateDashboard();
  }

  // UI actions
  $addEmpBtn.on("click", async () => {
    if (!currentUser || currentUser.role !== "Admin") {
      const msg = currentLang==="en" ? "Only Admin can add employees" : "केवल एडमिनले कर्मचारी थप्न सक्छ";
      alert(msg); return;
    }
    const name = $empName.val().trim();
    if (!name) return;
    try {
      await apiFetch('/employees', { method: 'POST', body: JSON.stringify({ name }) });
      $empName.val('');
      await loadEmployees();
      const msg = currentLang==="en" ? "Employee added" : "कर्मचारी थपियो";
      alert(msg);
    } catch (err) {
      console.error(err);
      const msg = currentLang==="en" ? "Could not add employee: " + err.message : "कर्मचारी थप्न सकेन: " + err.message;
      alert(msg);
    }
  });

  $markBtn.on("click", async () => {
    if (!authToken) { alert(currentLang==="en"?"Please login":"कृपया लगइन गर्नुहोस्"); return; }
    const empId = $empSelect.val();
    const date = $nepaliDate.val();
    if (!empId || !date) { alert(currentLang === "en" ? "Select employee & date" : "कर्मचारी र मिति छान्नुहोस्"); return; }
    try { await markAttendanceOnServer(empId, date); }
    catch (e) { console.error(e); }
  });

  $exportBtn.on("click", async () => {
    const role = currentUser ? currentUser.role : null;
    if (!(role === 'Admin' || role === 'Manager')) {
      alert(currentLang==="en"?"Only Admin/Manager can export":"केवल एडमिन/म्यानेजरले निर्यात गर्न सक्छ"); return;
    }
    try {
      const date = $nepaliDate.val();
      await downloadAttendanceCsv(date || '');
    } catch (err) {
      console.error(err);
      const msg = currentLang==="en" ? "Export failed: " + err.message : "निर्यात असफल भयो: " + err.message;
      alert(msg);
    }
  });

  // Double-click to link employee to user (Admin)
  $empSelect.on("dblclick", async () => {
    if (!currentUser || currentUser.role !== "Admin") {
      alert(currentLang==="en"?"Only Admin can link employees":"केवल एडमिनले कर्मचारी लिंक गर्न सक्छ"); return;
    }
    const empId = $empSelect.val();
    if (!empId) return;
    const email = prompt(currentLang === "en" ? "Enter user email to link this employee to (existing user):" : "यो कर्मचारीलाई लिंक गर्न प्रयोगकर्ता इमेल प्रविष्ट गर्नुहोस् (अवस्थित प्रयोगकर्ता):");
    if (!email) return;
    try {
      await linkEmployeeToUser(empId, email);
      alert(currentLang==="en"?"Linked":"लिङ्क गरियो");
      await loadEmployees();
    } catch (err) {
      console.error(err);
      const msg = currentLang==="en" ? "Link failed: " + err.message : "लिङ्क असफल भयो: " + err.message;
      alert(msg);
    }
  });

  // Auth modal + flows
  $loginBtn.on("click", () => { openAuthModal('login'); });
  $showRegister.on("click", (e) => { e.preventDefault(); openAuthModal('register'); });
  $showLogin.on("click", (e) => { e.preventDefault(); openAuthModal('login'); });
  $closeAuth.on("click", () => closeAuthModal());

  function openAuthModal(mode) {
    if (mode === "login") { $authTitle.text(currentLang === "en" ? "Login" : "लगइन"); $loginForm.show(); $registerForm.hide(); }
    else { $authTitle.text(currentLang === "en" ? "Register" : "दर्ता"); $loginForm.hide(); $registerForm.show(); }
    $authModal.show();
  }
  function closeAuthModal() {
    $authModal.hide();
    $("#loginEmail, #loginPassword, #regName, #regEmail, #regPassword").val("");
  }

  $("#doRegister").on("click", async () => {
    const name = $("#regName").val().trim();
    const email = $("#regEmail").val().trim();
    const password = $("#regPassword").val();
    const role = $("#regRole").val();
    if (!name || !email || !password) { alert(currentLang==="en"?"Fill all fields":"सबै फिल्ड भर्नुहोस्"); return; }
    try {
      await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      authToken = data.token; currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      closeAuthModal();
      await loadEmployees();
      await loadAttendanceForDate($nepaliDate.val());
      refreshUI();
    } catch (err) {
      console.error(err);
      alert(currentLang==="en" ? err.message : ("त्रुटि: " + err.message));
    }
  });

  $("#doLogin").on("click", async () => {
    const email = $("#loginEmail").val().trim();
    const password = $("#loginPassword").val();
    if (!email || !password) { alert(currentLang==="en"?"Enter credentials":"प्रमाणपत्र प्रविष्ट गर्नुहोस्"); return; }
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      authToken = data.token; currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      closeAuthModal();
      await loadEmployees();
      await loadAttendanceForDate($nepaliDate.val());
      refreshUI();
    } catch (err) {
      console.error(err);
      alert(currentLang==="en" ? err.message : ("त्रुटि: " + err.message));
    }
  });

  $logoutBtn.on("click", () => { clearAuthState(); refreshUI(); });

  // Date change save + reload
  $nepaliDate.off("change.selectedDate").on("change.selectedDate input.selectedDate", function () {
    const d = $(this).val();
    if (d) localStorage.setItem('selectedBSDate', d);
    else localStorage.removeItem('selectedBSDate');
    loadAttendanceForDate(d).catch(()=>{});
  });

  // Language toggle
  $langBtn.on("click", () => {
    currentLang = currentLang === "en" ? "ne" : "en";
    applyLanguage();
    refreshUI();
  });

  function applyLanguage() {
    const isEN = currentLang === "en";
    $("#title").text(isEN ? "Attendance System" : "हाजिरी प्रणाली");
    $("#empHeader").text(isEN ? "Employee" : "कर्मचारी");
    $("#attHeader").text(isEN ? "Attendance" : "हाजिरी");
    $("#addEmpBtn").text(isEN ? "Add Employee" : "कर्मचारी थप्नुहोस्");
    $("#markBtn").text(isEN ? "Mark Attendance" : "हाजिरी चिन्ह लगाउनुहोस्");
    $("#exportBtn").text(isEN ? "Export CSV" : "CSV निर्यात");
    $("#loginBtn").text(isEN ? "Login" : "लगइन");
    $("#logoutBtn").text(isEN ? "Logout" : "लगआउट");
    $("#noAccountText").html(isEN ? "Don't have an account? <a href='#' id='showRegister'>Register</a>" : "खाता छैन? <a href='#' id='showRegister'>दर्ता गर्नुहोस्</a>");
    $("#haveAccountText").html(isEN ? "Already have an account? <a href='#' id='showLogin'>Login</a>" : "पहिले नै खाता छ? <a href='#' id='showLogin'>लगइन</a>");
    $("#regRole").find("option[value='Employee']").text(isEN ? "Employee" : "कर्मचारी");
    $("#regRole").find("option[value='Manager']").text(isEN ? "Manager" : "प्रबन्धक");
    $("#regRole").find("option[value='Admin']").text(isEN ? "Admin" : "प्रशासक");
    $("#roleLabel").text(isEN ? "Role" : "भूमिका");
    $("#totalEmp").text(isEN ? "Total: " + employees.length : "कुल: " + employees.length);
  }

  // Initial UI render
  applyLanguage();
  refreshUI();
});
