import React, { createContext, useContext, useState } from 'react';

const ClientContext = createContext(null);

export const ClientProvider = ({ children }) => {
  const [client, setClient] = useState(() => {
    try {
      const stored = sessionStorage.getItem('frontoffice_client');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = (clientData) => {
    setClient(clientData);
    sessionStorage.setItem('frontoffice_client', JSON.stringify(clientData));
  };

  const logout = () => {
    setClient(null);
    sessionStorage.removeItem('frontoffice_client');
  };

  return (
    <ClientContext.Provider value={{ client, login, logout }}>
      {children}
    </ClientContext.Provider>
  );
};

export const useClient = () => {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient doit être utilisé dans un ClientProvider');
  return ctx;
};