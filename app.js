/* =============================================
   Mathura Poshak Bhandaar – Main App Logic
   ============================================= */

const ORDERS_API_URL = "https://script.google.com/macros/s/AKfycbzqx5HwUsCPWQ1TyhrHvKhpKsLRI4_1KeAjmhkfv7mWxk1Ti3CPQSJtZT1U-Tnbdwyx/exec";

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTUoprJDH_LmaXwL1RFDTdlBXxg2tqbHm9SvMTOQtIz9Y6MuAy9zXch3DQzA09QQ0pT2NRyjsoK3isf/pub?gid=0&single=true&output=csv";

let cart = {};
let currentUser = null;

// =============================================
// SHA-256 PASSWORD HASHING (Security)
// =============================================
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================
// STORAGE HELPERS
// =============================================
function getUsers() { try { return JSON.parse(localStorage.getItem("mpb_users") || "[]"); } catch(e) { return []; } }
function saveUsers(u) { localStorage.setItem("mpb_users", JSON.stringify(u)); }
function getSession() { return localStorage.getItem("mpb_session"); }
function getUserCart(email) { try { return JSON.parse(localStorage.getItem("mpb_cart_" + email) || "{}"); } catch(e) { return {}; } }
function saveUserCart(email, c) { localStorage.setItem("mpb_cart_" + email, JSON.stringify(c)); }
function getUserWishlist(email) { try { return JSON.parse(localStorage.getItem("mpb_wishlist_" + email) || "[]"); } catch(e) { return []; } }
function saveUserWishlist(email, w) { localStorage.setItem("mpb_wishlist_" + email, JSON.stringify(w)); }
// Orders & Addresses — backed by Google Sheets
// Address & Order cache — instant reads, background Sheets sync
function getCachedAddresses(email) { try { return JSON.parse(localStorage.getItem("mpb_addrcache_" + email) || "null"); } catch(e) { return null; } }
function setCachedAddresses(email, list) { localStorage.setItem("mpb_addrcache_" + email, JSON.stringify(list)); }
function getCachedOrders(email) { try { return JSON.parse(localStorage.getItem("mpb_ordercache_" + email) || "null"); } catch(e) { return null; } }
function setCachedOrders(email, list) { localStorage.setItem("mpb_ordercache_" + email, JSON.stringify(list)); }

async function fetchSheetOrders(email) {
  try {
    const r = await fetch(ORDERS_API_URL + "?action=getOrders&email=" + encodeURIComponent(email));
    const d = await r.json();
    if (d.status === "success") { setCachedOrders(email, d.orders); return d.orders; }
    return getCachedOrders(email) || [];
  } catch(e) { return getCachedOrders(email) || []; }
}
async function fetchSheetAddresses(email) {
  try {
    const r = await fetch(ORDERS_API_URL + "?action=getAddresses&email=" + encodeURIComponent(email));
    const d = await r.json();
    if (d.status === "success") { setCachedAddresses(email, d.addresses); return d.addresses; }
    return getCachedAddresses(email) || [];
  } catch(e) { return getCachedAddresses(email) || []; }
}
async function apiSaveAddress(email, label, text, isDefault, id) {
  const payload = { email, label, text, isDefault: !!isDefault, id: id || null };
  try { await fetch(ORDERS_API_URL + "?action=saveAddress&data=" + encodeURIComponent(JSON.stringify(payload)), { method:"GET", mode:"no-cors" }); } catch(e){}
}
async function apiDeleteAddress(id) {
  try { await fetch(ORDERS_API_URL + "?action=deleteAddress&data=" + encodeURIComponent(JSON.stringify({ id })), { method:"GET", mode:"no-cors" }); } catch(e){}
}

// =============================================
// SESSION
// =============================================
function loadSession() {
  const email = getSession();
  if (!email) return;
  const user = getUsers().find(u => u.email === email);
  if (user) { currentUser = user; cart = getUserCart(email); updateCartUI(); updateAuthBtn(); }
}

function updateAuthBtn() {
  const btn = document.getElementById("authBtn");
  const txt = document.getElementById("authBtnText");
  const ddName = document.getElementById("userDropdownName");
  const dd = document.getElementById("userDropdown");
  if (currentUser) {
    txt.textContent = currentUser.firstName;
    btn.classList.add("logged-in");
    if (ddName) ddName.textContent = "👤 " + currentUser.firstName + " " + currentUser.lastName;
    if (dd) dd.style.removeProperty("display");
    updateWishlistBadge();
  } else {
    txt.textContent = "Login";
    btn.classList.remove("logged-in");
    if (dd) { dd.style.display = "none"; dd.classList.remove("open"); }
  }
}

