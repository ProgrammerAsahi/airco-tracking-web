import type { BrandDefinition } from "./types";

const brands: Record<string, Omit<BrandDefinition, "name">> = {
  Coolblue: { shortMark: "cb", url: "https://www.coolblue.nl", themeClass: "brand-theme--coolblue" },
  MediaMarkt: { shortMark: "M", url: "https://www.mediamarkt.nl", themeClass: "brand-theme--mediamarkt" },
  "EP.nl": { shortMark: "ep", url: "https://www.ep.nl", themeClass: "brand-theme--ep" },
  "Electro World": { shortMark: "EW", url: "https://www.electroworld.nl", themeClass: "brand-theme--electroworld" },
  Wehkamp: { shortMark: "w", url: "https://www.wehkamp.nl", themeClass: "brand-theme--wehkamp" },
  Lidl: { shortMark: "L", url: "https://www.lidl.nl", themeClass: "brand-theme--lidl" },
  GAMMA: { shortMark: "G", url: "https://www.gamma.nl", themeClass: "brand-theme--gamma" },
  KARWEI: { shortMark: "K", url: "https://www.karwei.nl", themeClass: "brand-theme--karwei" },
  Praxis: { shortMark: "P", url: "https://www.praxis.nl", themeClass: "brand-theme--praxis" },
  "Alternate.nl": { shortMark: "A", url: "https://www.alternate.nl", themeClass: "brand-theme--alternate" },
  Trotec: { shortMark: "T", url: "https://nl.trotec.com", themeClass: "brand-theme--trotec" },
  "Trotec France": { shortMark: "T", url: "https://fr.trotec.com", themeClass: "brand-theme--trotec" },
  Klarstein: { shortMark: "K", url: "https://www.klarstein.nl", themeClass: "brand-theme--klarstein" },
  FlinQ: { shortMark: "FQ", url: "https://www.flinqproducts.nl", themeClass: "brand-theme--flinq" },
  "Action Webshop": { shortMark: "A", url: "https://shop.action.com/nl-nl", themeClass: "brand-theme--action" },
  "Expert.nl": { shortMark: "E", url: "https://www.expert.nl", themeClass: "brand-theme--expert" },
  "De'Longhi NL": { shortMark: "DL", url: "https://www.delonghi.com/nl-nl", themeClass: "brand-theme--delonghi" },
  Obelink: { shortMark: "O", url: "https://www.obelink.nl", themeClass: "brand-theme--obelink" },
  Kampeerwereld: { shortMark: "KW", url: "https://www.kampeerwereld.nl", themeClass: "brand-theme--kampeerwereld" },
  "Create NL": { shortMark: "C", url: "https://www.create-store.com/nl", themeClass: "brand-theme--create" },
  "Costway NL": { shortMark: "C", url: "https://nl.costway.com", themeClass: "brand-theme--costway" },
  Evolarshop: { shortMark: "E", url: "https://www.evolarshop.nl", themeClass: "brand-theme--evolarshop" },
  "Airco voor in huis": { shortMark: "Ai", url: "https://www.aircovoorinhuis.nl", themeClass: "brand-theme--aircovoorinhuis" },
  Solago: { shortMark: "S", url: "https://solago.nl", themeClass: "brand-theme--solago" },
  Hubo: { shortMark: "H", url: "https://www.hubo.nl", themeClass: "brand-theme--hubo" },
  Vrijbuiter: { shortMark: "V", url: "https://www.vrijbuiter.nl", themeClass: "brand-theme--vrijbuiter" },
  Klimaatshop: { shortMark: "KS", url: "https://www.klimaatshop.nl", themeClass: "brand-theme--klimaatshop" },
  "Airco-Webwinkel": { shortMark: "AW", url: "https://www.airco-webwinkel.nl", themeClass: "brand-theme--aircowebwinkel" },
  Bostools: { shortMark: "B", url: "https://www.bostools.nl", themeClass: "brand-theme--bostools" },
};

export function getBrand(name: string): BrandDefinition {
  const brand = brands[name];
  if (brand) return { name, ...brand };
  return {
    name,
    shortMark: name.slice(0, 2).toUpperCase(),
    url: "#",
    themeClass: "brand-theme--default",
  };
}
