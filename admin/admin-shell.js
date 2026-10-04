/* =====================================================================
   WOK!N · ADMIN SHELL  ·  admin-shell.js
   ---------------------------------------------------------------------
   Injects the left sidebar nav into every admin page (one place to edit
   the nav), highlights the current page, moves the account/sign-out into
   the sidebar footer, and adds a mobile hamburger. Include this BEFORE
   each page's own script.
   ===================================================================== */
(function () {
  const NAV = [
    { href: "/admin/",             label: "Orders",   icon: "🧾" },
    { href: "/admin/tables.html",  label: "Tables & QR", icon: "🍽️" },
    { href: "/admin/menu.html",    label: "Menu",     icon: "🍜" },
    { href: "/admin/combos.html",  label: "Combos",   icon: "🍱" },
    { href: "/admin/banners.html", label: "Deals",    icon: "🔥" },
    { href: "/admin/coupons.html", label: "Coupons",  icon: "🏷️" },
    { href: "/admin/delivery.html",label: "Delivery", icon: "🛵" },
    { href: "/admin/areas.html",   label: "Areas",    icon: "📍" },
    { href: "/admin/leads.html",   label: "Guests",   icon: "👥" },
    { href: "/admin/hours.html",   label: "Hours",    icon: "🕒" },
    { href: "/admin/site.html",    label: "Site Text",icon: "📝" },
  ];

  function build() {
    const app = document.querySelector(".app");
    if (!app || document.querySelector(".side")) return;

    const file = (location.pathname.split("/").pop() || "index.html");
    const side = document.createElement("aside");
    side.className = "side";
    side.innerHTML =
      '<div class="side-brand">' +
        '<img src="/Wokin.- logo.jpeg" alt="WOK!N" />' +
        '<span><b>WOK!N</b><em>ADMIN</em></span>' +
      '</div>' +
      '<nav class="side-nav">' +
        NAV.map(function (n) {
          const nf = (n.href.split("/").pop() || "index.html");
          const on = (file === nf) ? " is-on" : "";
          return '<a href="' + n.href + '" class="side-link' + on + '">' +
                 '<span class="si">' + n.icon + '</span>' + n.label + '</a>';
        }).join("") +
      '</nav>' +
      '<div class="side-foot"></div>';
    app.insertBefore(side, app.firstChild);
    document.body.classList.add("has-sidebar");

    // Move the existing account + sign-out (keep their ids/handlers) into the footer
    const foot = side.querySelector(".side-foot");
    const who = document.getElementById("whoami");
    const out = document.getElementById("signOut");
    if (who) foot.appendChild(who);
    if (out) foot.appendChild(out);

    // Mobile hamburger + backdrop
    const burger = document.createElement("button");
    burger.className = "side-burger";
    burger.setAttribute("aria-label", "Menu");
    burger.textContent = "☰";
    burger.addEventListener("click", function () { document.body.classList.toggle("side-open"); });
    document.body.appendChild(burger);

    const scrim = document.createElement("div");
    scrim.className = "side-scrim";
    scrim.addEventListener("click", function () { document.body.classList.remove("side-open"); });
    document.body.appendChild(scrim);

    side.addEventListener("click", function (e) {
      if (e.target.closest("a")) document.body.classList.remove("side-open");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