function updateWishlistBadge() {
  const badge = document.getElementById("wishlistCountBadge");
  if (!badge || !currentUser) return;
  const count = getUserWishlist(currentUser.email).length;
  badge.textContent = count > 0 ? count : "";
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

// =============================================
// AUTH – OPEN / CLOSE
// =============================================
function openAuth(tab) {
  if (currentUser) { toggleUserDropdown(); return; }
  switchTab(tab || "login");
  document.getElementById("authOverlay").classList.add("open");
}

function closeAuth() {
  document.getElementById("authOverlay").classList.remove("open");
  ["loginEmail","loginPassword","regFirstName","regLastName","regEmail","regPhone","regPassword","regConfirmPassword","forgotEmail","newPassword","confirmNewPassword"]
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
  const s1 = document.getElementById("forgotStep1"); const s2 = document.getElementById("forgotStep2");
  if (s1) s1.style.display = "block"; if (s2) s2.style.display = "none";
}

function closeAuthModal(e) { if (!e || e.target === document.getElementById("authOverlay")) closeAuth(); }

function switchTab(tab) {
  document.getElementById("loginForm").style.display = tab === "login" ? "block" : "none";
  document.getElementById("registerForm").style.display = tab === "register" ? "block" : "none";
  document.getElementById("forgotForm").style.display = tab === "forgot" ? "block" : "none";
  document.getElementById("loginTab").classList.toggle("active", tab === "login");
  document.getElementById("registerTab").classList.toggle("active", tab === "register");
}

// =============================================
// AUTH – LOGIN (with SHA-256 hashing + legacy fallback)
// =============================================
async function doLogin() {
  const email = (document.getElementById("loginEmail").value || "").trim().toLowerCase();
  const password = (document.getElementById("loginPassword").value || "");
  if (!email || !password) { showToast("Please enter email and password"); return; }

  const hashedPwd = await sha256(password);

  // 1. Check localStorage with hashed password (new accounts)
  let localUser = getUsers().find(u => u.email === email && u.password === hashedPwd);

  // 2. Legacy fallback: plain text (accounts registered before hashing was added)
  if (!localUser) {
    localUser = getUsers().find(u => u.email === email && u.password === password);
    if (localUser) {
      // Silently migrate to hashed password
      const users = getUsers();
      const idx = users.findIndex(u => u.email === email);
      if (idx !== -1) { users[idx].password = hashedPwd; saveUsers(users); }
      localUser = { ...localUser, password: hashedPwd };
    }
  }

  if (localUser) {
    currentUser = localUser;
    localStorage.setItem("mpb_session", email);
    cart = getUserCart(email);
    updateCartUI(); updateAuthBtn(); closeAuth(); renderProducts();
    showToast("Welcome back, " + localUser.firstName + "! 🎉");
    return;
  }

  const btn = document.querySelector("#loginForm .submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Verifying..."; }
  try {
    const resp = await fetch(ORDERS_API_URL + "?action=login&data=" + encodeURIComponent(JSON.stringify({ email, password: hashedPwd })));
    const result = await resp.json();
    if (result.status === 'success') {
      const user = result.user;
      const users = getUsers();
      if (!users.find(u => u.email === email)) { users.push(user); saveUsers(users); }
      currentUser = user;
      localStorage.setItem("mpb_session", email);
      cart = getUserCart(email);
      updateCartUI(); updateAuthBtn(); closeAuth(); renderProducts();
      showToast("Welcome back, " + user.firstName + "! 🎉");
    } else {
      showToast("❌ Invalid email or password. If registered before, please re-register.");
    }
  } catch(e) {
    showToast("❌ Invalid email or password");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Login →"; }
  }
}

// =============================================
// AUTH – REGISTER (with SHA-256 hashing)
// =============================================
async function doRegister() {
  const firstName = (document.getElementById("regFirstName").value || "").trim();
  const lastName  = (document.getElementById("regLastName").value  || "").trim();
  const email     = (document.getElementById("regEmail").value     || "").trim().toLowerCase();
  const phone     = (document.getElementById("regPhone").value     || "").trim();
  const password  = (document.getElementById("regPassword").value  || "");
  const confirmPwd= (document.getElementById("regConfirmPassword").value || "");

  if (!firstName || !lastName || !email || !phone || !password || !confirmPwd) { showToast("Please fill all required fields"); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Please enter a valid email address"); return; }
  if (!/^[0-9]{10}$/.test(phone)) { showToast("Please enter a valid 10-digit phone number"); return; }
  if (password.length < 6) { showToast("Password must be at least 6 characters"); return; }
  if (password !== confirmPwd) { showToast("Passwords do not match"); return; }

  const users = getUsers();
  if (users.find(u => u.email === email)) { showToast("An account with this email already exists"); return; }

  const hashedPwd = await sha256(password);
  const newUser = { firstName, lastName, email, phone, password: hashedPwd };
  users.push(newUser);
  saveUsers(users);

  try {
    fetch(ORDERS_API_URL + "?action=register&data=" + encodeURIComponent(JSON.stringify({ firstName, lastName, email, phone, password: hashedPwd })), { method: "GET", mode: "no-cors" });
  } catch(e) {}

  currentUser = newUser;
  localStorage.setItem("mpb_session", email);
  cart = {};
  updateCartUI(); updateAuthBtn(); closeAuth(); renderProducts();
  showToast("Account created! Welcome, " + firstName + "! 🎉");
}

// =============================================
// AUTH – LOGOUT
// =============================================
function doLogout() {
  if (currentUser) saveUserCart(currentUser.email, cart);
  currentUser = null; cart = {};
  localStorage.removeItem("mpb_session");
  updateCartUI(); updateAuthBtn(); closeUserDropdown();
  closeAccount();
  renderProducts();
  showToast("Logged out successfully");
}

// =============================================
// USER DROPDOWN
// =============================================
function toggleUserDropdown() { document.getElementById("userDropdown").classList.toggle("open"); }
function closeUserDropdown() { document.getElementById("userDropdown").classList.remove("open"); }

// =============================================
// PASSWORD TOGGLE
// =============================================
function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") { input.type = "text"; btn.textContent = "🙈"; }
  else { input.type = "password"; btn.textContent = "👁"; }
}

// =============================================
// AUTH – FORGOT / RESET PASSWORD (pre-login)
// =============================================
function doForgotPassword() {
  const email = (document.getElementById("forgotEmail").value || "").trim().toLowerCase();
  if (!email) { showToast("Please enter your email address"); return; }
  const user = getUsers().find(u => u.email === email);
  if (!user) { showToast("❌ No account found with this email"); return; }
  window._resetEmail = email;
  document.getElementById("forgotStep1").style.display = "none";
  document.getElementById("forgotStep2").style.display = "block";
}

async function doResetPassword() {
  const newPwd    = document.getElementById("newPassword").value || "";
  const confirmPwd= document.getElementById("confirmNewPassword").value || "";
  if (!newPwd || !confirmPwd) { showToast("Please fill all fields"); return; }
  if (newPwd.length < 6) { showToast("Password must be at least 6 characters"); return; }
  if (newPwd !== confirmPwd) { showToast("Passwords do not match"); return; }

  const hashedPwd = await sha256(newPwd);
  const users = getUsers();
  const idx = users.findIndex(u => u.email === window._resetEmail);
  if (idx === -1) { showToast("Something went wrong. Please try again."); return; }
  users[idx].password = hashedPwd;
  if (currentUser && currentUser.email === window._resetEmail) currentUser.password = hashedPwd;
  saveUsers(users);
  window._resetEmail = null;
  showToast("✅ Password reset! Please login with your new password.");
  closeAuth();
  openAuth("login");
}

// =============================================
// WISHLIST
// =============================================
function toggleWishlist(id) {
  if (!currentUser) { openAuth("login"); showToast("Please login to use wishlist"); return; }
  const wishlist = getUserWishlist(currentUser.email);
  const idx = wishlist.indexOf(id);
  if (idx > -1) { wishlist.splice(idx, 1); showToast("Removed from wishlist"); }
  else { wishlist.push(id); showToast("❤️ Added to wishlist"); }
  saveUserWishlist(currentUser.email, wishlist);
  const btn = document.getElementById("wish-" + id);
  if (btn) btn.classList.toggle("active", wishlist.includes(id));
  updateWishlistBadge();
}

function openWishlist() {
  closeUserDropdown();
  if (!currentUser) { openAuth("login"); return; }
  renderWishlist();
  document.getElementById("wishlistOverlay").classList.add("open");
}
function closeWishlist() { document.getElementById("wishlistOverlay").classList.remove("open"); }
function closeWishlistModal(e) { if (e.target === document.getElementById("wishlistOverlay")) closeWishlist(); }

function renderWishlist() {
  const wishlist = getUserWishlist(currentUser.email);
  const items = (window.PRODUCTS || PRODUCTS).filter(p => wishlist.includes(p.id));
  const container = document.getElementById("wishlistItems");
  if (items.length === 0) { container.innerHTML = '<p class="empty-msg">💔 Your wishlist is empty.<br>Tap the 🤍 on any product to save it.</p>'; return; }
  container.innerHTML = items.map(p => `
    <div class="side-item">
      <img src="${p.image}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/70x88?text=?'"/>
      <div class="side-item-info">
        <div class="side-item-name">${p.name}</div>
        <div class="side-item-meta">${(p.sizes||[p.size]).join(", ")} • ${(p.colors||[p.color]).join(", ")} • ${p.category}</div>
        <div class="side-item-price">₹${p.price}</div>
        <div class="side-item-actions">
          <button class="add-to-cart-sm" onclick="addToCart(${p.id})" ${p.stock===0?"disabled":""}>
            ${p.stock===0?"Out of Stock":"+ Add to Cart"}
          </button>
          <button class="remove-sm" onclick="toggleWishlist(${p.id});renderWishlist()">✕ Remove</button>
        </div>
      </div>
    </div>`).join("");
}

// =============================================
// ORDER HISTORY (standalone modal - preserved)
// =============================================
function openOrderHistory() {
  closeUserDropdown();
  if (!currentUser) { openAuth("login"); return; }
  renderOrderHistory();
  document.getElementById("ordersOverlay").classList.add("open");
}
function closeOrderHistory() { document.getElementById("ordersOverlay").classList.remove("open"); }
function closeOrdersModal(e) { if (e.target === document.getElementById("ordersOverlay")) closeOrderHistory(); }

async function renderOrderHistory() {
  const container = document.getElementById("ordersContent");
  // Show cache instantly, no spinner if we have data
  const cached = getCachedOrders(currentUser.email);
  if (cached && cached.length) {
    renderOrderHistoryCards(container, cached);
  } else {
    container.innerHTML = '<p class="empty-msg">⏳ Loading orders…</p>';
  }
  const orders = await fetchSheetOrders(currentUser.email);
  renderOrderHistoryCards(container, orders);
}
function renderOrderHistoryCards(container, orders) {
  if (orders.length === 0) { container.innerHTML = '<p class="empty-msg">📭 No orders yet.<br>Place your first order today!</p>'; return; }
  container.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-card-header">
        <div><strong class="order-id">${o.orderId}</strong><span class="order-date">${o.date}</span></div>
        <div class="order-total">₹${o.total}</div>
      </div>
      <div class="order-items-row">${(o.items||[]).map(i=>`<span class="order-tag">${i.name} x${i.qty}</span>`).join("")}</div>
      ${o.address?`<div class="order-address">📍 ${o.address}</div>`:""}
      <div class="order-status-badge">✅ Order Placed</div>
    </div>`).join("");
}

// =============================================
// ACCOUNT PAGE
// =============================================
function openAccount() {
  closeUserDropdown();
  if (!currentUser) { openAuth("login"); return; }
  // Populate header info
  const initials = (currentUser.firstName[0] + (currentUser.lastName[0]||"")).toUpperCase();
  document.getElementById("accAvatar").textContent = initials;
  document.getElementById("accUserName").textContent = currentUser.firstName + " " + currentUser.lastName;
  document.getElementById("accUserEmail").textContent = currentUser.email;
  document.getElementById("accountOverlay").classList.add("open");
  showAccountSection("profile");
  // Load profile stats — show cached counts instantly, refresh in background
  const cachedO = getCachedOrders(currentUser.email);
  const cachedA = getCachedAddresses(currentUser.email);
  const elO = document.getElementById("statOrders");
  const elA = document.getElementById("statAddresses");
  if (cachedO && elO) elO.textContent = cachedO.length;
  if (cachedA && elA) elA.textContent = cachedA.length;
  fetchSheetOrders(currentUser.email).then(o => { const el = document.getElementById("statOrders"); if(el) el.textContent = o.length; });
  fetchSheetAddresses(currentUser.email).then(a => { const el = document.getElementById("statAddresses"); if(el) el.textContent = a.length; });
}

function closeAccount() {
  const el = document.getElementById("accountOverlay");
  if (el) el.classList.remove("open");
}

function closeAccountModal(e) {
  if (e && e.target === document.getElementById("accountOverlay")) closeAccount();
}

function showAccountSection(section) {
  // Update active nav button
  document.querySelectorAll(".acc-nav-btn").forEach(b => b.classList.remove("active"));
  const activeBtn = document.getElementById("accNav-" + section);
  if (activeBtn) activeBtn.classList.add("active");

  const content = document.getElementById("accountContent");
  const sectionTitles = {
    profile: "👤 My Profile",
    wishlist: "❤️ My Wishlist",
    orders: "📦 Order History",
    address: "📍 Address Book",
    resetpwd: "🔑 Change Password",
    help: "💬 Help Center"
  };

  let html = `<div class="acc-section-header"><h2>${sectionTitles[section] || ""}</h2></div><div class="acc-section-body">`;

  if (section === "profile") {
    html += renderProfileSection();
  } else if (section === "wishlist") {
    html += renderAccountWishlistSection();
  } else if (section === "orders") {
    html += `<div id="accOrdersContent"><div class="acc-loading">⏳ Loading orders…</div></div>`;
  } else if (section === "address") {
    html += `<div id="accAddrContent"><div class="acc-loading">⏳ Loading addresses…</div></div>`;
  } else if (section === "resetpwd") {
    html += renderChangePwdSection();
  } else if (section === "help") {
    html += renderHelpSection();
  }

  html += "</div>";
  content.innerHTML = html;

  // Async load for orders and addresses
  if (section === "orders")  loadAccountOrders();
  if (section === "address") loadAccountAddresses();
}

function renderOrderList(el, orders) {
  if (!orders.length) {
    el.innerHTML = `<div class="acc-empty-state">📭<p>No orders yet</p><span>Your order history will appear here after your first purchase</span></div>`;
    return;
  }
  el.innerHTML = orders.map(o => `
    <div class="acc-order-card">
      <div class="acc-order-header">
        <span class="acc-order-id">${o.orderId}</span>
        <span class="acc-order-status ${(o.status||'').toLowerCase()}">${o.status || "Pending"}</span>
      </div>
      <div class="acc-order-meta">${o.date || ""}</div>
      <div class="acc-order-products">${o.products || ""}</div>
      ${o.address ? `<div class="acc-order-addr">📍 ${o.address}</div>` : ""}
      <div class="acc-order-total">Total: ₹${o.total || 0}</div>
      ${o.remarks ? `<div class="acc-order-remarks">Note: ${o.remarks}</div>` : ""}
    </div>`).join("");
}

async function loadAccountOrders() {
  const el = document.getElementById("accOrdersContent");
  if (!el || !currentUser) return;
  // Show cached orders instantly
  const cached = getCachedOrders(currentUser.email);
  if (cached) renderOrderList(el, cached);
  // Refresh from Sheets in background
  const fresh = await fetchSheetOrders(currentUser.email);
  const currentEl = document.getElementById("accOrdersContent");
  if (currentEl) renderOrderList(currentEl, fresh);
}

function renderAddressList(el, addresses) {
  let html = "";
  if (!addresses.length) {
    html += `<div class="acc-empty-state">📍<p>No saved addresses</p><span>Save addresses for faster checkout</span></div>`;
  } else {
    html += addresses.map(a => `
      <div class="acc-addr-card ${a.isDefault ? 'acc-addr-default' : ''}">
        <div class="acc-addr-top">
          <span class="acc-addr-label">${a.label || "Address"}</span>
          ${a.isDefault ? `<span class="acc-addr-badge">✔ Default</span>` : `<button class="acc-addr-setdef" onclick="setDefaultAddr('${a.id}')">Set as Default</button>`}
        </div>
        <div class="acc-addr-text">${a.text}</div>
        <button class="acc-addr-del" onclick="deleteAddr('${a.id}')">🗑 Remove</button>
      </div>`).join("");
  }
  html += `
    <div class="acc-add-addr-form">
      <h3>Add New Address</h3>
      <div class="form-group"><label>Label (e.g. Home, Shop)</label><input type="text" id="newAddrLabel" placeholder="Home" /></div>
      <div class="form-group"><label>Full Address *</label><textarea id="newAddrText" rows="3" placeholder="Street, City, State, PIN code"></textarea></div>
      <label style="font-size:.85rem;display:flex;align-items:center;gap:8px;margin-bottom:12px"><input type="checkbox" id="newAddrDefault"> Make this my default address</label>
      <button class="acc-save-btn" onclick="addAddr()">+ Add Address</button>
    </div>`;
  el.innerHTML = html;
}

async function loadAccountAddresses() {
  const el = document.getElementById("accAddrContent");
  if (!el || !currentUser) return;
  // Show cached addresses instantly
  const cached = getCachedAddresses(currentUser.email);
  if (cached) {
    renderAddressList(el, cached);
  }
  // Refresh from Sheets in background and update if different
  const fresh = await fetchSheetAddresses(currentUser.email);
  const currentEl = document.getElementById("accAddrContent");
  if (currentEl) renderAddressList(currentEl, fresh);
}

async function addAddr() {
  const label = (document.getElementById("newAddrLabel").value || "Address").trim();
  const text  = (document.getElementById("newAddrText").value || "").trim();
  const isDef = document.getElementById("newAddrDefault").checked;
  if (!text) { showToast("Please enter an address"); return; }

  const id = "addr_" + Date.now();
  // 1. Update cache instantly so UI is immediate
  const cached = getCachedAddresses(currentUser.email) || [];
  if (isDef) cached.forEach(a => a.isDefault = false);
  cached.push({ id, email: currentUser.email, label, text, isDefault: isDef });
  setCachedAddresses(currentUser.email, cached);
  // 2. Fire-and-forget to Sheets in background
  apiSaveAddress(currentUser.email, label, text, isDef, id);
  showToast("✅ Address saved!");
  showAccountSection("address"); // instant — reads from cache
}

async function deleteAddr(id) {
  if (!confirm("Remove this address?")) return;
  // 1. Remove from cache instantly
  const cached = (getCachedAddresses(currentUser.email) || []).filter(a => a.id !== id);
  setCachedAddresses(currentUser.email, cached);
  // 2. Fire-and-forget to Sheets
  apiDeleteAddress(id);
  showToast("Address removed");
  showAccountSection("address"); // instant
}

async function setDefaultAddr(id) {
  // 1. Update cache instantly
  const cached = getCachedAddresses(currentUser.email) || [];
  cached.forEach(a => a.isDefault = (a.id === id));
  setCachedAddresses(currentUser.email, cached);
  const addr = cached.find(a => a.id === id);
  if (addr) apiSaveAddress(currentUser.email, addr.label, addr.text, true, id);
  showToast("✅ Default address updated!");
  showAccountSection("address"); // instant
}

function renderProfileSection() {
  const u = currentUser;
  const joined = localStorage.getItem("mpb_joined_" + u.email) || "—";
  return `
    <div class="profile-card">
      <div class="profile-avatar-lg">${(u.firstName[0] + (u.lastName[0]||"")).toUpperCase()}</div>
      <div class="profile-fields">
        <div class="profile-field-row">
          <div class="profile-field">
            <label>First Name</label>
            <input type="text" id="profFirstName" value="${u.firstName}" />
          </div>
          <div class="profile-field">
            <label>Last Name</label>
            <input type="text" id="profLastName" value="${u.lastName}" />
          </div>
        </div>
        <div class="profile-field">
          <label>Email Address</label>
          <input type="email" id="profEmail" value="${u.email}" readonly style="opacity:.6;cursor:not-allowed" />
          <span class="field-note">Email cannot be changed</span>
        </div>
        <div class="profile-field">
          <label>Phone Number</label>
          <input type="tel" id="profPhone" value="${u.phone || ''}" maxlength="10" />
        </div>
        <button class="acc-save-btn" onclick="saveProfile()">💾 Save Changes</button>
      </div>
    </div>
    <div class="profile-stats">
      <div class="stat-card">
        <div class="stat-num" id="statOrders">—</div>
        <div class="stat-label">Orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${getUserWishlist(u.email).length}</div>
        <div class="stat-label">Wishlist</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" id="statAddresses">—</div>
        <div class="stat-label">Addresses</div>
      </div>
    </div>`;
}

function saveProfile() {
  const firstName = (document.getElementById("profFirstName").value || "").trim();
  const lastName  = (document.getElementById("profLastName").value  || "").trim();
  const phone     = (document.getElementById("profPhone").value     || "").trim();
  if (!firstName || !lastName) { showToast("Name cannot be empty"); return; }
  if (phone && !/^[0-9]{10}$/.test(phone)) { showToast("Enter a valid 10-digit phone number"); return; }
  const users = getUsers();
  const idx = users.findIndex(u => u.email === currentUser.email);
  if (idx !== -1) {
    users[idx].firstName = firstName;
    users[idx].lastName  = lastName;
    users[idx].phone     = phone;
    saveUsers(users);
    currentUser = { ...currentUser, firstName, lastName, phone };
    // Refresh sidebar info
    document.getElementById("accUserName").textContent = firstName + " " + lastName;
    document.getElementById("accAvatar").textContent = (firstName[0] + (lastName[0]||"")).toUpperCase();
    updateAuthBtn();
  }
  showToast("✅ Profile updated successfully!");
}

function renderAccountWishlistSection() {
  if (!currentUser) return "";
  const wishlist = getUserWishlist(currentUser.email);
  const items = (window.PRODUCTS || PRODUCTS).filter(p => wishlist.includes(p.id));
  if (items.length === 0) return `<div class="acc-empty-state">💔<p>Your wishlist is empty</p><span>Tap ♡ on any product to save it here</span></div>`;
  return `<div class="acc-wishlist-grid">${items.map(p => `
    <div class="acc-wish-card">
      <img src="${p.image}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/120x150?text=?'"/>
      <div class="acc-wish-info">
        <div class="acc-wish-name">${p.name}</div>
        <div class="acc-wish-meta">${(p.sizes||[p.size]).join(", ")} • ${(p.colors||[p.color]).join(", ")}</div>
        <div class="acc-wish-price">₹${p.price}</div>
        <div class="acc-wish-actions">
          <button class="acc-add-cart" onclick="addToCart(${p.id})" ${p.stock===0?"disabled":""}>
            ${p.stock===0?"Out of Stock":"+ Cart"}
          </button>
          <button class="acc-remove-wish" onclick="toggleWishlist(${p.id});showAccountSection('wishlist')">✕</button>
        </div>
      </div>
    </div>`).join("")}</div>`;
}

// renderAccountOrdersSection and renderAddressSection replaced by async loadAccountOrders / loadAccountAddresses above

function renderChangePwdSection() {
  return `
    <div class="acc-form-box">
      <div class="acc-pwd-info">
        <span>🔒</span>
        <p>Your password is securely hashed and never stored in plain text.</p>
      </div>
      <div class="profile-field">
        <label>Current Password *</label>
        <div class="pwd-wrap">
          <input type="password" id="accCurPwd" placeholder="Enter current password" />
          <button type="button" class="pwd-toggle" onclick="togglePwd('accCurPwd',this)">👁</button>
        </div>
      </div>
      <div class="profile-field">
        <label>New Password *</label>
        <div class="pwd-wrap">
          <input type="password" id="accNewPwd" placeholder="Minimum 6 characters" />
          <button type="button" class="pwd-toggle" onclick="togglePwd('accNewPwd',this)">👁</button>
        </div>
      </div>
      <div class="profile-field">
        <label>Confirm New Password *</label>
        <div class="pwd-wrap">
          <input type="password" id="accConfPwd" placeholder="Re-enter new password" />
          <button type="button" class="pwd-toggle" onclick="togglePwd('accConfPwd',this)">👁</button>
        </div>
      </div>
      <button class="acc-save-btn" onclick="doChangePassword()">🔑 Update Password</button>
    </div>`;
}

async function doChangePassword() {
  const curPwd  = document.getElementById("accCurPwd").value  || "";
  const newPwd  = document.getElementById("accNewPwd").value  || "";
  const confPwd = document.getElementById("accConfPwd").value || "";
  if (!curPwd || !newPwd || !confPwd) { showToast("Please fill all fields"); return; }
  if (newPwd.length < 6) { showToast("Password must be at least 6 characters"); return; }
  if (newPwd !== confPwd) { showToast("New passwords do not match"); return; }

  const curHash = await sha256(curPwd);
  const newHash = await sha256(newPwd);

  const users = getUsers();
  const idx   = users.findIndex(u => u.email === currentUser.email);
  if (idx === -1) { showToast("Account error. Please re-login."); return; }

  // Verify current password (hash or legacy plain text)
  const stored = users[idx].password;
  if (stored !== curHash && stored !== curPwd) {
    showToast("❌ Current password is incorrect"); return;
  }

  users[idx].password = newHash;
  currentUser.password = newHash;
  saveUsers(users);
  showToast("✅ Password changed successfully!");
  // Clear inputs
  ["accCurPwd","accNewPwd","accConfPwd"].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
}

function renderHelpSection() {
  return `
    <div class="acc-help-contact">
      <div class="help-contact-card">
        <span>📞</span>
        <div>
          <div class="help-contact-label">Phone / WhatsApp</div>
          <a href="tel:+919760096109">+91 97600 96109</a>
        </div>
      </div>
      <div class="help-contact-card">
        <span>📧</span>
        <div>
          <div class="help-contact-label">Email Us</div>
          <a href="mailto:mathura.dress.bhandaar@gmail.com">mathura.dress.bhandaar@gmail.com</a>
        </div>
      </div>
      <div class="help-contact-card">
        <span>💬</span>
        <div>
          <div class="help-contact-label">WhatsApp Order</div>
          <a href="https://wa.me/919760096109?text=Hi%2C%20I%20need%20help" target="_blank">Chat with us on WhatsApp</a>
        </div>
      </div>
    </div>
    <div class="acc-faq">
      <h3>Frequently Asked Questions</h3>
      ${[
        ["How do I place a bulk order?", "You can place bulk orders by adding products to cart and checking out, or directly WhatsApp us at +91 97600 96109 for bulk pricing and custom quantities."],
        ["What is the minimum order quantity?", "There is no strict minimum, but bulk discounts apply on orders above ₹2000. Contact us for special bulk rates."],
        ["How long does delivery take?", "Delivery typically takes 3–7 working days depending on your location. Express delivery can be arranged on request."],
        ["Can I return or exchange products?", "We accept exchanges for defective or wrongly delivered products within 7 days of receipt. Contact us via WhatsApp with photos of the issue."],
        ["Are the prices negotiable?", "Yes! For large bulk orders we offer special rates. Please WhatsApp us with your requirements and we will give you the best price."],
        ["How do I track my order?", "After your order is confirmed we will share the tracking details via WhatsApp or the phone number provided at checkout."]
      ].map(([q, a]) => `
        <details class="faq-item">
          <summary>${q}</summary>
          <p>${a}</p>
        </details>`).join("")}
    </div>`;
}

// =============================================
// PRODUCT DETAIL
// =============================================
let _currentProductId = null;

const COLOR_MAP = {
  "blue":"#4a90d9","red":"#d94a4a","yellow":"#f5c518","green":"#4caf50","pink":"#e91e8c",
  "orange":"#ff6600","purple":"#7c4dff","white":"#e0d6ce","black":"#444","teal":"#009688",
  "golden":"#d4a017","gold":"#d4a017","brown":"#795548","grey":"#9e9e9e","gray":"#9e9e9e",
  "light pink":"#ffb6c1","sky blue":"#87ceeb","navy":"#1a237e","maroon":"#800000",
  "cream":"#fffdd0","magenta":"#e91e63","aqua":"#00bcd4","black":"#222"
};

function openProduct(id) {
  const prods = window.PRODUCTS || PRODUCTS;
  const p = prods.find(x => x.id === id);
  if (!p) return;
  _currentProductId = id;

  // Update URL with slug for shareability
  const slug = p.slug || ("product-" + id);
  history.pushState({ productId: id }, "", "?product=" + encodeURIComponent(slug));

  // Build image list: main + sub images
  const allImages = [p.image, ...(p.subImages || [])].filter(Boolean);

  // Gallery
  document.getElementById("galleryMainImg").src = allImages[0] || "";
  document.getElementById("galleryMainImg").alt = p.name;
  const thumbsEl = document.getElementById("galleryThumbs");
  thumbsEl.innerHTML = allImages.length > 1 ? allImages.map((url, i) => `
    <div class="gallery-thumb ${i === 0 ? "active" : ""}" onclick="switchGalleryImg(${i}, this, ${JSON.stringify(allImages).replace(/"/g,'&quot;')})">
      <img src="${url}" alt="${p.name} image ${i+1}" onerror="this.parentElement.style.display='none'" loading="lazy" />
    </div>`).join("") : "";

  // Category & Name
  document.getElementById("detailCategory").textContent = p.category || "";
  document.getElementById("detailName").textContent = p.name;
  document.getElementById("detailPrice").textContent = "₹" + p.price;

  // Stock
  const stockEl = document.getElementById("detailStock");
  if (p.stock === 0) { stockEl.textContent = "Out of Stock"; stockEl.className = "detail-stock-badge out-stock"; }
  else if (p.stock <= 3) { stockEl.textContent = "Low Stock — Only " + p.stock + " left"; stockEl.className = "detail-stock-badge in-stock"; }
  else { stockEl.textContent = "In Stock"; stockEl.className = "detail-stock-badge in-stock"; }

  // Description
  const descEl = document.getElementById("detailDescription");
  descEl.textContent = p.description || "";
  descEl.style.display = p.description ? "block" : "none";

  // Attributes (sizes + colors)
  const colorDots = (p.colors || [p.color]).map(c => {
    const bg = COLOR_MAP[(c||"").toLowerCase()] || "#ccc";
    return `<span class="detail-attr-tag"><span class="detail-color-dot" style="background:${bg}"></span>${c}</span>`;
  }).join("");
  const sizeTags = (p.sizes || [p.size]).map(s => `<span class="detail-attr-tag">📏 ${s}</span>`).join("");
  document.getElementById("detailAttrs").innerHTML = `
    <div class="detail-attr-row">
      <div class="detail-attr-label">Colors</div>
      <div class="detail-attr-tags">${colorDots}</div>
    </div>
    <div class="detail-attr-row">
      <div class="detail-attr-label">Sizes</div>
      <div class="detail-attr-tags">${sizeTags}</div>
    </div>`;

  // Cart button
  const cartBtn = document.getElementById("detailAddCartBtn");
  cartBtn.disabled = p.stock === 0;
  cartBtn.textContent = p.stock === 0 ? "Out of Stock" : "+ Add to Cart";

  // WhatsApp
  const waText = encodeURIComponent(`Hi, I'm interested in ordering: ${p.name} (₹${p.price}). Please share availability and bulk pricing.`);
  document.getElementById("detailWhatsappBtn").href = `https://wa.me/919760096109?text=${waText}`;

  document.getElementById("productOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function switchGalleryImg(idx, thumbEl, images) {
  document.getElementById("galleryMainImg").src = images[idx];
  document.querySelectorAll(".gallery-thumb").forEach(t => t.classList.remove("active"));
  thumbEl.classList.add("active");
}

