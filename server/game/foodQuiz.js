// Top Spot food quiz: see a Sarawak dish, guess its name. 5 questions per round.
// Questions and answers live on the server so coins can't be cheated.

export const DISHES = [
  { name: 'Kolo Mee', emoji: '🍜', clue: 'Springy egg noodles tossed in shallot oil, topped with red char siu and minced pork.' },
  { name: 'Sarawak Laksa', emoji: '🥣', clue: 'Rice vermicelli in a spicy sambal-and-coconut broth with prawns, chicken and omelette strips.' },
  { name: 'Kek Lapis', emoji: '🍰', clue: 'A colourful cake with many thin, shiny layers — every Hari Raya table has one!' },
  { name: 'Manok Pansuh', emoji: '🎍', clue: 'Chicken cooked inside a bamboo tube over a fire, with lemongrass and tapioca leaves.' },
  { name: 'Midin', emoji: '🌿', clue: 'Crunchy wild jungle fern, stir-fried with garlic or belacan.' },
  { name: 'Umai', emoji: '🐟', clue: 'A Melanau raw fish salad with lime, chilli and shallots.' },
  { name: 'Kampua Mee', emoji: '🍝', clue: 'Sibu-style noodles in pork lard and soy, similar to kolo mee but from Sibu.' },
  { name: 'Tomato Kuey Teow', emoji: '🍅', clue: 'Flat rice noodles fried and smothered in a sweet-sour tomato gravy.' },
  { name: 'Kueh Chap', emoji: '🍲', clue: 'Flat rice noodle sheets in a dark herbal soy broth with braised pork and egg.' },
  { name: 'Teh C Peng Special', emoji: '🧋', clue: 'An iced tea drink with three layers: palm sugar, evaporated milk and tea.' },
  { name: 'Dabai', emoji: '🫒', clue: 'A dark purple fruit called the “Sarawak olive”, soaked in warm water and eaten with soy sauce.' },
  { name: 'Terung Dayak Soup', emoji: '🟠', clue: 'A sour soup made from a round orange local eggplant, often with fish.' },
  { name: 'Bubur Pedas', emoji: '🥘', clue: 'A spicy Malay porridge full of vegetables, cooked during Ramadan.' },
  { name: 'Mee Jawa', emoji: '🍛', clue: 'Yellow noodles in a thick sweet-potato gravy with prawn fritters.' },
  { name: 'Belacan Bee Hoon', emoji: '🦐', clue: 'Rice vermicelli with a dark shrimp-paste gravy, cuttlefish and cucumber.' },
  { name: 'Nasi Aruk', emoji: '🍚', clue: 'Fried rice cooked without oil — stirred until smoky and fragrant.' },
];

export const QUIZ_LENGTH = 5;
export const COINS_PER_CORRECT = 5;
export const PERFECT_BONUS = 30;

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class FoodQuiz {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.dishes = shuffle(DISHES, rand).slice(0, QUIZ_LENGTH);
    this.index = 0;
    this.correct = 0;
    this.choices = [];
    this.makeChoices();
  }

  makeChoices() {
    const dish = this.dishes[this.index];
    if (!dish) return;
    const wrong = shuffle(DISHES.filter((d) => d !== dish), this.rand).slice(0, 3);
    this.choices = shuffle([dish, ...wrong], this.rand).map((d) => d.name);
  }

  get done() { return this.index >= this.dishes.length; }

  question() {
    const dish = this.dishes[this.index];
    return { n: this.index + 1, total: this.dishes.length, emoji: dish.emoji, clue: dish.clue, choices: this.choices };
  }

  answer(choice) {
    const dish = this.dishes[this.index];
    const correct = this.choices[choice] === dish.name;
    if (correct) this.correct++;
    this.index++;
    this.makeChoices();
    return { correct, answer: dish.name };
  }

  coins() { return this.correct * COINS_PER_CORRECT + (this.correct === QUIZ_LENGTH ? PERFECT_BONUS : 0); }
}
