import type { BrandDefinition } from "./types";

const brands: Record<string, Omit<BrandDefinition, "name">> = {
  Coolblue: { shortMark: "cb", url: "https://www.coolblue.nl", color: "#1673d1", tint: "#e9f3ff" },
  MediaMarkt: { shortMark: "M", url: "https://www.mediamarkt.nl", color: "#df0000", tint: "#fff0f0" },
  "EP.nl": { shortMark: "ep", url: "https://www.ep.nl", color: "#ee2f33", tint: "#fff0f1" },
  "Electro World": { shortMark: "EW", url: "https://www.electroworld.nl", color: "#ef3125", tint: "#fff1ef" },
  Wehkamp: { shortMark: "w", url: "https://www.wehkamp.nl", color: "#3c1d63", tint: "#f3edfa" },
  Lidl: { shortMark: "L", url: "https://www.lidl.nl", color: "#0050aa", tint: "#eaf2ff" },
  GAMMA: { shortMark: "G", url: "https://www.gamma.nl", color: "#e9500e", tint: "#fff0e8" },
  KARWEI: { shortMark: "K", url: "https://www.karwei.nl", color: "#1f1f1f", tint: "#f0f0ed" },
  Praxis: { shortMark: "P", url: "https://www.praxis.nl", color: "#e31b23", tint: "#fff0f0" },
  "Alternate.nl": { shortMark: "A", url: "https://www.alternate.nl", color: "#e3001b", tint: "#fff0f2" },
  Trotec: { shortMark: "T", url: "https://nl.trotec.com", color: "#df1724", tint: "#fff0f1" },
  Klarstein: { shortMark: "K", url: "https://www.klarstein.nl", color: "#171717", tint: "#f1f1ef" },
  FlinQ: { shortMark: "FQ", url: "https://www.flinqproducts.nl", color: "#141414", tint: "#f1f1ef" },
  "Action Webshop": { shortMark: "A", url: "https://shop.action.com/nl-nl", color: "#0062aa", tint: "#e9f4fb" },
  "Expert.nl": { shortMark: "E", url: "https://www.expert.nl", color: "#e3000f", tint: "#fff0f1" },
  "De'Longhi NL": { shortMark: "DL", url: "https://www.delonghi.com/nl-nl", color: "#0b3b73", tint: "#eaf0f7" },
  Obelink: { shortMark: "O", url: "https://www.obelink.nl", color: "#ed6f00", tint: "#fff2e7" },
  Kampeerwereld: { shortMark: "KW", url: "https://www.kampeerwereld.nl", color: "#217241", tint: "#eaf5ee" },
  "Create NL": { shortMark: "C", url: "https://www.create-store.com/nl", color: "#c05548", tint: "#f9ece9" },
  "Costway NL": { shortMark: "C", url: "https://nl.costway.com", color: "#1769aa", tint: "#eaf3fa" },
  Evolarshop: { shortMark: "E", url: "https://www.evolarshop.nl", color: "#0495a6", tint: "#e8f6f7" },
  "Airco voor in huis": { shortMark: "Ai", url: "https://www.aircovoorinhuis.nl", color: "#2472a4", tint: "#e9f3f9" },
  Solago: { shortMark: "S", url: "https://solago.nl", color: "#ec762c", tint: "#fff1e8" },
  Hubo: { shortMark: "H", url: "https://www.hubo.nl", color: "#e46215", tint: "#fff1e8" },
  Vrijbuiter: { shortMark: "V", url: "https://www.vrijbuiter.nl", color: "#e64d24", tint: "#fff0ec" },
  Klimaatshop: { shortMark: "KS", url: "https://www.klimaatshop.nl", color: "#00779c", tint: "#e7f4f8" },
  "Airco-Webwinkel": { shortMark: "AW", url: "https://www.airco-webwinkel.nl", color: "#2b74a8", tint: "#eaf3f9" },
};

export function getBrand(name: string): BrandDefinition {
  const brand = brands[name];
  if (brand) return { name, ...brand };
  return {
    name,
    shortMark: name.slice(0, 2).toUpperCase(),
    url: "#",
    color: "#35524a",
    tint: "#edf2ef",
  };
}
