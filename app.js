/* =============================================
   Mathura Poshak Bhandaar – Main App Logic
   ============================================= */

const ORDERS_API_URL = "https://script.google.com/macros/s/AKfycbwwzRrKZMCmAm2cTWvHExJo9hm4b3kKo7RToM4uiCBCdTGfwLJtBs-F8V9Rh4NK9wOW/exec";

let cart = {};
let currentUser = null;

// =============================================
// STORAGE HELPERS
// =============================================
function getUsers() {
  try { return JSON.parse(localStorage.getItem("mpb_users") || "[]"); } catch(e) { return []; }
}
function saveUsers(u) { localStorage.setItem("mpb_users", JSON.stringify(u)); }
function getSession() { return localStorage.getItem("mpb_session"); }
function getUserCart(email) {
  try { return JSON.parse(localStorage.getItem("mpb_cart_" + email) || "{}"); } catch(e) { return {}; }
}
function saveUserCart(email, c) { localStorage.setItem("mpb_cart_" + email, JSON.stringify(c)); }
function getUserWishlist(email) {
  try { return JSON.parse(localStorage.getItem("mpb_wishlist_" + email) || "[]"); } catch(e) { return []; }
}
function saveUserWishlist(email, w) { localStorage.setItem("mpb_wishlist_" + email, JSON.stringify(w)); }
function getUserOrders(email) {
  try { return JSON.parse(localStorage.getItem("mpb_orders_" + email) || "[]"); } catch(e) { return []; }
}
function saveUserOrders(email, o) { localStorage.setItem("mpb_orders_" + email, JSON.stringify(o)); }

// =============================================
// SESSION
// =============================================
function loadSession() {
  const email = getSession();
  if (!email) return;
  const user = getUsers().find(u => u.email === email);
  if (user) {
    currentUser = user;
    cart = getUserCart(email);
    updateCartUI();
    updateAuthBtn();
  }
}

