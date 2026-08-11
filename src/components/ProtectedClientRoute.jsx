import React from 'react';
import { Navigate } from 'react-router-dom';
import { useClient } from '../context/ClientContext';

const ProtectedClientRoute = ({ children }) => {
  const { client } = useClient();
  if (!client) {
    return <Navigate to="/client-login" replace />;
  }
  return children;
};

export default ProtectedClientRoute;