// Baby food brand / category / flavor data.
// Structure: BABY_FOOD_DATA[brand][category] = string[]

export const BABY_FOOD_DATA: Record<string, Record<string, string[]>> = {
  "Amara": {
    "Purees": [
      "Banana", "Mango", "Sweet Potato", "Carrots", "Oats N Berries",
      "Oats Mango Strawberry", "Sweet Potato Raspberry", "Black Bean & Sweet Corn",
      "Applesauce w/ Maqui Berry", "Kale Veggie Mash", "Mixed Red Berries",
      "Tropical Mango Pineapple", "Apple Mango", "Oats & Berries",
    ],
    "Snacks": [
      "Smoothie Melts - Mixed Red Berries", "Smoothie Melts - Mighty Sweet Greens",
      "Smoothie Melts - Carrot Raspberry", "Fruit Bites - Apple Kale",
      "Fruit Bites - Strawberry", "Breakfast Oat Melts - Peach",
      "Breakfast Oat Melts - Strawberry",
    ],
  },

  "Beech-Nut": {
    "Organics - Stage 1": [
      "Apple", "Pear", "Carrot", "Pumpkin", "Sweet Potato", "Banana",
    ],
    "Organics - Stage 2": [
      "Apple, Raspberries & Avocado", "Pear, Mango & Strawberry", "Apple, Pea & Kiwi",
      "Mango & Carrot", "Prune & Pear", "Banana", "Apple & Blueberries",
      "Mango, Apple & Banana", "Banana, Strawberry & Blueberry", "Banana Berry Yogurt",
      "Banana Orange Yogurt", "Apple, Pumpkin & Granola", "Banana & Granola",
    ],
    "Organics - Stage 3": [
      "Mango, Yogurt & Rolled Oats", "Banana, Pumpkin & Rolled Oats",
      "Apple, Blueberries & Rolled Oats",
    ],
    "Naturals - Stage 1": [
      "Apple", "Pear", "Banana", "Sweet Potato", "Green Beans", "Carrots",
      "Butternut Squash", "Prunes",
    ],
    "Naturals - Stage 2": [
      "Mango", "Apple & Pumpkin", "Apple & Blackberries", "Pear & Blueberries",
      "Guava, Pear & Strawberries", "Pineapple, Pear & Avocado",
      "Banana, Orange & Pineapple", "Banana, Blueberries & Green Beans",
      "Carrots, Sweet Corn & Pumpkin", "Spinach, Zucchini & Peas",
      "Peas, Green Beans & Asparagus", "Sweet Corn & Green Beans",
      "Apple, Cinnamon & Granola",
    ],
    "Naturals - Stage 3/4": [
      "Mango, Carrot, Yogurt & Oat",
      "Apple, Blueberries & Ginger (Immune Support)",
      "Banana, Pumpkin & Orange (Immune Support)",
      "Pear, Kale & Orange (Immune Support)",
    ],
    "Naturals - Pouches (Fruities)": [
      "Banana, Apple & Strawberry", "Apple, Peach & Strawberries",
      "Pear, Banana & Raspberries",
    ],
    "Naturals - Pouches (Veggies)": [
      "Pumpkin, Zucchini & Apple", "Squash, Peas & Pears",
      "Zucchini, Spinach & Banana",
    ],
    "Naturals - Pouches (Breakfast)": [
      "Yogurt, Banana & Mixed Berry", "Yogurt, Banana & Strawberry",
    ],
  },

  "Cerebelly": {
    "Stage 1": [
      "Sweet Potato Mango", "White Bean Pumpkin", "Carrot Pea", "Carrot Chickpea",
      "Butternut Squash White Bean", "Black Bean Sweet Potato",
    ],
    "Stage 2": [
      "Spinach Apple Sweet Potato", "Purple Carrot Blueberry", "Pumpkin Pear Raisin",
      "Carrot Pumpkin", "Broccoli Pear",
      "Kale Sweet Potato Apple w/ Sunflower Seed Butter",
      "Beet Carrot Blueberry w/ Coconut Milk", "Spinach Strawberry",
    ],
    "Stage 3": [
      "Kale Apple Sweet Potato", "Broccoli Pear", "Beet Banana",
      "Sweet Potato Peach", "Sweet Potato Banana Blueberry",
      "Purple Carrot Blueberry Smoothie",
    ],
    "Bone Broth Pouches": [
      "Sweet Potato Pinto Bean Chicken Broth w/ Cumin",
      "Butternut Squash Chicken Bone Broth",
      "Carrot Beef Bone Broth w/ Rosemary",
      "Carrot Chickpea w/ Ginger",
      "White Bean Pumpkin Apple",
    ],
    "Snacks": ["Smart Bars"],
  },

  "Earth's Best Organic": {
    "Purees": [
      "Apple Strawberry Spinach", "Banana Apple Blueberry", "Carrot Pear",
      "Peach Mango Squash", "Pear Butternut Squash",
      "Butternut Squash, Mango & Sweet Peas", "Pumpkin & Spinach",
      "Squash & Sweet Peas", "Carrot + Broccoli",
    ],
    "Oat & Grain Blends": [
      "Apple Peach Oatmeal", "Apple + Raisin + Oatmeal",
      "Banana + Blueberry Oat", "Banana + Raspberry + Barley",
      "Sweet Potato, Banana + Oat",
    ],
    "Hearty Meals": [
      "Pasta Marinara with Veggies", "Mac + Cheese with Veggies",
      "Cheesy Pasta with Veggies",
      "Chicken Casserole (Carrot Broccoli Chicken + Barley/Oat)",
      "Beef Medley", "Turkey, Quinoa, Apple & Sweet Potato",
    ],
  },

  "Gerber Organic": {
    "First Foods": ["Organic Banana", "Organic Apple", "Organic Carrot"],
    "Second Foods": [
      "Organic Pear Peach Strawberry", "Organic Carrot Apple Mango",
      "Organic Apple Blueberry Spinach", "Organic Apple Zucchini Spinach Strawberry",
      "Organic Pear Spinach", "Organic Apple Carrot Squash",
      "Organic Pear Mango Avocado", "Organic Banana Mango",
      "Organic Apple Wild Blueberry", "Organic Pear Blueberry Apple Avocado",
    ],
    "Oatmeal Blends": [
      "Organic Mango Peach Carrot Sweet Potato Oatmeal",
      "Organic Banana Blueberry Blackberry Oatmeal",
      "Organic Banana, Strawberry, Beet, Oatmeal",
    ],
    "Toddler": [
      "Organic Banana Raspberry & Yogurt with Vanilla",
      "Organic Apple Mango Raspberry Avocado Oatmeal",
    ],
  },

  "Happy Baby Organics": {
    "Single Ingredients": [
      "Mangos", "Prunes", "Bananas", "Pears", "Apples",
      "Sweet Potatoes", "Carrots", "Green Beans", "Peas",
    ],
    "Blends": [
      "Apples, Kale & Avocado", "Apples, Blueberries & Oats",
      "Apples, Sweet Potatoes & Granola", "Apples, Guavas & Beets",
      "Apples, Purple Carrots & Guava (Brain Support)",
      "Apples, Sweet Potatoes & Carrots", "Butternut Squash w/ Cinnamon",
      "Pumpkin & Carrots", "Pumpkin & Prunes",
      "Spinach, Peas & Broccoli + Super Chia",
      "Bananas, Raspberries & Oats",
      "Bananas, Pineapple, Avocado & Granola",
      "Bananas, Sweet Potatoes & Papayas", "Bananas, Plums & Granola",
      "Bananas, Passion Fruit, Spinach & Oats",
      "Bananas, Peaches & Mangos + Super Chia",
      "Pears, Kale & Spinach", "Pears, Zucchini & Peas",
      "Pears, Squash & Blackberries", "Pears, Pumpkin, Peaches & Granola",
      "Pears, Pumpkin & Passion Fruit",
      "Pears, Blueberries & Spinach (Fiber + Protein)",
      "Pears, Blueberries, Strawberries & Oats",
      "Pears, Peaches & Strawberries", "Pears, Mangos & Spinach",
      "Pears, Peas & Broccoli",
      "Pears, Beets & Blackberries + Super Chia",
      "Pears, Raspberries, Carrots & Squash (Fiber + Protein)",
      "Squash, Mango & Papaya", "Squash, Pears & Apricots",
      "Carrots, Strawberries & Chickpeas",
      "Purple Carrots, Bananas, Avocado & Quinoa",
      "Peas, Bananas & Kiwi", "Sweet Potatoes, Mangos & Carrots",
      "Green Beans, Pears & Spinach",
    ],
    "Savory Blends": [
      "Squash, Chickpea & Spinach w/ Avocado Oil & Sage",
      "Sweet Potato, Olive Oil & Rosemary",
      "Chicken, Veg & Quinoa Fiesta",
      "Beef, Market Vegetables & Quinoa Stew",
    ],
    "Nut Blends": [
      "Bananas & Peanut Butter", "Apples & Walnut Butter", "Pears & Cashew Butter",
    ],
    "Cereals": ["Oatmeal + Banana", "Brown Rice", "Oatmeal", "Multi-Grain"],
    "Toddler Stage 4": [
      "Apples, Sweet Potatoes, Carrots & Cinnamon",
      "Bananas, Carrots & Strawberries (Immune)",
    ],
    "Snacks": [
      "Creamies", "Teethers/Wafers", "Yogurt Melts", "Superfood Puffs",
      "Crunchy Sticks - Cheddar", "Crunchy Sticks - Garden Veggie",
      "Crunchy Sticks - Strawberry Banana", "Peanut Butter Corn Puffs",
      "Letter Cookies", "Sunny Days Snack Bars", "Soft-Baked Oat Bars",
    ],
  },

  "Little Spoon": {
    "Stage 1": ["Banana", "Mango", "Sweet Potato", "Butternut Squash", "Apple", "Pear"],
    "Stage 2": [
      "Apple Carrot Ginger", "Blueberry Butternut Squash", "Carrot Sweet Potato",
      "Broccoli Pineapple Banana + Hemp Seed",
      "Pear Blueberry Chickpea Spinach + Rosemary",
      "Pear Beet Strawberry Chia + Basil",
      "Strawberry Banana Murasaki Sweet Potato",
    ],
    "Stage 3": [
      "Pea Pear Mint", "Avocado Green Apple Broccoli Spirulina",
      "Kale Avocado Mango Spirulina",
    ],
    "Stage 4/5": [
      "Quinoa Raspberry Pudding", "Apple Cinnamon Buckwheat Crumble",
      "Purple Sweet Potato Blueberry Zucchini",
      "Butternut Squash Golden Beet Cinnamon", "Strawberry Basil Gazpacho",
      "Kale Apple Avocado Chia",
      "Butternut Squash Apple Strawberry Coconut Flax Vanilla",
    ],
    "Other Blends": [
      "Sweet Potato Beet", "Banana Pumpkin Cinnamon", "Green Beans Peas",
      "Mango Carrot", "Banana Avocado", "Apple Blueberry",
      "Mango Pineapple", "Peach Banana", "Pear Zucchini",
    ],
    "Seasonal": [
      "Peach Cobbler (Sweet Potato Peach Coconut Quinoa Vanilla)",
      "Pumpkin Spice (Pumpkin Apple Coconut Date Flax Cinnamon Nutmeg Ginger Vanilla)",
    ],
    "BabyBlends+ Brain": [
      "Banana Chickpea Broccoli Kiwi Avocado Chia",
      "Butternut Squash Mango Cauliflower White Bean Coconut Pumpkin Seed Turmeric",
    ],
    "BabyBlends+ Immune": [
      "Carrot Banana Pineapple Pumpkin Seed Acerola",
      "Apple Murasaki Sweet Potato Blueberry Strawberry Spinach Pumpkin Seed Acerola",
    ],
    "BabyBlends+ Gut": [
      "Sweet Potato Apple White Bean",
      "Banana Chickpea Pitaya Purple Carrot Pumpkin Seed",
    ],
    "Snacks": ["Puffs", "Smoothie Melts", "Finger Foods"],
  },

  "Once Upon a Farm": {
    "Stage 1 Singles": [
      "Banana", "Mango", "Sweet Potato", "Butternut Squash", "Apple", "Pear",
    ],
    "Fruit & Veggie Blends": [
      "Apple Carrot Beet & Ginger", "Apple Banana Spinach & Avocado",
      "Apple Sweet Potato Blueberry & Coconut Milk", "Mango Coconut & Carrot",
      "Greens & Beans (Navy Bean Pea Broccoli Olive Oil Mint)",
      "Papaya Sunrise", "Reds Greens & Black Beans", "Cajun Beans",
      "Green Kale & Apples", "OhMyMega Veggie", "Strawberry Patch",
      "Mama Blueberry", "Wild Rumpus Avocado",
      "Strawberry Squash Coconut Vanilla", "Pineapple Banana Avocado Mint",
      "Apple Banana Kale w/ Flax Seed", "Sweet Potato Beet",
      "Banana Pumpkin Cinnamon", "Green Beans Peas", "Carrot Sweet Potato",
      "Mango Carrot", "Banana Avocado", "Apple Blueberry",
      "Mango Pineapple", "Peach Banana", "Pear Zucchini",
    ],
    "Stage 3 Blends": [
      "Pea Pear Mint", "Avocado Green Apple Broccoli Spirulina",
      "Kale Avocado Mango Spirulina",
    ],
    "Baby Oatmeal": [
      "Apple Baby Oatmeal", "Banana Baby Oatmeal",
      "Pear Blueberry Baby Oatmeal", "Mango Baby Oatmeal",
    ],
    "Toddler Bars": [
      "Tractor Wheels - Apple Sweet Potato Spinach",
      "Tractor Wheels - Banana Pumpkin Cauliflower",
      "Tractor Wheels - Strawberry Pumpkin Beet",
    ],
    "Snacks": [
      "Fruit & Veggie Puffs - Strawberry Sweet Potato Coconut",
      "Fruit & Veggie Puffs - Apple Sweet Potato Coconut",
      "Fruit & Veggie Puffs - Mango Carrot Coconut",
      "Coconut Melts - Mango Ba-nilla", "Coconut Melts - Strawberry Banana",
      "Coconut Melts - Mixed Berry", "Power Wheels - Strawberry Shortcake",
      "Power Wheels - Blueberry Crumble",
    ],
    "Smoothies": [
      "Strawberry Splash", "Orange Mango Twist",
      "Apple Strawberry Beet", "Strawberry Banana",
    ],
  },

  "Plum Organics": {
    "Little Yums Stage 2": [
      "Sweet Potato, Corn & Apple", "Carrot, Mango, Turmeric",
      "Mango & Pineapple", "Pumpkin, Banana & Papaya", "Pear & Mango",
      "Peach, Banana & Apricot", "Apple + Carrot",
      "Apple, Spinach + Avocado", "Apple, Plum, Berry + Barley",
      "Banana, Kiwi, Spinach, Greek Yogurt + Barley",
      "Pear, Purple Carrot + Blueberry",
      "Apple, Blackberry, Coconut Cream + Oat",
      "Apple, Blackberry, Purple Carrot, Greek Yogurt + Oat",
    ],
    "Mighty 4 Meals": [
      "Guava, Banana, Black Bean, Carrot + Oat",
      "Banana, Peach, Pumpkin, Carrot, Greek Yogurt + Oat",
      "Mango, Banana, White Bean + Chia",
    ],
    "Snacks": ["Mighty Puffs", "Teensy Snacks - Soft Fruit Snacks", "Jammy Sammy Sandwich Bars"],
  },

  "Serenity Kids": {
    "Grass-Fed Beef": [
      "Beef w/ Kale Sweet Potato", "Beef Chimichurri w/ Vegetables",
      "Beef Pot Roast w/ Veggies Herbs Bone Broth", "Beef Kebab",
      "Beef & Ginger w/ Pea Bell Pepper Broccoli",
    ],
    "Free-Range Chicken": [
      "Chicken w/ Peas Carrots", "Chicken Thyme Parsnip Beet",
      "Chicken Mexican Inspired Stew w/ Veggies Spices",
      "Turmeric Chicken w/ Veggies Herbs Bone Broth",
      "Coconut Curry Chicken", "Chicken Tikka Masala",
    ],
    "Free-Range Turkey": [
      "Turkey Sweet Potato Pumpkin Beet",
      "Turkey Bolognese w/ Vegetables Herbs Bone Broth",
      "Turkey w/ Vegetables Rosemary",
    ],
    "Free-Range Pork": [
      "Pork Green Beans & Sweet Potatoes", "Pork Apple Carrots Sage",
    ],
    "Wild-Caught Salmon": [
      "Salmon Butternut Squash Beet", "Salmon Teriyaki",
    ],
    "Bison": ["Bison Kabocha Squash Spinach"],
    "Veggie Pouches": [
      "Sweet Potato Spinach", "Carrot Spinach Basil Olive Oil",
      "Sweet Potato Parsnip Purple Carrot Olive Oil",
      "Squashes (Kabocha Butternut Pumpkin) Olive Oil",
      "Carrot Spinach Basil",
    ],
    "Smoothies": [
      "Pumpkin Spice", "Berry Butternut + Protein", "Mango Sweet Potato",
      "Apple Pumpkin Spice", "Blueberry Butternut", "Beet Carrot",
    ],
    "Puffs": [
      "Cheddar Cauliflower Spinach", "Carrot Beet", "Pumpkin Cinnamon",
      "Broccoli Spinach", "Tomato Mushroom",
    ],
  },

  "Square Baby": {
    "Veggie-Based": ["Spinach Dahl", "Greenie Baby"],
    "Fruit-Based": [
      "Beet Berry", "Blueberry Crush", "Mango Chia Pudding", "Peachy Oatmeal",
    ],
    "Protein Meals": [
      "Apple Curry Chicken", "Lil Cashew Chicken", "Cashew Chicken",
      "Salmon Mash", "Beef Stew",
    ],
    "Allergen Introduction": [
      "Almond Butter & Banana", "Hazelnut Pumpkin Pie",
      "Lil Cashew Chicken", "Salmon Mash",
    ],
    "Grains": ["Oatmeal varieties", "Bean/lentil-based meals"],
  },

  "White Leaf Provisions": {
    "Purees": [
      "Carrot Sweet Potato Pea Puree", "Pea Apple Cauliflower Puree",
      "Pumpkin Nectarine Puree", "Pear Banana Kiwi Puree",
      "Peach Oat Puree", "Mango Carrot Banana Pear",
      "Banana Sweet Potato", "Pear Quinoa", "Apple Oat",
      "Carrot Pumpkin", "Mango Carrot", "Sweet Potato Apple",
    ],
    "Applesauce Pouches": [
      "Apple + Blueberry Sauce", "Apple + Pear Sauce",
      "Apple + Mango + Coconut Sauce", "Apple + Banana Sauce",
    ],
    "Cereals & Snacks": [
      "Organic Whole Grain Cereal", "Mighty Sticks", "Puffs",
    ],
  },
};

export const BRAND_NAMES = Object.keys(BABY_FOOD_DATA).sort();

export function getCategories(brand: string): string[] {
  return Object.keys(BABY_FOOD_DATA[brand] ?? {});
}

export function getFlavors(brand: string, category: string): string[] {
  return BABY_FOOD_DATA[brand]?.[category] ?? [];
}

export function getAllFlavorsForBrand(brand: string): string[] {
  return Object.values(BABY_FOOD_DATA[brand] ?? {}).flat();
}
