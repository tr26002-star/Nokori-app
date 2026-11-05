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
  status: 'pending' | 'delivered';
  created_at: string;
};

export type ReservationBookingRow = ReservationRow & {
  remaining_quantity: number;
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
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
