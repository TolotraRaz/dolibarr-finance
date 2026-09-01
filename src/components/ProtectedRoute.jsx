import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 heures

const ProtectedRoute = ({ children }) => {
  const location = useLocation();

  const authData = JSON.parse(localStorage.getItem('backoffice_auth') || 'null');
  const isExpired = !authData || (Date.now() - authData.timestamp > SESSION_DURATION);

  if (isExpired) {
    localStorage.removeItem('backoffice_auth');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;