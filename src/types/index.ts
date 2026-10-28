export type AppRole = 'client' | 'merchant' | 'courier' | 'admin';

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
  created_at: string;
  shops?: Pick<Shop, 'id' | 'name' | 'city' | 'logo_url'> | null;
  categories?: Pick<Category, 'name' | 'slug'> | null;
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
