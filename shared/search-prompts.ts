/**
 * Searchable catalog terms, not invented multi-word filters. The shop searches
 * literal product names, tags, and colors, so keep these spellings in sync.
 */
export const SEARCH_PROMPT_GROUPS = {
  artists: [
    "MF Doom", "Pharcyde", "Outkast", "Hieroglyphics", "Slum Village",
    "Phife", "Jay Dee", "Dilla", "ATCQ", "Q-Tip", "De La Soul",
    "Black Star", "Mos Def", "Talib Kweli", "Little Brother", "Phonte",
    "9th Wonder", "Pete Rock", "CL Smooth",
    "Digable Planets", "Souls of Mischief", "Del", "Brand Nubian",
    "Beatnuts", "Def Squad", "Eric B.", "Rakim", "KRS",
    "Big L", "Big Pun", "AZ", "Nas", "WuTang", "ODB",
    "Raekwon", "Ghostface", "GZA", "Method Man", "Redman",
    "Mobb Deep", "Styles P", "Jadakiss",
    "Biggie", "Jay-Z", "2Pac", "Ice Cube", "Dr. Dre",
    "Eazy E", "Snoop", "E-40",
    "UGK", "Scarface", "Geto Boys", "8Ball", "MJG",
    "Goodie Mob", "Dungeon Family", "Andre 3000", "Big Boi",
    "Master P", "Juvenile",
    "Jodeci", "New Edition", "Isley Brothers", "Jackson 5",
    "Aaliyah", "Mary J Blige", "Lauryn Hill", "Erykah Badu",
    "D'Angelo", "Maxwell", "Sade", "Les Nubians",
    "Musiq", "Dwele", "Bilal", "Jill Scott",
    "Biz Markie", "Slick Rick", "MC Lyte", "Heavy D", "Luniz",
    "Humpty Hump", "Kool G Rap", "Roy Ayers",
    "Frankie Beverly", "Chaka Khan",
    "Luther Vandross", "SWV", "Mint Condition",
  ],
  designs: [
    "Stakes is High", "1nce Again", "Can I Kick It", "We Got the Jazz",
    "The Love Movement", "Electric Relaxation", "Bonita", "T.R.O.Y.",
    "Luchini", "Liquid Swords", "CREAM",
    "Illmatic", "One Mic", "The World Is Yours",
    "Paid In Full", "Follow The Leader", "My Philosophy", "Top Billin",
    "Chief Rocker", "Hip Hop Junkies", "I Got Ya Open", "Flava",
    "Woo Hah", "Gimme The Loot", "Everyday Struggle", "Players Anthem",
    "Its All About The Benjamins", "Money Power Respect", "Cant Knock The Hustle",
    "Reasonable Doubt", "Dear Summer", "Love Yourz",
    "Southernplayalistic", "ATLiens", "Elevators",
    "Aint No Thang", "Hootie Hoo", "Get Up Get Out",
    "Underground Kingz",
    "Thuggish Ruggish", "Crossroad", "Check Yo Self",
    "It Was A Good Day", "Nuthin", "Atomic Dog",
    "Funkdafied", "So Far To Go", "Didnt Cha Know", "No Ordinary Love",
    "Pretty Wings", "Soul Star", "My Life In The Sunshine", "Brown Skin Lady",
    "Around the Way Girl", "Dont Touch My Hair", "No Scrubs",
    "Pretty Brown Eyes", "Between the Sheets", "Anytime", "One in a Million",
    "Love U 4 Life", "I Miss the Old Kanye",
    "Kick Push", "Steady Mobbin", "Get At Me Dog", "Back in the Day",
    "Lodi Dodi", "U Still Down", "Represent Represent", "Who Ya Wit",
    "Sugar Hill Baby", "Ready or Not", "Walk On By", "Take It or Squeeze It",
    "Supa Dupa Fly", "Southern Girl", "I Need A Beat", "Rock this Funky Joint",
  ],
  scenes: [
    "Compton", "Queens", "Brooklyn", "Detroit", "Chicago", "Atlanta",
    "Oakland", "Bay Area", "Memphis", "Houston", "New Orleans",
    "Yonkers", "North Carolina", "New Jersey", "Philly", "Cleveland",
    "Los Angeles", "Jamaica", "New York", "East Coast", "West Coast",
    "Motown", "Harlem", "Bronx", "Staten Island",
    "Bad Boy", "Death Row", "Rocafella", "Ruff Ryders",
    "So So Def", "No Limit", "Ruthless", "Def Jam",
  ],
  screenAndCulture: [
    "The Last Dragon", "The Wood", "Coming to America",
    "Fresh Prince", "Dolly My Baby", "Little Mike", "DJ Mickey",
    "Free Huey", "Black Power", "Spook By the Door", "Freaknik",
    "Black Love", "Butter Pecan",
  ],
} as const;

export const SEARCH_PROMPTS: readonly string[] = Object.values(SEARCH_PROMPT_GROUPS).flat();

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** Mix themes rather than exhausting every artist before showing other ideas. */
export function createSearchPromptCycle(random: () => number = Math.random, previous?: string): string[] {
  const queues = shuffled(Object.values(SEARCH_PROMPT_GROUPS).map((group) => shuffled<string>(group, random)), random);
  const cycle: string[] = [];
  while (queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const term = queue.pop();
      if (term) cycle.push(term);
    }
  }
  if (cycle[0] === previous && cycle.length > 1) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
  return cycle;
}