function updateAuthBtn() {
  const btn = document.getElementById("authBtn");
  const txt = document.getElementById("authBtnText");
  const ddName = document.getElementById("userDropdownName");
  if (currentUser) {
    txt.textContent = currentUser.firstName;
    btn.classList.add("logged-in");
    if (ddName) ddName.textContent = "👤 " + currentUser.firstName + " " + currentUser.lastName;
    updateWishlistBadge();
  } else {
    txt.textContent = "Login";
    btn.classList.remove("logged-in");
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
  // clear inputs
  ["loginEmail","loginPassword","regFirstName","regLastName","regEmail","regPhone","regPassword","regConfirmPassword"]
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
}

function closeAuthModal(e) {
  if (e.target === document.getElementById("authOverlay")) closeAuth();
}

function switchTab(tab) {
  document.getElementById("loginForm").style.display   = tab === "login"    ? "block" : "none";
  document.getElementById("registerForm").style.display = tab === "register" ? "block" : "none";
  document.getElementById("loginTab").classList.toggle("active",    tab === "login");
  document.getElementById("registerTab").classList.toggle("active", tab === "register");
}

// =============================================
// AUTH – LOGIN
// =============================================
function doLogin() {
  const email    = (document.getElementById("loginEmail").value || "").trim().toLowerCase();
  const password = (document.getElementById("loginPassword").value || "");
  if (!email || !password) { showToast("Please enter email and password"); return; }

  const user = getUsers().find(u => u.email === email && u.password === password);
  if (!user) { showToast("❌ Invalid email or password"); return; }

  currentUser = user;
  localStorage.setItem("mpb_session", email);
  cart = getUserCart(email);
  updateCartUI();
  updateAuthBtn();
  closeAuth();
  renderProducts();
  showToast("Welcome back, " + user.firstName + "! 🎉");
}

// =============================================
// AUTH – REGISTER
// =============================================
function doRegister() {
  const firstName  = (document.getElementById("regFirstName").value || "").trim();
  const lastName   = (document.getElementById("regLastName").value || "").trim();
  const email      = (document.getElementById("regEmail").value || "").trim().toLowerCase();
  const phone      = (document.getElementById("regPhone").value || "").trim();
  const password   = (document.getElementById("regPassword").value || "");
  const confirmPwd = (document.getElementById("regConfirmPassword").value || "");

  if (!firstName || !lastName || !email || !phone || !password || !confirmPwd) {
    showToast("Please fill all required fields"); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Please enter a valid email address"); return;
  }
  if (!/^[0-9]{10}$/.test(phone)) {
    showToast("Please enter a valid 10-digit phone number"); return;
  }
  if (password.length < 6) {
    showToast("Password must be at least 6 characters"); return;
  }
  if (password !== confirmPwd) {
    showToast("Passwords do not match"); return;
  }

  const users = getUsers();
  if (users.find(u => u.email === email)) {
    showToast("An account with this email already exists"); return;
  }

  const newUser = { firstName, lastName, email, phone, password };
  users.push(newUser);
  saveUsers(users);

  currentUser = newUser;
  localStorage.setItem("mpb_session", email);
  cart = {};
  updateCartUI();
  updateAuthBtn();
  closeAuth();
  renderProducts();
  showToast("Account created! Welcome, " + firstName + "! 🎉");
}

// =============================================
// AUTH – LOGOUT
// =============================================
function doLogout() {
  if (currentUser) saveUserCart(currentUser.email, cart);
  currentUser = null;
  cart = {};
  localStorage.removeItem("mpb_session");
  updateCartUI();
  updateAuthBtn();
  closeUserDropdown();
  renderProducts();
  showToast("Logged out successfully");
}

// =============================================
// USER DROPDOWN
// =============================================
function toggleUserDropdown() {
  document.getElementById("userDropdown").classList.toggle("open");
}
function closeUserDropdown() {
  document.getElementById("userDropdown").classList.remove("open");
}

// =============================================
// PASSWORD TOGGLE
// =============================================
function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") { input.type = "text";     btn.textContent = "🙈"; }
  else                           { input.type = "password"; btn.textContent = "👁";  }
}

// =============================================
// WISHLIST
// =============================================
function toggleWishlist(id) {
  if (!currentUser) { openAuth("login"); showToast("Please login to use wishlist"); return; }
  const wishlist = getUserWishlist(currentUser.email);
  const idx = wishlist.indexOf(id);
  if (idx > -1) { wishlist.splice(idx, 1); showToast("Removed from wishlist"); }
  else          { wishlist.push(id);        showToast("❤️ Added to wishlist");  }
  saveUserWishlist(currentUser.email, wishlist);
  const btn = document.getElementById("wish-" + id);
  if (btn) { btn.classList.toggle("active", wishlist.includes(id)); btn.textContent = wishlist.includes(id) ? "❤️" : "🤍"; }
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
  const items    = PRODUCTS.filter(p => wishlist.includes(p.id));
  const container = document.getElementById("wishlistItems");
  if (items.length === 0) { container.innerHTML = '<p class="empty-msg">💔 Your wishlist is empty.<br>Tap the 🤍 on any product to save it.</p>'; return; }
  container.innerHTML = items.map(p => `
    <div class="side-item">
      <img src="${p.image}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/70x88?text=?'"/>
      <div class="side-item-info">
        <div class="side-item-name">${p.name}</div>
        <div class="side-item-meta">${p.size} • ${p.color} • ${p.category}</div>
        <div class="side-item-price">₹${p.price}</div>
        <div class="side-item-actions">
          <button class="add-to-cart-sm" onclick="addToCart(${p.id})" ${p.stock===0 ? "disabled" : ""}>${p.stock===0 ? "Out of Stock" : "+ Add to Cart"}</button>
          <button class="remove-sm" onclick="toggleWishlist(${p.id});renderWishlist()">✕ Remove</button>
        </div>
      </div>
    </div>`).join("");
}

