/** Official MoPH WebMarketed / registered-drugs Excel columns (Lebanon). */
export const MOPH_COLUMN_SPECS = {
  moph_code: {
    excel: "Code",
    labelEn: "MoPH code (رقم الوزارة)",
    labelAr: "رقم الوزارة",
    description: "Ministry of Public Health product code, e.g. 5143 for ACC LONG",
  },
  moph_registration: {
    excel: "Registration number",
    labelEn: "Registration number",
    labelAr: "رقم التسجيل",
  },
  brand_name: {
    excel: "Brand name",
    labelEn: "Brand name",
    labelAr: "الاسم التجاري",
  },
  strength: {
    excel: "Strength",
    labelEn: "Strength",
    labelAr: "التركيز",
  },
  presentation: {
    excel: "Presentation",
    labelEn: "Presentation",
    labelAr: "العرض",
  },
  dosage_form: {
    excel: "Form",
    labelEn: "Form",
    labelAr: "الشكل الصيدلاني",
  },
  agent: {
    excel: "Agent",
    labelEn: "Agent",
    labelAr: "الوكيل",
  },
  manufacturer: {
    excel: "Manufacturer",
    labelEn: "Manufacturer",
    labelAr: "الشركة المصنعة",
  },
  country_of_origin: {
    excel: "Country",
    labelEn: "Country",
    labelAr: "بلد المنشأ",
  },
  official_price_lbp: {
    excel: "Public Price LL",
    labelEn: "Public price (LBP)",
    labelAr: "السعر الرسمي ل.ل",
  },
  pharmacist_margin: {
    excel: "Pharmacist Margin",
    labelEn: "Pharmacist margin",
  },
  stratum: {
    excel: "Stratum",
    labelEn: "Stratum",
  },
} as const;

export type MophListKind = "web_marketed" | "web_non_marketed" | "primary_registered" | "unknown";

export type MophDataSources = {
  listPageUrl: string;
  marketedUrl: string | null;
  nonMarketedUrl: string | null;
  primaryRegisteredUrl: string | null;
  /** @deprecated use marketedUrl */
  priceListUrl: string | null;
  /** @deprecated use primaryRegisteredUrl */
  catalogListUrl: string | null;
  discovered: { url: string; kind: MophListKind; label: string }[];
};

export const MOPH_FILE_ROLES = {
  web_marketed: {
    role: "Prices + coded catalog",
    description: "Drugs with public prices (marketed). Use for price sync when MoPH publishes updates.",
  },
  web_non_marketed: {
    role: "Coded catalog (non-marketed)",
    description: "Registered codes without marketed public price column. Catalog identity only.",
  },
  primary_registered: {
    role: "Primary registration catalog",
    description: "Primary registered products (~200+). Often no MoPH Code column — matched by name/form.",
  },
} as const;
