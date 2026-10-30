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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