function detailAddToCart() {
  if (_currentProductId) {
    addToCart(_currentProductId);
    closeProduct();
  }
}

function closeProduct() {
  document.getElementById("productOverlay").classList.remove("open");
  document.body.style.overflow = "";
  _currentProductId = null;
  // Restore URL
  history.pushState({}, "", location.pathname);
}

function closeProductModal(e) {
  if (e.target === document.getElementById("productOverlay")) closeProduct();
}

function copyProductLink() {
  navigator.clipboard.writeText(location.href).then(() => showToast("🔗 Link copied!"));
}

// Handle ?product=slug on page load
function checkProductSlugInUrl() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("product");
  if (!slug) return;
  const prods = window.PRODUCTS || PRODUCTS;
  const p = prods.find(x => x.slug === slug || ("product-" + x.id) === slug);
  if (p) openProduct(p.id);
}

// Handle browser back button closing modal
window.addEventListener("popstate", () => {
  const overlay = document.getElementById("productOverlay");
  if (overlay && overlay.classList.contains("open")) {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    _currentProductId = null;
  }
});

// =============================================
// HERO CAROUSEL
// =============================================
let _carouselIdx = 0;
let _carouselTotal = 1;
let _carouselTimer = null;

function buildCarousel(products) {
  const track = document.getElementById("carouselTrack");
  const dotsEl = document.getElementById("carouselDots");
  if (!track || !dotsEl || !products || !products.length) return;

  // Pick up to 6 in-stock products with images
  const slides = products
    .filter(p => p.stock > 0 && p.image && !p.image.includes("placehold"))
    .slice(0, 6);
  if (!slides.length) return;

  _carouselTotal = slides.length;
  _carouselIdx   = 0;

  track.innerHTML = slides.map((p, i) => `
    <div class="carousel-slide${i === 0 ? " active" : ""}"
         style="background-image:url('${p.image}');background-size:cover;background-position:center">
      <div class="carousel-overlay"></div>
      <div class="carousel-content">
        <div class="carousel-btns">
          <a href="#products" class="carousel-cta-primary" onclick="carouselShopNow(${p.id})">Shop Now</a>
          <a href="https://wa.me/919760096109?text=Hi%2C%20I%27m%20interested%20in%20${encodeURIComponent(p.name)}" target="_blank" class="carousel-cta-secondary">WhatsApp Order</a>
        </div>
      </div>
    </div>`).join("");

  dotsEl.innerHTML = slides.map((_, i) =>
    `<button class="carousel-dot${i === 0 ? " active" : ""}" onclick="carouselGoTo(${i})"></button>`
  ).join("");

  carouselAutoPlay();
}

