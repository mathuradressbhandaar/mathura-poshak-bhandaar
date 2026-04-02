/* ============================================
   Mathura Poshak Bhandaar – Main App Logic
   ============================================= */

const ORDERS_API_URL = "https://script.google.com/macros/s/AKfycbwwzRrKZ�MCmAm2cTWvHExJo9hm4b3kKo7RToM4uiCBCdTGfwLJtBs-F8V9Rh4NK9wOW/exec";

let cart = {};

// ---- RENDER PRODUCTS ----
function renderProducts() {
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = PRODUCTS.map(p => {
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
            <span class="product-price">₹${p.price}</span>
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
  showToast(`✓ ${product.name} added to cart`);
  // Open cart briefly
  document.getElementById("cartSidebar").classList.add("open");
  document.getElementById("cartOverlay").classList.add("open");
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
        <div class="cart-item-price">₹${i.price} × ${i.qty} = ₹${i.price * i.qty}</div>
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty(${i.id}, -1)">−</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" onclick="changeQty(${i.id}, +1)">+</button>
          <button class="remove-item" onclick="removeFromCart(${i.id})">✕ Remove</button>
        </div>
      </div>
    </div>`).join("");

  document.getElementById("cartTotal").textContent = `₹${total}`;
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
    `<div class="order-summary-item"><span>${i.name} × ${i.qty}</span><span>₹${i.price * i.qty}</span></div>`
  ).join("") +
  `<div class="order-summary-item order-summary-total"><span>Total</span><span>₹${total}</span></div>`;
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
  btn.textContent = "Placing Order…";

  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const productsStr = items.map(i => `${i.name} x ${i.qty}`).join(", ");

  const orderData = {
    name:     document.getElementById("custName").value.trim(),
    phone:    document.getElementById("custPhone").value.trim(),
    email:    document.getElementById("custEmail").value.trim(),
    address:  document.getElementById("custAddress").value.trim(),
    products: productsStr,
    total:    total,
    remarks:  document.getElementById("custRemarks").value.trim()
  };

  try {
    // Submit to Google Sheets via Apps Script (GET with params to avoid CORS)
    const apiUrl = ORDERS_API_URL +
      "?action=order&data=" + encodeURIComponent(JSON.stringify(orderData));
    await fetch(apiUrl, { method: "GET", mode: "no-cors" });

    // Always also send WhatsApp message as backup
    const waMsg = encodeURIComponent(
      `🛍️ *New Order – Mathura Poshak Bhandaar*\n\n` +
      `👤 *Name:* ${orderData.name}\n` +
      `📞 *Phone:* ${orderData.phone}\n` +
      `📧 *Email:* ${orderData.email || "N/A"}\n` +
      `📍 *Address:* ${orderData.address}\n\n` +
      `🛒 *Items:*\n${items.map(i => `  • ${i.name} × ${i.qty} = ₹${i.price * i.qty}`).join("\n")}\n\n` +
      `💰 *Total: ₹${total}*\n` +
      `📝 *Remarks:* ${orderData.remarks || "None"}`
    );

    // Clear cart
    cart = {};
    updateCartUI();
    closeCheckout();
    document.getElementById("orderForm").reset();

    showToast("🎉 Order placed! Redirecting to WhatsApp…");

    setTimeout(() => {
      window.open(`https://wa.me/918748374835?text=${waMsg}`, "_blank");
    }, 1500);

  } catch (err) {
    console.error(err);
    showToast("❌ Something went wrong. Please try WhatsApp order.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Place Order";
  }
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
  renderProducts();
});
