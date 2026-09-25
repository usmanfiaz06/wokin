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
const DEFAULT_DELIVERY_DEALS = [
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
      { pick:"soup", label:"Half soup" },
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
      { pick:"soup", label:"Full soup (Wok!n Special included)" },
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
      { pick:"soup", label:"Full soup (Wok!n Special included)" },
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
  soup:           { cats:["soup"],             fallback:"Hot 'N' Sour Soup" },
  "rice-noodles": { cats:["rice","noodles"],   fallback:"Chicken Fried Rice" },
};

/* The deals the pages actually render. Starts as the built-ins above and
   is replaced by whatever staff have saved, once loadDeliveryDeals runs.
   Mutated in place so both pages keep the same array reference. */
const DELIVERY_DEALS = DEFAULT_DELIVERY_DEALS.map(d => ({ ...d }));

function rowToDeal(row){
  return {
    id:      row.id,
    name:    row.name,
    price:   Number(row.price) || 0,
    serves:  row.serves || "",
    hero:    row.hero || "",
    items:   Array.isArray(row.items) ? row.items : [],
    note:    row.note || undefined,
    popular: row.is_popular === true,
  };
}

/* Read the deals staff have saved. An empty table or a missing one both
   leave the built-in five in place, so the section never goes blank. */
async function loadDeliveryDeals(db){
  if (!db) return;
  try {
    const { data, error } = await db.from("delivery_deals")
      .select("*").eq("is_active", true).order("position", { ascending: true });
    if (error) throw error;
    if (!data || !data.length) return;
    DELIVERY_DEALS.length = 0;
    data.forEach(r => DELIVERY_DEALS.push(rowToDeal(r)));
  } catch (e){
    console.warn("[wokin] delivery deals unavailable (using the built-in set):", e.message || e);
  }
}

/* Which dishes staff allow in the deal dropdowns, by menu category.
   Filled by loadDealDishOptions(); a category that isn't in here has no
   restriction, so the deals keep working before anyone sets one. */
const DEAL_DISH_OPTIONS = new Map();

/* Read the admin's choices. Safe to call before the table exists — the
   dropdowns just fall back to the whole category. */
async function loadDealDishOptions(db){
  if (!db) return;
  try {
    const { data, error } = await db.from("deal_dish_options").select("category,dish_names");
    if (error) throw error;
    DEAL_DISH_OPTIONS.clear();
    (data || []).forEach(r => {
      if (Array.isArray(r.dish_names) && r.dish_names.length){
        DEAL_DISH_OPTIONS.set(r.category, r.dish_names);
      }
    });
  } catch (e){
    console.warn("[wokin] deal dish options unavailable (offering the full menu):", e.message || e);
  }
}

function pickOptions(key){
  const spec = PICKS[key];
  if (!spec) return [];
  if (typeof MENU_DATA === "undefined") return [spec.fallback];

  const names = [];
  spec.cats.forEach(id => {
    const cat = MENU_DATA.find(c => c.id === id);
    if (!cat) return;
    const allowed = DEAL_DISH_OPTIONS.get(id);
    cat.items.forEach(d => {
      if (d.tags && d.tags.includes("hidden")) return;
      // An empty/absent list means staff haven't narrowed this category.
      if (allowed && !allowed.includes(d.name)) return;
      names.push(d.name);
    });
  });
  return names.length ? names : [spec.fallback];
}

/* Every dish a category could offer, ignoring the admin's filter —
   what the admin screen ticks boxes against. */
function allCategoryDishes(catId){
  if (typeof MENU_DATA === "undefined") return [];
  const cat = MENU_DATA.find(c => c.id === catId);
  if (!cat) return [];
  return cat.items.filter(d => !d.tags || !d.tags.includes("hidden")).map(d => d.name);
}

/* The categories the deals actually draw on, in a sensible admin order. */
const DEAL_CATEGORIES = [
  { id:"poultry", label:"Chicken dishes", note:'for every "half chicken dish" line' },
  { id:"beef",    label:"Beef dishes",    note:'for every "half beef dish" line' },
  { id:"rice",    label:"Rice",           note:"for the fried-rice lines" },
  { id:"noodles", label:"Noodles",        note:"for the chow mein lines" },
  { id:"soup",    label:"Soups",          note:"for the soup lines" },
];


if (typeof window !== "undefined"){
  window.DELIVERY_DEALS         = DELIVERY_DEALS;
  window.DEFAULT_DELIVERY_DEALS = DEFAULT_DELIVERY_DEALS;
  window.loadDeliveryDeals      = loadDeliveryDeals;
  window.PICKS          = PICKS;
  window.pickOptions         = pickOptions;
  window.loadDealDishOptions = loadDealDishOptions;
  window.allCategoryDishes   = allCategoryDishes;
  window.DEAL_CATEGORIES     = DEAL_CATEGORIES;
  window.DEAL_DISH_OPTIONS   = DEAL_DISH_OPTIONS;
}
