// Catalog + settings derived from the Aquila's Daddies business workbook
// (Settings sheet: Selling Price 1500, Profit Per Packet 500, Low Stock Alert 20)

export const SETTINGS = {
  currency: "UGX",
  sellingPrice: 1500,
  profitPerPacket: 500,
  lowStockAlert: 20,
  defaultCreditLimit: 6000,
  taxRate: 0, // sales in the workbook are recorded tax-inclusive
};

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  packets: number;
  sku: string;
};

export const SEED_PRODUCTS: Product[] = [
  {
    id: "p-salted",
    name: "Daddies Salted Popcorn",
    category: "Packets",
    price: 1500,
    cost: 1000,
    stock: 148,
    packets: 1,
    sku: "DP-SALT-01",
  },
  {
    id: "p-caramel",
    name: "Daddies Caramel Popcorn",
    category: "Packets",
    price: 1500,
    cost: 1000,
    stock: 96,
    packets: 1,
    sku: "DP-CARA-01",
  },
  {
    id: "p-cheese",
    name: "Daddies Cheese Popcorn",
    category: "Packets",
    price: 1500,
    cost: 1000,
    stock: 42,
    packets: 1,
    sku: "DP-CHEE-01",
  },
  {
    id: "p-chilli",
    name: "Daddies Chilli Popcorn",
    category: "Packets",
    price: 1500,
    cost: 1000,
    stock: 14,
    packets: 1,
    sku: "DP-CHIL-01",
  },
  {
    id: "p-family",
    name: "Family Bundle (5 packets)",
    category: "Bundles",
    price: 7000,
    cost: 5000,
    stock: 26,
    packets: 5,
    sku: "DP-BND-05",
  },
  {
    id: "p-crate",
    name: "Party Crate (10 packets)",
    category: "Bundles",
    price: 13500,
    cost: 10000,
    stock: 11,
    packets: 10,
    sku: "DP-BND-10",
  },
  {
    id: "p-school",
    name: "School Pack (3 packets)",
    category: "Bundles",
    price: 4300,
    cost: 3000,
    stock: 33,
    packets: 3,
    sku: "DP-BND-03",
  },
  {
    id: "p-jumbo",
    name: "Jumbo Reseller Sack (24)",
    category: "Wholesale",
    price: 31000,
    cost: 24000,
    stock: 6,
    packets: 24,
    sku: "DP-WHL-24",
  },
];

export const SELLERS = ["Aquila", "Jeremy"] as const;

export function formatMoney(value: number) {
  return `${SETTINGS.currency} ${Math.round(value).toLocaleString("en-UG")}`;
}
