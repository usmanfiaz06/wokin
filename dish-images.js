/* =====================================================================
   WOK!N  ·  DISH IMAGE MAPPER
   ---------------------------------------------------------------------
   Maps each menu item to a stable food-image URL.

   Why two image sources?
   ----------------------
   • Foodish API  (https://foodish-api.com/images/...)
     Free, stable, hosts only food photos — no risk of "pizza on a beef
     dish" surprises. The trade-off is that Foodish's library is mostly
     Indian cuisine, so we use it for the visually-similar pan-Asian
     dishes (saucy meats, rice, fried snacks) where a butter-chicken or
     biryani photo reads correctly.
   • Unsplash  for the specialty categories Foodish doesn't cover well
     (drinks, lobster, fish-as-fillet, kid bowls). We use a small set
     of hand-picked photo IDs.

   Resolution order:
     1.  Exact dish-name override          (DISH_OVERRIDES)
     2.  Category default with hash-based variety
     3.  Universal fallback                (FALLBACK_IMG)
   If a URL fails to load, the <img>'s onerror clears the bg image so
   the typographic placeholder behind it (large dish-initial char) shows.
   ===================================================================== */

// Foodish stable image URL builder.
const FOODISH = (cat, n) => `https://foodish-api.com/images/${cat}/${cat}${n}.jpg`;

// Unsplash photo URL builder.
const UNSPLASH = (id, w = 800) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${Math.round(w * 0.7)}&fit=crop&auto=format&q=80`;

// Foodish image counts I'm comfortable using (each integer in 1..MAX).
// Kept conservative so we don't hit a 404.
const FOODISH_MAX = {
  biryani:           50,
  "butter-chicken":  40,
  rice:              50,
  samosa:            50,
  dosa:              50,
  pasta:             30,
  idly:              20,
  dessert:           40,
};

/* hand-picked Unsplash photos for things Foodish doesn't cover ------ */
const U = {
  // drinks
  cola:          UNSPLASH("1554866585-cd94860890b7"),
  lemonade:      UNSPLASH("1556679343-c7306c1976bc"),
  cocktailBlue:  UNSPLASH("1551538827-9c037cb4f32a"),
  pinaColada:    UNSPLASH("1556679343-c7306c1976bc"),
  sparkling:     UNSPLASH("1605648916361-9bc12ad6a569"),
  bottleWater:   UNSPLASH("1564834724105-918b73d1b9e0"),
  karakTea:      UNSPLASH("1571805341302-f857805a8ee0"),
  greenTea:      UNSPLASH("1576092768241-dec231879fc3"),
  mintCocktail:  UNSPLASH("1551024709-8f23befc6f87"),
  strawberryDrink:UNSPLASH("1554136545-1f000fd1c1d7"),
  // seafood
  lobster:       UNSPLASH("1625944525200-29c79077ce5e"),
  // fries
  friesPlain:    UNSPLASH("1573080496219-bb080dd4f877"),
  friesMasala:   UNSPLASH("1639024471283-03518883512d"),
  friesCheese:   UNSPLASH("1630384060421-cb20d0e0649d"),
  // kids
  kidsMeal:      UNSPLASH("1565958011703-44f9829ba187"),
};

/* tiny string hash so the SAME dish always gets the SAME image ------- */
function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* category -> Foodish source pool (each entry can be picked by hash) -- */
const CATEGORY_FOODISH = {
  starters:        ["samosa"],
  fries:           ["samosa"],
  soup:            ["butter-chicken"],
  poultry:         ["butter-chicken"],
  "seafood-prawns":["butter-chicken"],
  fish:            ["butter-chicken"],
  beef:            ["butter-chicken"],
  rice:            ["biryani", "rice"],
  noodles:         ["pasta"],
  vegetables:      ["dosa"],
  kids:            ["biryani"],
};

function _fromFoodishCat(catId, hashKey) {
  const pool = CATEGORY_FOODISH[catId];
  if (!pool) return null;
  const h = _hash(hashKey);
  const cat = pool[h % pool.length];
  const max = FOODISH_MAX[cat] || 30;
  const n = (h % max) + 1;
  return FOODISH(cat, n);
}

/* -------- exact dish name overrides --------------------------------- */
const DISH_OVERRIDES = {
  // drinks
  "Soft Drinks":               U.cola,
  "Frosted Mint Lemonade":     U.lemonade,
  "Blue Lagoon":               U.cocktailBlue,
  "Pina Colada":               U.pinaColada,
  "Sparkling Water (Perrier)": U.sparkling,
  "Mineral Water (L)":         U.bottleWater,
  "Mineral Water (S)":         U.bottleWater,
  "Karak Tea":                 U.karakTea,
  "Green Tea":                 U.greenTea,
  "Mint Margarita":            U.mintCocktail,
  "Strawberry Margarita":      U.strawberryDrink,
  "Lemon Margarita":           U.lemonade,
  "Peach Margarita":           U.cocktailBlue,
  "Wokin Special Drink":       U.cocktailBlue,

  // lobster
  "Lobster (with Choice of Sauce)": U.lobster,

  // fries — keep distinct
  "Plain Fries":               U.friesPlain,
  "Masala Fries":              U.friesMasala,
  "Cheese Fries":              U.friesCheese,

  // kids
  "Option 1":                  U.kidsMeal,
  "Option 2":                  U.kidsMeal,
};

const FALLBACK_IMG = FOODISH("butter-chicken", 1);

/* -------- resolver -------------------------------------------------- */
function getDishImage(dishName, categoryId) {
  if (DISH_OVERRIDES[dishName]) return DISH_OVERRIDES[dishName];
  const fromCat = _fromFoodishCat(categoryId, dishName);
  if (fromCat) return fromCat;
  return FALLBACK_IMG;
}

/* -------- "Most Popular" / upsell picks ----------------------------- */
const POPULAR_DISH_NAMES = [
  "Dynamite Chicken",
  "Chicken Manchurian",
  "Wokin Special Chow Mein",
  "Chinese Spring Rolls",
  "Kung Pao Chicken",
  "Chicken Fried Rice",
  "Prawn Tempura",
  "Hot 'N' Sour Soup",
];

if (typeof window !== "undefined") {
  window.getDishImage = getDishImage;
  window.POPULAR_DISH_NAMES = POPULAR_DISH_NAMES;
}