function carouselGoTo(idx) {
  const slides = document.querySelectorAll(".carousel-slide");
  const dots   = document.querySelectorAll(".carousel-dot");
  if (!slides.length) return;
  slides[_carouselIdx].classList.remove("active");
  if (dots[_carouselIdx]) dots[_carouselIdx].classList.remove("active");
  _carouselIdx = (idx + slides.length) % slides.length;
  slides[_carouselIdx].classList.add("active");
  if (dots[_carouselIdx]) dots[_carouselIdx].classList.add("active");
}

function carouselMove(dir) {
  carouselGoTo(_carouselIdx + dir);
  carouselAutoPlay(); // reset timer on manual nav
}

function carouselAutoPlay() {
  if (_carouselTimer) clearInterval(_carouselTimer);
  _carouselTimer = setInterval(() => carouselGoTo(_carouselIdx + 1), 4000);
}

function carouselShopNow(productId) {
  // Scroll to products and highlight
  document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
}

// Pause on hover
document.addEventListener("DOMContentLoaded", () => {
  const carousel = document.getElementById("heroCarousel");
  if (carousel) {
    carousel.addEventListener("mouseenter", () => { if (_carouselTimer) clearInterval(_carouselTimer); });
    carousel.addEventListener("mouseleave", carouselAutoPlay);
  }
});

