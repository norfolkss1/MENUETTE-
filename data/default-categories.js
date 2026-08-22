/* global DEFAULT_CATEGORIES, DEFAULT_PIN */

/* Seeded into config/menuSettings the very first time the app runs against a
   fresh Firestore project. After that, categories/pin are only ever read from
   Firestore — edit them from the app (Manage categories / change PIN), not here. */
const DEFAULT_CATEGORIES = [
  "STARTER",
  "MAIN",
  "DESSERT",
  "MORNING COFFEE BREAK",
  "AFTERNOON COFFEE BREAK",
  "LUNCH",
  "DINNER",
];

const DEFAULT_PIN = "2580";
