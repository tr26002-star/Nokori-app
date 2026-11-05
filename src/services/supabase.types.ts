export type ProductRow = {
  id: string;
  seller_id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  quantity: number;
  pickup_start: string;
  pickup_end: string;
  seller_name: string;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type ReservationRow = {
  id: string;
  ticket_code: string;
  seller_id: string;
  product_id: string;
  product_name: string;
  customer_name: string;
  customer_phone: string;
  packs: number;
  total_price: number;
  pickup_start: string;
  pickup_end: string;
  status: 'pending' | 'delivered' | 'cancelled';
  created_at: string;
};

export type ReservationBookingRow = ReservationRow & {
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
  customer_name: string;
  packs: number;
  total_price: number;
  pickup_start: string;
  pickup_end: string;
  status: 'pending' | 'delivered' | 'cancelled';
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      products: {
        Row: ProductRow;
        Insert: Omit<ProductRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ProductRow, 'id' | 'seller_id'>>;
        Relationships: [];
      };
      reservations: {
        Row: ReservationRow;
        Insert: Omit<ReservationRow, 'id' | 'created_at' | 'ticket_code'> & {
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
          p_customer_phone: string;
          p_packs: number;
        };
        Returns: ReservationBookingRow[];
      };
      get_client_reservations: {
        Args: {
          p_ticket_codes?: string[];
          p_customer_phone?: string;
        };
        Returns: ClientReservationRow[];
      };
      cancel_reservation: {
        Args: {
          p_reservation_id: string;
          p_ticket_code: string;
        };
        Returns: boolean;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
