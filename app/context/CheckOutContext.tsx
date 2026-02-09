"use client";
import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import { useSalesAuth } from "./SalesAuthContext";
import { toast } from "react-toastify";
import { getShortAddress } from "./utils/geocode";
import { useRouter } from "next/navigation";

export type CartItem = {
  id: number;
  title: string;
  price: number;
  image?: string;
  qty: number;
};

export type RewardItem = {
  product_id: number;
  name: string;
  points_at_reward: number;
  qty: number;
  image?: string;
};

export type Address = {
  id?: number;
  label: any;
  details?: string;
  phone?: string;
  coordinates?: { lat: number; lng: number };
  short_address?: string;
  customer_name?: string;
  customer_email?: string;
  customer_company?: string;
};

type CheckoutContextType = {
  cart: CartItem[];
  total: number;
  addToCart: (product: Omit<CartItem, "qty">, deltaQty: number) => void;
  updateItemQty: (id: number, qty: number) => void;
  removeItem: (id: number) => void;

  rewards: RewardItem[];
  totalPoints: number;
  addReward: (reward: Omit<RewardItem, "qty">, deltaQty: number) => void;
  updateRewardQty: (product_id: number, qty: number) => void;
  removeReward: (product_id: number) => void;

  selectedAddress: Address | "current" | null;
  setSelectedAddress: (addr: Address | "current") => void;
  currentAddress: Address;
  setCurrentAddress: (addr: Address) => void;
  detectCurrentLocation: () => Promise<Address>;

  paymentMethod: string;
  setPaymentMethod: (method: string) => void;

  placeOrder: () => void;
  placeRewardOrder: () => void;
  
  // New properties for sales mode
  isSalesMode: boolean;
  salespersonName: string;
  customerInfo: {
    name: string;
    phone: string;
    email: string;
  };
  setCustomerInfo: (info: { name: string; phone: string; email: string }) => void;
};

const CheckoutContext = createContext<CheckoutContextType | undefined>(undefined);

// LocalStorage keys
const CART_STORAGE_KEY = 'shopping_cart_v2';
const REWARDS_STORAGE_KEY = 'rewards_cart_v2';
const CART_EXPIRY_HOURS = 24; // Cart expires after 24 hours

