const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwYtdHJDm0ACpVEne9kGsRc6d-8J7g_XRFB0R9D9M-QKEXSrJT7JkY9bYHEJxu0tncr/exec";

let serialPort, reader;
let waitingForCard = false;
let pendingAmount = 0;
let currentAction = "";
let uidBuffer = "";
let displayValue = "0";
let isLoggedIn = false;
let currentUserRole = "";
let currentStaffName = "";
let pendingUID = "";
let pendingUserImage = "";

// Cache ข้อมูลในหน่วยความจำเพื่อลดการเรียก API
let walletDataCache = { users: [] };

// ข้อมูลบัญชีพนักงาน
const STAFF_ACCOUNTS = [
  {
    idCard: "1111111111111",
    laserCode: "AA1111111111",
    role: "seller",
    name: "พนักงานขาย"
  },
  {
    idCard: "9999999999999",
    laserCode: "AA9999999999",
    role: "admin",
    name: "ผู้ดูแลระบบ"
  }
];

// ฟังก์ชันโหลดข้อมูลจาก Google Sheets
async function loadData() {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL);
    const result = await response.json();
    
    if (result.status === "success") {
      walletDataCache.users = result.users;
      console.log("✅ โหลดข้อมูลสำเร็จ:", result.users.length, "users");
      return walletDataCache;
    } else {
      console.error("❌ โหลดข้อมูลล้มเหลว:", result.message);
      return walletDataCache;
    }
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการโหลดข้อมูล:", error);
    return walletDataCache;
  }
}

// ฟังก์ชันบันทึกข้อมูลผู้ใช้
async function saveUser(userData) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "saveUser",
        uid: userData.uid,
        idCard: userData.idCard || "",
        name: userData.name || "",
        phone: userData.phone || "",
        credit: userData.credit || 0,
        image: userData.image || ""
      })
    });
    
    const result = await response.json();
    
    if (result.status === "success") {
      console.log("✅ บันทึกข้อมูลสำเร็จ");
      await loadData();
      return true;
    } else {
      console.error("❌ บันทึกข้อมูลล้มเหลว:", result.message);
      return false;
    }
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล:", error);
    return false;
  }
}

// ฟังก์ชันอัพเดทเครดิต
async function updateCredit(uid, amount) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "updateCredit",
        uid: uid,
        amount: amount,
        staffName: currentStaffName,
        transactionType: amount > 0 ? "เติมเงิน" : "ซื้อของ"
      })
    });
    
    const result = await response.json();
    
    if (result.status === "success") {
      console.log("✅ อัพเดทเครดิตสำเร็จ");
      await loadData();
      return result.credit;
    } else {
      console.error("❌ อัพเดทเครดิตล้มเหลว:", result.message);
      return null;
    }
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการอัพเดทเครดิต:", error);
    return null;
  }
}

// ฟังก์ชันดึงประวัติรายการ
async function getTransactionHistory(uid) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL + "?action=getHistory&uid=" + uid);
    const result = await response.json();
    
    if (result.status === "success") {
      return result.transactions || [];
    } else {
      console.error("❌ ดึงประวัติล้มเหลว:", result.message);
      return [];
    }
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการดึงประวัติ:", error);
    return [];
  }
}

// ฟังก์ชันดึงรายได้ในเดือนนี้
async function getMonthlyRevenue() {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL + "?action=getMonthlyRevenue");
    const result = await response.json();
    
    if (result.status === "success") {
      return result.data;
    } else {
      console.error("❌ ดึงรายได้ล้มเหลว:", result.message);
      return null;
    }
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการดึงรายได้:", error);
    return null;
  }
}

// โหลดข้อมูลเมื่อเริ่มต้น
loadData();

// ฟังก์ชันตรวจสอบยอดเงิน (สำหรับผู้ใช้งานทั่วไป) - ค้นหาด้วยเลขบัตรประชาชน
async function checkBalanceByIdCard() {
  const idCard = document.getElementById("check-id-card").value.trim();
  const errorEl = document.getElementById("check-error");
  const resultEl = document.getElementById("balance-result");
  
  if (idCard.length !== 13) {
    errorEl.textContent = "⚠️ กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก";
    resultEl.style.display = "none";
    return;
  }
  
  errorEl.textContent = "⏳ กำลังตรวจสอบ...";
  
  let data = await loadData();
  let user = data.users.find(u => u.idCard === idCard);
  
  if (!user) {
    errorEl.textContent = "❌ ไม่พบข้อมูล กรุณาเติมเงินก่อนใช้งาน";
    resultEl.style.display = "none";
  } else {
    errorEl.textContent = "";
    document.getElementById("result-name").textContent = user.name || "ไม่ระบุชื่อ";
    document.getElementById("result-balance").textContent = user.credit.toLocaleString() + " บาท";
    document.getElementById("result-uid").textContent = "UID: " + user.uid;
    resultEl.style.display = "block";
    resultEl.classList.add('fade-in');
    setTimeout(() => resultEl.classList.remove('fade-in'), 400);
  }
}

