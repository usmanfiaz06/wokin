/* =====================================================================
   WOK!N  ·  DISH IMAGE MAPPER
   ---------------------------------------------------------------------
   Maps each menu item to an Unsplash food photo URL.
   Resolution order:
     1.  Exact dish-name override          (DISH_OVERRIDES)
     2.  Keyword match on the dish name    (KEYWORD_MAP)
     3.  Category fallback                 (CATEGORY_FALLBACK)
     4.  Universal fallback                (FALLBACK_IMG)
   If a chosen URL fails to load, the <img> element's `onerror` swaps to
   a typographic placeholder card (handled in order.js / order.css).
   ===================================================================== */

const _IMG = (id, w = 800) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${Math.round(w * 0.7)}&fit=crop&auto=format&q=80`;

/* -------- curated pan-Asian photo library --------------------------- */
const P = {
  noodleBowl:    _IMG("1569718212165-3a8278d5f624"),
  ramen:         _IMG("1623341214825-9f4f963727da"),
  chowMein:      _IMG("1612929633738-8fe44f7ec841"),
  padThai:       _IMG("1559314809-0d155014e29e"),
  dumplings:     _IMG("1496116218417-1a781b1c416c"),
  springRoll:    _IMG("1606270842043-3a3b8c4fe34a"),
  tempura:       _IMG("1607301406259-dfb186e15de8"),
  prawns:        _IMG("1625938144755-652e08e359b7"),
  prawnsRed:     _IMG("1626057571776-b057f59d50a8"),
  fishWhole:     _IMG("1559339352-11d035aa65de"),
  fishFillet:    _IMG("1604908176997-125f25cc6f3d"),
  lobster:       _IMG("1625944525200-29c79077ce5e"),
  beefStirFry:   _IMG("1565299624946-b28f40a0ae38"),
  beefBowl:      _IMG("1574484284002-952d92456975"),
  chickenStirFry:_IMG("1525755662778-989d0524087e"),
  kungPao:       _IMG("1583032015879-e5022cb87c3b"),
  sesameChicken: _IMG("1582450871972-aa56b3c5a2cc"),
  chickenWings:  _IMG("1567620832903-9fc6debc209f"),
  drumsticks:    _IMG("1562967914-608f82629710"),
  honeyChicken:  _IMG("1604908554049-29c1f1d8e3ec"),
  manchurian:    _IMG("1626777553635-86e2eba63dc3"),
  szechuan:      _IMG("1552611052-33e04de081de"),
  cashew:        _IMG("1626804475297-41608ea09aeb"),
  almondChicken: _IMG("1617692855027-33b14f061079"),
  pineapple:     _IMG("1612874742237-6526221588e3"),
  blackPepper:   _IMG("1603894584373-5ac82b2ae398"),
  lemonChicken:  _IMG("1604908176997-125f25cc6f3d"),
  friedRice:     _IMG("1603133872878-684f208fb84b"),
  steamedRice:   _IMG("1586201375761-83865001e31c"),
  garlicRice:    _IMG("1596797038530-2c107229654b"),
  eggRice:       _IMG("1601050690597-df0568f70950"),
  vegStirFry:    _IMG("1623428187969-5da2dcea5ebf"),
  mushroom:      _IMG("1611599537845-1c7aca0091c0"),
  sweetSour:     _IMG("1626804475297-41608ea09aeb"),
  hotSourSoup:   _IMG("1607330289024-1535c6b4e1c1"),
  cornSoup:      _IMG("1612251123330-9eddf3a8d3c0"),
  clearSoup:     _IMG("1547592180-85f173990554"),
  thaiSoup:      _IMG("1569718212165-3a8278d5f624"),
  seafoodSoup:   _IMG("1583608205776-bfd35f0d9f83"),
  vegSoup:       _IMG("1547592180-85f173990554"),
  noodleSoup:    _IMG("1604152135912-04a022e23696"),
  chefSoup:      _IMG("1583608205776-bfd35f0d9f83"),
  friesPlain:    _IMG("1573080496219-bb080dd4f877"),
  friesMasala:   _IMG("1639024471283-03518883512d"),
  friesCheese:   _IMG("1630384060421-cb20d0e0649d"),
  dynamiteChx:   _IMG("1599487488170-d11ec9c172f0"),
  dynamitePrawn: _IMG("1626057571776-b057f59d50a8"),
  honeyWings:    _IMG("1567620832903-9fc6debc209f"),
  goldenSilk:    _IMG("1625944525200-29c79077ce5e"),
  fingerFish:    _IMG("1626082896492-766af4eb6501"),
  chopSuey:      _IMG("1617093727343-374698b1b08d"),
  kidsMeal:      _IMG("1565958011703-44f9829ba187"),
  cola:          _IMG("1622483767028-3f66f32aef97"),
  lemonade:      _IMG("1556881286-fc6915169721"),
  blueDrink:     _IMG("1551024709-8f23befc6f87"),
  pinaColada:    _IMG("1546171753-97d7676e4602"),
  perrier:       _IMG("1605648916361-9bc12ad6a569"),
  mineralWater:  _IMG("1548839140-29a749e1cf4d"),
  karakTea:      _IMG("1571805341302-f857805a8ee0"),
  greenTea:      _IMG("1576092768241-dec231879fc3"),
  mintMargarita: _IMG("1556881286-fc6915169721"),
  strawDrink:    _IMG("1571805529553-2eaf3a8aa3a4"),
  peachDrink:    _IMG("1546171753-97d7676e4602"),
  specialDrink:  _IMG("1551024709-8f23befc6f87"),
  generic:       _IMG("1585032226651-759b368d7246"),
};

/* -------- exact dish name overrides --------------------------------- */
const DISH_OVERRIDES = {
  "Crispy Finger Fish":              P.fingerFish,
  "Dynamite Chicken":                P.dynamiteChx,
  "Spicy Honey Chicken Wings":       P.honeyWings,
  "Sesame Honey Chilli Chicken":     P.honeyChicken,
  "Dynamite Prawns":                 P.dynamitePrawn,
  "Prawn Tempura":                   P.tempura,
  "Golden Silk Prawns":              P.goldenSilk,
  "Chinese Spring Rolls":            P.springRoll,
  "Steamed Chicken Dumplings":       P.dumplings,
  "Chilli Wings":                    P.chickenWings,

  "Plain Fries":                     P.friesPlain,
  "Masala Fries":                    P.friesMasala,
  "Cheese Fries":                    P.friesCheese,

  "Wokin Special Soup":              P.chefSoup,
  "Hot 'N' Sour Soup":               P.hotSourSoup,
  "Chicken Corn Soup":               P.cornSoup,
  "Hot Szechuan Soup":               P.szechuan,
  "Thai Chicken Soup":               P.thaiSoup,
  "Chef's Special Soup":             P.chefSoup,
  "Chicken Noodle Soup":             P.noodleSoup,
  "Mix Seafood Soup":                P.seafoodSoup,
  "Clear Vegetable Soup":            P.vegSoup,
  "Clear Chicken Vegetable Soup":    P.clearSoup,

  "Sesame Sliced Chicken":           P.sesameChicken,
  "Shanghai Special Chicken":        P.chickenStirFry,
  "Chilli Chicken Ginger":           P.chickenStirFry,
  "Yajua Chicken":                   P.kungPao,
  "Hot and Spicy Braised Chicken":   P.szechuan,
  "Shu Shi Chicken":                 P.chickenStirFry,
  "Chicken with Baby Corn":          P.chickenStirFry,
  "Peanut Chicken":                  P.kungPao,
  "Chicken Drumsticks":              P.drumsticks,
  "Chicken Manchurian":              P.manchurian,
  "Kung Pao Chicken":                P.kungPao,
  "Szechuan Chicken":                P.szechuan,
  "Wokin Special Chicken with Pineapple": P.pineapple,
  "Chicken with Chillies (Dry)":     P.szechuan,
  "Chicken with Chillies and Onions":P.chickenStirFry,
  "Chicken in Hot Garlic Sauce":     P.chickenStirFry,
  "Chicken in Garlic Sauce":         P.chickenStirFry,
  "Chicken and Mix Vegetables":      P.chickenStirFry,
  "Chicken with Cashew Nuts (Szechuan Style)": P.cashew,
  "Mongolian Chicken":               P.beefStirFry,
  "Chicken with Roasted Almonds":    P.almondChicken,
  "Black Pepper Chicken":            P.blackPepper,
  "Lemon Chicken":                   P.lemonChicken,
  "Mandarin Chicken":                P.pineapple,
  "Chef's Special Sesame Chicken":   P.sesameChicken,
  "Chilli Oyster Chicken":           P.chickenStirFry,

  "Hot and Spicy Braised Prawns":    P.prawnsRed,
  "Prawn Manchurian":                P.manchurian,
  "Prawn with Chillies (Dry)":       P.prawns,
  "Szechuan Prawns":                 P.prawns,
  "Prawns with Chillies and Vegetables": P.prawns,
  "Prawns in Hot Garlic Sauce":      P.prawns,
  "Prawns in Garlic Sauce":          P.prawns,
  "Mongolian Prawns":                P.prawnsRed,
  "Kung Pao Prawns":                 P.prawns,
  "Stir-Fried Prawns":               P.prawns,
  "Honey Chilli Sesame Prawns":      P.dynamitePrawn,

  "Hot and Spicy Braised Fish":      P.fishFillet,
  "Wokin Special Fish (with Choice of Sauce)": P.fishWhole,
  "Fish with Chillies (Dry)":        P.fishFillet,
  "Fish in Hot Garlic Sauce":        P.fishFillet,
  "Kung Pao Fish":                   P.fishFillet,
  "Fish with Chillies and Vegetables":P.fishFillet,
  "Szechuan Fish":                   P.fishFillet,
  "Mongolian Fish":                  P.fishFillet,
  "Fish with Chilli Garlic Sauce":   P.fishFillet,

  "Lobster (with Choice of Sauce)":  P.lobster,

  "Hot and Spicy Braised Beef":      P.beefStirFry,
  "Shu Shi Beef":                    P.beefStirFry,
  "Beef in Garlic Sauce":            P.beefStirFry,
  "Wokin Special Beef":              P.beefBowl,
  "Beef Chilli Vegetables":          P.beefStirFry,
  "Beef with Chillies (Dry)":        P.beefStirFry,
  "Beef with Chillies and Onions":   P.beefStirFry,
  "Mongolian Beef":                  P.beefBowl,
  "Chilli Oyster Beef":              P.beefStirFry,

  "Chicken Masala Rice":             P.friedRice,
  "Prawn Masala Rice":               P.friedRice,
  "Vegetable Fried Rice":            P.friedRice,
  "Egg Fried Rice":                  P.eggRice,
  "Chicken Fried Rice":              P.friedRice,
  "Wokin Special Rice":              P.friedRice,
  "Steamed Rice":                    P.steamedRice,
  "Prawn Fried Rice":                P.friedRice,
  "Garlic Fried Rice":               P.garlicRice,

  "American Chop Suey":              P.chopSuey,
  "Chicken Chop Suey":               P.chopSuey,
  "Vegetable Chow Mein":             P.chowMein,
  "Chicken Chow Mein":               P.chowMein,
  "Wokin Special Chow Mein":         P.chowMein,
  "Beef Chow Mein":                  P.chowMein,

  "Stir-Fried Vegetables":           P.vegStirFry,
  "Mushrooms in Garlic Sauce":       P.mushroom,
  "Sweet 'N' Sour Vegetables":       P.sweetSour,

  "Option 1":                        P.kidsMeal,
  "Option 2":                        P.kidsMeal,

  "Soft Drinks":                     P.cola,
  "Frosted Mint Lemonade":           P.lemonade,
  "Blue Lagoon":                     P.blueDrink,
  "Pina Colada":                     P.pinaColada,
  "Sparkling Water (Perrier)":       P.perrier,
  "Mineral Water (L)":               P.mineralWater,
  "Mineral Water (S)":               P.mineralWater,
  "Karak Tea":                       P.karakTea,
  "Green Tea":                       P.greenTea,
  "Mint Margarita":                  P.mintMargarita,
  "Strawberry Margarita":            P.strawDrink,
  "Lemon Margarita":                 P.lemonade,
  "Peach Margarita":                 P.peachDrink,
  "Wokin Special Drink":             P.specialDrink,
};

/* -------- category fallbacks ---------------------------------------- */
const CATEGORY_FALLBACK = {
  starters:        P.springRoll,
  fries:           P.friesPlain,
  soup:            P.hotSourSoup,
  poultry:         P.chickenStirFry,
  "seafood-prawns":P.prawns,
  fish:            P.fishFillet,
  lobster:         P.lobster,
  beef:            P.beefStirFry,
  rice:            P.friedRice,
  noodles:         P.chowMein,
  vegetables:      P.vegStirFry,
  kids:            P.kidsMeal,
  beverages:       P.cola,
};

const FALLBACK_IMG = P.generic;

/* -------- resolver -------------------------------------------------- */
function getDishImage(dishName, categoryId) {
  if (DISH_OVERRIDES[dishName]) return DISH_OVERRIDES[dishName];
  if (CATEGORY_FALLBACK[categoryId]) return CATEGORY_FALLBACK[categoryId];
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
