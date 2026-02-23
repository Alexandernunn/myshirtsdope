import { storage } from "./storage";
import type { InsertProduct } from "@shared/schema";

const PRINTFUL_API_BASE = "https://api.printful.com";

interface PrintfulSyncProduct {
  id: number;
  external_id: string;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url: string;
  is_ignored: boolean;
}

interface PrintfulSyncVariant {
  id: number;
  sync_product_id: number;
  name: string;
  synced: boolean;
  variant_id: number;
  retail_price: string;
  currency: string;
  product: {
    variant_id: number;
    product_id: number;
    image: string;
    name: string;
  };
  files: Array<{
    id: number;
    type: string;
    preview_url: string;
    thumbnail_url: string;
  }>;
}

interface PrintfulProductDetail {
  sync_product: {
    id: number;
    external_id: string;
    name: string;
    variants: number;
    synced: number;
    thumbnail_url: string;
  };
  sync_variants: PrintfulSyncVariant[];
}

function getApiKey(): string {
  const key = process.env.PRINTFUL_API_KEY;
  if (!key) throw new Error("PRINTFUL_API_KEY is not set");
  return key;
}

async function fetchAllSyncProducts(): Promise<PrintfulSyncProduct[]> {
  const allProducts: PrintfulSyncProduct[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetchWithRetry(`${PRINTFUL_API_BASE}/sync/products?offset=${offset}&limit=${limit}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Printful API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    const products = data.result as PrintfulSyncProduct[];
    allProducts.push(...products);

    const total = data.paging?.total || 0;
    if (allProducts.length >= total || products.length < limit) break;
    offset += limit;
  }

  return allProducts;
}

async function fetchProductDetail(syncProductId: number): Promise<PrintfulProductDetail> {
  const res = await fetchWithRetry(`${PRINTFUL_API_BASE}/sync/products/${syncProductId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printful API error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.result as PrintfulProductDetail;
}

function categorizeProduct(productName: string, variants: PrintfulSyncVariant[]): string {
  const name = productName.toLowerCase();
  const variantProductName = variants[0]?.product?.name?.toLowerCase() || "";

  if (name.includes("onesie") || name.includes("bodysuit") || variantProductName.includes("one piece")) return "Onesies";
  if (name.includes("hoodie") || name.includes("sweatshirt") || name.includes("pullover")) return "Hoodies";
  if (name.includes("mug") || name.includes("candle") || name.includes("hat") || name.includes("cap") ||
      name.includes("beanie") || name.includes("pin") || name.includes("tote") || name.includes("bag") ||
      name.includes("sticker") || name.includes("poster") || name.includes("phone case")) return "Accessories";
  if (name.includes("shirt") || name.includes("tee") || name.includes("tank") || name.includes("jersey")) return "Shirts";

  if (variantProductName.includes("hoodie") || variantProductName.includes("sweatshirt")) return "Hoodies";
  if (variantProductName.includes("onesie") || variantProductName.includes("bodysuit") || variantProductName.includes("one piece")) return "Onesies";
  if (variantProductName.includes("mug") || variantProductName.includes("candle")) return "Accessories";
  return "Shirts";
}

function extractSizesAndColors(variants: PrintfulSyncVariant[]): { sizes: string[]; colors: string[]; colorImages: Record<string, string> } {
  const sizes = new Set<string>();
  const colors = new Set<string>();
  const colorImages: Record<string, string> = {};

  for (const v of variants) {
    let colorName: string | null = null;

    const nameParts = v.name.split(" / ");
    if (nameParts.length >= 3) {
      colorName = nameParts[1].trim();
      colors.add(colorName);
      sizes.add(nameParts[2].trim());
    } else if (nameParts.length === 2) {
      const val = nameParts[1].trim();
      if (isSize(val)) {
        sizes.add(val);
      } else {
        colorName = val;
        colors.add(colorName);
      }
    }

    if (v.product?.name) {
      const prodParts = v.product.name.match(/\(([^)]+)\)$/);
      if (prodParts) {
        const inner = prodParts[1].split(" / ");
        if (inner.length === 2) {
          if (!colorName) {
            colorName = inner[0].trim();
          }
          colors.add(inner[0].trim());
          sizes.add(inner[1].trim());
        }
      }
    }

    if (colorName && !colorImages[colorName]) {
      const preview = v.files?.find(f => f.type === "preview");
      if (preview?.preview_url) {
        colorImages[colorName] = preview.preview_url;
      } else if (v.product?.image) {
        colorImages[colorName] = v.product.image;
      }
    }
  }

  return {
    sizes: sizes.size > 0 ? Array.from(sizes) : ["One Size"],
    colors: colors.size > 0 ? Array.from(colors) : ["Default"],
    colorImages,
  };
}

function isSize(val: string): boolean {
  const sizePatterns = /^(XS|S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL|NB|3M|6M|9M|12M|18M|24M|2T|3T|4T|5T|One Size|\d+(\.\d+)?(oz)?|11oz|15oz)$/i;
  return sizePatterns.test(val.trim());
}

function getBestImageUrl(detail: PrintfulProductDetail): string {
  for (const v of detail.sync_variants) {
    if (v.files) {
      const preview = v.files.find(f => f.type === "preview");
      if (preview?.preview_url) return preview.preview_url;
    }
  }
  return detail.sync_product.thumbnail_url || "/images/placeholder.png";
}

const AREA_CODE_CITIES: Record<string, string[]> = {
  "212": ["new york", "nyc", "manhattan", "east coast"],
  "305": ["miami", "florida", "south florida", "south"],
  "310": ["los angeles", "la", "california", "west coast"],
  "312": ["chicago", "illinois", "midwest"],
  "313": ["detroit", "michigan", "midwest"],
  "404": ["atlanta", "georgia", "south", "atl"],
  "615": ["nashville", "tennessee", "south"],
};

const ARTIST_TAG_MAP: Record<string, string[]> = {
  "eazy e": ["west coast", "compton", "los angeles", "california", "nwa", "ruthless", "rap", "hip hop", "gangsta rap"],
  "eric b. and rakim": ["east coast", "new york", "nyc", "rap", "hip hop", "golden age"],
  "eric b. and rakim 86": ["east coast", "new york", "nyc", "rap", "hip hop", "golden age"],
  "2pac": ["west coast", "los angeles", "california", "rap", "hip hop", "tupac", "thug life"],
  "thug life 2pac": ["west coast", "los angeles", "california", "rap", "hip hop", "tupac", "2pac", "thug life"],
  "bone thugs": ["cleveland", "ohio", "midwest", "rap", "hip hop", "bone thugs n harmony"],
  "wutang": ["wu-tang", "wu tang", "staten island", "new york", "nyc", "east coast", "rap", "hip hop"],
  "cream wutang": ["wu-tang", "wu tang", "staten island", "new york", "nyc", "east coast", "rap", "hip hop", "c.r.e.a.m."],
  "c.r.e.a.m.": ["wu-tang", "wu tang", "staten island", "new york", "nyc", "east coast", "rap", "hip hop", "wutang"],
  "wu kitty": ["wu-tang", "wu tang", "new york", "nyc", "east coast", "rap", "hip hop", "wutang"],
  "liquid swords": ["wu-tang", "wu tang", "gza", "new york", "nyc", "east coast", "rap", "hip hop"],
  "odb": ["wu-tang", "wu tang", "ol dirty bastard", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "mf doom": ["underground", "rap", "hip hop", "new york", "nyc", "east coast", "alternative hip hop"],
  "big l": ["harlem", "new york", "nyc", "east coast", "rap", "hip hop"],
  "big l corelone": ["harlem", "new york", "nyc", "east coast", "rap", "hip hop"],
  "big l corleone": ["harlem", "new york", "nyc", "east coast", "rap", "hip hop"],
  "big poppa": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "bad boy"],
  "it was all a dream": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "bad boy", "juicy"],
  "one more chance": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "bad boy"],
  "gimme the loot": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "nas": ["queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "the world is yours nas": ["nas", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "illmatic"],
  "my daddy is illmatic": ["nas", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "illmatic"],
  "one mic": ["nas", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "gods son": ["nas", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "if i ruled the world": ["nas", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "represent represent": ["nas", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "biz markie": ["new york", "nyc", "east coast", "rap", "hip hop"],
  "black sheep": ["new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "black star": ["brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "mos def", "talib kweli", "conscious"],
  "brand nubian": ["new york", "nyc", "east coast", "rap", "hip hop", "conscious", "golden age"],
  "dead prez": ["new york", "nyc", "east coast", "rap", "hip hop", "conscious", "political"],
  "def squad": ["new york", "nyc", "east coast", "rap", "hip hop", "erick sermon", "redman"],
  "epmd": ["new york", "nyc", "east coast", "rap", "hip hop", "golden age"],
  "epmd strictly business": ["new york", "nyc", "east coast", "rap", "hip hop", "golden age", "epmd"],
  "fat boys": ["brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "old school"],
  "outkast": ["atlanta", "georgia", "south", "atl", "rap", "hip hop", "dirty south", "andre 3000", "big boi"],
  "atlien": ["outkast", "atlanta", "georgia", "south", "atl", "rap", "hip hop", "dirty south", "andre 3000", "big boi"],
  "players ball": ["outkast", "atlanta", "georgia", "south", "atl", "rap", "hip hop", "dirty south"],
  "prototype": ["outkast", "atlanta", "georgia", "south", "atl", "rap", "hip hop", "andre 3000"],
  "pharcyde": ["los angeles", "california", "west coast", "rap", "hip hop", "alternative hip hop"],
  "phife": ["a tribe called quest", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "award tour": ["a tribe called quest", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "check the rhyme": ["a tribe called quest", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "electric relaxation": ["a tribe called quest", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "can i kick it": ["a tribe called quest", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "the love movement": ["a tribe called quest", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "hieroglyphics": ["oakland", "bay area", "california", "west coast", "rap", "hip hop", "underground"],
  "souls of mischief": ["oakland", "bay area", "california", "west coast", "rap", "hip hop", "hieroglyphics"],
  "luniz": ["oakland", "bay area", "california", "west coast", "rap", "hip hop"],
  "luniz 5 on it": ["oakland", "bay area", "california", "west coast", "rap", "hip hop"],
  "jackson 5": ["gary", "indiana", "motown", "r&b", "soul", "music", "pop"],
  "isley brothers": ["r&b", "soul", "music", "funk"],
  "new edition": ["boston", "r&b", "soul", "music", "pop"],
  "another bad creation": ["r&b", "music", "new jack swing"],
  "les nubians": ["r&b", "soul", "music", "neo soul", "french"],
  "little brother": ["durham", "north carolina", "south", "rap", "hip hop"],
  "common": ["chicago", "illinois", "midwest", "rap", "hip hop", "conscious"],
  "common i used to love her": ["chicago", "illinois", "midwest", "rap", "hip hop", "conscious", "common"],
  "the light": ["common", "chicago", "illinois", "midwest", "rap", "hip hop", "conscious"],
  "dilla": ["detroit", "michigan", "midwest", "rap", "hip hop", "j dilla", "jay dee", "producer"],
  "dilla detroit la": ["detroit", "los angeles", "michigan", "california", "rap", "hip hop", "j dilla", "jay dee", "producer"],
  "dilla charlie brown": ["detroit", "michigan", "rap", "hip hop", "j dilla", "jay dee"],
  "dillatroit": ["detroit", "michigan", "rap", "hip hop", "j dilla", "jay dee"],
  "thank you jay dee": ["detroit", "michigan", "rap", "hip hop", "j dilla", "jay dee", "dilla"],
  "cashville": ["nashville", "tennessee", "south", "rap", "hip hop"],
  "crooklyns finest": ["brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "6 mile detroit": ["detroit", "michigan", "midwest", "eminem", "rap", "hip hop"],
  "what up doe": ["detroit", "michigan", "midwest", "rap", "hip hop", "motown"],
  "what up doe detroit": ["detroit", "michigan", "midwest", "rap", "hip hop", "motown"],
  "what up doe detroit 2": ["detroit", "michigan", "midwest", "rap", "hip hop", "motown"],
  "detroit wolverines": ["detroit", "michigan", "midwest", "sports"],
  "detroit wolverine": ["detroit", "michigan", "midwest", "sports"],
  "doggy dogg world": ["snoop dogg", "long beach", "los angeles", "california", "west coast", "rap", "hip hop", "death row"],
  "nothin but a g thang": ["dr dre", "snoop dogg", "compton", "los angeles", "california", "west coast", "rap", "hip hop", "death row", "gangsta rap"],
  "the next episode": ["dr dre", "snoop dogg", "compton", "los angeles", "california", "west coast", "rap", "hip hop"],
  "it was a good day": ["ice cube", "los angeles", "california", "west coast", "rap", "hip hop", "south central"],
  "check yo self b4 u wreck ya self": ["ice cube", "los angeles", "california", "west coast", "rap", "hip hop"],
  "always into somethin": ["nwa", "compton", "los angeles", "california", "west coast", "rap", "hip hop", "gangsta rap"],
  "all in the same gang": ["west coast", "los angeles", "california", "rap", "hip hop"],
  "to live and die in la": ["west coast", "los angeles", "california", "rap", "hip hop"],
  "to live and die in l.a.": ["west coast", "los angeles", "california", "rap", "hip hop"],
  "regulators mount up": ["warren g", "nate dogg", "long beach", "los angeles", "california", "west coast", "rap", "hip hop", "g-funk"],
  "hard knock life": ["jay-z", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "roc-a-fella"],
  "reasonable doubt 20": ["jay-z", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "roc-a-fella"],
  "cant knock the hustle": ["jay-z", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "its all about the benjamins": ["puff daddy", "diddy", "bad boy", "new york", "nyc", "east coast", "rap", "hip hop"],
  "money power respect": ["the lox", "yonkers", "new york", "nyc", "east coast", "rap", "hip hop"],
  "rock the bells": ["ll cool j", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "old school"],
  "mama said knock u out": ["ll cool j", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "i cant live w/o my radio": ["ll cool j", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "i need a beat": ["ll cool j", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "im bad": ["ll cool j", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "around the way girl": ["ll cool j", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "dont believe the hype": ["public enemy", "long island", "new york", "nyc", "east coast", "rap", "hip hop", "political", "conscious"],
  "follow the leader": ["eric b", "rakim", "new york", "nyc", "east coast", "rap", "hip hop", "golden age"],
  "paid in full": ["eric b", "rakim", "new york", "nyc", "east coast", "rap", "hip hop", "golden age"],
  "i aint no joke": ["eric b", "rakim", "new york", "nyc", "east coast", "rap", "hip hop"],
  "top billin": ["audio two", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "old school"],
  "childrens story": ["slick rick", "bronx", "new york", "nyc", "east coast", "rap", "hip hop", "storytelling"],
  "lyte as a rock": ["mc lyte", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "female mc"],
  "me myself and i": ["de la soul", "long island", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "stakes is high": ["de la soul", "long island", "new york", "nyc", "east coast", "rap", "hip hop", "native tongues"],
  "cool like that": ["digable planets", "new york", "nyc", "east coast", "rap", "hip hop", "jazz rap"],
  "t.r.o.y.": ["pete rock", "cl smooth", "mount vernon", "new york", "nyc", "east coast", "rap", "hip hop"],
  "troy": ["pete rock", "cl smooth", "mount vernon", "new york", "nyc", "east coast", "rap", "hip hop"],
  "they want efx": ["das efx", "new york", "nyc", "east coast", "rap", "hip hop"],
  "the infamous": ["mobb deep", "queensbridge", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "hip hop junkies": ["nice & smooth", "new york", "nyc", "east coast", "rap", "hip hop"],
  "the show": ["slick rick", "doug e fresh", "new york", "nyc", "east coast", "rap", "hip hop", "old school"],
  "down with the king": ["run dmc", "queens", "new york", "nyc", "east coast", "rap", "hip hop", "old school"],
  "my philosophy": ["krs-one", "boogie down productions", "bronx", "new york", "nyc", "east coast", "rap", "hip hop", "conscious"],
  "step off humpty": ["digital underground", "oakland", "bay area", "california", "west coast", "rap", "hip hop"],
  "humpty hump": ["digital underground", "oakland", "bay area", "california", "west coast", "rap", "hip hop"],
  "brand new flava in ya ear": ["craig mack", "new york", "nyc", "east coast", "rap", "hip hop", "bad boy"],
  "u.n.i.t.y.": ["queen latifah", "newark", "new jersey", "east coast", "rap", "hip hop", "female mc", "conscious"],
  "do wop that thing": ["lauryn hill", "south orange", "new jersey", "east coast", "rap", "hip hop", "r&b", "fugees"],
  "everything is everything": ["lauryn hill", "new jersey", "east coast", "rap", "hip hop", "r&b", "fugees"],
  "lost ones": ["lauryn hill", "new jersey", "east coast", "rap", "hip hop", "r&b", "fugees"],
  "ready or not": ["fugees", "new jersey", "east coast", "rap", "hip hop"],
  "the firm": ["nas", "az", "foxy brown", "new york", "nyc", "east coast", "rap", "hip hop"],
  "supa dupa fly": ["missy elliott", "virginia", "east coast", "rap", "hip hop", "r&b", "timbaland"],
  "get ur freak on": ["missy elliott", "virginia", "east coast", "rap", "hip hop"],
  "kick push": ["lupe fiasco", "chicago", "illinois", "midwest", "rap", "hip hop", "conscious"],
  "through the wire": ["kanye west", "chicago", "illinois", "midwest", "rap", "hip hop"],
  "i miss the old kanye": ["kanye west", "chicago", "illinois", "midwest", "rap", "hip hop"],
  "touch the sky": ["kanye west", "chicago", "illinois", "midwest", "rap", "hip hop"],
  "overnight celebrity": ["twista", "chicago", "illinois", "midwest", "rap", "hip hop"],
  "everyday im hustlin": ["rick ross", "miami", "florida", "south", "rap", "hip hop"],
  "a milli": ["lil wayne", "new orleans", "louisiana", "south", "rap", "hip hop", "cash money"],
  "bout it bout it": ["master p", "new orleans", "louisiana", "south", "rap", "hip hop", "no limit"],
  "coming out hard": ["eightball & mjg", "memphis", "tennessee", "south", "rap", "hip hop"],
  "meet u at the crossroad": ["bone thugs n harmony", "cleveland", "ohio", "midwest", "rap", "hip hop"],
  "meet u at the crossroads": ["bone thugs n harmony", "cleveland", "ohio", "midwest", "rap", "hip hop"],
  "thuggish ruggish": ["bone thugs n harmony", "cleveland", "ohio", "midwest", "rap", "hip hop"],
  "diamonds and wood": ["ugk", "port arthur", "texas", "south", "rap", "hip hop", "pimp c", "bun b"],
  "underground kingz": ["ugk", "port arthur", "texas", "south", "rap", "hip hop", "pimp c", "bun b"],
  "25 lighters": ["dj dmd", "lil keke", "houston", "texas", "south", "rap", "hip hop"],
  "hootie hoo": ["outkast", "atlanta", "georgia", "south", "atl", "rap", "hip hop", "dirty south"],
  "southern hospitality": ["ludacris", "atlanta", "georgia", "south", "rap", "hip hop"],
  "get low": ["lil jon", "atlanta", "georgia", "south", "rap", "hip hop", "crunk"],
  "snap yo fingers": ["lil jon", "atlanta", "georgia", "south", "rap", "hip hop", "crunk"],
  "the block is hot": ["lil wayne", "new orleans", "louisiana", "south", "rap", "hip hop", "cash money"],
  "hot boys": ["cash money", "new orleans", "louisiana", "south", "rap", "hip hop"],
  "hot boyz": ["missy elliott", "virginia", "east coast", "rap", "hip hop"],
  "we fly high ballin": ["jim jones", "harlem", "new york", "nyc", "east coast", "rap", "hip hop", "dipset"],
  "no diggity no doubt": ["blackstreet", "new york", "r&b", "new jack swing", "music"],
  "no scrubs": ["tlc", "atlanta", "georgia", "r&b", "music"],
  "jodeci freekn you": ["jodeci", "charlotte", "north carolina", "r&b", "new jack swing", "music"],
  "between the sheets": ["isley brothers", "r&b", "soul", "music"],
  "before i let go": ["maze", "frankie beverly", "r&b", "soul", "music"],
  "atomic dog": ["george clinton", "parliament", "funkadelic", "funk", "music"],
  "baptized in the funk": ["funk", "music", "soul"],
  "bad mama jama": ["carl carlton", "r&b", "funk", "music"],
  "yo mtv raps": ["hip hop", "rap", "mtv", "old school", "classic", "music", "television"],
  "steady mobbin": ["lil wayne", "new orleans", "louisiana", "south", "rap", "hip hop"],
  "grindin all my life": ["rap", "hip hop", "hustle"],
  "soul food": ["goodie mob", "atlanta", "georgia", "south", "rap", "hip hop", "dirty south"],
  "still ghetto": ["ludacris", "atlanta", "georgia", "south", "rap", "hip hop"],
  "how its going down": ["dj drama", "atlanta", "georgia", "south", "rap", "hip hop"],
  "get money": ["junior mafia", "biggie", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "kick in the door": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "unbelievable": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "picture me rollin": ["2pac", "tupac", "west coast", "los angeles", "california", "rap", "hip hop", "death row"],
  "me against the world": ["2pac", "tupac", "west coast", "los angeles", "california", "rap", "hip hop"],
  "hail mary": ["2pac", "tupac", "west coast", "los angeles", "california", "rap", "hip hop", "death row", "makaveli"],
  "keep ya head up": ["2pac", "tupac", "west coast", "los angeles", "california", "rap", "hip hop", "conscious"],
  "dear summer": ["jay-z", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "west coast girl": ["west coast", "california", "los angeles", "rap", "hip hop"],
  "sugar hill": ["sugarhill gang", "new jersey", "east coast", "rap", "hip hop", "old school"],
  "the freshest": ["rap", "hip hop", "fresh"],
  "poetic justice": ["kendrick lamar", "compton", "los angeles", "california", "west coast", "rap", "hip hop"],
  "dont kill my vibe": ["kendrick lamar", "compton", "los angeles", "california", "west coast", "rap", "hip hop"],
  "stay dangerous": ["yg", "compton", "los angeles", "california", "west coast", "rap", "hip hop"],
  "olympic black power": ["black power", "culture", "history", "activism"],
  "stay woke": ["conscious", "culture", "activism", "rap", "hip hop"],
  "power to the people": ["black power", "culture", "history", "activism", "conscious"],
  "young gifted and black": ["culture", "nina simone", "soul", "music", "black excellence"],
  "free huey": ["black panther", "huey newton", "culture", "history", "activism"],
  "southern girl": ["south", "r&b", "music"],
  "southern comfort": ["south", "rap", "hip hop"],
  "southern hummingbird": ["tweet", "south", "r&b", "music"],
  "freaknik veteran": ["atlanta", "georgia", "south", "culture", "party"],
  "back in the day": ["old school", "classic", "nostalgia", "hip hop", "rap"],
  "la smoove": ["los angeles", "california", "west coast"],
  "space age 4 eva": ["outkast", "atlanta", "georgia", "south", "rap", "hip hop"],
  "players anthem": ["ugk", "jay-z", "texas", "south", "rap", "hip hop"],
  "off the books": ["beatnuts", "big pun", "new york", "nyc", "east coast", "rap", "hip hop", "latin"],
  "woo hah": ["busta rhymes", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "woo hah got you all in check": ["busta rhymes", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "get at me dog": ["dmx", "yonkers", "new york", "nyc", "east coast", "rap", "hip hop", "ruff ryders"],
  "rather unique": ["aq", "new york", "nyc", "east coast", "rap", "hip hop"],
  "this is how we do it": ["montell jordan", "los angeles", "california", "r&b", "music", "party"],
  "whats the 411": ["mary j blige", "yonkers", "new york", "nyc", "r&b", "hip hop soul", "music"],
  "real love": ["mary j blige", "yonkers", "new york", "nyc", "r&b", "hip hop soul", "music"],
  "u remind me": ["usher", "atlanta", "georgia", "r&b", "music"],
  "my boo": ["usher", "atlanta", "georgia", "r&b", "music"],
  "no letting go": ["wayne wonder", "dancehall", "reggae", "music"],
  "pon de river pon de bank": ["dancehall", "reggae", "music"],
  "gimme the light": ["sean paul", "dancehall", "reggae", "music"],
  "dont be cruel": ["bobby brown", "boston", "r&b", "new jack swing", "music", "new edition"],
  "every lil step": ["bobby brown", "boston", "r&b", "new jack swing", "music"],
  "if it isnt love": ["new edition", "boston", "r&b", "new jack swing", "music"],
  "u better call tyrone": ["erykah badu", "dallas", "texas", "neo soul", "r&b", "music"],
  "didnt cha know": ["erykah badu", "dallas", "texas", "neo soul", "r&b", "music"],
  "vibrant thing": ["q-tip", "queens", "new york", "nyc", "rap", "hip hop"],
  "smooth operator": ["sade", "r&b", "soul", "music"],
  "remember the time": ["michael jackson", "pop", "r&b", "music"],
  "isnt she lovely": ["stevie wonder", "r&b", "soul", "music", "motown"],
  "lovely day": ["bill withers", "r&b", "soul", "music"],
  "aint no stopping us now": ["mcfadden & whitehead", "philadelphia", "r&b", "soul", "disco", "music"],
  "give it to me baby": ["rick james", "funk", "r&b", "music"],
  "im the magnificent": ["dj jazzy jeff", "philadelphia", "rap", "hip hop"],
  "funkdafied": ["da brat", "chicago", "illinois", "midwest", "rap", "hip hop", "female mc"],
  "fast life": ["kool g rap", "queens", "new york", "nyc", "east coast", "rap", "hip hop"],
  "just to get by": ["talib kweli", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "conscious"],
  "brown skin lady": ["black star", "mos def", "talib kweli", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop", "conscious"],
  "love yourz": ["j cole", "fayetteville", "north carolina", "rap", "hip hop", "dreamville"],
  "everyday struggle": ["biggie", "notorious big", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "i got it made": ["special ed", "brooklyn", "new york", "nyc", "east coast", "rap", "hip hop"],
  "fool...u know how we do it": ["ice cube", "los angeles", "california", "west coast", "rap", "hip hop"],
  "swagger like us": ["ti", "jay-z", "kanye west", "lil wayne", "atlanta", "rap", "hip hop"],
  "game related": ["rap", "hip hop", "west coast", "california"],
  "urban legend": ["ti", "atlanta", "georgia", "south", "rap", "hip hop"],
  "the big payback": ["james brown", "funk", "soul", "music"],
  "how ya do dat there": ["south", "rap", "hip hop"],
  "breakem off somethin": ["south", "rap", "hip hop"],
  "foe the love of money": ["rap", "hip hop", "hustle"],
  "all for the money": ["rap", "hip hop", "hustle"],
  "4 tha love of money": ["rap", "hip hop", "hustle"],
  "get dis money": ["rap", "hip hop", "hustle"],
  "gotta make that money mane": ["rap", "hip hop", "hustle", "south"],
  "cant stop wont stop": ["puff daddy", "diddy", "bad boy", "new york", "nyc", "rap", "hip hop"],
  "frontin": ["pharrell", "virginia", "rap", "hip hop", "neptunes"],
  "keep on keepin on": ["mc lyte", "xscape", "new york", "nyc", "east coast", "rap", "hip hop"],
  "i wanna chill on sugar hill": ["sugarhill", "new york", "nyc", "east coast", "rap", "hip hop", "old school"],
  "back and forth": ["aaliyah", "detroit", "michigan", "r&b", "music"],
  "one in a million": ["aaliyah", "detroit", "michigan", "r&b", "music"],
  "soul clap": ["funk", "soul", "music", "party"],
  "afro puffs": ["the lady of rage", "west coast", "los angeles", "california", "rap", "hip hop", "death row"],
  "dont touch my hair": ["solange", "houston", "texas", "r&b", "music"],
  "beautiful skin": ["goodie mob", "atlanta", "georgia", "south", "r&b", "music"],
  "sprinkle me": ["south", "rap", "hip hop"],
  "laffy taffy": ["d4l", "atlanta", "georgia", "south", "rap", "hip hop", "snap music"],
  "get the gas face": ["3rd bass", "new york", "nyc", "east coast", "rap", "hip hop"],
  "hold you down": ["rap", "hip hop", "r&b", "love"],
  "1999": ["prince", "minneapolis", "minnesota", "funk", "r&b", "music", "pop"],
  "33 45 vinyl": ["vinyl", "music", "dj", "records", "old school"],
  "thats the way love goes": ["janet jackson", "r&b", "music", "pop"],
  "i love your smile": ["shanice", "r&b", "music"],
  "anytime...any place": ["janet jackson", "r&b", "music"],
  "lodi dodi": ["slick rick", "snoop dogg", "new york", "east coast", "rap", "hip hop", "old school"],
  "ordinary people": ["john legend", "r&b", "soul", "music"],
  "so amazing": ["luther vandross", "r&b", "soul", "music"],
  "pretty wings": ["maxwell", "r&b", "neo soul", "music"],
  "mahogany soul": ["angie stone", "r&b", "neo soul", "music"],
  "so far to go": ["j dilla", "common", "detroit", "chicago", "rap", "hip hop"],
  "mercy mercy me": ["marvin gaye", "motown", "detroit", "r&b", "soul", "music"],
  "whats going on": ["marvin gaye", "motown", "detroit", "r&b", "soul", "music"],
  "love and happiness": ["al green", "memphis", "tennessee", "r&b", "soul", "music"],
  "lets chill": ["guy", "r&b", "new jack swing", "music"],
  "no ordinary love": ["sade", "r&b", "soul", "music"],
};

export function generateTags(productName: string, category: string, colors: string[]): string[] {
  const tags = new Set<string>();

  tags.add(category.toLowerCase());
  tags.add("hip hop");
  tags.add("music");
  tags.add("rap");

  const name = productName.trim();
  const productTypes = ["shirt", "hoodie", "onesie", "tee", "tank", "jersey", "sweatshirt", "pullover", "bodysuit"];
  let baseName = name;
  for (const type of productTypes) {
    const typePatterns = [
      ` youth ${type}`,
      ` toddler ${type}`,
      ` kids ${type}`,
      ` baby ${type}`,
      ` ${type}`,
    ];
    for (const pattern of typePatterns) {
      const idx = baseName.toLowerCase().lastIndexOf(pattern);
      if (idx > 0) {
        baseName = baseName.substring(0, idx).trim();
        break;
      }
    }
  }

  const suffixPatterns = [/ mug$/i, / candle$/i, / baby$/i, / youth$/i, / toddler$/i, / kids$/i, / oneise$/i];
  for (const pat of suffixPatterns) {
    baseName = baseName.replace(pat, "").trim();
  }

  if (baseName && baseName !== name) {
    tags.add(baseName.toLowerCase());
  }

  tags.add(name.toLowerCase());

  const lowerBase = baseName.toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerName.includes("youth")) tags.add("youth");
  if (lowerName.includes("toddler") || lowerName.includes("kids")) tags.add("kids");
  if (lowerName.includes("onesie") || lowerName.includes("bodysuit")) tags.add("baby");
  if (lowerName.includes("hoodie") || lowerName.includes("sweatshirt")) tags.add("hoodie");
  if (lowerName.includes("shirt") || lowerName.includes("tee")) tags.add("shirt");
  if (lowerName.includes("mug")) tags.add("mug");
  if (lowerName.includes("candle")) tags.add("candle");
  if (lowerName.includes("mixtape")) tags.add("mixtape");
  if (lowerName.includes("vintage") || lowerName.includes("retro") || lowerName.includes("classic")) tags.add("retro");

  const areaCodeMatch = lowerBase.match(/^(\d{3})\s+day$/);
  if (areaCodeMatch) {
    const code = areaCodeMatch[1];
    const cityTags = AREA_CODE_CITIES[code];
    if (cityTags) {
      for (const ct of cityTags) tags.add(ct);
    }
    tags.add("area code");
    tags.add("city pride");
  }

  const lookupKeys = [lowerBase];
  const withoutNum = lowerBase.replace(/\s+\d+$/, "");
  if (withoutNum !== lowerBase) lookupKeys.push(withoutNum);

  for (const key of lookupKeys) {
    const artistTags = ARTIST_TAG_MAP[key];
    if (artistTags) {
      for (const at of artistTags) tags.add(at);
      break;
    }
  }

  if (!tags.has("east coast") && !tags.has("west coast") && !tags.has("south") && !tags.has("midwest")) {
    for (const [, artistTags] of Object.entries(ARTIST_TAG_MAP)) {
      if (artistTags.includes(lowerBase)) {
        for (const at of artistTags) tags.add(at);
        break;
      }
    }
  }

  for (const color of colors) {
    tags.add(color.toLowerCase());
  }

  return Array.from(tags);
}

function getLowestRetailPrice(variants: PrintfulSyncVariant[]): number {
  const prices = variants
    .map(v => parseFloat(v.retail_price))
    .filter(p => !isNaN(p) && p > 0);
  return prices.length > 0 ? Math.min(...prices) : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "10");
      const waitTime = (retryAfter + 2) * 1000;
      console.log(`[Printful] Rate limited, waiting ${waitTime / 1000}s (attempt ${attempt + 1}/${retries + 1})`);
      await delay(waitTime);
      continue;
    }

    return res;
  }

  throw new Error("Exceeded max retries due to rate limiting");
}

export async function fetchColorImagesForProduct(printfulId: number): Promise<Record<string, string>> {
  const detail = await fetchProductDetail(printfulId);
  const colorImages: Record<string, string> = {};
  const productName = detail.sync_product.name;

  for (const v of detail.sync_variants) {
    let colorName: string | null = null;

    const parts = v.name.split(" / ");

    if (parts.length >= 3) {
      colorName = parts[parts.length - 2].trim();
    } else if (parts.length === 2) {
      const lastPart = parts[1].trim();
      if (!isSize(lastPart) && lastPart !== "Default Title") {
        colorName = lastPart;
      } else {
        const firstPart = parts[0].trim();
        if (firstPart !== productName && !isSize(firstPart) && firstPart !== "Default Title") {
          colorName = firstPart;
        }
      }
    }

    if (colorName && !colorImages[colorName]) {
      const preview = v.files?.find(f => f.type === "preview");
      if (preview?.preview_url) {
        colorImages[colorName] = preview.preview_url;
      } else if (v.product?.image) {
        colorImages[colorName] = v.product.image;
      }
    }
  }

  return colorImages;
}

export async function syncPrintfulProducts(): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    console.log("[Printful] Fetching product list...");
    const storeProducts = await fetchAllSyncProducts();
    console.log(`[Printful] Found ${storeProducts.length} products in store`);

    if (storeProducts.length === 0) {
      console.log("[Printful] No products found in Printful store");
      return { synced: 0, errors: [] };
    }

    const printfulIds: number[] = [];
    let synced = 0;

    for (let i = 0; i < storeProducts.length; i++) {
      const sp = storeProducts[i];
      try {
        if (i > 0 && i % 5 === 0) {
          await delay(600);
        }

        const detail = await fetchProductDetail(sp.id);
        const variants = detail.sync_variants;

        if (!variants || variants.length === 0) {
          errors.push(`Product "${sp.name}" has no variants, skipping`);
          continue;
        }

        const { sizes, colors, colorImages } = extractSizesAndColors(variants);
        const category = categorizeProduct(sp.name, variants);
        const imageUrl = getBestImageUrl(detail);
        const price = getLowestRetailPrice(variants);

        if (price === 0) {
          errors.push(`Product "${sp.name}" has no retail price, skipping`);
          continue;
        }

        const tags = generateTags(sp.name, category, colors);

        const productData: InsertProduct = {
          name: sp.name,
          description: `${sp.name} - Premium quality, made to order. Available in ${sizes.length} size${sizes.length > 1 ? "s" : ""} and ${colors.length} color${colors.length > 1 ? "s" : ""}.`,
          price,
          category,
          imageUrl,
          badge: null,
          isNewDrop: false,
          sizes,
          colors,
          colorImages: Object.keys(colorImages).length > 0 ? colorImages : null,
          printfulId: sp.id,
          tags,
        };

        await storage.upsertProductByPrintfulId(sp.id, productData);
        printfulIds.push(sp.id);
        synced++;

        if (synced % 50 === 0) {
          console.log(`[Printful] Progress: ${synced}/${storeProducts.length} products synced`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to sync "${sp.name}": ${msg}`);
        console.error(`[Printful] Error syncing "${sp.name}":`, msg);
      }
    }

    await storage.deleteProductsNotInPrintfulIds(printfulIds);
    console.log(`[Printful] Sync complete: ${synced} products synced`);

    return { synced, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Printful] Sync failed:", msg);
    return { synced: 0, errors: [msg] };
  }
}
