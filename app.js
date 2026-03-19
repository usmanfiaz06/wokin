// ===== WOK!N Digital Menu — App Logic =====

(function () {
  "use strict";

  // ── State ──
  let cart = [];
  let activeCategory = MENU_DATA[0].id;

  // ── DOM refs ──
  const welcomeScreen = document.getElementById("welcomeScreen");
  const exploreBtn = document.getElementById("exploreBtn");
  const menuApp = document.getElementById("menuApp");
  const catNavScroll = document.getElementById("catNavScroll");
  const menuMain = document.getElementById("menuMain");
  const searchToggle = document.getElementById("searchToggle");
  const searchBar = document.getElementById("searchBar");
  const searchInput = document.getElementById("searchInput");
  const searchClose = document.getElementById("searchClose");
  const searchResults = document.getElementById("searchResults");
  const searchResultsInner = document.getElementById("searchResultsInner");
  const cartToggle = document.getElementById("cartToggle");
  const cartBadge = document.getElementById("cartBadge");
  const cartOverlay = document.getElementById("cartOverlay");
  const cartDrawer = document.getElementById("cartDrawer");
  const cartClose = document.getElementById("cartClose");
  const cartBody = document.getElementById("cartBody");
  const cartEmpty = document.getElementById("cartEmpty");
  const cartItems = document.getElementById("cartItems");
  const cartFooter = document.getElementById("cartFooter");
  const cartTotal = document.getElementById("cartTotal");
  const orderBtn = document.getElementById("orderBtn");
  const orderModalOverlay = document.getElementById("orderModalOverlay");
  const orderModalBody = document.getElementById("orderModalBody");
  const orderModalTotal = document.getElementById("orderModalTotal");
  const orderModalClose = document.getElementById("orderModalClose");

  // ── Fun toast messages ──
  const toastMessages = [
    "Great choice! 🔥",
    "Your wok approves! 👨‍🍳",
    "Added! Keep going! 🍜",
    "Excellent taste! ✨",
    "Ooh, nice pick! 😋",
    "Into the wok it goes! 🥘",
    "You know what's good! 💯",
    "Chef's nod of approval 🤌",
  ];

  // ── Helpers ──
  function formatPrice(p) {
    return "Rs. " + p.toLocaleString("en-PK");
  }

  function showToast(msg) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function randomToast() {
    return toastMessages[Math.floor(Math.random() * toastMessages.length)];
  }

  // ── Welcome Screen ──
  exploreBtn.addEventListener("click", () => {
    welcomeScreen.classList.add("hiding");
    setTimeout(() => {
      welcomeScreen.style.display = "none";
      menuApp.style.display = "block";
    }, 600);
  });

  // ── Build Category Nav ──
  function buildCatNav() {
    catNavScroll.innerHTML = "";
    MENU_DATA.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "cat-btn" + (cat.id === activeCategory ? " active" : "");
      btn.dataset.category = cat.id;
      btn.textContent = cat.emoji + " " + cat.name;
      btn.addEventListener("click", () => scrollToCategory(cat.id));
      catNavScroll.appendChild(btn);
    });
  }

  function scrollToCategory(catId) {
    const section = document.getElementById("section-" + catId);
    if (section) {
      const offset = 110; // top-bar + nav height
      const top = section.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setActiveNav(catId);
  }

  function setActiveNav(catId) {
    activeCategory = catId;
    catNavScroll.querySelectorAll(".cat-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.category === catId);
      if (btn.dataset.category === catId) {
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });
  }

  // ── Build Menu Sections ──
  function buildMenu() {
    menuMain.innerHTML = "";
    MENU_DATA.forEach((cat) => {
      const section = document.createElement("section");
      section.className = "menu-section";
      section.id = "section-" + cat.id;

      section.innerHTML = `
        <div class="section-header">
          <h2 class="section-title"><span class="emoji">${cat.emoji}</span>${cat.name}</h2>
          <p class="section-tagline">${cat.tagline}</p>
        </div>
      `;

      cat.items.forEach((item, idx) => {
        section.appendChild(buildItemCard(item, cat.id, idx));
      });

      menuMain.appendChild(section);
    });
  }

  function buildItemCard(item, catId, idx) {
    const card = document.createElement("div");
    card.className = "menu-item";
    card.dataset.catId = catId;
    card.dataset.idx = idx;

    const hasDual = item.priceFull !== undefined;
    const tagDots = item.tags
      .map((t) => `<span class="tag tag-${t}"></span>`)
      .join("");

    let priceHTML;
    if (hasDual) {
      priceHTML = `
        <div class="item-price-dual">
          <div><span class="price-label">Half</span> <span class="price-value">${formatPrice(item.price)}</span></div>
          <div><span class="price-label">Full</span> <span class="price-value">${formatPrice(item.priceFull)}</span></div>
        </div>`;
    } else {
      priceHTML = `<div class="item-price">${formatPrice(item.price)}</div>`;
    }

    const cartEntry = findCartEntry(catId, idx);

    let actionHTML;
    if (cartEntry) {
      actionHTML = buildQtyHTML(cartEntry.qty);
    } else if (hasDual) {
      actionHTML = `
        <div class="size-selector">
          <button class="size-btn" data-size="half">+ Half</button>
          <button class="size-btn" data-size="full">+ Full</button>
        </div>`;
    } else {
      actionHTML = `<button class="add-btn">ADD</button>`;
    }

    card.innerHTML = `
      <div class="item-top">
        <div class="item-info">
          <div class="item-name">${item.name}${tagDots ? '<span class="item-tags">' + tagDots + "</span>" : ""}</div>
          <p class="item-desc">${item.desc}</p>
          ${item.pcs ? '<p class="item-pcs">' + item.pcs + "</p>" : ""}
        </div>
        <div class="item-right">
          ${priceHTML}
          <div class="item-action">${actionHTML}</div>
        </div>
      </div>
    `;

    // Event: Add / Size select
    const addBtn = card.querySelector(".add-btn");
    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        addToCart(catId, idx, null);
        refreshItemCard(card, catId, idx);
        card.classList.add("just-added");
        setTimeout(() => card.classList.remove("just-added"), 500);
        showToast(randomToast());
      });
    }

    const sizeBtns = card.querySelectorAll(".size-btn");
    sizeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        addToCart(catId, idx, btn.dataset.size);
        refreshItemCard(card, catId, idx);
        card.classList.add("just-added");
        setTimeout(() => card.classList.remove("just-added"), 500);
        showToast(randomToast());
      });
    });

    bindQtyButtons(card, catId, idx);

    return card;
  }

  function buildQtyHTML(qty) {
    return `
      <div class="qty-controls">
        <button class="qty-btn qty-minus">&minus;</button>
        <span class="qty-value">${qty}</span>
        <button class="qty-btn qty-plus">+</button>
      </div>`;
  }

  function bindQtyButtons(card, catId, idx) {
    const minus = card.querySelector(".qty-minus");
    const plus = card.querySelector(".qty-plus");
    if (minus) {
      minus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(catId, idx, -1);
        refreshItemCard(card, catId, idx);
      });
    }
    if (plus) {
      plus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(catId, idx, 1);
        refreshItemCard(card, catId, idx);
      });
    }
  }

  function refreshItemCard(card, catId, idx) {
    const item = getItem(catId, idx);
    const hasDual = item.priceFull !== undefined;
    const cartEntry = findCartEntry(catId, idx);
    const actionEl = card.querySelector(".item-action");

    if (cartEntry) {
      actionEl.innerHTML = buildQtyHTML(cartEntry.qty);
    } else if (hasDual) {
      actionEl.innerHTML = `
        <div class="size-selector">
          <button class="size-btn" data-size="half">+ Half</button>
          <button class="size-btn" data-size="full">+ Full</button>
        </div>`;
      actionEl.querySelectorAll(".size-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          addToCart(catId, idx, btn.dataset.size);
          refreshItemCard(card, catId, idx);
          card.classList.add("just-added");
          setTimeout(() => card.classList.remove("just-added"), 500);
          showToast(randomToast());
        });
      });
    } else {
      actionEl.innerHTML = `<button class="add-btn">ADD</button>`;
      actionEl.querySelector(".add-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        addToCart(catId, idx, null);
        refreshItemCard(card, catId, idx);
        card.classList.add("just-added");
        setTimeout(() => card.classList.remove("just-added"), 500);
        showToast(randomToast());
      });
    }

    bindQtyButtons(card, catId, idx);
    updateCartUI();
  }

  // ── Cart Logic ──
  function getItem(catId, idx) {
    const cat = MENU_DATA.find((c) => c.id === catId);
    return cat ? cat.items[idx] : null;
  }

  function findCartEntry(catId, idx, size) {
    return cart.find(
      (e) => e.catId === catId && e.idx === idx && (size === undefined || e.size === size)
    );
  }

  function addToCart(catId, idx, size) {
    const item = getItem(catId, idx);
    if (!item) return;
    const existing = findCartEntry(catId, idx, size);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({
        catId,
        idx,
        size: size || null,
        qty: 1,
        name: item.name,
        price: size === "full" ? item.priceFull : item.price,
      });
    }
    updateCartUI();
  }

  function changeQty(catId, idx, delta) {
    const entry = findCartEntry(catId, idx);
    if (!entry) return;
    entry.qty += delta;
    if (entry.qty <= 0) {
      cart = cart.filter((e) => e !== entry);
    }
    updateCartUI();
  }

  function cartChangeQty(cartIdx, delta) {
    cart[cartIdx].qty += delta;
    if (cart[cartIdx].qty <= 0) {
      const catId = cart[cartIdx].catId;
      const idx = cart[cartIdx].idx;
      cart.splice(cartIdx, 1);
      // Refresh the menu card if visible
      const card = menuMain.querySelector(
        `.menu-item[data-cat-id="${catId}"][data-idx="${idx}"]`
      );
      if (card) refreshItemCard(card, catId, idx);
    }
    updateCartUI();
    renderCartDrawer();
  }

  function getCartTotal() {
    return cart.reduce((sum, e) => sum + e.price * e.qty, 0);
  }

  function getCartCount() {
    return cart.reduce((sum, e) => sum + e.qty, 0);
  }

  // ── Cart UI ──
  function updateCartUI() {
    const count = getCartCount();
    if (count > 0) {
      cartBadge.style.display = "flex";
      cartBadge.textContent = count;
    } else {
      cartBadge.style.display = "none";
    }
    updateFloatingCart();
  }

  function renderCartDrawer() {
    if (cart.length === 0) {
      cartEmpty.style.display = "block";
      cartItems.innerHTML = "";
      cartFooter.style.display = "none";
      return;
    }

    cartEmpty.style.display = "none";
    cartFooter.style.display = "block";
    cartTotal.textContent = formatPrice(getCartTotal());

    cartItems.innerHTML = "";
    cart.forEach((entry, ci) => {
      const div = document.createElement("div");
      div.className = "cart-item";
      const sizeLabel = entry.size ? ` (${entry.size})` : "";
      div.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name">${entry.name}${sizeLabel}</div>
          <div class="cart-item-price">${formatPrice(entry.price)} each</div>
        </div>
        <div class="cart-item-qty">
          <button class="cart-qty-btn cart-qty-minus" data-ci="${ci}">&minus;</button>
          <span class="cart-qty-val">${entry.qty}</span>
          <button class="cart-qty-btn cart-qty-plus" data-ci="${ci}">+</button>
        </div>
        <div class="cart-item-total">${formatPrice(entry.price * entry.qty)}</div>
      `;
      cartItems.appendChild(div);
    });

    // Bind cart qty buttons
    cartItems.querySelectorAll(".cart-qty-minus").forEach((btn) => {
      btn.addEventListener("click", () => cartChangeQty(+btn.dataset.ci, -1));
    });
    cartItems.querySelectorAll(".cart-qty-plus").forEach((btn) => {
      btn.addEventListener("click", () => cartChangeQty(+btn.dataset.ci, 1));
    });
  }

  // ── Cart Drawer Open/Close ──
  function openCart() {
    renderCartDrawer();
    cartOverlay.classList.add("active");
    cartDrawer.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    cartOverlay.classList.remove("active");
    cartDrawer.classList.remove("active");
    document.body.style.overflow = "";
  }

  cartToggle.addEventListener("click", openCart);
  cartClose.addEventListener("click", closeCart);
  cartOverlay.addEventListener("click", closeCart);

  // ── Floating Cart Button ──
  function createFloatingCart() {
    const fc = document.createElement("button");
    fc.className = "floating-cart";
    fc.id = "floatingCart";
    fc.innerHTML = `
      <div class="floating-cart-left">
        <span class="floating-cart-count" id="fcCount">0</span>
        <span class="floating-cart-label">View Order</span>
      </div>
      <span class="floating-cart-total" id="fcTotal">Rs. 0</span>
    `;
    fc.addEventListener("click", openCart);
    document.body.appendChild(fc);
  }

  function updateFloatingCart() {
    const fc = document.getElementById("floatingCart");
    if (!fc) return;
    const count = getCartCount();
    if (count > 0) {
      fc.classList.add("visible");
      document.getElementById("fcCount").textContent = count;
      document.getElementById("fcTotal").textContent = formatPrice(getCartTotal());
    } else {
      fc.classList.remove("visible");
    }
  }

  // ── Order Summary ──
  orderBtn.addEventListener("click", () => {
    if (cart.length === 0) return;
    orderModalBody.innerHTML = "";
    cart.forEach((entry) => {
      const sizeLabel = entry.size ? ` (${entry.size})` : "";
      const div = document.createElement("div");
      div.className = "order-line";
      div.innerHTML = `
        <span class="order-line-name">${entry.name}${sizeLabel}</span>
        <span class="order-line-qty">x${entry.qty}</span>
        <span class="order-line-price">${formatPrice(entry.price * entry.qty)}</span>
      `;
      orderModalBody.appendChild(div);
    });
    orderModalTotal.textContent = formatPrice(getCartTotal());
    orderModalOverlay.style.display = "flex";
    closeCart();
  });

  orderModalClose.addEventListener("click", () => {
    orderModalOverlay.style.display = "none";
  });

  orderModalOverlay.addEventListener("click", (e) => {
    if (e.target === orderModalOverlay) orderModalOverlay.style.display = "none";
  });

  // ── Search ──
  searchToggle.addEventListener("click", () => {
    searchBar.classList.toggle("active");
    if (searchBar.classList.contains("active")) {
      searchInput.focus();
    } else {
      searchInput.value = "";
      searchResults.style.display = "none";
    }
  });

  searchClose.addEventListener("click", () => {
    searchBar.classList.remove("active");
    searchInput.value = "";
    searchResults.style.display = "none";
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) {
      searchResults.style.display = "none";
      return;
    }
    performSearch(q);
  });

  function performSearch(query) {
    searchResultsInner.innerHTML = "";
    let found = false;

    MENU_DATA.forEach((cat) => {
      const matches = cat.items.filter(
        (item, idx) =>
          item.name.toLowerCase().includes(query) ||
          item.desc.toLowerCase().includes(query)
      );

      if (matches.length > 0) {
        found = true;
        const catHeader = document.createElement("div");
        catHeader.className = "search-result-category";
        catHeader.textContent = cat.emoji + " " + cat.name;
        searchResultsInner.appendChild(catHeader);

        matches.forEach((item) => {
          const idx = cat.items.indexOf(item);
          const card = buildItemCard(item, cat.id, idx);
          searchResultsInner.appendChild(card);
        });
      }
    });

    if (!found) {
      searchResultsInner.innerHTML = `
        <div class="search-no-results">
          <span class="nope-emoji">🤷</span>
          <p>Nothing found for "${query}"</p>
          <p style="font-size:0.82rem; color:var(--gray-400); margin-top:0.3rem;">Try searching for chicken, prawns, tofu...</p>
        </div>
      `;
    }

    searchResults.style.display = "block";
  }

  // ── Scroll spy for category nav ──
  function setupScrollSpy() {
    const sections = MENU_DATA.map((cat) => ({
      id: cat.id,
      el: document.getElementById("section-" + cat.id),
    }));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const catId = entry.target.id.replace("section-", "");
            setActiveNav(catId);
          }
        });
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((s) => {
      if (s.el) observer.observe(s.el);
    });
  }

  // ── Init ──
  function init() {
    buildCatNav();
    buildMenu();
    createFloatingCart();
    setupScrollSpy();

    // Check if we should skip welcome (e.g., reload)
    if (sessionStorage.getItem("wokin_visited")) {
      welcomeScreen.style.display = "none";
      menuApp.style.display = "block";
    } else {
      sessionStorage.setItem("wokin_visited", "1");
    }
  }

  init();
})();
