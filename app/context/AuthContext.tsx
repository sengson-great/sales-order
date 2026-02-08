"use client";
import {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useRef,
} from "react";
import api from "@/api/api";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  name: string;
  phone?: string | null;
  mobile?: string | null;
  profile_url?: string | null;
  role?: string;
  reward_points: {
    total: number;
    used: number;
    expired: number;
    available: number;
  };
}

export type Contact = {
  id?: number;
  business_id?: number;
  type: "customer" | "supplier" | "both";
  supplier_business_name?: string;
  name: string;
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  contact_id?: string;
  tax_number?: string;
  city?: string;
  state?: string;
  country?: string;
  address_line_1?: string;
  address_line_2?: string;
  zip_code?: string;
  mobile: string;
  landline?: string;
  alternate_number?: string;
  latitude?: number;
  longitude?: number;
  customer_group_id?: number;
  contact_status?: "active" | "inactive";
  created_by?: number;
  is_default?: boolean;
  shipping_address?: string;
  position?: string;
  dob?: string;
  custom_field1?: string;
  custom_field2?: string;
  custom_field3?: string;
  custom_field4?: string;
  custom_field5?: string;
  credit_limit?: number;
  created_at?: string;
  updated_at?: string;
  // Additional fields for UI
  details?: string; // For address details in UI
  coordinates?: { lat: number; lng: number };
  place_pic?: string;
};

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
  login: (phone: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  error: string | null;
  setError: (error: string | null) => void;
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  newContact: Contact;
  setNewContact: (contact: Contact) => void;
  fetchContacts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [newContact, setNewContact] = useState<Contact>({
    name: "",
    mobile: "",
    type: "customer",
    email: "",
    address_line_1: "",
    city: "",
    state: "",
    country: "",
    zip_code: "",
    details: "", // For UI only
    coordinates: undefined,
    place_pic: "",
  });

  // 🔹 Unified function to extract user data
  const extractUserFromResponse = (responseData: any): User | null => {
    if (!responseData) return null;
    
    let userData;
    
    if (responseData.user) {
      userData = responseData.user;
    } else if (responseData.id) {
      userData = responseData;
    } else {
      return null;
    }
    
    return {
      id: userData.id || 0,
      name: userData.name || '',
      phone: userData.phone || null,
      mobile: userData.mobile || null,
      profile_url: userData.profile_url || null,
      role: userData.role || '',
      reward_points: userData.reward_points || {
        total: 0,
        used: 0,
        expired: 0,
        available: 0
      }
    };
  };

  // 🔹 Restore user on mount - SIMPLIFIED
  useEffect(() => {
    const fetchUser = async () => {
      try {
        console.log('🔄 Fetching user on mount...');
        
        const res = await api.get("/user", {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
          // Adding a timestamp ensures Safari sees this as a brand new URL
          params: {
            _t: Date.now()
          }
        });
        
        const userData = extractUserFromResponse(res.data);
        
        if (userData) {
          console.log('✅ User found', userData);
          setUser(userData);
        } else {
          console.log('❌ No valid user data');
          setUser(null);
        }
      } catch (err: any) {
        console.error("Auth restore failed:", err.message);
        
        // Don't automatically redirect - let components handle
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
    
    // Cleanup timeout on unmount
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // 🔹 Refresh user data - SIMPLIFIED
  const refreshUser = async (): Promise<void> => {
    try {
      const response = await api.get(`/user`);
      
      const newUser = extractUserFromResponse(response.data);
      
      if (!newUser) {
        setUser(null);
        return;
      }
      
      setUser(newUser);
      
    } catch (error: any) {
      console.error('Failed to refresh user:', error.message);
      
      // Only clear user if it's an auth error
      if (error.response?.status === 401) {
        setUser(null);
      }
      
      throw error;
    }
  };

  async function fetchContacts() {
    setLoading(true);
    try {
      const res = await api.get<{ status: string; data: Contact[] }>("/contacts/all");
      console.log("Fetched contacts:", res.data.data);
      setContacts(res.data.data);
    } catch (err) {
      console.error(err);
      //toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }


  

  // 🔹 Update user data
  const updateUser = (updates: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  // 🔹 Enhanced login with better error handling
  const login = async (phone: string, username: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔐 Attempting login with:', { phone, username });
      
      // Use the ACTUAL endpoint from your api.php
      const res = await api.post("/login", { 
        phone, 
        name: username   // or whatever field the backend expects for username/name
      });
      
      console.log('✅ Login successful');
      console.log('📥 Login response:', res.data);
      

      
      // Try to fetch user right after login
      try {
        const userResponse = await api.get("/user");
        console.log('📦 /user after login:', userResponse.data);
        
        const userData = extractUserFromResponse(userResponse.data);
        
        if (userData) {
          console.log('✅ User loaded after login:', userData.name);
          setUser(userData);
          router.push("/");
          return;
        } else {
          console.warn('⚠️ Login OK but /user did not return valid user object');
        }
      } catch (userErr: any) {
        console.warn('⚠️ Could not fetch /user right after login:', userErr.message);
        // Still consider login successful if the /login returned 200
      }
      
      // If no immediate user fetch → at least redirect
      router.push("/");
      
    } catch (err: any) {
      console.error('🔴 Login failed:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        url: err.config?.url
      });
      
      setError(`Login failed: ${err.response?.data?.message || err.message || 'Unknown error'}`);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Logout
// 🔹 Enhanced Logout
  const logout = async () => {
    try {
      await api.post("/logout");
      
    } catch (error: any) {
      console.error("Logout error:", error);
    }
    
    setUser(null);
    router.push("/sign-in-sale");
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser,
      loading, 
      login, 
      logout, 
      refreshUser, 
      updateUser,
      contacts,
      setContacts,
      fetchContacts,
      newContact,
      setNewContact,
      error,
      setError
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be inside AuthProvider");
  return context;
};