// =============================================
// ORDER HISTORY
// =============================================
function openOrderHistory() {
  closeUserDropdown();
  if (!currentUser) { openAuth("login"); return; }
  renderOrderHistory();
  document.getElementById("ordersOverlay").classList.add("open");
}
function closeOrderHistory() { document.getElementById("ordersOverlay").classList.remove("open"); }
function closeOrdersModal(e) { if (e.target === document.getElementById("ordersOverlay")) closeOrderHistory(); }

function renderOrderHistory() {
  const orders = getUserOrders(currentUser.email);
  const container = document.getElementById("ordersContent");
  if (orders.length === 0) { container.innerHTML = '<p class="empty-msg">📭 No orders yet.<br>Place your first order today!</p>'; return; }
  container.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-card-header">
        <div>
          <strong class="order-id">${o.orderId}</strong>
          <span class="order-date">${o.date}</span>
        </div>
        <div class="order-total">₹${o.total}</div>
      </div>
      <div class="order-items-row">
        ${(o.items || []).map(i => `<span class="order-tag">${i.name} ×${i.qty}</span>`).join("")}
      </div>
      ${o.address ? `<div class="order-address">📍 ${o.address}</div>` : ""}
      <div class="order-status-badge">✅ Order Placed</div>
    </div>`).join("");
}

// =============================================
// SEARCH & FILTER
// =============================================
function applyFilters() {
  const search   = (document.getElementById("searchInput").value || "").toLowerCase().trim();
  const cat      = document.getElementById("filterCategory").value;
  const size     = document.getElementById("filterSize").value;
  const color    = document.getElementById("filterColor").value;
  const stock    = document.getElementById("filterStock").value;
  const sort     = document.getElementById("sortPrice").value;
  const minP     = parseInt(document.getElementById("priceMinInput").value) || 0;
  const maxP     = parseInt(document.getElementById("priceMaxInput").value) || 999999;

  let filtered = [...PRODUCTS];

  if (search) filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(search) ||
    (p.category || "").toLowerCase().includes(search) ||
    (p.color || "").toLowerCase().includes(search) ||
    p.size.toLowerCase().includes(search)
  );
  if (cat)   filtered = filtered.filter(p => p.category === cat);
  if (size)  filtered = filtered.filter(p => p.size === size);
  if (color) filtered = filtered.filter(p => p.color === color);
  if (stock === "in_stock")  filtered = filtered.filter(p => p.stock > 3);
  else if (stock === "low_stock")  filtered = filtered.filter(p => p.stock > 0 && p.stock <= 3);
  else if (stock === "out_stock")  filtered = filtered.filter(p => p.stock === 0);

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
  const prods    = products !== undefined ? products : PRODUCTS;
  const grid     = document.getElementById("productsGrid");
  const wishlist = currentUser ? getUserWishlist(currentUser.email) : [];

  const COLOR_DOT = {
    Blue: "#4a90d9", Red: "#d94a4a", Yellow: "#f5c518", Green: "#4caf50",
    Pink: "#e91e8c", Orange: "#ff6600", Purple: "#7c4dff", White: "#e0d6ce"
  };

  grid.innerHTML = prods.map(p => {
    const stockLabel = p.stock === 0 ? "out-of-stock" : p.stock <= 3 ? "low-stock" : "in-stock";
    const stockText  = p.stock === 0 ? "Out of Stock" : p.stock <= 3 ? `Only ${p.stock} left` : "In Stock";
    const disabled   = p.stock === 0 ? "disabled" : "";
    const wished     = wishlist.includes(p.id);
    const dot        = COLOR_DOT[p.color] || "#ccc";
    return `
      <div class="product-card" id="card-${p.id}">
        <div class="product-img-wrap">
          <img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'"/>
          <button class="wish-btn ${wished ? "active" : ""}" id="wish-${p.id}" onclick="toggleWishlist(${p.id})" title="Wishlist">${wished ? "❤️" : "🤍"}</button>
        </div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-tags">
            <span class="tag tag-cat">${p.category}</span>
            <span class="tag tag-size">📏 ${p.size}</span>
            <span class="tag tag-color"><span class="color-dot" style="background:${dot}"></span>${p.color}</span>
          </div>
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
  const product = PRODUCTS.find(p => p.id === id);
  if (!product || product.stock === 0) return;
  cart[id] = cart[id] ? { ...cart[id], qty: cart[id].qty + 1 } : { ...product, qty: 1 };
  if (currentUser) saveUserCart(currentUser.email, cart);
  updateCartUI();
  showToast("✓ " + product.name + " added to cart");
}

