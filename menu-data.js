// WOK!N Digital Menu Data
// All prices reduced 12% from reference menu, rounded to nearest 5

const MENU_DATA = [
  {
    id: "starters",
    name: "Starters",
    tagline: "First impressions that slap",
    emoji: "🥟",
    items: [
      {
        name: "Crispy Finger Fish",
        desc: "Breaded Fish Fingers deep fried to a perfect Gold colour, served with Garlic Mayo Sauce.",
        pcs: "5 Pcs / 10 Pcs",
        price: 2460,
        priceFull: 3965,
        tags: []
      },
      {
        name: "Dynamite Chicken",
        desc: "Crispy Chicken coated with a Rich Creamy Sriracha Mayo Sauce — Super delicious.",
        pcs: "300gm",
        price: 2750,
        tags: []
      },
      {
        name: "Spicy Honey Chicken Wings",
        desc: "Spicy fried Chicken Wings glazed with Honey and Chillies.",
        pcs: "8 Pcs",
        price: 2220,
        tags: []
      },
      {
        name: "Sesame Honey Chilli Chicken",
        desc: "Batter fried Chicken tossed in Honey Sauce and topped with Sesame Seeds.",
        pcs: "300gm",
        price: 2665,
        tags: []
      },
      {
        name: "Dynamite Prawns",
        desc: "Crispy Prawns coated with a Rich Creamy Sriracha Mayo Sauce — Super delicious.",
        pcs: "10-12 Pcs",
        price: 3780,
        tags: []
      },
      {
        name: "Stuffed Chilli Prawns",
        desc: "Hand chopped Prawns, seasoned with Chinese Spices and stuffed in Green Chillies.",
        pcs: "12 Pcs",
        price: 3430,
        tags: []
      },
      {
        name: "Prawn Tempura",
        desc: "Choicest Prawns, dipped in Asian Wok's Special Batter, deep fried and served with Wonton Sauce.",
        pcs: "6 Pcs",
        price: 3780,
        tags: ["chef"]
      },
      {
        name: "Golden Silk Prawns",
        desc: "Juiciest Prawns coated with Asian Wok's Special Sauce and shredded Potatoes, deep fried to a Perfect Golden.",
        pcs: "6-8 Pcs",
        price: 3780,
        tags: []
      },
      {
        name: "Chinese Spring Rolls",
        desc: "Wok fried Vegetables and Chicken with Chinese Spices in a Crispy Wrapper, Golden fried to perfection.",
        pcs: "6 Pcs",
        price: 1885,
        tags: []
      },
      {
        name: "Steamed Chicken Dumplings",
        desc: "Just that — Steamed Dumplings filled with Chicken Mince.",
        pcs: "8 Pcs",
        price: 1930,
        tags: []
      },
      {
        name: "Fried Wonton",
        desc: "Deep fried Wontons stuffed with Chicken, Prawns, Black Mushrooms, Spring Onions and Carrots.",
        pcs: "8 Pcs",
        price: 2460,
        tags: []
      },
      {
        name: "Sesame Toast",
        desc: "Meat Mince on Toast coated with Egg and Sesame Seeds, deep fried to a perfect Crispy Golden. Choice of Chicken or Prawn.",
        pcs: "8 Pcs",
        price: 1930,
        priceFull: 2150,
        tags: []
      },
      {
        name: "Chilli Wings",
        desc: "Spicy, Crispy Chicken Wings, wok fried in a Spicy Sauce.",
        pcs: "8 Pcs",
        price: 2110,
        tags: []
      }
    ]
  },
  {
    id: "fries",
    name: "Fries",
    tagline: "The real MVPs",
    emoji: "🍟",
    items: [
      {
        name: "Plain Fries",
        desc: "Classic golden fries, crispy perfection.",
        price: 815,
        priceFull: 965,
        tags: ["veg"]
      },
      {
        name: "Masala Fries",
        desc: "Fries tossed in our signature spice blend.",
        price: 875,
        priceFull: 1035,
        tags: ["veg"]
      },
      {
        name: "Cheese Fries",
        desc: "Loaded with melted cheese goodness.",
        price: 900,
        priceFull: 1095,
        tags: ["veg"]
      }
    ]
  },
  {
    id: "soup",
    name: "Soup",
    tagline: "Warm hugs in a bowl",
    emoji: "🍜",
    items: [
      {
        name: "Asian Wok Special Soup",
        desc: "Delightful thick soup with Chicken, Prawns, Seasonal Vegetables and Black Mushrooms.",
        pcs: "19B",
        price: 2045,
        priceFull: 2880,
        tags: ["chef"]
      },
      {
        name: "Hot 'N' Sour Soup",
        desc: "All-time favourite soup prepared in Chicken Broth with Chicken and Chinese Vegetables.",
        price: 1845,
        priceFull: 2505,
        tags: []
      },
      {
        name: "Chicken Corn Soup",
        desc: "Minced Chicken and crushed Sweet Corn, cooked in Chicken Broth.",
        price: 1845,
        priceFull: 2505,
        tags: ["mild"]
      },
      {
        name: "Hot Szechuan Soup",
        desc: "Authentic Szechuan Soup with Chicken, Prawns, Tofu and Chinese Herbs in a Hot Sauce, topped with Chopped Peanuts.",
        price: 2020,
        priceFull: 2685,
        tags: []
      },
      {
        name: "Thai Chicken Soup",
        desc: "Clear Chicken soup with Lemon Juice and Green Chillies, garnished with Crispy Rice.",
        price: 1845,
        priceFull: 2505,
        tags: []
      },
      {
        name: "Chef's Special Soup",
        desc: "Delicious thick soup with Chicken, Prawns, Carrots, Black Mushrooms & Green Onions.",
        price: 2020,
        priceFull: 2860,
        tags: ["chef"]
      },
      {
        name: "Chicken Noodle Soup",
        desc: "Mild flavour clear soup with Chinese and Chicken Noodles.",
        price: 1845,
        priceFull: 2505,
        tags: ["mild"]
      },
      {
        name: "Wonton Soup",
        desc: "A clear soup with Chicken and Prawns, stuffed Wontons and Seasonal Vegetables.",
        price: 1845,
        priceFull: 2505,
        tags: []
      },
      {
        name: "Mix Seafood Soup",
        desc: "Special clear Seafood soup prepared with Fish, Prawns, Chinese Mushrooms and Seasonal Vegetables.",
        price: 2020,
        priceFull: 2860,
        tags: []
      },
      {
        name: "Clear Vegetable Soup",
        desc: "A medley of Vegetables in a clear Vegetable/Chicken Broth.",
        price: 1580,
        priceFull: 2155,
        tags: ["veg"]
      },
      {
        name: "Clear Chicken Vegetable Soup",
        desc: "A medley of Vegetables and Chicken in a clear Chicken Broth.",
        price: 1845,
        priceFull: 2460,
        tags: []
      }
    ]
  },
  {
    id: "poultry",
    name: "Poultry",
    tagline: "Cluckin' good stuff",
    emoji: "🍗",
    items: [
      {
        name: "Sesame Sliced Chicken",
        desc: "Sliced Chicken, Broccoli, Green Chillies, Capsicum and Roasted Sesame in Tomato Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Shanghai Special Chicken",
        desc: "Chicken slices, Cucumbers, Carrots, Pineapple, Green Chillies and Roasted Peanuts in a Hot, Spicy, Sweet and Sour Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Chilli Chicken Ginger",
        desc: "Chicken slices with julienned Ginger, Green Chillies, fresh Asparagus and finely chopped Bird Chillies cooked in Oyster and Garlic Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Yajua Chicken",
        desc: "Sliced Chicken, Sliced Onions, Green Chillies and Black Mushrooms in Oyster Sauce.",
        price: 2725,
        tags: ["mild"]
      },
      {
        name: "Hot and Spicy Braised Chicken",
        desc: "Spiced up succulent Chicken cubes in a Red Sauce, sautéed with Vegetables.",
        price: 2725,
        tags: []
      },
      {
        name: "Shu Shi Chicken",
        desc: "Slices of Chicken, Onions, Capsicum and Tomatoes cooked in a Mild Spicy Red Sauce, sprinkled with Sesame Seeds.",
        price: 2725,
        tags: []
      },
      {
        name: "Chicken with Baby Corn",
        desc: "For those who prefer a Mild, a tasty combination of Chicken and Baby Corn in a Non-Spicy Sauce.",
        price: 2725,
        tags: ["mild"]
      },
      {
        name: "Peanut Chicken",
        desc: "Sliced Chicken breast with Vegetables, sautéed with Peanuts.",
        price: 2725,
        tags: []
      },
      {
        name: "Chicken Drumsticks",
        desc: "Spicy Minced Chicken Drumsticks, seasoned with Chinese Spices and deep fried to a Golden Brown.",
        pcs: "3 Pcs / 6 Pcs",
        price: 1740,
        priceFull: 2615,
        tags: []
      },
      {
        name: "Chicken Manchurian",
        desc: "All-time favourite Stir-fried Chicken with Ginger and Garlic in a Spicy Tomato Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Kung Pao Chicken",
        desc: "Stir-fried cubes Chicken with Dry Red Chillies, Roasted Peanuts and Chilli Oil in a Spicy Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Szechuan Chicken",
        desc: "Stir-fried sliced Chicken with Dry Red Chillies, Capsicum, Onions and Green Chillies, glazed in a Spicy Szechuan Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Asian Wok Special Chicken with Pineapple",
        desc: "Sliced Chicken cooked in our Secret Sauce with Pineapple Slices and glazed Red Cherries.",
        price: 2725,
        tags: ["chef"]
      },
      {
        name: "Chicken with Chillies (Dry)",
        desc: "Stir-fried slices of Chicken, Green Chillies, Garlic and Onions all glazed in a Chinese Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Chicken with Chillies and Onions",
        desc: "Spicy Chicken slices with Green Onions, Chillies, Ginger, Garlic and Chilli Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Chicken in Hot Garlic Sauce",
        desc: "Stir-fried Chicken with Onions, Green Chillies, Capsicum and Carrots, flavoured with our Special Hot Garlic Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Chicken in Garlic Sauce",
        desc: "Stir-fried Chicken with Onions, flavoured with our Chef's Special Garlic Sauce.",
        price: 2725,
        tags: ["chef"]
      },
      {
        name: "Chicken and Mix Vegetables",
        desc: "Chicken slices and Seasonal Vegetables with Chinese Spices.",
        price: 2725,
        tags: ["mild"]
      },
      {
        name: "Chicken with Cashew Nuts (Szechuan Style)",
        desc: "Stir-fried Chicken cubes, topped with Roasted Cashew Nuts and seasoned with Szechuan Spices.",
        price: 2725,
        tags: []
      },
      {
        name: "Mongolian Chicken",
        desc: "Sliced Chicken served with Ripe Tomatoes, Capsicum, Carrots, Bean Sprouts and Special Mongolian Spices.",
        price: 2725,
        tags: []
      },
      {
        name: "Chicken with Roasted Almonds",
        desc: "Stir-fried Chicken cubes cooked with Seasonal Vegetables and topped with Crunchy Almonds.",
        price: 2725,
        tags: ["mild"]
      },
      {
        name: "Black Pepper Chicken",
        desc: "Stir-fried Chicken cubes cooked with Onion, and seasoned with freshly crushed Black Peppers.",
        price: 2725,
        tags: []
      },
      {
        name: "Lemon Chicken",
        desc: "Sliced Chicken prepared in a Homemade Signature Lemon Sauce.",
        price: 2725,
        tags: ["mild"]
      },
      {
        name: "Mandarin Chicken",
        desc: "Chicken cubes prepared with Premium Battered Mandarin Sauce.",
        price: 2725,
        tags: []
      },
      {
        name: "Chef's Special Sesame Chicken",
        desc: "Crispy fried Chicken, glazed in our Special Sauce and topped with Roasted Sesame Seeds.",
        price: 2725,
        tags: ["chef"]
      },
      {
        name: "Chilli Oyster Chicken",
        desc: "Sliced Chicken in a scrumptious Oyster Sauce.",
        price: 2725,
        tags: []
      }
    ]
  },
  {
    id: "seafood-prawns",
    name: "Seafood Prawns",
    tagline: "From the sea, with love",
    emoji: "🦐",
    items: [
      {
        name: "Hot and Spicy Braised Prawns",
        desc: "Spiced up succulent Prawns in Red Sauce, sautéed with Vegetables.",
        price: 3850,
        tags: []
      },
      {
        name: "Prawn Manchurian",
        desc: "All-time favourite stir-fried Prawns with Ginger and Garlic in a Spicy Tomato Sauce.",
        price: 3850,
        tags: []
      },
      {
        name: "Prawn with Chillies (Dry)",
        desc: "Stir-fried Prawns with Green Chillies, Garlic and Onions all glazed in a Chinese Sauce.",
        price: 3850,
        tags: []
      },
      {
        name: "Szechuan Prawns",
        desc: "Stir-fried Prawns cooked with Dry Red Chillies, Capsicum, Onions and Green Chillies, glazed in a Spicy Szechuan Sauce.",
        price: 3850,
        tags: []
      },
      {
        name: "Prawns with Chillies and Vegetables",
        desc: "Stir-fried large Prawns with a mix of Seasonal Vegetables and Chinese Spices.",
        price: 3850,
        tags: []
      },
      {
        name: "Prawns in Hot Garlic Sauce",
        desc: "Stir-fried Prawns with Garlic, Onions, Green Chillies and flavoured with our Special Hot Sauce.",
        price: 3850,
        tags: []
      },
      {
        name: "Prawns in Garlic Sauce",
        desc: "Stir-fried Prawns with Onions, flavoured with our Chef's Special Garlic Sauce.",
        price: 3850,
        tags: ["chef"]
      },
      {
        name: "Mongolian Prawns",
        desc: "Stir-fried large Prawns served with Ripe Tomatoes, Carrots, Bean Sprouts, Capsicum and Special Mongolian Spices.",
        price: 3850,
        tags: []
      },
      {
        name: "Kung Pao Prawns",
        desc: "Stir-fried Prawns with Dry Red Chillies, Roasted Peanuts and Chilli Oil in a Spicy Sauce.",
        price: 3850,
        tags: []
      },
      {
        name: "Stir-Fried Prawns",
        desc: "Large Juicy Prawns in a Spicy Sauce. A Chef's Recommendation.",
        price: 3850,
        tags: ["chef"]
      },
      {
        name: "Honey Chilli Sesame Prawns",
        desc: "Batter fried Prawns tossed in Honey Sauce and topped with Sesame Seeds.",
        price: 3850,
        tags: []
      }
    ]
  },
  {
    id: "fish",
    name: "Fish",
    tagline: "Hooked on flavour",
    emoji: "🐟",
    items: [
      {
        name: "Hot and Spicy Braised Fish",
        desc: "Spiced up Fish cubes in a Red Sauce, sautéed with Vegetables.",
        price: 3650,
        tags: []
      },
      {
        name: "Fish in Ginger Sauce",
        desc: "Fillet of Pan Grilled Fish cooked in a Ginger Sauce with Button Mushrooms.",
        price: 3650,
        tags: ["mild"]
      },
      {
        name: "Asian Wok Special Fish (with Choice of Sauce)",
        desc: "Mouth-watering crispy deep fried Red Snapper topped with your choice of Sauce: Sweet and Sour, Szechuan, Hot Garlic or Garlic Sauce.",
        price: 5450,
        tags: ["chef"]
      },
      {
        name: "Fish with Chillies (Dry)",
        desc: "Stir-fried Fish flavoured with Green Chillies and Soya Sauce.",
        price: 3650,
        tags: []
      },
      {
        name: "Fish in Hot Garlic Sauce",
        desc: "Stir-fried Fish with Garlic, Onions, Green Chillies, Capsicum, Carrots and flavoured with our Special Hot Garlic Sauce.",
        price: 3650,
        tags: []
      },
      {
        name: "Kung Pao Fish",
        desc: "Stir-fried Fish with Dry Red Chillies, Roasted Peanuts and Chilli Oil in a Spicy Sauce.",
        price: 3650,
        tags: []
      },
      {
        name: "Fish with Chillies and Vegetables",
        desc: "Stir-fried Fish with a Mix of Seasonal Vegetables and Chinese Spices.",
        price: 3650,
        tags: []
      },
      {
        name: "Szechuan Fish",
        desc: "Stir-fried Fish with Dry Red Chillies, Capsicum, Onions and Green Chillies, glazed in a Spicy Szechuan Sauce.",
        price: 3650,
        tags: []
      },
      {
        name: "Mongolian Fish",
        desc: "Stir-fried Fish Served with Ripe Tomatoes, Carrots, Bean Sprouts, Capsicum and Special Mongolian Spices.",
        price: 3650,
        tags: []
      },
      {
        name: "Fish with Chilli Garlic Sauce",
        desc: "Fried Fish cubes served with Chilli Garlic Sauce.",
        price: 3650,
        tags: []
      }
    ]
  },
  {
    id: "crab",
    name: "Crab",
    tagline: "Worth getting your hands dirty",
    emoji: "🦀",
    items: [
      {
        name: "Crab (with Choice of Sauce)",
        desc: "Szechuan, Hot Garlic or Garlic Sauce.",
        price: 4835,
        tags: ["chef"]
      }
    ]
  },
  {
    id: "lobster",
    name: "Lobster",
    tagline: "The luxe life",
    emoji: "🦞",
    items: [
      {
        name: "Lobster (with Choice of Sauce)",
        desc: "Szechuan, Hot Garlic or Garlic Sauce.",
        price: 7035,
        tags: ["chef"]
      }
    ]
  },
  {
    id: "beef",
    name: "Beef",
    tagline: "Bold & beefy",
    emoji: "🥩",
    items: [
      {
        name: "Hot and Spicy Braised Beef",
        desc: "Spiced up succulent Beef Slices in a Red Sauce, sautéed with Vegetables.",
        price: 3295,
        tags: []
      },
      {
        name: "Shu Shi Beef",
        desc: "Slices of Beef, Onion, Capsicum and Tomatoes cooked in a Mild Spicy Red Sauce, sprinkled with Sesame Seeds.",
        price: 3295,
        tags: []
      },
      {
        name: "Beef in Garlic Sauce",
        desc: "Stir-fried Beef with Onions, flavoured with our Chef's Special Garlic Sauce.",
        price: 3295,
        tags: []
      },
      {
        name: "Asian Wok Special Beef",
        desc: "Crispy fried Beef, glazed in our Special Sauce and topped with Roasted Sesame Seeds.",
        price: 3470,
        tags: ["chef"]
      },
      {
        name: "Beef Chilli Vegetables",
        desc: "Sliced Beef with Seasonal Mix Vegetables, cooked with Red and Green Chillies.",
        price: 3295,
        tags: []
      },
      {
        name: "Beef with Chillies (Dry)",
        desc: "Sliced Beef marinated with Chinese Spices, stir-fried with Green Chillies and Garlic, glazed in Soya Sauce.",
        price: 3470,
        tags: []
      },
      {
        name: "Beef with Chillies and Onions",
        desc: "Stir-fried sliced Beef with Green Chillies in a Mild Sauce.",
        price: 3295,
        tags: []
      },
      {
        name: "Mongolian Beef",
        desc: "Stir-fried Beef tossed with Ripe Tomatoes, Capsicum, Carrots, Bean Sprouts, and Special Mongolian Spices.",
        price: 3295,
        tags: []
      },
      {
        name: "Chilli Oyster Beef",
        desc: "Sliced Beef in a scrumptious Oyster Sauce.",
        price: 3295,
        tags: []
      }
    ]
  },
  {
    id: "rice",
    name: "Rice",
    tagline: "The foundation of greatness",
    emoji: "🍚",
    items: [
      {
        name: "Chicken Masala Rice",
        desc: "Aromatic rice wok-tossed with chicken and masala spices.",
        price: 1315,
        priceFull: 1975,
        tags: []
      },
      {
        name: "Prawn Masala Rice",
        desc: "Aromatic rice wok-tossed with prawns and masala spices.",
        price: 1535,
        priceFull: 2285,
        tags: []
      },
      {
        name: "Vegetable Fried Rice",
        desc: "Classic fried rice with seasonal vegetables.",
        price: 1230,
        priceFull: 1890,
        tags: ["veg"]
      },
      {
        name: "Egg Fried Rice",
        desc: "Golden egg fried rice, simple and satisfying.",
        price: 1230,
        priceFull: 1890,
        tags: ["veg"]
      },
      {
        name: "Chicken Fried Rice",
        desc: "Fried rice loaded with tender chicken pieces.",
        price: 1315,
        priceFull: 2020,
        tags: []
      },
      {
        name: "Asian Wok Special Rice",
        desc: "Our signature fried rice — the full works.",
        price: 1495,
        priceFull: 2285,
        tags: ["chef"]
      },
      {
        name: "Steamed Rice",
        desc: "Perfectly steamed, fluffy white rice.",
        price: 1010,
        priceFull: 1535,
        tags: ["veg", "mild"]
      },
      {
        name: "Prawn Fried Rice",
        desc: "Fried rice with juicy prawns tossed in.",
        price: 1535,
        priceFull: 2285,
        tags: []
      },
      {
        name: "Garlic Fried Rice",
        desc: "Aromatic garlic fried rice, crispy garlic bits throughout.",
        price: 1230,
        priceFull: 1890,
        tags: ["veg"]
      }
    ]
  },
  {
    id: "noodles",
    name: "Chopsuey & Noodles",
    tagline: "Slurp-worthy goodness",
    emoji: "🍝",
    items: [
      {
        name: "American Chop Suey",
        desc: "Crispy Noodles topped with stir-fried Prawns, Chicken and Tomato Sauce.",
        price: 1755,
        priceFull: 2635,
        tags: []
      },
      {
        name: "Chicken Chop Suey",
        desc: "Stir-fried Chicken glazed in a Mild Sauce and topped on Crispy Noodles.",
        price: 1695,
        priceFull: 2595,
        tags: ["mild"]
      },
      {
        name: "Vegetable Chow Mein",
        desc: "Chinese Noodles stir-fried with julienne cut Vegetables.",
        price: 1340,
        priceFull: 2090,
        tags: ["veg"]
      },
      {
        name: "Chicken Chow Mein",
        desc: "Chinese Noodles stir-fried with julienne cut Chicken and Seasonal Vegetables.",
        price: 1520,
        priceFull: 2370,
        tags: []
      },
      {
        name: "Asian Wok Special Chow Mein",
        desc: "Chinese Noodles with Prawns, Chicken, Black Mushrooms, seasoned with Hot Spices.",
        price: 1775,
        priceFull: 2775,
        tags: ["chef"]
      },
      {
        name: "Beef Chow Mein",
        desc: "Chinese Noodles stir-fried with cut Beef and Seasonal Vegetables.",
        price: 1695,
        priceFull: 2595,
        tags: []
      }
    ]
  },
  {
    id: "vegetables",
    name: "Vegetables & Tofu",
    tagline: "Green never tasted this good",
    emoji: "🥦",
    items: [
      {
        name: "Stir-Fried Vegetables",
        desc: "A Colorful Combination of Seasonal Vegetables cooked in Chinese Style.",
        price: 1975,
        tags: ["veg"]
      },
      {
        name: "Mushrooms in Garlic Sauce",
        desc: "Sautéed Button Mushrooms in Hot Chilli Paste with Garlic Sauce.",
        price: 1975,
        tags: ["veg"]
      },
      {
        name: "Sweet 'N' Sour Vegetables",
        desc: "Stir-fried Seasonal Vegetables glazed in Sweet and Sour Sauce.",
        price: 1975,
        tags: ["veg", "mild"]
      },
      {
        name: "Dry Szechuan Tofu",
        desc: "Special In-house Spices, Stir-fried with Green Chillies and Garlic glazed in Szechuan Sauce.",
        price: 2090,
        tags: ["veg"]
      },
      {
        name: "Tofu with Vegetables",
        desc: "A combination of Tofu with Seasonal Vegetables.",
        price: 2090,
        tags: ["veg", "mild"]
      },
      {
        name: "Tofu in Hot Garlic Sauce",
        desc: "Tofu with Onions, Green Chillies, Capsicum and Carrots, flavoured with our Special Hot Garlic Sauce.",
        price: 2090,
        tags: ["veg"]
      }
    ]
  },
  {
    id: "kids",
    name: "Kids Meal",
    tagline: "Little wokkers welcome",
    emoji: "🧒",
    items: [
      {
        name: "Option 1",
        desc: "Chicken Nuggets (4 Pcs), Chicken Chow Mein (1 Portion), French Fries (1 Portion), Mango Juice (1). Includes a Dinosaur Toy!",
        price: 1430,
        tags: []
      },
      {
        name: "Option 2",
        desc: "Chicken Drumstick (1 Pc), Chicken Chow Mein (1 Portion), French Fries (1 Portion), Mango Juice (1). Includes a Dinosaur Toy!",
        price: 1430,
        tags: []
      }
    ]
  },
  {
    id: "beverages",
    name: "Beverages",
    tagline: "Sip happens",
    emoji: "🥤",
    items: [
      {
        name: "Soft Drinks",
        desc: "Assorted soft drinks.",
        price: 285,
        tags: ["veg"]
      },
      {
        name: "Frosted Mint Lemonade",
        desc: "Refreshing frosted lemonade with fresh mint.",
        price: 285,
        tags: ["veg"]
      },
      {
        name: "Blue Lagoon",
        desc: "A cool, vibrant blue citrus cooler.",
        price: 1010,
        tags: ["veg"]
      },
      {
        name: "Pina Colada",
        desc: "Creamy coconut and pineapple mocktail.",
        price: 1050,
        tags: ["veg"]
      },
      {
        name: "Sparkling Water (Perrier)",
        desc: "Premium Perrier sparkling water.",
        price: 830,
        tags: ["veg"]
      },
      {
        name: "Mineral Water (L)",
        desc: "Large mineral water bottle.",
        price: 320,
        tags: ["veg"]
      },
      {
        name: "Mineral Water (S)",
        desc: "Small mineral water bottle.",
        price: 170,
        tags: ["veg"]
      },
      {
        name: "Tea",
        desc: "Hot brewed tea.",
        price: 365,
        tags: ["veg"]
      },
      {
        name: "Green Tea",
        desc: "Light and refreshing green tea.",
        price: 275,
        tags: ["veg"]
      },
      {
        name: "Coffee",
        desc: "Freshly brewed hot coffee.",
        price: 945,
        tags: ["veg"]
      },
      {
        name: "Cold Coffee",
        desc: "Chilled blended coffee.",
        price: 1185,
        tags: ["veg"]
      }
    ]
  }
];