export const CheckoutProvider = ({ children }: { children: ReactNode }) => {
  const { user: regularUser } = useAuth();
  const { salesUser, isSalesAuthenticated } = useSalesAuth();
  const router = useRouter();

  // Determine active user and mode
  const activeUser = isSalesAuthenticated ? salesUser : regularUser;
  const isSalesMode = isSalesAuthenticated;
  const salespersonName = salesUser?.name || "Sales Staff";

  // Customer info state for sales mode
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    email: ""
  });

  // ========== LOCALSTORAGE FUNCTIONS ==========
  
  // Load cart from localStorage
  const loadCartFromStorage = (): CartItem[] => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if data has expiry
        if (parsed.expiry && Date.now() > parsed.expiry) {
          // Cart expired, clear it
          localStorage.removeItem(CART_STORAGE_KEY);
          return [];
        }
        return parsed.cart || [];
      }
    } catch (error) {
      console.error('Failed to load cart from storage:', error);
    }
    return [];
  };

  // Save cart to localStorage with expiry
  const saveCartToStorage = (cartItems: CartItem[]) => {
    try {
      const cartData = {
        cart: cartItems,
        expiry: Date.now() + (CART_EXPIRY_HOURS * 60 * 60 * 1000), // 24 hours from now
        lastUpdated: Date.now()
      };
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartData));
    } catch (error) {
      console.error('Failed to save cart to storage:', error);
    }
  };

  // Load rewards from localStorage
  const loadRewardsFromStorage = (): RewardItem[] => {
    try {
      const stored = localStorage.getItem(REWARDS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiry && Date.now() > parsed.expiry) {
          // Rewards expired, clear it
          localStorage.removeItem(REWARDS_STORAGE_KEY);
          return [];
        }
        return parsed.rewards || [];
      }
    } catch (error) {
      console.error('Failed to load rewards from storage:', error);
    }
    return [];
  };

  // Save rewards to localStorage
  const saveRewardsToStorage = (rewardItems: RewardItem[]) => {
    try {
      const rewardsData = {
        rewards: rewardItems,
        expiry: Date.now() + (CART_EXPIRY_HOURS * 60 * 60 * 1000), // 24 hours from now
        lastUpdated: Date.now()
      };
      localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(rewardsData));
    } catch (error) {
      console.error('Failed to save rewards to storage:', error);
    }
  };

  // Clear all cart data from localStorage
  const clearCartStorage = () => {
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(REWARDS_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear cart storage:', error);
    }
  };

  // Initialize cart from localStorage on mount
  const [cart, setCart] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);

  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    // Load cart from localStorage on initial mount
    const savedCart = loadCartFromStorage();
    if (savedCart.length > 0) {
      setCart(savedCart);
      setTotal(recalcTotal(savedCart));
    }

    // Load rewards from localStorage
    const savedRewards = loadRewardsFromStorage();
    if (savedRewards.length > 0) {
      setRewards(savedRewards);
      setTotalPoints(recalcTotalPoints(savedRewards));
    }
  }, []);

  const [selectedAddress, setSelectedAddress] = useState<Address | "current" | null>(null);
  const [currentAddress, setCurrentAddress] = useState<Address>({
    label: "Current Location",
    details: "",
    phone: activeUser?.phone || "",
    coordinates: { lat: 0, lng: 0 },
  });

  const [paymentMethod, setPaymentMethod] = useState("QR");
  const userPoints = regularUser?.reward_points?.available || 0;

  // Enhanced token retrieval function
  const getAuthToken = (): string | null => {
    if (typeof window === 'undefined') return null;

    // For sales mode
    if (isSalesMode) {
      // Check localStorage first
      let token = localStorage.getItem('sales_token');
      if (token) return token;
      
      // Check localStorage legacy
      token = localStorage.getItem('auth_token');
      if (token) return token;
      
      // Check sessionStorage
      token = sessionStorage.getItem('sales_token');
      if (token) return token;
      
      // Check URL parameters (for OAuth redirects)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token') || urlParams.get('access_token');
      if (urlToken) {
        localStorage.setItem('sales_token', urlToken);
        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        return urlToken;
      }
    } 
    // For regular users
    else {
      // Check localStorage first
      let token = localStorage.getItem('auth_token');
      if (token) return token;
      
      // Check localStorage legacy
      token = localStorage.getItem('token');
      if (token) return token;
      
      // Check sessionStorage
      token = sessionStorage.getItem('auth_token');
      if (token) return token;
      
      token = sessionStorage.getItem('token');
      if (token) return token;
      
      // Check URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token') || urlParams.get('access_token');
      if (urlToken) {
        localStorage.setItem('auth_token', urlToken);
        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        return urlToken;
      }
    }

    return null;
  };

  // Update currentAddress phone when active user changes
  useEffect(() => {
    if (activeUser) {
      const userPhone = activeUser.phone;
      if (userPhone && userPhone !== currentAddress.phone) {
        setCurrentAddress(prev => ({
          ...prev,
          phone: userPhone
        }));
      }
    }
  }, [activeUser]);

  // Update customer info when selecting a saved address
  useEffect(() => {
    if (isSalesMode && selectedAddress && selectedAddress !== "current") {
      const address = selectedAddress as Address;
      // Pre-fill customer info from saved address if available
      if (address.label && address.phone) {
        setCustomerInfo(prev => ({
          ...prev,
          name: address.label || prev.name,
          phone: address.phone || prev.phone
        }));
      }
    }
  }, [selectedAddress, isSalesMode]);

  const recalcTotal = (items: CartItem[]) => items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const recalcTotalPoints = (items: RewardItem[]) => items.reduce((sum, i) => sum + i.points_at_reward * i.qty, 0);

  // --- CART METHODS ---
  const addToCart = (product: Omit<CartItem, "qty">, deltaQty: number) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === product.id);
      if (idx === -1 && deltaQty > 0) {
        const newItems = [...prev, { ...product, qty: deltaQty }];
        setTotal(recalcTotal(newItems));
        // Save to localStorage
        saveCartToStorage(newItems);
        return newItems;
      }
      if (idx === -1) return prev;

      const existing = prev[idx];
      const newQty = existing.qty + deltaQty;
      if (newQty <= 0) {
        const newItems = prev.filter(i => i.id !== product.id);
        setTotal(recalcTotal(newItems));
        // Save to localStorage
        saveCartToStorage(newItems);
        return newItems;
      }
      const updated = { ...existing, qty: newQty };
      const newItems = [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      setTotal(recalcTotal(newItems));
      // Save to localStorage
      saveCartToStorage(newItems);
      return newItems;
    });
  };

  const updateItemQty = (id: number, qty: number) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      if (qty <= 0) {
        const newItems = prev.filter(i => i.id !== id);
        setTotal(recalcTotal(newItems));
        // Save to localStorage
        saveCartToStorage(newItems);
        return newItems;
      }
      const updated = { ...prev[idx], qty };
      const newItems = [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      setTotal(recalcTotal(newItems));
      // Save to localStorage
      saveCartToStorage(newItems);
      return newItems;
    });
  };

  const removeItem = (id: number) => {
    setCart(prev => {
      const newItems = prev.filter(i => i.id !== id);
      setTotal(recalcTotal(newItems));
      // Save to localStorage
      saveCartToStorage(newItems);
      return newItems;
    });
  };

  // --- REWARD METHODS ---
  const addReward = (reward: Omit<RewardItem, "qty">, deltaQty: number) => {
    setRewards(prev => {
      const idx = prev.findIndex(r => r.product_id === reward.product_id);
      const existingQty = idx === -1 ? 0 : prev[idx].qty;
      const newQty = existingQty + deltaQty;

      const newTotalPoints = prev.reduce((sum, r, i) => {
        if (i === idx) return sum + newQty * reward.points_at_reward;
        return sum + r.qty * r.points_at_reward;
      }, 0) + (idx === -1 ? deltaQty * reward.points_at_reward : 0);

      if (newTotalPoints > userPoints) {
        setTimeout(() => {
          toast.error("You don't have enough reward points!", { autoClose: 2000 });
        }, 0);
        return prev;
      }

      if (idx === -1 && deltaQty > 0) {
        const newItems = [...prev, { ...reward, qty: deltaQty }];
        // Save to localStorage
        saveRewardsToStorage(newItems);
        return newItems;
      }
      if (newQty <= 0) {
        const newItems = prev.filter(r => r.product_id !== reward.product_id);
        // Save to localStorage
        saveRewardsToStorage(newItems);
        return newItems;
      }

      const updated = { ...prev[idx], qty: newQty };
      const newItems = [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      // Save to localStorage
      saveRewardsToStorage(newItems);
      return newItems;
    });
  };

  const updateRewardQty = (product_id: number, qty: number) => {
    setRewards(prev => {
      const idx = prev.findIndex(r => r.product_id === product_id);
      if (idx === -1) return prev;
      if (qty <= 0) {
        const newItems = prev.filter(r => r.product_id !== product_id);
        setTotalPoints(recalcTotalPoints(newItems));
        // Save to localStorage
        saveRewardsToStorage(newItems);
        return newItems;
      }
      const updated = { ...prev[idx], qty };
      const newItems = [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      setTotalPoints(recalcTotalPoints(newItems));
      // Save to localStorage
      saveRewardsToStorage(newItems);
      return newItems;
    });
  };

  const removeReward = (product_id: number) => {
    setRewards(prev => {
      const newItems = prev.filter(r => r.product_id !== product_id);
      setTotalPoints(recalcTotalPoints(newItems));
      // Save to localStorage
      saveRewardsToStorage(newItems);
      return newItems;
    });
  };

// Generate invoice image from order data
const generateInvoiceImage = (
  orderPayload: any, 
  customerName: string, 
  customerPhone: string,
  addressData: Address | null
) => {
  try {
    const scale = 2;
    const width = 384;
    
    // Calculate dynamic height
    const baseHeight = 240;
    const itemsCount = orderPayload.items?.length || 0;
    const itemsHeight = itemsCount * 35;
    const addressHeight = 60;
    const totalHeight = baseHeight + itemsHeight + addressHeight + 100;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = width * scale;
    canvas.height = totalHeight * scale;
    ctx.scale(scale, scale);

    // Draw the Box Style
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, totalHeight);
    
    // Header
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, 80);
    ctx.fillStyle = '#1e4ce4';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('បង្កាន់ដៃ', 20, 35);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Arial';
    const orderDate = new Date().toLocaleString('km-KH');
    ctx.fillText(orderDate, 20, 55);

    // Customer Info
    let y = 110;
    if (customerName) {
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(customerName || 'អតិថិជន', 20, y);
      ctx.font = '12px Arial';
      ctx.fillText(customerPhone || '', 20, y + 18);
      y += 45;
    }

    // Address Section
    if (addressData?.short_address) {
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('📍 អាសយដ្ឋាន', 20, y);
      
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Arial';
      
      // Text wrapping for address
      const maxWidth = width - 40;
      const lineHeight = 14;
      const words = addressData.short_address.split(' ');
      let line = '';
      let lineY = y + 20;
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, 20, lineY);
          line = words[n] + ' ';
          lineY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 20, lineY);
      y = lineY + 25;
    } else {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'italic 11px Arial';
      ctx.fillText('⚠️ គ្មានអាសយដ្ឋាន', 20, y);
      y += 30;
    }

    // Items Separator
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath(); 
    ctx.moveTo(20, y); 
    ctx.lineTo(width - 20, y); 
    ctx.stroke();
    y += 25;

    // Items Header
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('ទំនិញ', 20, y);
    ctx.fillText('តម្លៃ', width - 50, y);
    y += 20;

    // Items List
    ctx.font = '12px Arial';
    orderPayload.items?.forEach((item: any) => {
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'left';
      
      // Find product name from cart
      const cartItem = cart.find(ci => ci.id === item.product_id);
      const productName = cartItem?.title || 'Product';
      ctx.fillText(productName, 20, y);
      
      ctx.textAlign = 'right';
      ctx.fillText(`$${(item.qty * item.price_at_order).toFixed(2)}`, width - 20, y);
      
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(`${item.qty} x $${item.price_at_order.toFixed(2)}`, 20, y + 15);
      
      y += 35;
    });

    // Payment Method
    y += 10;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, y, width, 30);
    ctx.fillStyle = '#475569';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    const paymentText = paymentMethod === 'QR' ? 'QR' : 
                       paymentMethod === 'Cash' ? 'សាច់ប្រាក់' : 
                       paymentMethod === 'Card' ? 'ប័ណ្ណ' : 'មិនមាន';
    ctx.fillText(`វិធីសាស្រ្តទូទាត់: ${paymentText}`, 20, y + 20);
    
    // Total Box
    y += 40;
    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(0, y, width, 70);
    ctx.fillStyle = '#1e4ce4';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('សរុប', 20, y + 40);
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`$${total.toFixed(2)}`, width - 20, y + 40);

    return canvas.toDataURL('image/png', 1.0);
  } catch (e) {
    console.error('Error generating invoice:', e);
    return null;
  }
};
  