// ฟังก์ชันตรวจสอบการเข้าสู่ระบบ
function checkLogin() {
  const idCard = document.getElementById("id-card-input").value.trim();
  const laserCode = document.getElementById("laser-code-input").value.trim();
  const errorEl = document.getElementById("login-error");
  
  if (idCard.length !== 13) {
    errorEl.textContent = "⚠️ กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก";
    return;
  }
  
  if (laserCode.length !== 12) {
    errorEl.textContent = "⚠️ กรุณากรอกรหัสหลังบัตรให้ครบ 12 หลัก";
    return;
  }
  
  const staff = STAFF_ACCOUNTS.find(s => s.idCard === idCard && s.laserCode === laserCode);
  
  if (staff) {
    isLoggedIn = true;
    currentUserRole = staff.role;
    errorEl.textContent = "";
    
    const loginPage = document.getElementById("page-login");
    const selectPage = document.getElementById("page-select");
    
    loginPage.classList.add('fade-out');
    
    setTimeout(() => {
      loginPage.style.display = "none";
      selectPage.style.display = "flex";
      selectPage.classList.add('fade-in');
      
      createMenuByRole(staff.role, staff.name);
      
      document.getElementById("id-card-input").value = "";
      document.getElementById("laser-code-input").value = "";
      
      setTimeout(() => {
        loginPage.classList.remove('fade-out');
        selectPage.classList.remove('fade-in');
      }, 400);
    }, 400);
  } else {
    errorEl.textContent = "❌ เลขบัตรประชาชนหรือรหัสหลังบัตรไม่ถูกต้อง";
    
    const loginForm = document.querySelector(".login-form");
    loginForm.style.animation = 'shake 0.5s';
    setTimeout(() => {
      loginForm.style.animation = '';
    }, 500);
  }
}

function createMenuByRole(role, staffName) {
  currentStaffName = staffName;
  const actionButtonsEl = document.getElementById("action-buttons");
  const badgeEl = document.getElementById("staff-badge");
  const titleEl = document.getElementById("staff-title");
  const roleEl = document.getElementById("staff-role");
  
  actionButtonsEl.innerHTML = "";
  
  if (role === "seller") {
    badgeEl.textContent = "🛒";
    titleEl.textContent = "SELLER PANEL";
    roleEl.textContent = `ผู้ขาย - ${staffName}`;
    
    actionButtonsEl.innerHTML = `
      <button class="btn-action minus" data-action-type="minus">
        <div class="btn-icon">-</div>
        <div class="btn-text">หักเงิน</div>
        <div class="btn-label">DEDUCT</div>
      </button>
      
      <button class="btn-action check" data-action-type="check">
        <div class="btn-icon">🔍</div>
        <div class="btn-text">ตรวจสอบข้อมูล</div>
        <div class="btn-label">CHECK INFO</div>
      </button>
    `;
  } else if (role === "admin") {
    badgeEl.textContent = "👑";
    titleEl.textContent = "ADMIN PANEL";
    roleEl.textContent = `ผู้ดูแล - ${staffName}`;
    
    actionButtonsEl.innerHTML = `
      <button class="btn-action add" data-action-type="add">
        <div class="btn-icon">+</div>
        <div class="btn-text">เติมเงิน</div>
        <div class="btn-label">ADD CREDIT</div>
      </button>
      
      <button class="btn-action minus" data-action-type="minus">
        <div class="btn-icon">-</div>
        <div class="btn-text">หักเงิน</div>
        <div class="btn-label">DEDUCT</div>
      </button>
      
      <button class="btn-action register" data-action-type="register">
        <div class="btn-icon">👤</div>
        <div class="btn-text">เพิ่มสมาชิก</div>
        <div class="btn-label">ADD MEMBER</div>
      </button>
      
      <button class="btn-action check" data-action-type="check">
        <div class="btn-icon">🔍</div>
        <div class="btn-text">ตรวจสอบข้อมูล</div>
        <div class="btn-label">CHECK INFO</div>
      </button>
      
      <button class="btn-action revenue" data-action-type="revenue">
        <div class="btn-icon">💰</div>
        <div class="btn-text">รายได้เดือนนี้</div>
        <div class="btn-label">MONTHLY REVENUE</div>
      </button>
    `;
  }
  
  document.querySelectorAll('[data-action-type]').forEach(btn => {
    btn.addEventListener('click', function() {
      const actionType = this.getAttribute('data-action-type');
      if (actionType === 'check') {
        startCheckInfo();
      } else if (actionType === 'register') {
        startRegisterMember();
      } else if (actionType === 'revenue') {
        showMonthlyRevenue();
      } else {
        chooseAction(actionType);
      }
    });
  });
}

