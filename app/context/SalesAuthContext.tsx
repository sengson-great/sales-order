"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

interface SalesUser {
  id: number;
  username: string;
  email: string;
  name: string;
  phone: string;
  business_id: number;
  profile_url?: string;
  role: string;
  token?: string;
  roles: string[];
}

interface SalesAuthContextType {
  salesUser: SalesUser | null;
  salesLoading: boolean;
  salesLogin: (username: string, password: string) => Promise<void>;
  salesLogout: () => Promise<void>;
  updateSalesUser: (userData: Partial<SalesUser>) => void;
  isSalesAuthenticated: boolean;
  refreshSalesUser: () => Promise<void>;
}

const SalesAuthContext = createContext<SalesAuthContextType | undefined>(undefined);

export const useSalesAuth = () => {
  const context = useContext(SalesAuthContext);
  if (!context) {
    throw new Error("useSalesAuth must be used within a SalesAuthProvider");
  }
  return context;
};

interface SalesAuthProviderProps {
  children: ReactNode;
}

// Helper function to get main role from roles array
const getMainRole = (roles: string[]): string => {
  if (!roles || roles.length === 0) return 'sales';
  
  for (const role of roles) {
    const cleanRole = role.toLowerCase().replace(/#\d+$/, '');
    if (cleanRole.includes('sales online')) return 'salesOnline';
    if (cleanRole.includes('sales on field')) return 'salesOnField';
    if (cleanRole.includes('admin')) return 'admin';
    if (cleanRole.includes('cashier')) return 'cashier';
    if (cleanRole.includes('delivery')) return 'delivery';
  }
  
  return roles[0].replace(/#\d+$/, '').toLowerCase();
};

export const SalesAuthProvider: React.FC<SalesAuthProviderProps> = ({ children }) => {
  const [salesUser, setSalesUser] = useState<SalesUser | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const router = useRouter();

  // Initialize from localStorage
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const storedSalesUser = localStorage.getItem("sales_user");
        const storedToken = localStorage.getItem("sales_token");
        
        if (storedSalesUser && storedToken) {
          const parsedUser = JSON.parse(storedSalesUser);
          setSalesUser(parsedUser);
          
          // Set axios default header with Bearer token
          axios.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
        }
      } catch (error) {
        console.error("Error initializing sales auth:", error);
        localStorage.removeItem("sales_user");
        localStorage.removeItem("sales_token");
      } finally {
        setSalesLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const salesLogin = async (username: string, password: string) => {
    setSalesLoading(true);
    
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/sales/login`,
        { 
          username, 
          password
        }
      );

      console.log("Sales login response:", response.data);

      if (response.data.success) {
        const userData = response.data.user;
        const token = response.data.token;
        const roles = response.data.roles;

        const salesUserData: SalesUser = {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          name: userData.name,
          phone: userData.phone || '',
          business_id: userData.business_id,
          profile_url: userData.profile_url,
          role: getMainRole(roles),
          token: token,
          roles: roles
        };

        // Save to state
        setSalesUser(salesUserData);
        
        // Save to localStorage
        localStorage.setItem("sales_user", JSON.stringify(salesUserData));
        localStorage.setItem("sales_token", token);
        
        // Set axios default header for future requests
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        toast.success("Sales login successful!");
        
        // Redirect to sales dashboard
        router.push("/");
      } else {
        throw new Error(response.data.msg || "Login failed");
      }
    } catch (error: any) {
      console.error("Sales login error:", error);
      
      let errorMessage = "Login failed. Please try again.";
      
      if (error.response) {
        if (error.response.status === 401) {
          errorMessage = error.response.data?.msg || "Invalid username or password";
        } else if (error.response.status === 403) {
          errorMessage = error.response.data?.msg || "Access denied. Sales or admin role required.";
        } else if (error.response.data?.msg) {
          errorMessage = error.response.data.msg;
        }
      } else if (error.request) {
        errorMessage = "Network error. Please check your connection.";
      }
      
      toast.error(errorMessage);
      throw error;
    } finally {
      setSalesLoading(false);
    }
  };

  const refreshSalesUser = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/sales/profile`);
      
      if (response.data.success) {
        const userData = response.data.user;
        const roles = response.data.roles || [];

        const updatedUser: SalesUser = {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          name: userData.name,
          phone: userData.phone || '',
          business_id: userData.business_id,
          profile_url: userData.profile_url,
          role: getMainRole(roles),
          token: salesUser?.token, // Keep existing token
          roles: roles
        };

        setSalesUser(updatedUser);
        localStorage.setItem("sales_user", JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error("Error refreshing sales user:", error);
      // If refresh fails, log out
      await salesLogout();
    }
  };

  const salesLogout = async () => {
    try {
      // Call logout API
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/sales/logout`);
    } catch (err) {
      console.error("Logout API error:", err);
    } finally {
      // Clear state
      setSalesUser(null);
      
      // Clear localStorage
      localStorage.removeItem("sales_user");
      localStorage.removeItem("sales_token");
      
      // Clear axios header
      delete axios.defaults.headers.common["Authorization"];
      
      toast.success("Sales logged out successfully!");
      
      // Redirect to sales login page
      router.push("/sign-in-sale");
    }
  };

  const updateSalesUser = (userData: Partial<SalesUser>) => {
    if (salesUser) {
      const updatedUser = { ...salesUser, ...userData };
      setSalesUser(updatedUser);
      localStorage.setItem("sales_user", JSON.stringify(updatedUser));
    }
  };

  const isSalesAuthenticated = !!salesUser;

  return (
    <SalesAuthContext.Provider
      value={{
        salesUser,
        salesLoading,
        salesLogin,
        salesLogout,
        updateSalesUser,
        isSalesAuthenticated,
        refreshSalesUser,
      }}
    >
      {children}
    </SalesAuthContext.Provider>
  );
};