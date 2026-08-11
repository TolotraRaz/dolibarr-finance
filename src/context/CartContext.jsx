import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const stored = sessionStorage.getItem('cart_items');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    sessionStorage.setItem('cart_items', JSON.stringify(items));
  }, [items]);

  const addItem = (product, quantite) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantite: i.quantite + quantite } : i);
      }

      const basePrice = parseFloat(product.price || product.price_ttc || 0);
      const prixDisponibles = [basePrice];

      if (Array.isArray(product.priceHistory)) {
        product.priceHistory.forEach(p => {
          const val = parseFloat(p.pu_ht);
          if (val > 0 && !prixDisponibles.includes(val)) {
            prixDisponibles.push(val);
          }
        });
      }

      return [...prev, {
        id: product.id,
        ref: product.ref,
        label: product.label || product.description || product.ref,
        price: basePrice,
        prixDisponibles,
        selectedPrice: basePrice,
        maxPriceTTC: parseFloat(product.maxPriceTTC || product.price || product.price_ttc || 0),
        tva: parseFloat(product.tva_tx || 0),
        quantite,
        remise: 0,
        priceType: 'unitaire'
      }];
    });
  };

  const updateQuantity = (productId, quantite) => {
    setItems(prev =>
      prev.map(i => i.id === productId ? { ...i, quantite } : i).filter(i => i.quantite > 0)
    );
  };

  const updateRemise = (productId, remise) => {
    const valeur = Math.max(0, Math.min(100, parseFloat(remise) || 0));
    setItems(prev =>
      prev.map(i => i.id === productId ? { ...i, remise: valeur } : i)
    );
  };

  const updatePriceType = (productId, priceType) => {
    setItems(prev =>
      prev.map(i => i.id === productId ? { ...i, priceType } : i)
    );
  };

  const updateSelectedPrice = (productId, price) => {
    setItems(prev =>
      prev.map(i => i.id === productId ? { ...i, selectedPrice: parseFloat(price), priceType: 'unitaire' } : i)
    );
  };

  const getEffectivePrice = (item) =>
    item.priceType === 'maxTTC' ? (item.maxPriceTTC || item.price) : (item.selectedPrice ?? item.price);

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.id !== productId));
  };

  const clearCart = () => {
    setItems([]);
    sessionStorage.removeItem('cart_items');
  };

  const total = items.reduce((sum, i) => sum + (getEffectivePrice(i) * i.quantite), 0);
  const totalAvecRemise = items.reduce((sum, i) => {
    const sousTotal = getEffectivePrice(i) * i.quantite;
    const remise = i.remise || 0;
    return sum + (sousTotal * (1 - remise / 100));
  }, 0);

  return (
    <CartContext.Provider value={{ 
      items, 
      addItem, 
      updateQuantity, 
      updateRemise, 
      updatePriceType,
      updateSelectedPrice,
      getEffectivePrice, 
      removeItem, 
      clearCart, 
      total, 
      totalAvecRemise 
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans un CartProvider');
  return ctx;
};