// Function to send invoice to Telegram
const sendInvoiceToTelegram = async (orderId: number, imageDataUrl: string) => {
  try {
    // Convert Data URL to blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    const formData = new FormData();
    formData.append('invoice_image', blob, `ល.រ_${orderId}_បង្កាន់ដៃ.png`);
    
    // Get token
    const token = getAuthToken();
    
    if (!token) {
      console.error('No auth token available for Telegram send');
      return;
    }
    
    await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/online-orders/${orderId}/send-telegram-invoice`,
      formData,
      {
        withCredentials: true,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    console.log('✅ Invoice sent to Telegram automatically');
  } catch (error) {
    console.error('❌ Failed to send invoice to Telegram:', error);
    // Don't show error to user, just log it
  }
};
  

// --- PLACE ORDER (MODIFIED WITH CONTACTS SUPPORT) ---
const placeOrder = async () => {
  // Declare these variables at the top
  let addressToSend: Address | null = null;
  let customerName = "";
  let customerPhone = "";
  let customerEmail = "";
  let payload: any = null;
  
  // ============================================
  // 1. ADDRESS SELECTION LOGIC (UNCHANGED)
  // ============================================
  if (selectedAddress === "current") {
    if (!currentAddress.coordinates) {
      toast.error("Current address coordinates not set!");
      return;
    }
    
    // For sales mode, validate customer info
    if (isSalesMode) {
      if (!customerInfo.name || !customerInfo.phone) {
        toast.error("Please enter customer name and phone number");
        return;
      }
      
      customerName = customerInfo.name;
      customerPhone = customerInfo.phone;
      customerEmail = customerInfo.email || "";
      
      const short_address = await getShortAddress(currentAddress.coordinates.lat, currentAddress.coordinates.lng);
      addressToSend = { 
        ...currentAddress, 
        short_address,
        phone: customerPhone,
        label: customerName,
        details: `Customer address: ${short_address}`,
      };
    } else {
      const userPhone = regularUser?.mobile || regularUser?.phone || "";
      
      if (!userPhone) {
        toast.error("Please add your phone number in your account settings");
        return;
      }
      
      customerName = regularUser?.name || "Customer";
      customerPhone = userPhone;
      
      const short_address = await getShortAddress(currentAddress.coordinates.lat, currentAddress.coordinates.lng);
      addressToSend = { 
        ...currentAddress, 
        short_address,
        phone: customerPhone,
        label: customerName,
      };
    }
  } else {
    addressToSend = selectedAddress as Address;
    
    if (!addressToSend) {
      toast.error("Please select an address!");
      return;
    }
    
    if (isSalesMode) {
      // ============================================
      // NEW: CHECK IF SELECTED ADDRESS IS FROM CONTACTS
      // ============================================
      if (addressToSend.id) {
        // This is a contact from the contacts table
        customerName = addressToSend.label || "";
        customerPhone = addressToSend.phone || "";
        
        // Use the contact's address as delivery address
        addressToSend = {
          ...addressToSend,
          label: customerName,
          phone: customerPhone,
          coordinates: addressToSend.coordinates
        };
      } else if (addressToSend.label && addressToSend.phone) {
        // Old address-based customer info
        customerName = addressToSend.label;
        customerPhone = addressToSend.phone;
        customerEmail = "";
      } else {
        if (!customerInfo.name || !customerInfo.phone) {
          toast.error("Please enter customer name and phone number");
          return;
        }
        customerName = customerInfo.name;
        customerPhone = customerInfo.phone;
        customerEmail = customerInfo.email || "";
        
        addressToSend.phone = customerPhone;
        addressToSend.label = customerName;
      }
    } else {
      customerName = regularUser?.name || addressToSend.label || "Customer";
      customerPhone = addressToSend.phone || regularUser?.mobile || regularUser?.phone || "";
      
      if (!customerPhone) {
        toast.error("Saved address must have a phone number. Please update your address.");
        return;
      }
      
      if (!addressToSend.phone) {
        addressToSend.phone = customerPhone;
      }
    }
  }

  if (!addressToSend || cart.length === 0) {
    toast.error("Cart is empty or no address selected!");
    return;
  }

  if (!addressToSend.phone) {
    toast.error("Phone number is required for delivery");
    return;
  }

  // ============================================
  // 2. DETERMINE USER IDS (UPDATED FOR CONTACTS)
  // ============================================
  let apiUserId: number;
  let salesUserId: number | undefined = undefined;
  let isSalesOrder = false;
  let contactId: number | undefined = undefined;

  if (isSalesMode && salesUser) {
    isSalesOrder = true;
    salesUserId = salesUser.id;
    apiUserId = 20; // Fixed API user ID for sales
    
    // ============================================
    // NEW: SET CONTACT ID IF FROM CONTACTS TABLE
    // ============================================
    if (selectedAddress !== "current" && selectedAddress && typeof selectedAddress !== 'string') {
      const contactAddress = selectedAddress;
      if (contactAddress.id) {
        contactId = contactAddress.id;
        console.log('Using contact ID for order:', contactId);
      }
    }
  } else if (regularUser) {
    isSalesOrder = false;
    apiUserId = regularUser.id;
    salesUserId = undefined;
    contactId = undefined;
  } else {
    toast.error("You must be logged in to place an order!");
    return;
  }

  // ============================================
  // 3. CREATE PAYLOAD (UPDATED FOR CONTACTS)
  // ============================================
// Create a clean payload without sending both IDs
payload = {
  api_user_id: apiUserId,
  paymentMethod,
  total_qty: cart.reduce((sum, i) => sum + i.qty, 0),
  total,
  items: cart.map(i => ({
    product_id: i.id,
    qty: i.qty,
    price_at_order: i.price,
    total_line: Number((i.price * i.qty).toFixed(2)),
    image_url: (i.image ?? "").split("/").pop(),
  })),
};

// Determine which address identifier to use
if (contactId) {
  // Sales mode with contact from contacts table
  payload.contact_id = contactId;
  payload.address_type = 'current';
  payload.address = addressToSend;
} else if (selectedAddress !== "current" && addressToSend?.id) {
  // Regular saved address
  payload.saved_address_id = addressToSend.id;
  payload.address_type = 'saved';
} else {
  // Current address
  payload.address_type = 'current';
  payload.address = addressToSend;
}

// Sales order fields
if (isSalesOrder) {
  // Only send customer_info if NOT using contact_id
  if (!contactId) {
    payload.customer_info = {
      name: customerName,
      phone: customerPhone,
      email: customerEmail || undefined,
    };
  }
  
  payload.sales_user_id = salesUserId;
  payload.sales_person_name = salespersonName;
  payload.is_sales_order = true;
}

  try {
    // Get token using enhanced function
    const token = getAuthToken();
    
    if (!token) {
      toast.error("Authentication token missing. Please log in again.");
      
      if (isSalesMode) {
        localStorage.removeItem('sales_token');
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('sales_token');
        toast.info("Redirecting to sales login...");
        setTimeout(() => router.push('/sales/login'), 1000);
      } else {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('token');
        toast.info("Redirecting to login...");
        setTimeout(() => router.push('/login'), 1000);
      }
      return;
    }

    // 🔥 STEP 1: FIRST GENERATE THE INVOICE IMAGE
    // Pass the required variables to the function
    const invoiceImage = generateInvoiceImage(payload, customerName, customerPhone, addressToSend);
    
    // 🔥 STEP 2: MAKE THE ORDER API CALL
    const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/store-order`, payload, {
      withCredentials: true,
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });
    
    if (res.data?.success) {
      const orderId = res.data.order_id;
      
      // 🔥 STEP 3: AUTOMATICALLY SEND INVOICE TO TELEGRAM
      if (invoiceImage && res.data.telegram_start_link) {
        // Wait a moment for the order to be fully processed
        setTimeout(async () => {
          try {
            await sendInvoiceToTelegram(orderId, invoiceImage);
            console.log('✅ Invoice auto-sent to Telegram for order:', orderId);
          } catch (error) {
            console.error('❌ Auto-send invoice failed:', error);
          }
        }, 1000); // 1 second delay
      }
      
      toast.success("Order placed successfully!");
      
      if (isSalesOrder) {
        // Show contact info if available
        if (contactId) {
          toast.info(`Customer from contacts: ${customerName}, Phone: ${customerPhone}`);
        } else {
          toast.info(`New customer: ${customerName}, Phone: ${customerPhone}`);
        }
        
        if (res.data.salesperson_info?.name) {
          toast.info(`Salesperson: ${res.data.salesperson_info.name}`);
        }
      }
      
      // Clear cart after successful order
      setCart([]);
      setTotal(0);
      clearCartStorage();
      setCustomerInfo({ name: "", phone: "", email: "" });
      
      // Redirect to success page
      router.push(`/checkout/order-success?telegram=${encodeURIComponent(res.data.telegram_start_link)}&order_id=${orderId}`);
    }
  } catch (err: any) {
    console.error("❌ Order error:", err);
    console.error("❌ Full error response:", err.response?.data);
    console.error("❌ Payload sent:", payload);
    
    if (err.response?.status === 401) {
      if (err.response?.data?.message === 'Unauthenticated.') {
        if (isSalesMode) {
          localStorage.removeItem('sales_token');
          localStorage.removeItem('auth_token');
          sessionStorage.removeItem('sales_token');
          toast.info("Sales session expired. Redirecting to login...");
          setTimeout(() => router.push('/sales/login'), 1000);
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('token');
          sessionStorage.removeItem('auth_token');
          sessionStorage.removeItem('token');
          toast.info("Session expired. Redirecting to login...");
          setTimeout(() => router.push('/login'), 1000);
        }
        return;
      }
    }
    
    if (err.response?.data?.message) {
      toast.error(err.response.data.message);
    } else if (err.response?.data?.errors) {
      const errorMessages = Object.values(err.response.data.errors).flat();
      errorMessages.forEach((msg: any) => toast.error(msg));
    } else {
      toast.error("Order failed. Please try again.");
    }
  }
};

  // --- PLACE REWARD ORDER ---
  const placeRewardOrder = async () => {
    if (rewards.length === 0) {
      toast.error("No reward products selected!");
      return;
    }
    
    let apiUserId: number;
    
    // Determine correct API user ID
    if (isSalesMode && salesUser) {
      // For sales users, use fixed ID 20
      apiUserId = 20;
    } else {
      // For regular users
      apiUserId = regularUser?.id || 0;
    }
    
    const payload = {
      api_user_id: apiUserId,
      total_points: totalPoints,
      items: rewards.map(r => ({
        product_id: r.product_id,
        qty: r.qty,
        points_at_reward: r.points_at_reward,
      })),
    };

    try {
      // Get token using the same function
      const token = getAuthToken();
      
      if (!token) {
        toast.error("Authentication token missing. Please log in again.");
        return;
      }

      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/store-reward-order`, payload, {
        withCredentials: true,
        headers: { 
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
      });
      
      if (res.data?.success) {
        toast.success("Reward order placed successfully!");
        setRewards([]);
        setTotalPoints(0);
        // Clear rewards from localStorage
        localStorage.removeItem(REWARDS_STORAGE_KEY);
        router.push(`/checkout/reward-success`);
      }
    } catch (err: any) {
      toast.error("Reward order failed. Please try again.");
      console.error(err);
    }
  };

  const detectCurrentLocation = async () => {
    return new Promise<Address>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }
  
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const coordinates = { lat: latitude, lng: longitude };

          // Get user's phone number
          const userPhone = activeUser?.phone;
  
          try {
            // Get human-readable short address
            const short_address = await getShortAddress(latitude, longitude);
  
            const currentAddr: Address = {
              label: activeUser?.name || "Current Location",
              details: short_address || "Your current position",
              phone: userPhone || "",
              coordinates,
              short_address,
            };
  
            setCurrentAddress(currentAddr);
            resolve(currentAddr);
          } catch (err) {
            // Fallback if reverse geocoding fails
            const fallbackAddr: Address = {
              label: "Current Location",
              details: "Detected location",
              phone: userPhone || "",
              coordinates,
            };
            setCurrentAddress(fallbackAddr);
            resolve(fallbackAddr);
          }
        },
        (error) => {
          let message = "Unable to retrieve your location";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = "Location access denied. Please enable it in browser settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "Location information unavailable.";
              break;
            case error.TIMEOUT:
              message = "Location request timed out.";
              break;
          }
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  };

  return (
    <CheckoutContext.Provider
      value={{
        cart,
        total,
        addToCart,
        updateItemQty,
        removeItem,
        rewards,
        totalPoints,
        addReward,
        updateRewardQty,
        removeReward,
        selectedAddress,
        setSelectedAddress,
        currentAddress,
        setCurrentAddress,
        detectCurrentLocation,
        paymentMethod,
        setPaymentMethod,
        placeOrder,
        placeRewardOrder,
        // New properties for sales mode
        isSalesMode,
        salespersonName,
        customerInfo,
        setCustomerInfo,
      }}
    >
      {children}
    </CheckoutContext.Provider>
  );
};

export const useCheckout = () => {
  const context = useContext(CheckoutContext);
  if (!context) throw new Error("useCheckout must be used within CheckoutProvider");
  return context;
};