function logout() {
  isLoggedIn = false;
  currentUserRole = "";
  
  const homePage = document.getElementById("page-home");
  const selectPage = document.getElementById("page-select");
  
  selectPage.classList.add('fade-out');
  
  setTimeout(() => {
    selectPage.style.display = "none";
    homePage.style.display = "flex";
    homePage.classList.add('fade-in');
    
    setTimeout(() => {
      selectPage.classList.remove('fade-out');
      homePage.classList.remove('fade-in');
    }, 400);
  }, 400);
}

function startCheckInfo() {
  currentAction = "check";
  
  const selectPage = document.getElementById("page-select");
  selectPage.style.display = "none";
  
  // Reset overlay components ก่อนแสดง
  document.getElementById("customer-info").style.display = "none";
  document.getElementById("scan-animation").style.display = "flex";
  document.getElementById("overlay-text").style.display = "block";
  document.getElementById("result-icon").innerHTML = "";
  
  showOverlay("⏳ กำลังรอสแกนบัตร...\nPlease scan your card", "waiting");
  waitingForCard = true;
  uidBuffer = "";
}

function startRegisterMember() {
  currentAction = "register";
  
  const selectPage = document.getElementById("page-select");
  selectPage.style.display = "none";
  
  // Reset overlay components
  document.getElementById("customer-info").style.display = "none";
  document.getElementById("scan-animation").style.display = "flex";
  document.getElementById("overlay-text").style.display = "block";
  document.getElementById("result-icon").innerHTML = "";
  
  showOverlay("⏳ กำลังรอสแกนบัตร...\nPlease scan card to register", "waiting");
  waitingForCard = true;
  uidBuffer = "";
}

async function showCustomerInfo(uid) {
  let data = await loadData();
  let user = data.users.find(u => u.uid === uid);
  
  if (!user) {
    showOverlay(
      `✕ ไม่พบข้อมูล\nCard Not Found\n\nUID: ${uid}\n\nกรุณาเติมเงินก่อนใช้งาน`,
      "error"
    );
    setTimeout(() => {
      hideOverlay();
      document.getElementById("page-select").style.display = "flex";
    }, 3000);
  } else {
    // ดึงประวัติรายการ
    const transactions = await getTransactionHistory(uid);
    
    document.getElementById("scan-animation").style.display = "none";
    document.getElementById("overlay-text").style.display = "none";
    
    const customerInfo = document.getElementById("customer-info");
    
    // แสดงข้อมูลพื้นฐาน
    let infoHTML = `
      <div class="info-section">
        <div class="info-section-title">ข้อมูลสมาชิก</div>
        <div class="info-row">
          <span class="info-label">UID:</span>
          <span class="info-value">${user.uid}</span>
        </div>
        <div class="info-row">
          <span class="info-label">บัตรประชาชน:</span>
          <span class="info-value">${user.idCard || "ไม่ระบุ"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ชื่อ:</span>
          <span class="info-value">${user.name || "ไม่ระบุชื่อ"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">เบอร์โทร:</span>
          <span class="info-value">${user.phone || "ไม่ระบุ"}</span>
        </div>
        <div class="info-row highlight">
          <span class="info-label">ยอดเงินคงเหลือ:</span>
          <span class="info-value">${user.credit.toLocaleString()} บาท</span>
        </div>
      </div>
    `;
    
    // แสดงประวัติรายการ
    if (transactions.length > 0) {
      infoHTML += `
        <div class="info-section">
          <div class="info-section-title">ประวัติรายการ (5 รายการล่าสุด)</div>
          <div class="transaction-list">
      `;
      
      transactions.slice(0, 5).forEach(trans => {
        const isAdd = trans.amount > 0;
        const amountClass = isAdd ? "amount-add" : "amount-minus";
        const icon = isAdd ? "+" : "-";
        
        infoHTML += `
          <div class="transaction-item">
            <div class="trans-header">
              <span class="trans-type">${trans.type}</span>
              <span class="trans-amount ${amountClass}">${icon}${Math.abs(trans.amount).toLocaleString()} บาท</span>
            </div>
            <div class="trans-details">
              <span class="trans-staff">พนักงาน: ${trans.staffName}</span>
              <span class="trans-date">${new Date(trans.timestamp).toLocaleString('th-TH')}</span>
            </div>
          </div>
        `;
      });
      
      infoHTML += `
          </div>
        </div>
      `;
    }
    
    infoHTML += `<button class="btn-close-overlay" id="close-overlay-btn-dynamic">ปิด</button>`;
    
    customerInfo.innerHTML = infoHTML;
    customerInfo.style.display = "block";
    customerInfo.classList.add('fade-in');
    
    // เพิ่ม event listener ให้ปุ่มปิด
    document.getElementById("close-overlay-btn-dynamic").addEventListener('click', function() {
      hideOverlay();
      document.getElementById("page-select").style.display = "flex";
      waitingForCard = false;
      currentAction = "";
      uidBuffer = "";
    });
    
    setTimeout(() => customerInfo.classList.remove('fade-in'), 400);
  }
  
  waitingForCard = false;
  uidBuffer = "";
}

