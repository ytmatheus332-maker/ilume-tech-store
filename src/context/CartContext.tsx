
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface CartProduct {
  id: number;
  slug: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

interface CartContextData {
  items: CartProduct[];
  totalItems: number;
  subtotal: number;
  addToCart: (product: Omit<CartProduct, "quantity">, quantity?: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextData | undefined>(undefined);

const STORAGE_KEY = "ilume-cart";

function loadCart(): CartProduct[] {
  try {
    const savedCart = localStorage.getItem(STORAGE_KEY);

    if (!savedCart) return [];

    const parsedCart: unknown = JSON.parse(savedCart);

    if (!Array.isArray(parsedCart)) return [];

    return parsedCart.filter(
      (item): item is CartProduct =>
        typeof item.id === "number" &&
        typeof item.slug === "string" &&
        typeof item.name === "string" &&
        typeof item.price === "number" &&
        Number.isFinite(item.price) &&
        typeof item.image === "string" &&
        typeof item.quantity === "number" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
    );
  } catch {
    return [];
  }
}

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [items, setItems] = useState<CartProduct[]>(loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addToCart(
    product: Omit<CartProduct, "quantity">,
    quantity = 1
  ) {
    const safeQuantity = Math.max(1, Math.floor(quantity));

    setItems((currentItems) => {
      const existingProduct = currentItems.find(
        (item) => item.id === product.id
      );

      if (existingProduct) {
        return currentItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + safeQuantity }
            : item
        );
      }

      return [
        ...currentItems,
        { ...product, quantity: safeQuantity },
      ];
    });
  }

  function updateQuantity(id: number, quantity: number) {
    const safeQuantity = Math.floor(quantity);

    if (safeQuantity <= 0) {
      removeFromCart(id);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id
          ? { ...item, quantity: safeQuantity }
          : item
      )
    );
  }

  function removeFromCart(id: number) {
    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== id)
    );
  }

  function clearCart() {
    setItems([]);
  }

  const totalItems = items.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const subtotal = items.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        subtotal,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
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
      "useCart precisa ser utilizado dentro de CartProvider."
    );
  }

  return context;
}
