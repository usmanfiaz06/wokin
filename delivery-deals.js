/* =====================================================================
   WOK!N  ·  DELIVERY DEALS  ·  delivery-deals.js
   ---------------------------------------------------------------------
   One definition of the delivery bundles, shared by the customer menu
   (index.html) and the in-restaurant QR page (/deals), so the two can
   never drift apart. Loaded after menu-data.js, which the pickers read.
   ===================================================================== */

/* Delivery bundles. `hero` names the menu dish whose photo fronts the
   card — the photo itself is whatever the admin has set for that dish,
   so these stay in step with the menu. Prices exclude tax, which the
   order page adds at checkout, exactly as it does for every other line. */
const DELIVERY_DEALS = [
  { id:"duo", name:"WOK!N DUO", price:2695, serves:"For 2 people",
    hero:"Chicken with Chillies (Dry)",
    items:[
      { pick:"poultry", label:"Half chicken dish" },
      { pick:"rice",    label:"Half fried rice" },
      "2 mint margaritas",
    ],
    note:"Selected dishes apply" },

  { id:"duo-plus", name:"WOK!N DUO PLUS", price:3395, serves:"For 2–3 people",
    hero:"Chicken Chow Mein",
    items:[
      "Half soup",
      { pick:"poultry",      label:"Half chicken dish" },
      { pick:"rice-noodles", label:"Half fried rice or chow mein" },
      "2 mint margaritas",
      "Fish crackers",
    ],
    note:"Selected dishes apply" },

  { id:"trio", name:"WOK!N TRIO FEAST", price:4995, serves:"For 3–4 people",
    hero:"Steamed Chicken Dumplings", popular:true,
    items:[
      "Steamed chicken dumplings",
      { pick:"poultry", label:"Half chicken dish" },
      { pick:"beef",    label:"Half beef dish" },
      { pick:"rice",    label:"Full fried rice" },
      "3 mint margaritas",
      "Fish crackers",
    ],
    note:"Selected dishes apply" },

  { id:"family", name:"WOK!N FAMILY FEAST", price:8495, serves:"For 4–5 people",
    hero:"Spicy Honey Chicken Wings",
    items:[
      "Full soup, including Wok!n Special 19B",
      "Spicy honey chicken wings",
      { pick:"poultry",      label:"Half chicken dish" },
      { pick:"beef",         label:"Half beef dish" },
      { pick:"rice-noodles", label:"Full fried rice or chow mein" },
      "4 mint margaritas",
      "Fish crackers",
    ],
    note:"Selected dishes apply" },

  { id:"signature", name:"WOK!N SIGNATURE FEAST", price:12495, serves:"For 4–5 people",
    hero:"Prawn Tempura",
    items:[
      "Full soup, including Wok!n Special 19B",
      "Prawn tempura",
      { pick:"poultry",  label:"Half chicken dish" },
      { pick:"beef",     label:"Half beef dish" },
      { pick:"rice",     label:"Full fried rice" },
      { pick:"noodles",  label:"Half chow mein" },
      "4 mint margaritas",
      "Fish crackers",
    ] },
];

/* Where each picker gets its dishes, and what it lands on by default.
   Read from the live menu, so the lists follow the menu itself. */
const PICKS = {
  poultry:        { cats:["poultry"],          fallback:"Chicken Manchurian" },
  beef:           { cats:["beef"],             fallback:"Beef in Garlic Sauce" },
  rice:           { cats:["rice"],             fallback:"Chicken Fried Rice" },
  noodles:        { cats:["noodles"],          fallback:"Chicken Chow Mein" },
  "rice-noodles": { cats:["rice","noodles"],   fallback:"Chicken Fried Rice" },
};

function pickOptions(key){
  const spec = PICKS[key];
  if (!spec) return [];
  if (typeof MENU_DATA === "undefined") return [spec.fallback];
  const names = [];
  spec.cats.forEach(id => {
    const cat = MENU_DATA.find(c => c.id === id);
    if (cat) cat.items.forEach(d => { if (!d.tags || !d.tags.includes("hidden")) names.push(d.name); });
  });
  return names.length ? names : [spec.fallback];
}


if (typeof window !== "undefined"){
  window.DELIVERY_DEALS = DELIVERY_DEALS;
  window.PICKS          = PICKS;
  window.pickOptions    = pickOptions;
}
