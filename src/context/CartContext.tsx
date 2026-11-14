
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

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

interface CartItemInput extends Partial<CartItem> {
  price_cents?: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItemInput) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "@ilume_cart_v2";
const MAX_QUANTITY = 10;

function normalizeCartItem(item: any): CartItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const variantId = String(item.variantId || item.id || "").trim();

  if (!variantId) {
    return null;
  }

  const rawPrice =
    item.price !== undefined && item.price !== null
      ? Number(item.price)
      : Number(item.price_cents) / 100;

  const price = Number.isFinite(rawPrice) && rawPrice >= 0
    ? rawPrice
    : 0;

  const rawQuantity = Number(item.quantity);
  const quantity = Number.isInteger(rawQuantity)
    ? Math.min(MAX_QUANTITY, Math.max(1, rawQuantity))
    : 1;

  const rawStorage = Number(item.storage);

  return {
    id: variantId,
    variantId,
    name: String(item.name || "Produto ILUME"),
    price,
    quantity,
    image: String(item.image || ""),
    color: String(item.color || "Padrão"),
    storage:
      Number.isInteger(rawStorage) && rawStorage > 0
        ? rawStorage
        : 128,
  };
}

function loadCart(): CartItem[] {
  try {
    if (typeof window === "undefined") {
      return [];
    }

    const saved = localStorage.getItem(CART_STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedItems = parsed
      .map(normalizeCartItem)
      .filter((item): item is CartItem => item !== null);

    // Consolida variantes repetidas de carrinhos antigos.
    const consolidated = new Map<string, CartItem>();

    for (const item of normalizedItems) {
      const existing = consolidated.get(item.variantId!);

      if (existing) {
        existing.quantity = Math.min(
          MAX_QUANTITY,
          existing.quantity + item.quantity
        );
      } else {
        consolidated.set(item.variantId!, { ...item });
      }
    }

    return Array.from(consolidated.values());
  } catch (error) {
    console.error("ILUME: Erro ao recuperar o carrinho.", error);
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.error("ILUME: Erro ao salvar o carrinho.", error);
    }
  }, [cart]);

  function addToCart(newItem: CartItemInput) {
    const normalizedItem = normalizeCartItem({
      ...newItem,
      id: newItem.variantId || newItem.id,
    });

    if (!normalizedItem) {
      console.error("ILUME: Não foi possível identificar a variante.");
      return;
    }

    setCart((previousCart) => {
      const existingIndex = previousCart.findIndex(
        (item) => item.variantId === normalizedItem.variantId
      );

      if (existingIndex >= 0) {
        return previousCart.map((item, index) => {
          if (index !== existingIndex) {
            return item;
          }

          return {
            ...item,
            quantity: Math.min(
              MAX_QUANTITY,
              item.quantity + normalizedItem.quantity
            ),
          };
        });
      }

      return [...previousCart, normalizedItem];
    });
  }

  function removeFromCart(id: string) {
    setCart((previousCart) =>
      previousCart.filter(
        (item) => item.id !== id && item.variantId !== id
      )
    );
  }

  function clearCart() {
    setCart([]);

    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch (error) {
      console.error("ILUME: Erro ao limpar o carrinho.", error);
    }
  }

  const total = cart.reduce(
    (accumulator, item) =>
      accumulator + item.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        clearCart,
        total,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error(
      "useCart deve ser usado dentro de um CartProvider"
    );
  }

  return context;
}
