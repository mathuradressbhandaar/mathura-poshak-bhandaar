/* ============================================
   Mathura Poshak Bhandaar – Main App Logic
   ============================================= */

const ORDERS_API_URL = "https://script.google.com/macros/s/AKfycbwwzRrKZMCmAm2cTWvHExJo9hm4b3kKo7RToM4uiCBCdTGfwLJtBs-F8V9Rh4NK9wOW/exec";
const WHATSAPP_NUMBER = "919760096109";

let cart = {};
let currentUser = null;

// ---- USER SESSION ----
function loadUser() {
  try {
    const u = localStorage.getItem("mpb_user");
    if (u) { currentUser = JSON.parse(u); updateLoginBtn(); }
  } catch(e) {}
}

function updateLoginBtn() {
  const btn = document.getElementById("loginBtnText");
  if (currentUser) {
    btn.textContent = currentUser.name.split(" ")[0];
  } else {
    btn.textContent = "Login";
  }
}

// ---- LOGIN ----
function openLogin() {
  if (currentUser) {
    if (confirm("Logged in as " + currentUser.name + "\n\nClick OK to logout.")) {
      currentUser = null;
      localStorage.removeItem("mpb_user");
      updateLoginBtn();
      showToast("Logged out successfully");
    }
    return;
  }
  document.getElementById("loginOverlay").classList.add("open");
}

function closeLogin() {
  document.getElementById("loginOverlay").classList.remove("open");
}

function closeLoginModal(e) {
  if (e.target === document.getElementById("loginOverlay")) closeLogin();
}

function doLogin() {
  const name = document.getElementById("loginName").value.trim();
  const phone = document.getElementById("loginPhone").value.trim();
  const business = document.getElementById("loginBusiness").value.trim();
  if (!name || !phone) { showToast("Please enter name and phone number"); return; }
  if (!/^[0-9]{10}$/.test(phone)) { showToast("Please enter a valid 10-digit phone"); return; }
  currentUser = { name, phone, business };
  localStorage.setItem("mpb_user", JSON.stringify(currentUser));
  updateLoginBtn();
  closeLogin();
  showToast("Welcome, " + name + "!");
  document.getElementById("loginName").value = "";
  document.getElementById("loginPhone").value = "";
  document.getElementById("loginBusiness").value = "";
}

// ---- SEARCH & FILTER ----
function applyFilters() {
  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const stockFilter = document.getElementById("filterStock").value;
  const sortPrice = document.getElementById("sortPrice").value;

  let filtered = [...PRODUCTS];

  if (search) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.size.toLowerCase().includes(search)
    );
  }

  if (stockFilter === "in_stock")  filtered = filtered.filter(p => p.stock > 3);
  else if (stockFilter === "low_stock") filtered = filtered.filter(p => p.stock > 0 && p.stock <= 3);
  else if (stockFilter === "out_stock") filtered = filtered.filter(p => p.stock === 0);

  if (sortPrice === "low_high") filtered.sort((a, b) => a.price - b.price);
  else if (sortPrice === "high_low") filtered.sort((a, b) => b.price - a.price);

  renderProducts(filtered);
  document.getElementById("noResults").style.display = filtered.length === 0 ? "block" : "none";
}

function clearFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterStock").value = "";
  document.getElementById("sortPrice").value = "";
  applyFilters();
}

// ---- RENDER PRODUCTS ----
function renderProducts(products) {
  const prods = products !== undefined ? products : PRODUCTS;
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = prods.map(p => {
    const stockLabel = p.stock === 0 ? "out-of-stock" : p.stock <= 3 ? "low-stock" : "in-stock";
    const stockText  = p.stock === 0 ? "Out of Stock" : p.stock <= 3 ? `Only ${p.stock} left` : "In Stock";
    const disabled   = p.stock === 0 ? "disabled" : "";
    return `
      <div class="product-card" id="card-${p.id}">
        <img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'"/>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-size">Size: ${p.size}</div>
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

// ---- CART ----
function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product || product.stock === 0) return;
  cart[id] = cart[id] ? { ...cart[id], qty: cart[id].qty + 1 } : { ...product, qty: 1 };
  updateCartUI();
  showToast("✓ " + product.name + " added to cart");
  // Cart does NOT auto-open — user clicks Cart button to view
}

function removeFromCart(id) {
  delete cart[id];
  updateCartUI();
}

function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id].qty += delta;
  if (cart[id].qty <= 0) delete cart[id];
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

// ---- CHECKOUT ----
function openCheckout() {
  const items = Object.values(cart);
  if (items.length === 0) return;
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const summary = document.getElementById("orderSummary");
  summary.innerHTML = items.map(i =>
    `<div class="order-summary-item"><span>${i.name} &times; ${i.qty}</span><span>&#8377;${i.price * i.qty}</span></div>`
  ).join("") +
  `<div class="order-summary-item order-summary-total"><span>Total</span><span>&#8377;${total}</span></div>`;

  // Pre-fill if logged in
  if (currentUser) {
    document.getElementById("custName").value = currentUser.name;
    document.getElementById("custPhone").value = currentUser.phone;
  }

  document.getElementById("modalOverlay").classList.add("open");
}

function closeCheckout() {
  document.getElementById("modalOverlay").classList.remove("open");
}

function closeModal(e) {
  if (e.target === document.getElementById("modalOverlay")) closeCheckout();
}

// ---- SUBMIT ORDER ----
async function submitOrder(e) {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Placing Order...";

  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const productsStr = items.map(i => `${i.name} x ${i.qty}`).join(", ");

  // Generate unique order ID
  const orderId = "ORD-" + Date.now().toString().slice(-6);

  const orderData = {
    orderId,
    name:     document.getElementById("custName").value.trim(),
    phone:    document.getElementById("custPhone").value.trim(),
    email:    document.getElementById("custEmail").value.trim(),
    address:  document.getElementById("custAddress").value.trim(),
    products: productsStr,
    total:    total,
    remarks:  document.getElementById("custRemarks").value.trim()
  };

  try {
    // Submit to Google Sheets via Apps Script
    const apiUrl = ORDERS_API_URL +
      "?action=order&data=" + encodeURIComponent(JSON.stringify(orderData));
    await fetch(apiUrl, { method: "GET", mode: "no-cors" });

    // Build thank you summary HTML
    const summaryHtml =
      `<div class="ty-customer"><b>${orderData.name}</b> &nbsp;|&nbsp; ${orderData.phone}</div>` +
      (orderData.address ? `<div class="ty-address">&#128205; ${orderData.address}</div>` : "") +
      `<div class="ty-items">` +
      items.map(i => `<div class="ty-item"><span>${i.name} &times; ${i.qty}</span><span>&#8377;${i.price * i.qty}</span></div>`).join("") +
      `<div class="ty-item ty-total"><span>Total</span><span>&#8377;${total}</span></div>` +
      `</div>`;

    document.getElementById("thankOrderId").textContent = orderId;
    document.getElementById("thankYouSummary").innerHTML = summaryHtml;

    // Clear cart and close modals
    cart = {};
    updateCartUI();
    closeCheckout();
    document.getElementById("cartSidebar").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
    document.getElementById("orderForm").reset();

    // Show thank you modal
    document.getElementById("thankYouOverlay").classList.add("open");

  } catch (err) {
    console.error(err);
    showToast("Something went wrong. Please try WhatsApp order.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Place Order";
  }
}

function closeThankYou() {
  document.getElementById("thankYouOverlay").classList.remove("open");
}

// ---- TOAST ----
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ---- INIT ----
document.addEventListener("DOMContentLoaded", () => {
  loadUser();
  renderProducts();
});
