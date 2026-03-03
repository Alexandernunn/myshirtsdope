import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { CartItemWithProduct, Product, ShopifyVariantMapping } from "@shared/schema";

const CART_KEY = "msd_cart";

interface StoredCartItem {
  id: string;
  productId: number;
  size: string;
  color: string;
  quantity: number;
  productName: string;
  productPrice: number;
  productImageUrl: string;
  productColorImages: Record<string, string> | null;
  shopifyVariants: ShopifyVariantMapping[] | null;
}

function loadCart(): StoredCartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items: StoredCartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function toWithProduct(item: StoredCartItem): CartItemWithProduct {
  return {
    id: item.id,
    sessionId: "",
    productId: item.productId,
    size: item.size,
    color: item.color,
    quantity: item.quantity,
    product: {
      id: item.productId,
      shopifyProductId: null,
      name: item.productName,
      price: item.productPrice,
      imageUrl: item.productImageUrl,
      colorImages: item.productColorImages,
      shopifyVariants: item.shopifyVariants,
      description: "",
      category: "",
      badge: null,
      isNewDrop: null,
      sizes: [],
      colors: [],
      tags: null,
    },
  };
}

interface CartContextType {
  items: CartItemWithProduct[];
  isLoading: boolean;
  totalItems: number;
  totalPrice: number;
  addToCart: (product: Product, size: string, color: string) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  isAdding: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredCartItem[]>(() => loadCart());
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    saveCart(stored);
  }, [stored]);

  const items = stored.map(toWithProduct);

  const addToCart = useCallback((product: Product, size: string, color: string) => {
    setIsAdding(true);
    setStored((prev) => {
      const existing = prev.find(
        (i) => i.productId === product.id && i.size === size && i.color === color
      );
      if (existing) {
        const updated = prev.map((i) =>
          i === existing ? { ...i, quantity: i.quantity + 1 } : i
        );
        return updated;
      }
      const newItem: StoredCartItem = {
        id: `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        productId: product.id,
        size,
        color,
        quantity: 1,
        productName: product.name,
        productPrice: product.price,
        productImageUrl: product.imageUrl,
        productColorImages: product.colorImages,
        shopifyVariants: product.shopifyVariants,
      };
      return [...prev, newItem];
    });
    setTimeout(() => setIsAdding(false), 300);
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setStored((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setStored((prev) => prev.filter((i) => i.id !== id));
    } else {
      setStored((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setStored([]);
  }, []);

  const totalItems = stored.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = stored.reduce((sum, i) => sum + i.productPrice * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      isLoading: false,
      totalItems,
      totalPrice,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      isAdding,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