function updateDisplay() {
  const displayEl = document.getElementById("display");
  displayEl.innerText = displayValue;
  
  displayEl.classList.remove('animate-in');
  void displayEl.offsetWidth;
  displayEl.classList.add('animate-in');
  
  setTimeout(() => {
    displayEl.classList.remove('animate-in');
  }, 300);
}

function inputNumber(num) {
  if (displayValue === "0") {
    displayValue = num;
  } else {
    if (displayValue.length < 10) {
      displayValue += num;
    }
  }
  updateDisplay();
}

function deleteNumber() {
  const displayEl = document.getElementById("display");
  
  displayEl.classList.add('animate-delete');
  
  setTimeout(() => {
    if (displayValue.length > 1) {
      displayValue = displayValue.slice(0, -1);
    } else {
      displayValue = "0";
    }
    displayEl.classList.remove('animate-delete');
    updateDisplay();
  }, 100);
}

function clearDisplay() {
  displayValue = "0";
  updateDisplay();
}

function chooseAction(action) {
  currentAction = action;
  displayValue = "0";
  
  const selectPage = document.getElementById("page-select");
  const amountPage = document.getElementById("page-amount");
  
  selectPage.classList.add('fade-out');
  selectPage.style.display = "none";
  amountPage.style.display = "flex";
  amountPage.classList.add('fade-in');
  
  document.getElementById("amount-title").innerText = action === "add" ? "เติมเงิน / ADD CREDIT" : "หักเงิน / DEDUCT";
  updateDisplay();
  
  setTimeout(() => {
    selectPage.classList.remove('fade-out');
    amountPage.classList.remove('fade-in');
  }, 400);
}

function goBackToSelect() {
  const selectPage = document.getElementById("page-select");
  const amountPage = document.getElementById("page-amount");
  
  amountPage.classList.add('fade-out');
  amountPage.style.display = "none";
  selectPage.style.display = "flex";
  selectPage.classList.add('fade-in');
  
  displayValue = "0";
  
  setTimeout(() => {
    amountPage.classList.remove('fade-out');
    selectPage.classList.remove('fade-in');
  }, 400);
}

function confirmAmount() {
  const amount = Number(displayValue);
  if (!amount || amount <= 0) {
    const amountPage = document.getElementById("page-amount");
    amountPage.style.animation = 'shake 0.4s';
    setTimeout(() => {
      amountPage.style.animation = '';
    }, 400);
    return;
  }

  pendingAmount = amount;
  
  const amountPage = document.getElementById("page-amount");
  amountPage.classList.add('fade-out');
  amountPage.style.display = "none";
  
  if (currentAction === "add") {
    startScanAdd();
  } else if (currentAction === "minus") {
    startScanMinus();
  }
  
  setTimeout(() => {
    amountPage.classList.remove('fade-out');
  }, 400);
}

function showOverlay(text, type = "waiting") {
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");
  const scanAnimation = document.getElementById("scan-animation");
  const resultIcon = document.getElementById("result-icon");
  const customerInfo = document.getElementById("customer-info");
  const spinner = document.getElementById("spinner"); // เพิ่ม
  
  customerInfo.style.display = "none";
  overlayText.style.display = "block";
  
  overlayText.innerText = text;
  overlay.className = "";
  
  if (type === "completed") {
    overlay.classList.add("completed");
    scanAnimation.style.display = "none";
    spinner.classList.remove("show"); // เพิ่ม
    resultIcon.innerHTML = '<div class="success-icon">✔</div>';
    resultIcon.style.display = "block";
  } else if (type === "error") {
    overlay.classList.add("error");
    scanAnimation.style.display = "none";
    spinner.classList.remove("show"); // เพิ่ม
    resultIcon.innerHTML = '<div class="error-icon">✕</div>';
    resultIcon.style.display = "block";
  } else if (type === "loading") { // เพิ่มส่วนนี้ทั้งหมด
    scanAnimation.style.display = "none";
    spinner.classList.add("show");
    resultIcon.style.display = "none";
    resultIcon.innerHTML = "";
  } else {
    scanAnimation.style.display = "flex";
    spinner.classList.remove("show"); // เพิ่ม
    resultIcon.style.display = "none";
    resultIcon.innerHTML = "";
  }
  
  overlay.classList.add("show");
}

