export type ProductRow = {
  id: string;
  seller_id: string;
  business_id: string | null;
  name: string;
  description: string;
  category: string;
  price: number;
  normal_price: number | null;
  quantity: number;
  pickup_start: string;
  pickup_end: string;
  seller_name: string;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type NearbyProductRow = Omit<ProductRow, 'normal_price'> & {
  business_name: string;
  business_address: string;
  business_latitude: number;
  business_longitude: number;
  business_avatar_url: string | null;
  distance_km: number;
};

export type ClientProductRow = Omit<NearbyProductRow, 'distance_km'> & {
  business_photo_url: string | null;
};

export type ReservationRow = {
  id: string;
  ticket_code: string;
  seller_id: string;
  customer_id: string | null;
  product_id: string;
  product_name: string;
  customer_name: string;
  customer_phone: string;
  packs: number;
  total_price: number;
  commission_amount: number;
  total_paid: number;
  payment_status: 'pagada_simulada' | 'historica' | 'pagada' | 'pendiente' | 'fallida' | 'reembolsada';
  payment_provider: 'wompi_simulado' | 'historico' | 'wompi';
  pickup_start: string;
  pickup_end: string;
  status: 'pending' | 'delivered' | 'cancelled' | 'not_collected';
  created_at: string;
};

export type ReservationBookingRow = Omit<ReservationRow, 'customer_id'> & {
  remaining_quantity: number;
};

export type ClientReservationRow = {
  id: string;
  ticket_code: string;
  seller_id: string;
  seller_name: string;
  product_id: string;
  product_name: string;
  product_category: string;
  product_description: string;
  product_image_url: string | null;
  seller_address: string | null;
  seller_latitude: number | null;
  seller_longitude: number | null;
  customer_name: string;
  packs: number;
  total_price: number;
  pickup_start: string;
  pickup_end: string;
  status: 'pending' | 'delivered' | 'cancelled' | 'not_collected';
  created_at: string;
};

export type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  photo_url: string | null;
  is_approved: boolean;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

export type BusinessRequestRow = {
  id: string;
  user_id: string;
  manager_name: string;
  business_name: string;
  business_email: string;
  business_phone: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  photo_url: string;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type ProfileRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: BusinessRow;
        Insert: Omit<BusinessRow, 'id' | 'created_at' | 'address' | 'latitude' | 'longitude' | 'avatar_url' | 'phone' | 'email' | 'description' | 'photo_url' | 'is_approved'> & {
          id?: string;
          created_at?: string;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          avatar_url?: string | null;
          phone?: string | null;
          email?: string | null;
          description?: string | null;
          photo_url?: string | null;
          is_approved?: boolean;
        };
        Update: Partial<Pick<BusinessRow, 'name' | 'status' | 'address' | 'latitude' | 'longitude' | 'avatar_url' | 'phone' | 'email' | 'description' | 'photo_url' | 'is_approved'>>;
        Relationships: [];
      };
      business_requests: {
        Row: BusinessRequestRow;
        Insert: Omit<BusinessRequestRow, 'id' | 'created_at' | 'reviewed_at' | 'rejection_reason' | 'status'> & {
          id?: string;
          created_at?: string;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          status?: BusinessRequestRow['status'];
        };
        Update: Partial<Pick<BusinessRequestRow, 'status' | 'rejection_reason' | 'reviewed_at'>>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Pick<ProfileRow, 'full_name' | 'avatar_url' | 'updated_at'>>;
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: Omit<ProductRow, 'id' | 'created_at' | 'normal_price'> & {
          id?: string;
          created_at?: string;
          normal_price?: number | null;
        };
        Update: Partial<Omit<ProductRow, 'id' | 'seller_id'>>;
        Relationships: [];
      };
      reservations: {
        Row: ReservationRow;
        Insert: Omit<ReservationRow, 'id' | 'created_at' | 'ticket_code' | 'customer_id'> & {
          id?: string;
          created_at?: string;
          ticket_code?: string;
        };
        Update: Partial<Pick<ReservationRow, 'status'>>;
        Relationships: [];
      };
    };
    Functions: {
      reserve_product: {
        Args: {
          p_product_id: string;
          p_customer_name: string;
          p_packs: number;
          p_customer_phone: string;
        };
        Returns: ReservationBookingRow[];
      };
      quote_client_price: {
        Args: { p_rescue_price: number; p_normal_price: number | null };
        Returns: { client_price: number; discount_percent: number; saved_amount: number }[];
      };
      get_reservation_quote: {
        Args: { p_product_id: string; p_packs: number };
        Returns: { unit_price: number; total_paid: number }[];
      };
      get_client_product: {
        Args: { p_product_id: string };
        Returns: ClientProductRow[];
      };
      get_client_reservations: {
        Args: Record<string, never>;
        Returns: ClientReservationRow[];
      };
      get_nearby_products: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_km?: number;
        };
        Returns: NearbyProductRow[];
      };
      cancel_reservation: {
        Args: {
          p_reservation_id: string;
          p_ticket_code: string;
        };
        Returns: boolean;
      };
      mark_reservation_not_collected: {
        Args: { p_reservation_id: string };
        Returns: boolean;
      };
      mark_reservation_delivered: {
        Args: { p_reservation_id: string };
        Returns: boolean;
      };
      get_seller_reservations: {
        Args: Record<string, never>;
        Returns: ReservationRow[];
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
