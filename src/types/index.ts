export type AppRole = 'client' | 'merchant' | 'courier' | 'service_provider' | 'admin';

export interface Profile {
  id: string;
  role: AppRole;
  full_name: string;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  is_available?: boolean;
  delivery_zone?: string | null;
  preferred_delivery_zone?: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
  sort_order?: number;
  description: string | null;
}

export interface Product {
  id: string;
  shop_id: string;
  category_id: string | null;
  name: string;
  description: string;
  price_xof: number;
  stock_quantity: number;
  image_url: string | null;
  status: 'pending_review' | 'active' | 'rejected' | 'archived';
  condition?: 'new' | 'used' | 'refurbished' | null;
  sale_mode?: 'retail' | 'wholesale' | 'made_to_order' | null;
  minimum_order_quantity?: number | null;
  lead_time_days?: number | null;
  created_at: string;
  shops?: Pick<Shop, 'id' | 'name' | 'city' | 'logo_url'> | null;
  categories?: Pick<Category, 'name' | 'slug'> | null;
}

/** Projection privée du coût d’achat jointe uniquement dans l’espace commerçant. */
export interface MerchantProduct extends Product {
  purchase_cost_xof: number | null;
}

export interface Shop {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  city: string;
  logo_url: string | null;
  cover_url: string | null;
  status: 'pending_review' | 'active' | 'suspended' | 'rejected';
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  shop_id: string;
  status: 'pending' | 'accepted' | 'preparing' | 'ready_for_delivery' | 'in_delivery' | 'delivered' | 'cancelled' | 'delivery_cancelled';
  payment_status: 'unpaid' | 'pending' | 'paid' | 'refunded';
  subtotal_xof: number;
  total_xof: number;
  delivery_address: Record<string, unknown>;
  created_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  courier_id: string | null;
  status: 'pending' | 'accepted' | 'in_progress' | 'delivered' | 'cancelled';
  pickup_zone: string | null;
  dropoff_zone: string | null;
  fee_xof: number | null;
  created_at: string;
}

export interface Plan {
  id: string;
  audience: 'merchant' | 'courier';
  code: string;
  name: string;
  price_xof: number;
  billing_interval: 'month' | 'year' | 'none';
  product_limit: number | null;
  features: string[];
}

export type BusinessPeriod = 'day' | 'week' | 'month';

export interface BusinessOrder {
  id: string;
  customer_id: string;
  shop_id: string;
  status: Order['status'];
  payment_status: Order['payment_status'];
  subtotal_xof: number;
  total_xof: number;
  created_at: string;
}

export interface BusinessOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_xof: number;
  purchase_cost_snapshot_xof: number | null;
  quantity: number;
  line_total_xof: number;
}

export interface BusinessExpense {
  id: string;
  shop_id: string;
  title: string;
  category: string;
  amount_xof: number;
  spent_at: string;
  created_at: string;
}

export interface StockMovement {
  id: string;
  shop_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  order_id: string | null;
  movement_type: 'order_sale' | 'order_return' | 'adjustment';
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  created_at: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface ServiceProviderProfile {
  user_id: string;
  display_name: string;
  bio: string;
  city: string;
  service_area: string[];
  public_contact_phone: string | null;
  review_status: 'pending_review' | 'active' | 'suspended' | 'rejected';
}

export interface ServiceListing {
  id: string;
  provider_id: string;
  category_id: string | null;
  title: string;
  description: string;
  city: string;
  service_area: string[];
  price_min_xof: number | null;
  price_max_xof: number | null;
  price_unit: string | null;
  image_urls: string[];
  status: 'pending_review' | 'active' | 'rejected' | 'archived';
  created_at: string;
  service_categories?: Pick<ServiceCategory, 'name' | 'slug'> | null;
  service_provider_profiles?: Pick<ServiceProviderProfile, 'user_id' | 'display_name' | 'city' | 'bio' | 'service_area' | 'public_contact_phone' | 'review_status'> | null;
}

export interface ServiceRequest {
  id: string;
  service_id: string;
  client_id: string;
  provider_id: string;
  message: string;
  requested_at: string | null;
  requested_location: string | null;
  status: 'requested' | 'quoted' | 'accepted' | 'completed' | 'cancelled' | 'declined';
  quoted_price_xof: number | null;
  quote_message: string | null;
  agreed_at: string | null;
  agreed_location: string | null;
  completed_at: string | null;
  created_at: string;
}
