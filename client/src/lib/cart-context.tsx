import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { CartItemWithProduct, Product } from "@shared/schema";
import { apiRequest, queryClient } from "./queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";

function getSessionId(): string {
  let sid = localStorage.getItem("msd_session");
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem("msd_session", sid);
  }
  return sid;
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
  const sessionId = getSessionId();

  const { data: items = [], isLoading } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart", sessionId],
  });

  const addMutation = useMutation({
    mutationFn: async ({ productId, size, color }: { productId: number; size: string; color: string }) => {
      await apiRequest("POST", "/api/cart", { sessionId, productId, quantity: 1, size, color });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", sessionId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cart/${id}?sessionId=${encodeURIComponent(sessionId)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", sessionId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      await apiRequest("PATCH", `/api/cart/${id}`, { quantity, sessionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", sessionId] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/cart/session/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", sessionId] });
    },
  });

  const addToCart = useCallback((product: Product, size: string, color: string) => {
    addMutation.mutate({ productId: product.id, size, color });
  }, [addMutation]);

  const removeFromCart = useCallback((id: string) => {
    removeMutation.mutate(id);
  }, [removeMutation]);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      removeMutation.mutate(id);
    } else {
      updateMutation.mutate({ id, quantity });
    }
  }, [updateMutation, removeMutation]);

  const clearCart = useCallback(() => {
    clearMutation.mutate();
  }, [clearMutation]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      isLoading,
      totalItems,
      totalPrice,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      isAdding: addMutation.isPending,
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