// =============================================
// SEARCH & FILTER
// =============================================
function applyFilters() {
  const search = (document.getElementById("searchInput").value || "").toLowerCase().trim();
  const cat   = document.getElementById("filterCategory").value;
  const size  = document.getElementById("filterSize").value;
  const color = document.getElementById("filterColor").value;
  const stock = document.getElementById("filterStock").value;
  const sort  = document.getElementById("sortPrice").value;
  const minP  = parseInt(document.getElementById("priceMinInput").value) || 0;
  const maxP  = parseInt(document.getElementById("priceMaxInput").value) || 999999;

  let filtered = [...(window.PRODUCTS || PRODUCTS)];
  if (search) filtered = filtered.filter(p => {
    const pSizes  = (p.sizes  || [p.size  || ""]).map(s => s.toLowerCase());
    const pColors = (p.colors || [p.color || ""]).map(c => c.toLowerCase());
    return (p.name.toLowerCase().includes(search) || (p.category||"").toLowerCase().includes(search) ||
      pColors.some(c => c.includes(search)) || pSizes.some(s => s.includes(search)));
  });
  if (cat)   filtered = filtered.filter(p => p.category === cat);
  if (size)  filtered = filtered.filter(p => (p.sizes  || [p.size  || ""]).includes(size));
  if (color) filtered = filtered.filter(p => (p.colors || [p.color || ""]).includes(color));
  if (stock === "in_stock")  filtered = filtered.filter(p => p.stock > 3);
  else if (stock === "low_stock") filtered = filtered.filter(p => p.stock > 0 && p.stock <= 3);
  else if (stock === "out_stock") filtered = filtered.filter(p => p.stock === 0);
  filtered = filtered.filter(p => p.price >= minP && p.price <= maxP);
  if (sort === "low_high") filtered.sort((a, b) => a.price - b.price);
  else if (sort === "high_low") filtered.sort((a, b) => b.price - a.price);
  renderProducts(filtered);
  document.getElementById("noResults").style.display = filtered.length === 0 ? "block" : "none";
}