function hideOverlay() {
  const overlay = document.getElementById("overlay");
  const spinner = document.getElementById("spinner"); // เพิ่ม
  
  overlay.classList.remove("show");
  spinner.classList.remove("show"); // เพิ่ม
  
  setTimeout(() => {
    document.getElementById("scan-animation").style.display = "flex";
    document.getElementById("result-icon").innerHTML = "";
    document.getElementById("customer-info").style.display = "none";
    document.getElementById("overlay-text").style.display = "block";
  }, 500);
}

function startScanMinus() {
  // Reset overlay components ก่อนแสดง
  document.getElementById("customer-info").style.display = "none";
  document.getElementById("scan-animation").style.display = "flex";
  document.getElementById("overlay-text").style.display = "block";
  document.getElementById("result-icon").innerHTML = "";
  
  showOverlay("⏳ กำลังรอสแกนบัตร...\nPlease scan your card", "waiting");
  waitingForCard = true;
  uidBuffer = "";
}

function startScanAdd() {
  // Reset overlay components ก่อนแสดง
  document.getElementById("customer-info").style.display = "none";
  document.getElementById("scan-animation").style.display = "flex";
  document.getElementById("overlay-text").style.display = "block";
  document.getElementById("result-icon").innerHTML = "";
  
  showOverlay("⏳ กำลังรอสแกนบัตร...\nPlease scan your card", "waiting");
  waitingForCard = true;
  uidBuffer = "";
}

function showNewUserModal(uid) {
  pendingUID = uid;
  pendingUserImage = "";
  hideOverlay();
  
  const modal = document.getElementById("new-user-modal");
  modal.style.display = "flex";
  modal.classList.add('fade-in');
  
  document.getElementById("new-user-idcard").value = "";
  document.getElementById("new-user-name").value = "";
  document.getElementById("new-user-phone").value = "";
  document.getElementById("new-user-amount").value = "";
  document.getElementById("new-user-image").value = "";
  document.getElementById("image-preview").style.display = "none";
  document.getElementById("new-user-error").textContent = "";
  
  // แสดง/ซ่อนฟิลด์จำนวนเงินตาม action
  const amountGroup = document.getElementById("amount-input-group");
  if (currentAction === "register") {
    amountGroup.style.display = "flex";
  } else {
    amountGroup.style.display = "none";
  }
  
  setTimeout(() => modal.classList.remove('fade-in'), 400);
}

function closeNewUserModal() {
  const modal = document.getElementById("new-user-modal");
  modal.classList.add('fade-out');
  
  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove('fade-out');
    
    document.getElementById("page-select").style.display = "flex";
    resetState();
  }, 400);
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) {
    pendingUserImage = "";
    document.getElementById("image-preview").style.display = "none";
    return;
  }
  
  // ตรวจสอบขนาดไฟล์ (จำกัดที่ 2MB)
  if (file.size > 2 * 1024 * 1024) {
    document.getElementById("new-user-error").textContent = "⚠️ ไฟล์ใหญ่เกินไป (สูงสุด 2MB)";
    event.target.value = "";
    return;
  }
  
  // ตรวจสอบประเภทไฟล์
  if (!file.type.startsWith('image/')) {
    document.getElementById("new-user-error").textContent = "⚠️ กรุณาเลือกไฟล์รูปภาพ";
    event.target.value = "";
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    pendingUserImage = e.target.result;
    const preview = document.getElementById("image-preview");
    preview.src = e.target.result;
    preview.style.display = "block";
    document.getElementById("new-user-error").textContent = "";
  };
  reader.readAsDataURL(file);
}

