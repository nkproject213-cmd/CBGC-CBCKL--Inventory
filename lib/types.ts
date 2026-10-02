export type Organization = "CBGC" | "CBCKL";

export type InventoryItem = {
  id: string;
  public_id: string;
  organization: Organization;
  manager_main: string | null;
  manager_sub: string | null;
  management_no: string;
  item_type: string;
  acquired_date: string | null;
  item_name: string;
  purchase_price: number | null;
  useful_life_years: number | null;
  storage_location: string | null;
  accessories: string | null;
  specification: string | null;
  classification_no: string | null;
  identification_no: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicInventoryItem = Pick<
  InventoryItem,
  | "public_id"
  | "organization"
  | "manager_main"
  | "manager_sub"
  | "management_no"
  | "acquired_date"
  | "item_name"
  | "storage_location"
  | "specification"
  | "photo_url"
>;
