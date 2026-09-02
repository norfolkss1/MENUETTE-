/* global DEFAULT_CATEGORIES, DEFAULT_BUFFET_STATIONS, DEFAULT_CANAPE_CATEGORIES, DEFAULT_PIN */

/* Seeded into config/menuSettings the very first time the app runs against a
   fresh Firestore project. After that, these lists are only ever read from
   Firestore — edit them from the app (Manage sections), not here.

   Each menu studio keeps its own section list: DDR uses menu courses, Buffet
   uses service stations, Canapé uses savoury/sweet. */

const DEFAULT_CATEGORIES = [
  "MORNING COFFEE BREAK",
  "STARTER",
  "MAIN",
  "VEG MAIN",
  "DESSERT",
  "SAVOURY COFFEE BREAK",
  "SWEET COFFEE BREAK",
];

const DEFAULT_BUFFET_STATIONS = [
  "COLD MEZZE & STARTERS",
  "SALADS",
  "SOUPS",
  "BREADS",
  "CHARCUTERIE & CHEESE",
  "CURED MEATS",
  "CHEESES",
  "TERRINES & PÂTÉS",
  "ACCOMPANIMENTS",
  "CONDIMENTS",
  "HOT MEZZE",
  "CARVING STATION",
  "GRILL STATION",
  "SAUCES",
  "MAIN COURSES",
  "LIVE PASTA STATION",
  "ADD-ONS",
  "SIDES",
  "DESSERTS",
  "RAMADAN DESSERTS",
  "SOFT DRINK PACKAGE – AED 250",
  "HOUSE BEVERAGE PACKAGE – AED 380",
  "BUBBLY PACKAGE – AED 550",
];

const DEFAULT_CANAPE_CATEGORIES = ["SAVOURY CANAPÉS", "SWEET CANAPÉS"];

/* Two access codes, two roles. Both roles get the whole studio; the manager
   code additionally lets you approve menus that have been sent for approval.
   Change both from Approvals → Access codes once you're up and running. */
const DEFAULT_PIN = "2580";
const DEFAULT_MANAGER_PIN = "1379";