function clearFilters() {
  ["searchInput","filterCategory","filterSize","filterColor","filterStock","sortPrice","priceMinInput","priceMaxInput"]
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
  applyFilters();
}

// =============================================
// RENDER PRODUCTS
// =============================================
function renderProducts(products) {
  const prods = products !== undefined ? products : (window.PRODUCTS || PRODUCTS);
  const grid = document.getElementById("productsGrid");
  const wishlist = currentUser ? getUserWishlist(currentUser.email) : [];
  const COLOR_DOT = {
    "blue":"#4a90d9","red":"#d94a4a","yellow":"#f5c518","green":"#4caf50","pink":"#e91e8c",
    "orange":"#ff6600","purple":"#7c4dff","white":"#e0d6ce","black":"#444","teal":"#009688",
    "golden":"#d4a017","gold":"#d4a017","brown":"#795548","grey":"#9e9e9e","gray":"#9e9e9e",
    "light pink":"#ffb6c1","sky blue":"#87ceeb","navy":"#1a237e","maroon":"#800000",
    "cream":"#fffdd0","magenta":"#e91e63"
  };
  grid.innerHTML = prods.map(p => {
    const stockLabel = p.stock === 0 ? "out-of-stock" : "in-stock";
    const stockText  = p.stock === 0 ? "Out of Stock" : "In Stock";
    const disabled   = p.stock === 0 ? "disabled" : "";
    const wished     = wishlist.includes(p.id);
    const sizeArr    = p.sizes  || [p.size  || "M"];
    const colorArr   = p.colors || [p.color || "Red"];
    const sizeTags   = sizeArr.map(s => `<span class="tag tag-size">📏 ${s}</span>`).join("");
    const colorTags  = colorArr.map(c => {
      const bg = COLOR_DOT[(c||"").toLowerCase()] || COLOR_DOT[(c||"").toLowerCase().split(" ")[0]] || "#ccc";
      return `<span class="tag tag-color"><span class="color-dot" style="background:${bg}"></span>${c}</span>`;
    }).join("");
    return `
      <div class="product-card" id="card-${p.id}">
        <div class="product-img-wrap" onclick="openProduct(${p.id})" style="cursor:pointer">
          <img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'"/>
          <button class="wish-btn ${wished?"active":""}" id="wish-${p.id}" onclick="event.stopPropagation();toggleWishlist(${p.id})" title="Wishlist">&#9829;</button>
        </div>
        <div class="product-info">
          <div class="product-name" onclick="openProduct(${p.id})" style="cursor:pointer">${p.name}</div>
          <div class="product-tags"><span class="tag tag-cat">${p.category}</span>${sizeTags}${colorTags}</div>
          <div class="product-bottom">
            <span class="product-price">&#8377;${p.price}</span>
            <span class="stock-badge ${stockLabel}">${stockText}</span>
          </div>
          <button class="add-to-cart" onclick="addToCart(${p.id})" ${disabled}>
            ${p.stock === 0 ? "Out of Stock" : "+ Add to Cart"}
          </button>
        </div>
      </div>`;
  }).join("");
}

