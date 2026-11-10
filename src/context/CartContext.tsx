import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface CartItem {
  id: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  color?: string;
  storage?: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: Partial<CartItem>) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_STORAGE_KEY = "@ilume_cart_v2";

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

  function addToCart(newItem: Partial<CartItem>) {
    setCart((prevCart) => {
      // Garante valores padrão para evitar undefined
      const id = newItem.id || newItem.variantId || Math.random().toString();
      const name = newItem.name || "Produto ILUME";
      
      // Converte preço de centavos para reais se necessário
      let price = newItem.price;
      if (!price && (newItem as any).price_cents) {
        price = (newItem as any).price_cents / 100;
      }
      price = price || 0;

      const quantity = newItem.quantity || 1;

      const existingIndex = prevCart.findIndex((item) => item.id === id);

      if (existingIndex > -1) {
        const updated = [...prevCart];
        updated[existingIndex].quantity += quantity;
        return updated;
      }

      return [
        ...prevCart,
        {
          id,
          variantId: newItem.variantId || id,
          name,
          price,
          quantity,
          image: newItem.image || "",
          color: newItem.color || "Padrão",
          storage: newItem.storage || 128,
        },
      ];
    });
  }

  function removeFromCart(id: string) {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  }

  function clearCart() {
    setCart([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {}
  }

  const total = cart.reduce((acc, item) => acc + (item.price || 0) * (item.quantity || 1), 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart deve ser usado dentro de um CartProvider");
  }
  return context;
}