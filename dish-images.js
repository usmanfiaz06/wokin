/* =====================================================================
   WOK!N  ·  DISH IMAGE MAPPER
   ---------------------------------------------------------------------
   Convention-based per-dish photos. Each dish points to a local file
   at  dish-photos/<slug>.jpg  — drop a file with that exact name and
   the card picks it up automatically.

   If the file isn't there yet, the card falls back to
   Assorted_Chinese_food_set.jpg.webp (the hero Chinese food spread)
   so every card always shows REAL pan-Asian food — never a generic
   stock surprise.

   Filename pattern:
     "Kung Pao Chicken"       →  dish-photos/kung-pao-chicken.jpg
     "Hot 'N' Sour Soup"      →  dish-photos/hot-n-sour-soup.jpg
     "Chef's Special Soup"    →  dish-photos/chefs-special-soup.jpg
     "Sweet 'N' Sour Vegetables" → dish-photos/sweet-n-sour-vegetables.jpg

   See  dish-photos/SLUGS.txt  for the full mapping.
   ===================================================================== */

const PHOTOS_DIR   = "dish-photos/";
const FALLBACK_IMG = "Assorted_Chinese_food_set.jpg.webp";

function slugifyDish(s) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDishImage(dishName /*, categoryId */) {
  return PHOTOS_DIR + slugifyDish(dishName) + ".jpg";
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
  window.getDishImage       = getDishImage;
  window.slugifyDish        = slugifyDish;
  window.FALLBACK_DISH_IMG  = FALLBACK_IMG;
  window.POPULAR_DISH_NAMES = POPULAR_DISH_NAMES;
}