// =============================================
// CART
// =============================================
function addToCart(id) {
  const product = (window.PRODUCTS || PRODUCTS).find(p => p.id === id);
  if (!product || product.stock === 0) return;
  cart[id] = cart[id] ? { ...cart[id], qty: cart[id].qty + 1 } : { ...product, qty: 1 };
  if (currentUser) saveUserCart(currentUser.email, cart);
  updateCartUI();
  showToast("✓ " + product.name + " added to cart");
}

function removeFromCart(id) { delete cart[id]; if (currentUser) saveUserCart(currentUser.email, cart); updateCartUI(); }

function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id].qty += delta;
  if (cart[id].qty <= 0) delete cart[id];
  if (currentUser) saveUserCart(currentUser.email, cart);
  updateCartUI();
}

function updateCartUI() {
  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  document.getElementById("cartCount").textContent = count;
  const container = document.getElementById("cartItems");
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
    document.getElementById("cartFooter").style.display = "none"; return;
  }
  container.innerHTML = items.map(i => `
    <div class="cart-item">
      <img class="cart-item-img" src="${i.image}" alt="${i.name}" onerror="this.src='https://via.placeholder.com/60x75?text=?'"/>
      <div class="cart-item-info">
        <div class="cart-item-name">${i.name}</div>
        <div class="cart-item-price">&#8377;${i.price} &times; ${i.qty} = &#8377;${i.price * i.qty}</div>
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty(${i.id}, -1)">&#8722;</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" onclick="changeQty(${i.id}, +1)">+</button>
          <button class="remove-item" onclick="removeFromCart(${i.id})">&#10005; Remove</button>
        </div>
      </div>
    </div>`).join("");
  document.getElementById("cartTotal").innerHTML = "&#8377;" + total;
  document.getElementById("cartFooter").style.display = "block";
}

function toggleCart() {
  document.getElementById("cartSidebar").classList.toggle("open");
  document.getElementById("cartOverlay").classList.toggle("open");
}

// =============================================
// CHECKOUT
// =============================================
function openCheckout() {
  const items = Object.values(cart);
  if (items.length === 0) return;
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const summary = document.getElementById("orderSummary");
  summary.innerHTML = items.map(i => `<div class="order-summary-item"><span>${i.name} &times; ${i.qty}</span><span>&#8377;${i.price * i.qty}</span></div>`).join("") +
    `<div class="order-summary-item order-summary-total"><span>Total</span><span>&#8377;${total}</span></div>`;
  if (currentUser) {
    document.getElementById("custName").value  = currentUser.firstName + " " + currentUser.lastName;
    document.getElementById("custPhone").value = currentUser.phone;
    document.getElementById("custEmail").value = currentUser.email;
    // Load saved addresses into selector
    loadCheckoutAddresses();
  }
  document.getElementById("modalOverlay").classList.add("open");
}

function renderCheckoutAddresses(addrGroup, addresses) {
  if (!addresses.length) {
    // No saved addresses — show plain textarea
    addrGroup.innerHTML = `<label>Delivery Address *</label><textarea id="custAddress" placeholder="Full address with PIN code" required rows="3"></textarea>`;
    return;
  }
  const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
  const opts = addresses.map(a =>
    `<option value="${encodeURIComponent(a.text)}" ${a.id === defaultAddr.id ? "selected" : ""}>${a.label}: ${a.text.substring(0,50)}${a.text.length>50?"…":""}</option>`
  ).join("") + `<option value="__new__">✏️ Enter a different address…</option>`;
  addrGroup.innerHTML = `
    <label>Delivery Address *</label>
    <select id="addrDropdown" onchange="onCheckoutAddrChange(this.value)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;font-size:0.95rem">${opts}</select>
    <textarea id="custAddress" style="display:none" placeholder="Full address with PIN code" rows="3"></textarea>
    <div id="checkoutSaveAddrBox" style="display:none;margin-top:8px;padding:10px;background:#fdf5f5;border-radius:6px;border:1px solid #f0c0c0">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
        <input type="checkbox" id="checkoutSaveAddr"> Save this address to my account
      </label>
      <div id="checkoutSaveAddrOptions" style="display:none;margin-top:8px">
        <input type="text" id="checkoutAddrLabel" placeholder="Label (e.g. Home, Shop)" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-bottom:6px;font-size:0.85rem"/>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
          <input type="checkbox" id="checkoutMakeDef"> Make this my default address
        </label>
      </div>
    </div>`;
  // Set hidden textarea value to default address
  document.getElementById("custAddress").value = defaultAddr.text;
  // Wire save checkbox toggle
  document.getElementById("checkoutSaveAddr") && document.getElementById("checkoutSaveAddr").addEventListener("change", function() {
    document.getElementById("checkoutSaveAddrOptions").style.display = this.checked ? "block" : "none";
  });
  // Set initial textarea value for form submission
  onCheckoutAddrChange(encodeURIComponent(defaultAddr.text));
}

async function loadCheckoutAddresses() {
  const addrGroup = document.getElementById("checkoutAddrGroup");
  if (!addrGroup || !currentUser) return;
  // Show cached addresses instantly (no spinner)
  const cached = getCachedAddresses(currentUser.email);
  if (cached) renderCheckoutAddresses(addrGroup, cached);
  // Refresh from Sheets in background
  const fresh = await fetchSheetAddresses(currentUser.email);
  const el = document.getElementById("checkoutAddrGroup");
  if (el) renderCheckoutAddresses(el, fresh);
}

function onCheckoutAddrChange(val) {
  const textarea = document.getElementById("custAddress");
  const saveBox  = document.getElementById("checkoutSaveAddrBox");
  if (val === "__new__") {
    textarea.style.display = "block";
    textarea.required = true;
    textarea.value = "";
    if (saveBox && currentUser) saveBox.style.display = "block";
  } else {
    textarea.style.display = "none";
    textarea.required = false;
    textarea.value = decodeURIComponent(val);
    if (saveBox) saveBox.style.display = "none";
  }
}

function closeCheckout() { document.getElementById("modalOverlay").classList.remove("open"); }
function closeModal(e)   { if (e.target === document.getElementById("modalOverlay")) closeCheckout(); }