async function saveNewUser() {
  const idCard = document.getElementById("new-user-idcard").value.trim();
  const name = document.getElementById("new-user-name").value.trim();
  const phone = document.getElementById("new-user-phone").value.trim();
  const amountInput = document.getElementById("new-user-amount").value.trim();
  const errorEl = document.getElementById("new-user-error");
  
  // ตรวจสอบชื่อ (จำเป็น)
  if (!name) {
    errorEl.textContent = "⚠️ กรุณากรอกชื่อ-นามสกุล";
    return;
  }
  
  // ตรวจสอบเบอร์โทร (จำเป็น)
  if (!phone) {
    errorEl.textContent = "⚠️ กรุณากรอกเบอร์โทรศัพท์";
    return;
  }
  
  if (phone.length !== 10) {
    errorEl.textContent = "⚠️ กรุณากรอกเบอร์โทรให้ครบ 10 หลัก";
    return;
  }
  
  // จำนวนเงิน (ไม่จำเป็น)
  let credit = 0;
  if (currentAction === "register" && amountInput) {
    credit = Number(amountInput);
    if (isNaN(credit) || credit < 0) {
      errorEl.textContent = "⚠️ กรุณากรอกจำนวนเงินที่ถูกต้อง";
      return;
    }
  } else if (currentAction === "add") {
    credit = pendingAmount;
  }
  
  errorEl.textContent = "⏳ กำลังบันทึก...";
  
  const success = await saveUser({
    uid: pendingUID,
    idCard: idCard,
    name: name,
    phone: phone,
    credit: credit,
    image: pendingUserImage
  });
  
  if (success) {
    closeNewUserModal();
    
    let message = `✓ ลงทะเบียนสำเร็จ\nRegistration Complete\n\nUID: ${pendingUID}\nชื่อ: ${name}\nเบอร์: ${phone}`;
    
    if (credit > 0) {
      message += `\n\n+ ${credit.toLocaleString()} บาท\n\nยอดคงเหลือ: ${credit.toLocaleString()} บาท`;
    }
    
    showOverlay(message, "completed");
    
    setTimeout(() => {
      hideOverlay();
      document.getElementById("page-select").style.display = "flex";
      resetState();
    }, 3000);
  } else {
    errorEl.textContent = "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล";
  }
}

const thaiToEngMap = {
  'ไ': '1', '/' : '2', '-': '3', 'ภ': '4', 'ถ': '5', 
  'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0',
  'ๆ': '1', '่': '2', 'ำ': '3', 'พ': '4', 'ะ': '5',
  'ั': '6', 'ี': '7', 'ร': '8', 'น': '9', 'ย': '0',
  'ไ': 'q', 'ำ': 'w', 'พ': 'e', 'ะ': 'r', 'ั': 't',
  'ี': 'y', 'ร': 'u', 'น': 'i', 'ย': 'o', 'บ': 'p',
  'ฟ': 'a', 'ห': 'b', 'ก': 'c', 'ด': 'd', 'เ': 'e',
  '้': 'f', '่': 'g', 'า': 'h', 'ส': 'i', 'ว': 'j',
  'ง': 'k', 'ผ': 'l', 'ป': 'm', 'แ': 'n', 'อ': 'o',
  'ิ': 'p', 'ื': 'q', 'ท': 'r', 'ม': 's', 'ใ': 't',
  'ฝ': 'u', 'ู': 'v', 'ซ': 'w', 'ช': 'x', 'ๆ': 'y',
  'ฌ': 'z'
};

function convertThaiToEng(text) {
  return text.split('').map(char => thaiToEngMap[char] || char).join('');
}

document.addEventListener('keypress', function(e) {
  if (!waitingForCard) return;

  if (e.key === 'Enter') {
    if (uidBuffer.length > 0) {
      const uid = convertThaiToEng(uidBuffer.trim());
      console.log("อ่าน UID (ต้นฉบับ):", uidBuffer.trim());
      console.log("อ่าน UID (แปลงแล้ว):", uid);
      
      if (currentAction === "add") {
        handleCardAdd(uid);
      } else if (currentAction === "minus") {
        handleCardMinus(uid);
      } else if (currentAction === "check") {
        showCustomerInfo(uid);
      } else if (currentAction === "register") {
        handleCardRegister(uid);
      }
      
      uidBuffer = "";
    }
  } else {
    uidBuffer += e.key;
  }
});

async function handleCardRegister(uid) {
  let data = await loadData();
  let user = data.users.find(u => u.uid === uid);
  
  if (user) {
    showOverlay(
      `⚠️ บัตรนี้มีในระบบแล้ว\nCard Already Exists\n\nUID: ${uid}\nชื่อ: ${user.name}\nยอดเงิน: ${user.credit.toLocaleString()} บาท`,
      "error"
    );
    setTimeout(() => {
      hideOverlay();
      document.getElementById("page-select").style.display = "flex";
      resetState();
    }, 3000);
  } else {
    showNewUserModal(uid);
  }
}

async function handleCardAdd(uid) {
  let data = await loadData();
  let user = data.users.find(u => u.uid === uid);
  
  if (user) {
    const newCredit = await updateCredit(uid, pendingAmount);
    
    if (newCredit !== null) {
      showOverlay(
        `✓ รายการสำเร็จ\nTransaction Complete\n\nUID: ${uid}\nบัตรประชาชน: ${user.idCard}\n\n+ ${pendingAmount.toLocaleString()} บาท\n\nยอดคงเหลือ: ${newCredit.toLocaleString()} บาท`,
        "completed"
      );
    } else {
      showOverlay("✕ เกิดข้อผิดพลาด\nError", "error");
    }
    
    resetState();
  } else {
    showNewUserModal(uid);
  }
}

