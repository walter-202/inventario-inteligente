export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      inventarios: {
        Row: {
          cantidad: number
          created_at: string
          id: number
          producto_id: number
          sucursal_id: number
          updated_at: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: never
          producto_id: number
          sucursal_id: number
          updated_at?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: never
          producto_id?: number
          sucursal_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventarios_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          cantidad: number
          created_at: string
          id: number
          observacion: string | null
          producto_id: number
          sucursal_destino_id: number | null
          sucursal_id: number
          tipo: string
          updated_at: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: never
          observacion?: string | null
          producto_id: number
          sucursal_destino_id?: number | null
          sucursal_id: number
          tipo: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: never
          observacion?: string | null
          producto_id?: number
          sucursal_destino_id?: number | null
          sucursal_id?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sucursal_destino_id_fkey"
            columns: ["sucursal_destino_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string | null
          rol: string
          sucursal_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nombre?: string | null
          rol?: string
          sucursal_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string | null
          rol?: string
          sucursal_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          cantidad: number
          categoria: string
          codigo: string
          created_at: string
          id: number
          nombre: string
          precio: number
          updated_at: string
        }
        Insert: {
          cantidad?: number
          categoria: string
          codigo: string
          created_at?: string
          id?: never
          nombre: string
          precio: number
          updated_at?: string
        }
        Update: {
          cantidad?: number
          categoria?: string
          codigo?: string
          created_at?: string
          id?: never
          nombre?: string
          precio?: number
          updated_at?: string
        }
        Relationships: []
      }
      sucursales: {
        Row: {
          ciudad: string
          created_at: string
          direccion: string
          id: number
          nombre: string
          updated_at: string
        }
        Insert: {
          ciudad: string
          created_at?: string
          direccion: string
          id?: never
          nombre: string
          updated_at?: string
        }
        Update: {
          ciudad?: string
          created_at?: string
          direccion?: string
          id?: never
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      ventas: {
        Row: {
          created_at: string
          fecha: string
          id: number
          metodo_pago: string
          sucursal_id: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: never
          metodo_pago: string
          sucursal_id: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: never
          metodo_pago?: string
          sucursal_id?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_detalles: {
        Row: {
          cantidad: number
          created_at: string
          id: number
          precio: number
          producto_id: number
          updated_at: string
          venta_id: number
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: never
          precio: number
          producto_id: number
          updated_at?: string
          venta_id: number
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: never
          precio?: number
          producto_id?: number
          updated_at?: string
          venta_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_detalles_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      registrar_movimiento_entrada: {
        Args: {
          p_cantidad: number
          p_observacion?: string
          p_producto_id: number
          p_sucursal_id: number
        }
        Returns: Json
      }
      registrar_movimiento_salida: {
        Args: {
          p_cantidad: number
          p_observacion?: string
          p_producto_id: number
          p_sucursal_id: number
        }
        Returns: Json
      }
      registrar_movimiento_transferencia: {
        Args: {
          p_cantidad: number
          p_observacion?: string
          p_producto_id: number
          p_sucursal_destino_id: number
          p_sucursal_origen_id: number
        }
        Returns: Json
      }
      registrar_producto_con_stock: {
        Args: {
          p_cantidad: number
          p_categoria: string
          p_codigo: string
          p_nombre: string
          p_precio: number
          p_sucursal_id: number
        }
        Returns: Json
      }
      registrar_venta: {
        Args: {
          p_fecha?: string
          p_metodo_pago: string
          p_productos: Json
          p_sucursal_id: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