// =============================================
// SUBMIT ORDER
// =============================================
async function submitOrder(e) {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  btn.disabled = true; btn.textContent = "Placing Order...";

  const items    = Object.values(cart);
  const total    = items.reduce((s, i) => s + i.price * i.qty, 0);
  const productsStr = items.map(i => `${i.name} x ${i.qty}`).join(", ");
  const orderTimestamp = Date.now().toString();
  const orderIdDisplay = "ORD-" + orderTimestamp.slice(-6);

  const orderData = {
    orderId:  orderIdDisplay,
    name:     document.getElementById("custName").value.trim(),
    phone:    document.getElementById("custPhone").value.trim(),
    email:    document.getElementById("custEmail").value.trim(),
    address:  document.getElementById("custAddress").value.trim(),
    products: productsStr,
    total,
    remarks:  document.getElementById("custRemarks").value.trim()
  };

  try {
    await fetch(ORDERS_API_URL + "?action=order&data=" + encodeURIComponent(JSON.stringify(orderData)), { method: "GET", mode: "no-cors" });
    // Order is now saved in Google Sheets — no localStorage needed
    // Check if user wants to save a new address entered at checkout
    if (currentUser) {
      const saveCheck = document.getElementById("checkoutSaveAddr");
      if (saveCheck && saveCheck.checked) {
        const addrText = orderData.address;
        const addrLabel = (document.getElementById("checkoutAddrLabel").value || "Address").trim();
        const makeDef   = document.getElementById("checkoutMakeDef") && document.getElementById("checkoutMakeDef").checked;
        const newId = "addr_" + Date.now();
        await apiSaveAddress(currentUser.email, addrLabel, addrText, makeDef, newId);
      }
    }
    const summaryHtml = `<div class="ty-customer"><b>${orderData.name}</b> &nbsp;|&nbsp; ${orderData.phone}</div>` +
      (orderData.address ? `<div class="ty-address">&#128205; ${orderData.address}</div>` : "") +
      `<div class="ty-items">` +
      items.map(i => `<div class="ty-item"><span>${i.name} &times; ${i.qty}</span><span>&#8377;${i.price * i.qty}</span></div>`).join("") +
      `<div class="ty-item ty-total"><span>Total</span><span>&#8377;${total}</span></div></div>`;
    document.getElementById("thankOrderId").textContent = orderIdDisplay;
    document.getElementById("thankYouSummary").innerHTML = summaryHtml;
    cart = {};
    if (currentUser) saveUserCart(currentUser.email, {});
    updateCartUI();
    closeCheckout();
    document.getElementById("cartSidebar").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
    document.getElementById("orderForm").reset();
    document.getElementById("thankYouOverlay").classList.add("open");
  } catch (err) {
    console.error(err);
    showToast("Something went wrong. Please try WhatsApp order.");
  } finally {
    btn.disabled = false; btn.textContent = "Place Order";
  }
}

function closeThankYou() { document.getElementById("thankYouOverlay").classList.remove("open"); }

// =============================================
// TOAST
// =============================================
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// =============================================
// GOOGLE SHEET PRODUCT SYNC
// =============================================
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.map(line => {
    const cells = []; let cell = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cell.trim()); cell = ""; continue; }
      cell += ch;
    }
    cells.push(cell.trim()); return cells;
  }).filter(r => r.join("").trim());
}

function normColor(c) { if (!c) return "Red"; const s = c.trim(); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

async function loadProductsFromSheet() {
  if (!SHEET_CSV_URL) return false;
  try {
    const freshUrl = SHEET_CSV_URL + "&nocache=" + Date.now();
    const resp = await fetch(freshUrl, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return false;
    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, "_").trim());
    const col = name => headers.indexOf(name);
    const nameCol = col("product_name") >= 0 ? col("product_name") : col("name");
    const idCol   = col("product_id");
    const catCol  = col("category");
    const priceCol= col("price");
    const sizeCol = col("size") >= 0 ? col("size") : col("sizes");
    const colorCol= col("colors") >= 0 ? col("colors") : col("color");
    const stockCol= col("set_quantity") >= 0 ? col("set_quantity") : col("stock");
    const stockStatusCol = col("stock_status");
    const imgCol  = col("image_url") >= 0 ? col("image_url") : col("image");
    const subImgCol  = col("sub_images");
    const descCol    = col("description");
    const slugCol    = col("slug");

    const loaded  = rows.slice(1)
      .filter(r => nameCol >= 0 && (r[nameCol] || "").trim())
      .map((row, i) => {
        const name    = (row[nameCol] || "").trim();
        const sizes   = ((row[sizeCol] || "M") + "").split(",").map(s => s.trim()).filter(Boolean);
        const cols    = ((row[colorCol] || "Red") + "").split(",").map(c => normColor(c)).filter(Boolean);
        const stockRaw= row[stockCol];
        const stockStatus = stockStatusCol >= 0 ? (row[stockStatusCol] || "").trim().toLowerCase() : "";
        const isOut   = stockStatus === "out_of_stock" || stockStatus === "out of stock";
        const stock   = isOut ? 0 : (stockRaw !== undefined && stockRaw !== "") ? (parseInt(stockRaw) || 0) : 10;
        const pid     = idCol >= 0 ? (parseInt(row[idCol]) || i + 1) : (i + 1);
        const imgUrl  = imgCol >= 0 ? (row[imgCol] || "").trim() : "";
        const cat     = catCol >= 0 ? ((row[catCol] || "Dress").trim() || "Dress") : "Dress";
        const subImgs = subImgCol >= 0 ? ((row[subImgCol] || "").split(",").map(u => u.trim()).filter(Boolean)) : [];
        const desc    = descCol >= 0 ? (row[descCol] || "").trim() : "";
        const slug    = slugCol >= 0 ? (row[slugCol] || "").trim() : "";
        return { id: pid, name, category: cat, price: parseInt(row[priceCol]) || 0,
          sizes: sizes.length ? sizes : ["M"], colors: cols.length ? cols : ["Red"],
          size: sizes[0] || "M", color: cols[0] || "Red", stock,
          image: imgUrl || ("https://placehold.co/300x400/f5ede8/8B1A1A?text=" + encodeURIComponent(name)),
          subImages: subImgs, description: desc, slug };
      });
    if (loaded.length === 0) return false;
    window.PRODUCTS = loaded;
    updateDynamicFilters();
    buildCarousel(loaded);
    checkProductSlugInUrl(); // auto-open if URL has ?product=slug
    return true;
  } catch (err) {
    console.warn("[Sheet sync failed, using bundled products]", err.message);
    return false;
  }
}

function updateDynamicFilters() {
  const prods  = window.PRODUCTS || PRODUCTS;
  const cats   = [...new Set(prods.map(p => p.category).filter(Boolean))];
  const sizes  = [...new Set(prods.flatMap(p => p.sizes  || [p.size  || "M"]).filter(Boolean))];
  const colors = [...new Set(prods.flatMap(p => p.colors || [p.color || "Red"]).filter(Boolean))];
  const catSel = document.getElementById("filterCategory");
  if (catSel && cats.length) catSel.innerHTML = '<option value="">🏷️ All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join("");
  const sizeSel = document.getElementById("filterSize");
  if (sizeSel && sizes.length) sizeSel.innerHTML = '<option value="">📏 All Sizes</option>' + sizes.map(s => `<option value="${s}">${s}</option>`).join("");
  const colorSel = document.getElementById("filterColor");
  if (colorSel && colors.length) colorSel.innerHTML = '<option value="">🎨 All Colors</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join("");
}

function toggleFilterPanel() {
  const panel = document.getElementById("filterPanel");
  const btn   = document.getElementById("filterToggleBtn");
  if (!panel) return;
  const isOpen = panel.classList.toggle("open");
  if (btn) btn.classList.toggle("active", isOpen);
}

// =============================================
// INIT
// =============================================
document.addEventListener("DOMContentLoaded", async () => {
  loadSession();
  renderProducts();
  if (SHEET_CSV_URL) { const loaded = await loadProductsFromSheet(); if (loaded) { renderProducts(); updateDynamicFilters(); } }
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && SHEET_CSV_URL) { const ok = await loadProductsFromSheet(); if (ok) renderProducts(); }
  });
  setInterval(async () => {
    if (!document.hidden && SHEET_CSV_URL) { const ok = await loadProductsFromSheet(); if (ok) renderProducts(); }
  }, 5 * 60 * 1000);
  document.addEventListener("click", (e) => {
    const dd  = document.getElementById("userDropdown");
    const btn = document.getElementById("authBtn");
    if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) closeUserDropdown();
  });
});