async function handleCardMinus(uid) {
  let data = await loadData();
  let user = data.users.find(u => u.uid === uid);
  
  if (!user) {
    showOverlay(
      `✕ ไม่พบข้อมูล\nCard Not Found\n\nUID: ${uid}\n\nกรุณาเติมเงินก่อนใช้งาน\nPlease add credit first`,
      "error"
    );
  } else {
    // อนุญาตให้เงินติดลบได้ (เซ็น)
    const newCredit = await updateCredit(uid, -pendingAmount);
    
    if (newCredit !== null) {
      let message = `✓ รายการสำเร็จ\nTransaction Complete\n\nUID: ${uid}\nบัตรประชาชน: ${user.idCard}\n\n- ${pendingAmount.toLocaleString()} บาท\n\nยอดคงเหลือ: ${newCredit.toLocaleString()} บาท`;
      
      // แจ้งเตือนถ้าเงินติดลบ (เซ็น)
      if (newCredit < 0) {
        message += `\n\n⚠️ เซ็นชื่อ ${Math.abs(newCredit).toLocaleString()} บาท`;
      }
      
      showOverlay(message, "completed");
    } else {
      showOverlay("✕ เกิดข้อผิดพลาด\nError", "error");
    }
  }

  resetState();
}

function resetState() {
  waitingForCard = false;
  pendingAmount = 0;
  currentAction = "";
  uidBuffer = "";
  displayValue = "0";
  pendingUID = "";

  setTimeout(() => {
    hideOverlay();
    
    const selectPage = document.getElementById("page-select");
    selectPage.style.display = "flex";
    selectPage.classList.add('slide-in-left');
    
    setTimeout(() => {
      selectPage.classList.remove('slide-in-left');
    }, 400);
  }, 3000);
}

async function showMonthlyRevenue() {
  const selectPage = document.getElementById("page-select");
  selectPage.style.display = "none";
  
  // เตรียม overlay
  document.getElementById("customer-info").style.display = "none";
  document.getElementById("scan-animation").style.display = "none";
  document.getElementById("overlay-text").style.display = "block";
  document.getElementById("result-icon").innerHTML = "";
  
  // แสดงหน้า loading พร้อม spinner
  showOverlay("⏳ กำลังโหลดข้อมูล...\nLoading Data...", "loading");
  
  // โหลดข้อมูล
  const data = await getMonthlyRevenue();
  
  // กรณีโหลดไม่สำเร็จ
  if (!data) {
    showOverlay("✕ เกิดข้อผิดพลาด\nError loading data", "error");
    setTimeout(() => {
      hideOverlay();
      selectPage.style.display = "flex";
    }, 2000);
    return;
  }
  
  // ⭐ ซ่อน loading spinner และ overlay text เมื่อโหลดเสร็จ
  document.getElementById("spinner").classList.remove("show");
  document.getElementById("scan-animation").style.display = "none";
  document.getElementById("overlay-text").style.display = "none";
  
  // แสดงข้อมูลรายได้
  const customerInfo = document.getElementById("customer-info");
  
  const currentDate = new Date();
  const monthName = currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  
  let infoHTML = `
    <div class="info-section">
      <div class="info-section-title">💰 รายได้ประจำเดือน ${monthName}</div>
      
      <div class="revenue-card total-revenue">
        <div class="revenue-label">รายได้รวมทั้งหมด</div>
        <div class="revenue-value">${data.totalRevenue.toLocaleString()} บาท</div>
        <div class="revenue-desc">Total Revenue</div>
      </div>
      
      <div class="revenue-card signed-amount">
        <div class="revenue-label">ยอดเซ็นชื่อ (เงินติดลบ)</div>
        <div class="revenue-value negative">${data.totalSigned.toLocaleString()} บาท</div>
        <div class="revenue-desc">Signed Amount (Negative Balance)</div>
      </div>
      
      <div class="revenue-card actual-revenue">
        <div class="revenue-label">รายได้สุทธิ</div>
        <div class="revenue-value positive">${data.actualRevenue.toLocaleString()} บาท</div>
        <div class="revenue-desc">Actual Revenue</div>
      </div>
    </div>
    
    <div class="info-section">
      <div class="info-section-title">📊 สถิติเพิ่มเติม</div>
      
      <div class="info-row">
        <span class="info-label">จำนวนรายการทั้งหมด:</span>
        <span class="info-value">${data.totalTransactions.toLocaleString()} รายการ</span>
      </div>
      
      <div class="info-row">
        <span class="info-label">จำนวนรายการเซ็นชื่อ:</span>
        <span class="info-value">${data.signedTransactions.toLocaleString()} รายการ</span>
      </div>
      
      <div class="info-row">
        <span class="info-label">ค่าเฉลี่ยต่อรายการ:</span>
        <span class="info-value">${data.avgPerTransaction.toLocaleString()} บาท</span>
      </div>
    </div>
    
    <button class="btn-close-overlay" id="close-revenue-btn">ปิด</button>
  `;
  
  customerInfo.innerHTML = infoHTML;
  customerInfo.style.display = "block";
  customerInfo.classList.add('fade-in');
  
  document.getElementById("close-revenue-btn").addEventListener('click', function() {
    hideOverlay();
    selectPage.style.display = "flex";
  });
  
  setTimeout(() => customerInfo.classList.remove('fade-in'), 400);
}