function removeFromCart(id) {
  delete cart[id];
  if (currentUser) saveUserCart(currentUser.email, cart);
  updateCartUI();
}

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
    document.getElementById("cartFooter").style.display = "none";
    return;
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
  document.getElementById("cartTotal").textContent = "&#8377;" + total;
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
  const total   = items.reduce((s, i) => s + i.price * i.qty, 0);
  const summary = document.getElementById("orderSummary");
  summary.innerHTML = items.map(i =>
    `<div class="order-summary-item"><span>${i.name} &times; ${i.qty}</span><span>&#8377;${i.price * i.qty}</span></div>`
  ).join("") +
  `<div class="order-summary-item order-summary-total"><span>Total</span><span>&#8377;${total}</span></div>`;

  if (currentUser) {
    document.getElementById("custName").value  = currentUser.firstName + " " + currentUser.lastName;
    document.getElementById("custPhone").value = currentUser.phone;
    document.getElementById("custEmail").value = currentUser.email;
  }
  document.getElementById("modalOverlay").classList.add("open");
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

  const items      = Object.values(cart);
  const total      = items.reduce((s, i) => s + i.price * i.qty, 0);
  const productsStr = items.map(i => `${i.name} x ${i.qty}`).join(", ");
  const orderId    = "ORD-" + Date.now().toString().slice(-6);

  const orderData = {
    orderId,
    name:     document.getElementById("custName").value.trim(),
    phone:    document.getElementById("custPhone").value.trim(),
    email:    document.getElementById("custEmail").value.trim(),
    address:  document.getElementById("custAddress").value.trim(),
    products: productsStr,
    total,
    remarks:  document.getElementById("custRemarks").value.trim()
  };

  try {
    const apiUrl = ORDERS_API_URL + "?action=order&data=" + encodeURIComponent(JSON.stringify(orderData));
    await fetch(apiUrl, { method: "GET", mode: "no-cors" });

    // Save to order history
    if (currentUser) {
      const orders = getUserOrders(currentUser.email);
      orders.unshift({ ...orderData, date: new Date().toLocaleDateString("en-IN"), items: [...items] });
      saveUserOrders(currentUser.email, orders);
    }

    // Build thank-you summary
    const summaryHtml =
      `<div class="ty-customer"><b>${orderData.name}</b> &nbsp;|&nbsp; ${orderData.phone}</div>` +
      (orderData.address ? `<div class="ty-address">&#128205; ${orderData.address}</div>` : "") +
      `<div class="ty-items">` +
      items.map(i => `<div class="ty-item"><span>${i.name} &times; ${i.qty}</span><span>&#8377;${i.price * i.qty}</span></div>`).join("") +
      `<div class="ty-item ty-total"><span>Total</span><span>&#8377;${total}</span></div></div>`;

    document.getElementById("thankOrderId").textContent = orderId;
    document.getElementById("thankYouSummary").innerHTML = summaryHtml;

    // Clear cart
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
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// =============================================
// INIT
// =============================================
document.addEventListener("DOMContentLoaded", () => {
  loadSession();
  renderProducts();

  // Close user dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dd  = document.getElementById("userDropdown");
    const btn = document.getElementById("authBtn");
    if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) {
      closeUserDropdown();
    }
  });
});