console.log("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
console.log("  💳 DIGITAL WALLET SYSTEM v2.1");
console.log("  Google Sheets Edition");
console.log("  with ID Card Support");
console.log("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛");
console.log("✓ System Online");
console.log("✓ Google Sheets Connected");
console.log("✓ ID Card Support Enabled");
console.log("");
console.log("⚠️ อย่าลืมใส่ GOOGLE_SCRIPT_URL");
console.log("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛");

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("check-balance-btn").addEventListener('click', checkBalanceByIdCard);
  
  document.getElementById("check-id-card").addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      checkBalanceByIdCard();
    }
  });
  
  document.getElementById("check-id-card").addEventListener('input', function(e) {
    this.value = this.value.replace(/[^0-9]/g, '');
  });
  
  document.getElementById("staff-login-btn").addEventListener('click', function() {
    const homePage = document.getElementById("page-home");
    const loginPage = document.getElementById("page-login");
    
    homePage.classList.add('fade-out');
    setTimeout(() => {
      homePage.style.display = "none";
      loginPage.style.display = "flex";
      loginPage.classList.add('fade-in');
      
      setTimeout(() => {
        homePage.classList.remove('fade-out');
        loginPage.classList.remove('fade-in');
      }, 400);
    }, 400);
  });
  
  document.getElementById("back-home-btn").addEventListener('click', function() {
    const homePage = document.getElementById("page-home");
    const loginPage = document.getElementById("page-login");
    
    loginPage.classList.add('fade-out');
    setTimeout(() => {
      loginPage.style.display = "none";
      homePage.style.display = "flex";
      homePage.classList.add('fade-in');
      
      document.getElementById("id-card-input").value = "";
      document.getElementById("laser-code-input").value = "";
      document.getElementById("login-error").textContent = "";
      
      setTimeout(() => {
        loginPage.classList.remove('fade-out');
        homePage.classList.remove('fade-in');
      }, 400);
    }, 400);
  });
  
  const loginBtn = document.getElementById("login-btn");
  loginBtn.addEventListener('click', checkLogin);
  
  document.getElementById("id-card-input").addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      document.getElementById("laser-code-input").focus();
    }
  });
  
  document.getElementById("laser-code-input").addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      checkLogin();
    }
  });
  
  document.getElementById("id-card-input").addEventListener('input', function(e) {
    this.value = this.value.replace(/[^0-9]/g, '');
  });
  
  document.getElementById("laser-code-input").addEventListener('input', function(e) {
    this.value = this.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  });
  
  document.getElementById("logout-btn").addEventListener('click', logout);

  document.querySelectorAll('[data-num]').forEach(btn => {
    btn.addEventListener('click', function() {
      inputNumber(this.getAttribute('data-num'));
    });
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      if (action === 'clear') clearDisplay();
      else if (action === 'delete') deleteNumber();
      else if (action === 'back') goBackToSelect();
      else if (action === 'confirm') confirmAmount();
    });
  });
  
  // Event listeners สำหรับ New User Modal
  document.getElementById("cancel-new-user").addEventListener('click', closeNewUserModal);
  document.getElementById("save-new-user").addEventListener('click', saveNewUser);
  
  document.getElementById("new-user-idcard").addEventListener('input', function(e) {
    this.value = this.value.replace(/[^0-9]/g, '');
  });
  
  document.getElementById("new-user-phone").addEventListener('input', function(e) {
    this.value = this.value.replace(/[^0-9]/g, '');
  });
  
  document.getElementById("new-user-amount").addEventListener('input', function(e) {
    this.value = this.value.replace(/[^0-9]/g, '');
  });
  
  document.getElementById("new-user-image").addEventListener('change', handleImageUpload);
});