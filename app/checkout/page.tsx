"use client";

import React, { useState, useEffect, useMemo } from "react";
import Header from "@/components/layouts/Header";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useCheckout, Address as ContextAddress } from "@/context/CheckOutContext";
import { useAuth } from "@/context/AuthContext";
import { useSalesAuth } from "@/context/SalesAuthContext";
import { useLoading } from "@/context/LoadingContext";
import api from "@/api/api";
import { toast } from "react-toastify";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "next/navigation";

// Define the API Address type
type APIAddress = {
  id?: number;
  api_user_id: number | undefined;
  label: string;
  phone?: string;
  details?: string;
  coordinates?: { lat: number; lng: number };
};

// Extended type that includes both context and API properties
type ExtendedAddress = ContextAddress & {
  api_user_id?: number;
  place_pic?: string
};

// Payment Method Interface
type PaymentMethodType = {
  id: string;
  name: string | any;
  image: string;
  type: 'default' | 'custom';
};

const containerStyle = { width: "100%", height: "400px" };
const ITEMS_PER_PAGE = 5;

const CombinedCheckoutPage = () => {
  const { user, setUser } = useAuth();
  const { salesUser } = useSalesAuth();
  const router = useRouter();
  const {
    cart,
    total,
    updateItemQty,
    selectedAddress,
    currentAddress,
    setSelectedAddress,
    setCurrentAddress,
    detectCurrentLocation,
    paymentMethod,
    setPaymentMethod,
    placeOrder,
  } = useCheckout();

  const { setLoading } = useLoading();

  const [savedAddresses, setSavedAddresses] = useState<ExtendedAddress[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [tempAddress, setTempAddress] = useState<Partial<APIAddress>>({
    label: "",
    phone: "",
    details: "",
    coordinates: { lat: 0, lng: 0 },
    api_user_id: user?.id,
  });

  const [showQRPopup, setShowQRPopup] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useLanguage();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE);
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // State to control when to show search results
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Payment methods state - FIXED: Initialize with proper structure
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodType[]>([]);


  const [showAllPaymentMethods, setShowAllPaymentMethods] = useState(false);

// Calculate how many methods to show initially
const maxInitialPaymentMethods = 3;
const defaultPaymentMethodsCount = Math.min(maxInitialPaymentMethods, paymentMethods.length);
const paymentMethodsToShow = showAllPaymentMethods ? paymentMethods : paymentMethods.slice(0, defaultPaymentMethodsCount);

  const IMAGE_URL = process.env.NEXT_PUBLIC_IMAGE_URL!;
  const currentSelectedAddress = selectedAddress === "current" ? currentAddress : selectedAddress;

  // Check if user is actively searching (typing in search box)
  const isSearching = useMemo(() => {
    return searchQuery.trim().length > 0;
  }, [searchQuery]);

  // Check if customer is selected
  const isCustomerSelected = useMemo(() => {
    return user?.role === "sale" && selectedAddress && typeof selectedAddress !== 'string';
  }, [user?.role, selectedAddress]);

  // Show main content when: NOT searching OR customer is selected
  const shouldShowMainContent = useMemo(() => {
    return !isSearching || isCustomerSelected;
  }, [isSearching, isCustomerSelected]);

  // Determine if search query starts with a number (phone) or not (name)
  const isLikelyPhoneNumber = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const firstChar = searchQuery.trim().charAt(0);
    return /^\d/.test(firstChar);
  }, [searchQuery]);

useEffect(() => {
  const fetchAllPaymentMethods = async () => {
    try {
      setLoading(true);
      
      // Start with default methods
      const allMethods: PaymentMethodType[] = [
        { id: 'qr', name: t.QR || 'QR', image: "/qr.jpg", type: 'default' },
        { id: 'cash', name: t.cash || 'Cash', image: "/cash.jpg", type: 'default' },
      ];
      
      // Fetch custom methods
      const response = await api.get('/business/1/custom-payments');
      
      if (response.data.success && response.data.custom_payments) {
        const customPayments = response.data.custom_payments;
        
        Object.entries(customPayments).forEach(([key, value]) => {
          if (key.startsWith('custom_pay_') && value && value !== null) {
            allMethods.push({
              id: key,
              name: value,
              image: `/${key}.jpg` || '/payment-default.jpg',
              type: 'custom' as const
            });
          }
        });
      }
      
      setPaymentMethods(allMethods);
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      toast.error('Failed to load custom payment methods');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    fetchAllPaymentMethods();
  }
}, [user, setLoading, t.QR, t.cash]); // Add t.QR and t.cash as dependencies

  // Filter saved addresses based on search query
  const filteredAddresses = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    return savedAddresses.filter(address => {
      const labelMatch = address.label?.toLowerCase().includes(query) || false;
      const phoneMatch = address.phone?.toLowerCase().includes(query) || false;
      const detailsMatch = address.details?.toLowerCase().includes(query) || false;

      return labelMatch || phoneMatch || detailsMatch;
    });
  }, [savedAddresses, searchQuery]);

  // Calculate pagination data
  const paginatedAddresses = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAddresses.slice(startIndex, endIndex);
  }, [filteredAddresses, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAddresses.length / itemsPerPage);

  // Fetch saved addresses
  useEffect(() => {
    const fetchSavedAddresses = async () => {
      setLoading(true);
      try {
        const res = await api.get("/addresses/all");
        const addresses: ExtendedAddress[] = res.data?.data.map((addr: any) => ({
          ...addr,
        })) || [];
        setSavedAddresses(addresses);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load addresses");
      } finally {
        setLoading(false);
      }
    };
    if (user) {
      fetchSavedAddresses();
    }
  }, [setLoading, user]);

  // Update tempAddress when user changes
  useEffect(() => {
    if (user && !tempAddress.api_user_id) {
      setTempAddress((prev) => ({
        ...prev,
        api_user_id: user.id,
        phone: user?.role === "sale" ? "" : getPhoneFromUser(user) || "",
      }));
    }
  }, [user]);

// AUTO-POPULATE FORM FIELDS: Open form automatically when customer is not found
useEffect(() => {
  if (searchQuery.trim() && user?.role === "sale") {
    // First, check if the search matches any existing customer
    const existingCustomer = savedAddresses.find(addr => 
      addr.label?.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      addr.phone?.includes(searchQuery.trim())
    );
    
    if (existingCustomer) {
      // If customer exists, select it and DON'T open form
      //setSelectedAddress(existingCustomer);
      setShowSearchResults(true);
      setIsAdding(false);
    } else if (!isAdding) {
      // If customer doesn't exist AND we're not already in the form
      // Open form immediately with the search query
      setIsAdding(true);
      setShowSearchResults(false);
      
      // Update the form fields based on current search
      if (isLikelyPhoneNumber) {
        setTempAddress(prev => ({
          ...prev,
          phone: searchQuery.trim(),
          label: prev.label || "", // Keep existing name if any
          details: prev.details || ""
        }));
      } else {
        setTempAddress(prev => ({
          ...prev,
          label: searchQuery.trim(),
          phone: prev.phone || "", // Keep existing phone if any
          details: prev.details || ""
        }));
      }
    }
  } else if (!searchQuery.trim() && isAdding) {
    // If search is cleared while form is open, close the form
    setIsAdding(false);
  }
}, [searchQuery, isLikelyPhoneNumber, user?.role, savedAddresses, setSelectedAddress, isAdding]);

// Also update the form fields in real-time while form is open
useEffect(() => {
  if (isAdding && searchQuery.trim() && user?.role === "sale") {
    // Update form fields in real-time as user continues typing
    if (isLikelyPhoneNumber) {
      setTempAddress(prev => ({
        ...prev,
        phone: searchQuery.trim(),
        // Don't clear label field - user might be editing it separately
      }));
    } else {
      setTempAddress(prev => ({
        ...prev,
        label: searchQuery.trim(),
        // Don't clear phone field - user might be editing it separately
      }));
    }
  }
}, [searchQuery, isLikelyPhoneNumber, isAdding, user?.role]);

  // Clear form fields when form disappears
  useEffect(() => {
    if (!isAdding && !searchQuery.trim() && user?.role === "sale") {
      setTempAddress({
        label: "",
        phone: user?.role === "sale" ? "" : getPhoneFromUser(user) || "",
        details: "",
        coordinates: { lat: 0, lng: 0 },
        api_user_id: user?.id,
      });
    }
  }, [isAdding, searchQuery, user]);

  // Helper to extract phone from user object
  const getPhoneFromUser = (userData: any): string | null => {
    if (!userData) return null;

    if (userData.phone && userData.phone.trim()) return userData.phone.trim();
    if (userData.mobile && userData.mobile.trim()) return userData.mobile.trim();
    if (userData.contact?.mobile && userData.contact.mobile.trim()) return userData.contact.mobile.trim();
    if (userData.contact?.phone && userData.contact.phone.trim()) return userData.contact.phone.trim();

    return null;
  };

  const userPhone = getPhoneFromUser(user);

  const handleDetectCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
  
    setIsDetectingLocation(true);
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
  
      const { latitude, longitude } = position.coords;
      const coordinates = { lat: latitude, lng: longitude };
      
      // Update tempAddress directly
      setTempAddress(prev => ({
        ...prev,
        coordinates: coordinates
      }));
      
      console.log('Coordinates detected:', coordinates);
      
      // Also update context if needed
      setCurrentAddress({
        coordinates: coordinates,
        label: "Current Location",
        details: "Your current location"
      });
      
      setSelectedAddress("current");
      toast.success("Current location detected!");
    } catch (error: any) {
      console.error("Geolocation error:", error);
      let errorMessage = "Failed to detect location";
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location permission denied. Please enable location services.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information is unavailable.";
          break;
        case error.TIMEOUT:
          errorMessage = "Location request timed out.";
          break;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        toast.error("Please upload an image file");
        return;
      }
  
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
  
      setImageFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      console.log("Image file selected:", file.name, file.size, file.type);
    }
  };

  const handleSelectSavedAddress = (addr: ExtendedAddress) => {
    setSelectedAddress(addr);
    setShowSearchResults(true);
    setIsAdding(false); // Close the form since we selected an existing customer
    // Don't clear search query - keep it visible as feedback
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setTempAddress({
        ...tempAddress,
        coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() },
      });
    }
  };

  const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setTempAddress({
        ...tempAddress,
        coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() },
      });
    }
  };

// Handle search input change
const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setSearchQuery(value);

  if (value.trim()) {
    setShowSearchResults(true);
  } else {
    setShowSearchResults(false);
    // Only close form if search is completely cleared
    setIsAdding(false);
    setSelectedAddress('current');
  }
};

  // Save new address
const handleSaveNewAddress = async () => {
  if (!tempAddress.label?.trim()) {
    toast.error(
      user?.role === "sale"
        ? "Please enter customer name"
        : "Please enter a name/label for the address"
    );
    return;
  }

  if (user?.role === "sale") {
    if (!tempAddress.phone?.trim()) {
      toast.error("Please enter customer phone number");
      return;
    }
    
    // Check for duplicate phone number
    const phoneExists = savedAddresses.some(addr => 
      addr.phone?.trim() === tempAddress.phone?.trim() && 
      addr.id !== tempAddress.id // Skip current if editing
    );
    
    if (phoneExists) {
      toast.error("A customer with this phone number already exists");
      return;
    }
  } else {
    if (!userPhone?.trim()) {
      toast.error("Please add your phone number in account settings");
      return;
    }
  }

  if (!tempAddress.details?.trim()) {
    toast.error("Please enter address details");
    return;
  }

  if (!tempAddress.coordinates || tempAddress.coordinates.lat === 0) {
    toast.error("Please select a location on the map");
    return;
  }

  const finalPhone = user?.role === "sale"
    ? (tempAddress.phone || "").trim()
    : userPhone?.trim();

  if (!finalPhone) {
    toast.error(
      user?.role === "sale"
        ? "Please enter customer's phone number"
        : "Please add your phone number in account settings"
    );
    return;
  }

  if (!tempAddress.api_user_id) {
    toast.error("User not authenticated");
    return;
  }

  setLoading(true);

  try {
    // Create FormData to handle file upload
    const formData = new FormData();
    formData.append('label', (tempAddress.label || "").trim());
    formData.append('phone', finalPhone);
    formData.append('details', (tempAddress.details || "").trim());
    formData.append('api_user_id', String(tempAddress.api_user_id));
    
    if (tempAddress.coordinates) {
      formData.append('coordinates[lat]', String(tempAddress.coordinates.lat));
      formData.append('coordinates[lng]', String(tempAddress.coordinates.lng));
    }
    
    // Append image file if exists
    if (imageFile) {
      formData.append('place_pic', imageFile);
    }

    console.log("Saving address with image:", imageFile ? "Yes" : "No");

    const res = await api.post("/addresses", formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    const apiResponse = res.data?.data;

    const newAddress: ExtendedAddress = {
      ...apiResponse,
      id: apiResponse.id,
      label: apiResponse.label,
      phone: apiResponse.phone,
      details: apiResponse.details,
      coordinates: apiResponse.coordinates,
      api_user_id: apiResponse.api_user_id,
      place_pic: apiResponse.place_pic
    };

    setSavedAddresses((prev) => [...prev, newAddress]);
    setSelectedAddress(newAddress);
    setIsAdding(false);
    setSearchQuery(newAddress.label || "");
    setShowSearchResults(true);
    setCurrentPage(1);

    // Reset form fields AND image
    setTempAddress({
      label: "",
      phone: user?.role === "sale" ? "" : userPhone || "",
      details: "",
      coordinates: { lat: 0, lng: 0 },
      api_user_id: user?.id,
    });
    setImageFile(null);
    setImagePreview(null);

    toast.success("Address saved successfully");
  } catch (err: any) {
    console.error("Save address error:", err);
    if (err.response?.status === 422) {
      // Handle validation errors from backend
      const errors = err.response.data.errors;
      if (errors?.phone) {
        toast.error("Phone number already exists.");
      } else {
        toast.error("Validation failed. Please check your input.");
      }
    } else {
      toast.error(err.response?.data?.message || "Failed to save address");
    }
  } finally {
    setLoading(false);
  }
};

  // FIXED: Handle payment method selection
  const handlePaymentMethodSelect = (methodName: string) => {
    const selectedMethod = paymentMethods.find(m => m.name === methodName);
    
    if (selectedMethod) {
      setPaymentMethod(methodName);
      
      if (methodName === (t.QR || 'QR')) {
        setShowQRPopup(true);
      } else if (selectedMethod.type === 'custom') {
        toast.info(`Selected custom payment: ${methodName}`);
      }
    }
  };

  const handleDownloadQR = () => {
    try {
      const link = document.createElement("a");
      link.download = "payment-qr-code.png";
      link.href = "/qr.jpg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("QR code downloaded");
    } catch (error) {
      toast.error("Failed to download QR code");
    }
  };

  // Pagination handlers
  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value);
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  // Handle adding new customer for sales
  const handleAddNewCustomer = () => {
    setIsAdding(true);
    setSearchQuery("");
    setShowSearchResults(false);
    setTempAddress({
      label: "",
      phone: "",
      details: "",
      coordinates: { lat: 0, lng: 0 },
      api_user_id: user?.id,
    });
  };

  // Clear search and reset form
  const handleClearSearch = () => {
    setSearchQuery("");
    setShowSearchResults(false);
    setIsAdding(false);
    setSelectedAddress('current');
    setTempAddress({
      label: "",
      phone: user?.role === "sale" ? "" : userPhone || "",
      details: "",
      coordinates: { lat: 0, lng: 0 },
      api_user_id: user?.id,
    });
  };

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto hide-scrollbar pb-24">
      <Header title={t.checkout} />

      {/* Sales Mode: Search and Customer Management */}
      {user?.role === "sale" && (
        <div className="space-y-3">
          {/* Search Bar - Always visible */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search customer by name or phone number..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="absolute left-3 top-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Selected Customer Display - Always visible when customer is selected */}
          {isCustomerSelected && (
            <div className="p-4 border border-green-300 bg-green-50 rounded-xl">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Selected Customer:</h3>
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">{(selectedAddress as ExtendedAddress).label}</p>
                    <p className="text-sm text-gray-600">Phone: {(selectedAddress as ExtendedAddress).phone}</p>
                    <p className="text-sm text-gray-600">Address: {(selectedAddress as ExtendedAddress).details}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedAddress('current');
                    setSearchQuery("");
                    setShowSearchResults(false);
                    setIsAdding(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Show search results ONLY when actively searching (typing) */}
          {isSearching && showSearchResults && !isCustomerSelected && (
            <div className="space-y-3">
              {/* Search Results Header */}
              <div className="text-sm text-gray-500">
                {filteredAddresses.length > 0 ? (
                  <div className="flex justify-between items-center">
                    <span>Found {filteredAddresses.length} customer(s)</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span>No customer found with "{searchQuery}"</span>
                    <button
                      onClick={handleAddNewCustomer}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      + Add New Customer
                    </button>
                  </div>
                )}
              </div>

              {/* Search Results - Customer List (only when not adding new) */}
              {!isAdding && paginatedAddresses.map((addr) => (
                <div
                  key={addr.id}
                  onClick={() => handleSelectSavedAddress(addr)}
                  className={`p-4 rounded-xl border cursor-pointer flex flex-col transition ${selectedAddress &&
                    typeof selectedAddress !== 'string' &&
                    (selectedAddress as ExtendedAddress).id === addr.id
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                    : "border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{addr.label}</p>
                        {selectedAddress &&
                          typeof selectedAddress !== 'string' &&
                          (selectedAddress as ExtendedAddress).id === addr.id && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                              Selected
                            </span>
                          )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Phone: {addr.phone}</p>
                      <p className="text-sm text-gray-600 mt-1">{addr.details}</p>
                    </div>
                    <span className="text-blue-500 text-lg">📍</span>
                  </div>
                </div>
              ))}

              {/* Pagination Controls for Search Results */}
              {!isAdding && totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 p-4 border border-gray-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1}
                      className={`px-3 py-1 border rounded ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    >
                      ← Previous
                    </button>

                    <div className="flex gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => goToPage(page)}
                          className={`w-8 h-8 rounded-full ${currentPage === page ? 'bg-blue-600 text-white' : 'border hover:bg-gray-50'}`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className={`px-3 py-1 border rounded ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    >
                      Next →
                    </button>
                  </div>

                  <div className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CUSTOMER FORM MODAL - Shows when adding new customer */}
          {isAdding && (
            <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
              <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Add New Customer
                  </h3>
                  <button
                    onClick={() => {
                      setIsAdding(false);
                      // Clear search if we cancel adding new customer
                      if (searchQuery.trim() && !savedAddresses.some(addr => 
                        addr.label?.toLowerCase() === searchQuery.trim().toLowerCase() ||
                        addr.phone === searchQuery.trim()
                      )) {
                        setSearchQuery("");
                      }
                    }}
                    className="text-gray-400 hover:text-gray-600 text-2xl p-1"
                  >
                    ×
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4">
                  {/* Name Field - Auto-populated from search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Enter customer name"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={tempAddress.label || ""}
                      onChange={(e) => setTempAddress({ ...tempAddress, label: e.target.value })}
                    />
                  </div>

                  {/* Phone Field - Auto-populated from search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone *
                      {tempAddress.phone?.trim() && savedAddresses.some(addr => 
                        addr.phone?.trim() === tempAddress.phone?.trim() && 
                        addr.id !== tempAddress.id
                      ) && (
                        <span className="ml-2 text-xs text-red-600">
                          ⚠️ Phone number already exists
                        </span>
                      )}
                    </label>
                    <input
                      type="tel"
                      placeholder="Customer phone number"
                      className={`w-full p-3 border rounded-lg focus:ring-2 focus:border-blue-500 ${
                        tempAddress.phone?.trim() && savedAddresses.some(addr => 
                          addr.phone?.trim() === tempAddress.phone?.trim() && 
                          addr.id !== tempAddress.id
                        )
                          ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500"
                          : "border-gray-300 focus:ring-blue-500"
                      }`}
                      value={tempAddress.phone || ""}
                      onChange={(e) => setTempAddress({ ...tempAddress, phone: e.target.value })}
                    />
                    {tempAddress.phone?.trim() && savedAddresses.some(addr => 
                      addr.phone?.trim() === tempAddress.phone?.trim() && 
                      addr.id !== tempAddress.id
                    ) && (
                      <p className="mt-1 text-xs text-red-600">
                        A customer with this phone number already exists. Please use a different phone number.
                      </p>
                    )}
                  </div>

                  {/* Address Details with GPS Button */}
                  <div className="w-full">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Address Details *
                    </label>
                    
                    <div className="flex gap-2 items-stretch">
                      {/* Textarea */}
                      <div className="flex-[2.5]">
                        <textarea
                          placeholder="Street, building, floor..."
                          className="w-full h-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                          value={tempAddress.details || ""}
                          onChange={(e) => setTempAddress({ ...tempAddress, details: e.target.value })}
                          rows={3}
                        />
                      </div>

                      {/* GPS Button - Compact but vertically tall to match textarea */}
                      <div className="flex-1 min-w-[100px]">
                        <button
                          type="button"
                          onClick={handleDetectCurrentLocation}
                          disabled={isDetectingLocation}
                          className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                            isDetectingLocation 
                              ? "bg-gray-100 border-gray-200" 
                              : tempAddress.coordinates && tempAddress.coordinates.lat !== 0
                                ? "bg-green-50 border-green-500 text-green-700 shadow-inner"
                                : "bg-blue-600 border-blue-600 text-white shadow-md active:bg-blue-700"
                          }`}
                        >
                          {isDetectingLocation ? (
                            <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <>
                              <div className="text-xl mb-1">
                                {tempAddress.coordinates && tempAddress.coordinates.lat !== 0 ? "✅" : "📍"}
                              </div>
                              <span className="text-[10px] font-bold uppercase text-center leading-tight">
                                {tempAddress.coordinates && tempAddress.coordinates.lat !== 0 ? "Saved" : "Tap GPS"}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Error message below the row */}
                    {!tempAddress.coordinates && !isDetectingLocation && (
                      <p className="text-[10px] font-medium text-red-500 mt-1.5 flex items-center gap-1">
                        <span>⚠️</span> Required: Tap the GPS button
                      </p>
                    )}
                  </div>

                  {/* Image Upload Area */}
                  <div className="border-2 border-dashed border-gray-300 rounded-xl h-40 relative flex items-center justify-center overflow-hidden">
                    {imagePreview ? (
                      <>
                        <img src={imagePreview} className="w-full h-full object-cover" alt="Location preview" />
                        <button 
                          onClick={() => {setImagePreview(""); setImageFile(null);}} 
                          className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full text-xs"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <label className="flex flex-col items-center cursor-pointer">
                        <span className="text-3xl">📸</span>
                        <span className="text-sm text-gray-500">Capture Location Photo</span>
                        <input 
                          type="file" 
                          capture="environment" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleImageUpload} 
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setIsAdding(false);
                        // Clear search if we cancel adding new customer
                        if (searchQuery.trim() && !savedAddresses.some(addr => 
                          addr.label?.toLowerCase() === searchQuery.trim().toLowerCase() ||
                          addr.phone === searchQuery.trim()
                        )) {
                          setSearchQuery("");
                        }
                      }}
                      className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                    >
                      Cancel
                    </button>
                    <button
  onClick={handleSaveNewAddress}
  disabled={
    !tempAddress.label?.trim() ||
    !tempAddress.phone?.trim() ||
    !tempAddress.details?.trim() ||
    !tempAddress.coordinates ||
    tempAddress.coordinates.lat === 0
  }
  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
>
  Save Customer
</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALWAYS show products and payment methods when shouldShowMainContent is true */}
      {(!isSearching || isCustomerSelected) && shouldShowMainContent && (
        <>
          {/* Order Summary - ALWAYS visible when not searching or customer is selected */}
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-gray-800">{t.orderSummary}</h2>
            {cart.length === 0 && <p>{t.yourCartIsEmpty}</p>}

            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b border-gray-300 p-3 gap-3"
              >
                <img
                  src={item.image && item.image.trim() ? IMAGE_URL + item.image : "https://syspro.asia/img/default.png"}
                  alt={item.title}
                  className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-gray-600">
                    ${item.price.toFixed(2)} × {item.qty} = ${(item.price * item.qty).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateItemQty(item.id, Math.max(1, item.qty - 1))}
                    className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    -
                  </button>
                  <span className="w-6 text-center">{item.qty}</span>
                  <button
                    onClick={() => updateItemQty(item.id, item.qty + 1)}
                    className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Shipping Address Section for Regular Users */}
          {user?.role !== "sale" && (
            <section className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold text-gray-800">{t.shippingAddress}</h2>

              {/* Current Location */}
              <div
                onClick={handleDetectCurrentLocation}
                className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition ${selectedAddress === "current" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                  } ${isDetectingLocation ? "opacity-70" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-blue-500 text-xl">📍</span>
                  <div>
                    <p className="font-semibold">{t.currentLocation || "Current Location"}</p>
                    <p className="text-sm text-gray-500">
                      {isDetectingLocation
                        ? t.detectingYourCurrentLocation
                        : currentAddress
                          ? t.clickToUseYourCurrentLocation
                          : t.clickToDetectYourCurrentLocation}
                    </p>
                  </div>
                </div>
                {isDetectingLocation && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                )}
              </div>

              {/* Regular Users: Saved Addresses List */}
              {!isAdding && savedAddresses.length > 0 && (
                <div className="flex flex-col gap-3">
                  {savedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      onClick={() => setSelectedAddress(addr)}
                      className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition ${selectedAddress && typeof selectedAddress !== 'string' && (selectedAddress as ExtendedAddress).id === addr.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-xl">🏠</span>
                        <div>
                          <p className="font-semibold">{addr.label}</p>
                          <p className="text-sm text-gray-600">{addr.details}</p>
                          <p className="text-xs text-gray-500 mt-1">{addr.phone}</p>
                        </div>
                      </div>
                      {selectedAddress && typeof selectedAddress !== 'string' && (selectedAddress as ExtendedAddress).id === addr.id && (
                        <span className="text-blue-500 font-bold">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Address Button */}
              {!isAdding && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="mt-2 w-full py-3 bg-gray-100 border border-dashed border-gray-300 rounded-xl hover:bg-gray-50 font-medium flex items-center justify-center gap-2"
                >
                  <span className="text-xl">+</span>
                  {t.addNewAddress}
                </button>
              )}

              {/* ADDRESS FORM MODAL - Similar to ShippingAddressPage */}
              {isAdding && user?.role !== "sale" && (
                <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
                  <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                    {/* Modal Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-gray-800">
                        Add New Address
                      </h3>
                      <button
                        onClick={() => {
                          setIsAdding(false);
                          setTempAddress({
                            label: "",
                            phone: userPhone || "",
                            details: "",
                            coordinates: { lat: 0, lng: 0 },
                            api_user_id: user?.id,
                          });
                        }}
                        className="text-gray-400 hover:text-gray-600 text-2xl p-1"
                      >
                        ×
                      </button>
                    </div>

                    {/* Modal Body */}
                    <div className="p-6 space-y-4">
                      {/* Label Field */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Address Label *
                        </label>
                        <input
                          type="text"
                          placeholder="Home, Work, etc."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={tempAddress.label || ""}
                          onChange={(e) => setTempAddress({ ...tempAddress, label: e.target.value })}
                        />
                      </div>

                      {/* Phone Field - Readonly from account */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Phone *
                        </label>
                        <div className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50">
                          {userPhone ? userPhone : "No phone in profile"}
                        </div>
                      </div>

                      {/* Address Details with GPS Button */}
                      <div className="w-full">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Address Details *
                        </label>
                        
                        <div className="flex gap-2 items-stretch">
                          {/* Textarea */}
                          <div className="flex-[2.5]">
                            <textarea
                              placeholder="Street, building, floor..."
                              className="w-full h-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                              value={tempAddress.details || ""}
                              onChange={(e) => setTempAddress({ ...tempAddress, details: e.target.value })}
                              rows={3}
                            />
                          </div>

                          {/* GPS Button - Compact but vertically tall to match textarea */}
                          <div className="flex-1 min-w-[100px]">
                            <button
                              type="button"
                              onClick={handleDetectCurrentLocation}
                              disabled={isDetectingLocation}
                              className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                                isDetectingLocation 
                                  ? "bg-gray-100 border-gray-200" 
                                  : tempAddress.coordinates && tempAddress.coordinates.lat !== 0
                                    ? "bg-green-50 border-green-500 text-green-700 shadow-inner"
                                    : "bg-blue-600 border-blue-600 text-white shadow-md active:bg-blue-700"
                              }`}
                            >
                              {isDetectingLocation ? (
                                <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              ) : (
                                <>
                                  <div className="text-xl mb-1">
                                    {tempAddress.coordinates && tempAddress.coordinates.lat !== 0 ? "✅" : "📍"}
                                  </div>
                                  <span className="text-[10px] font-bold uppercase text-center leading-tight">
                                    {tempAddress.coordinates && tempAddress.coordinates.lat !== 0 ? "Saved" : "Tap GPS"}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Error message below the row */}
                        {!tempAddress.coordinates && !isDetectingLocation && (
                          <p className="text-[10px] font-medium text-red-500 mt-1.5 flex items-center gap-1">
                            <span>⚠️</span> Required: Tap the GPS button
                          </p>
                        )}
                      </div>

                      {/* Image Upload Area */}
                      <div className="border-2 border-dashed border-gray-300 rounded-xl h-40 relative flex items-center justify-center overflow-hidden">
                        {imagePreview ? (
                          <>
                            <img src={imagePreview} className="w-full h-full object-cover" alt="Location preview" />
                            <button 
                              onClick={() => {setImagePreview(""); setImageFile(null);}} 
                              className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full text-xs"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <label className="flex flex-col items-center cursor-pointer">
                            <span className="text-3xl">📸</span>
                            <span className="text-sm text-gray-500">Capture Location Photo</span>
                            <input 
                              type="file" 
                              capture="environment" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleImageUpload} 
                            />
                          </label>
                        )}
                      </div>

                      {/* Map Selection Button */}
                      <div 
                        onClick={() => setShowMap(true)}
                        className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center text-center"
                      >
                        {tempAddress.coordinates && tempAddress.coordinates.lat !== 0 ? (
                          <div className="text-center">
                            <div className="text-green-600 text-lg mb-1">✓ Location Selected</div>
                            <p className="text-sm text-gray-600">
                              Lat: {tempAddress.coordinates.lat.toFixed(6)}
                              <br />
                              Lng: {tempAddress.coordinates.lng.toFixed(6)}
                            </p>
                            {tempAddress.details && (
                              <p className="text-xs text-gray-500 mt-2 truncate max-w-full">
                                {tempAddress.details}
                              </p>
                            )}
                            <p className="text-xs text-blue-600 mt-2">Click to change location</p>
                          </div>
                        ) : (
                          <>
                            <div className="text-gray-400 text-2xl mb-2">📍</div>
                            <p className="text-gray-600 font-medium">Click to select location on map</p>
                            <p className="text-sm text-gray-500 mt-1">
                              Select location by clicking on the map
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setIsAdding(false);
                            setTempAddress({
                              label: "",
                              phone: userPhone || "",
                              details: "",
                              coordinates: { lat: 0, lng: 0 },
                              api_user_id: user?.id,
                            });
                          }}
                          className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNewAddress}
                          disabled={
                            !tempAddress.label?.trim() ||
                            !tempAddress.details?.trim() ||
                            !tempAddress.coordinates ||
                            tempAddress.coordinates.lat === 0
                          }
                          className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
                        >
                          Save Address
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

{/* ==================== Payment Method Section ==================== */}
{<section className="flex flex-col gap-3">
  <h2 className="text-2xl font-semibold text-gray-800">{t.paymentMethod}</h2>
  
  {/* Payment Methods List */}
  {paymentMethodsToShow.map((method) => (
    <div
      key={method.name}
      onClick={() => handlePaymentMethodSelect(method.name)}
      className={`cursor-pointer border rounded-xl p-5 flex flex-col gap-2 transition-shadow ${
        paymentMethod === method.name
          ? method.type === 'custom' 
            ? "border-green-500 bg-green-50 shadow-lg" 
            : "border-blue-500 bg-blue-50 shadow-lg"
          : "border-gray-200 hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-4">
        <img
          src={method.image}
          alt={method.name}
          className="w-12 h-12 object-contain"
          onError={(e) => (e.currentTarget.src = "https://syspro.asia/img/default.png")}
        />
        <div>
          <p className="font-semibold text-gray-700">{method.name}</p>
          <p className="text-xs text-gray-500">
            {method.type === 'default' 
              ? method.name === 'QR' ? 'Scan QR code to pay' : 'Pay with cash on delivery'
              : ''}
          </p>
        </div>
      </div>
    </div>
  ))}

  {/* Show More/Less Button */}
  {paymentMethods.length > maxInitialPaymentMethods && (
    <button
      onClick={() => setShowAllPaymentMethods(!showAllPaymentMethods)}
      className="mt-2 p-3 border border-dashed border-gray-300 rounded-xl hover:bg-gray-50 text-gray-600 font-medium flex items-center justify-center gap-2"
    >
      {showAllPaymentMethods ? (
        <>
          <span>↑</span>
          Show Less
        </>
      ) : (
        <>
          <span>↓</span>
          Show More ({paymentMethods.length - defaultPaymentMethodsCount} more)
        </>
      )}
    </button>
  )}
</section>}
        </>
      )}

      {/* Map Modal */}
      {showMap && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 w-[90%] max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t.selectLocation}</h3>
              <button
                onClick={() => setShowMap(false)}
                className="text-gray-500 hover:text-gray-700 text-xl p-1"
              >
                ✕
              </button>
            </div>

            <GoogleMap
              mapContainerStyle={containerStyle}
              center={tempAddress.coordinates || { lat: 0, lng: 0 }}
              zoom={15}
              onClick={handleMapClick}
            >
              {tempAddress.coordinates && (
                <Marker
                  position={tempAddress.coordinates}
                  draggable
                  onDragEnd={handleMarkerDragEnd}
                />
              )}
            </GoogleMap>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700">{t.selectedCoordinates}:</p>
              {tempAddress.coordinates ? (
                <p className="text-sm text-gray-600 mt-1">
                  Lat: {tempAddress.coordinates.lat.toFixed(6)}
                  <br />
                  Lng: {tempAddress.coordinates.lng.toFixed(6)}
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">{t.clickToSelectLocation}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setTempAddress({ ...tempAddress, coordinates: undefined })}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                {t.clear}
              </button>
              <button
                onClick={() => {
                  setShowMap(false);
                  toast.success("Location selected successfully!");
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={!tempAddress.coordinates}
              >
                {t.select}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Popup */}
      {showQRPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">Scan QR Code</h3>
                <p className="text-sm text-gray-500">Scan with your bank app to pay</p>
              </div>
              <button
                onClick={() => setShowQRPopup(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl p-1"
              >
                ×
              </button>
            </div>

            <div className="text-center mb-6">
              <div className="mb-4 p-4 border rounded-lg bg-white inline-block">
                <img
                  src="/qr.jpg"
                  alt="Payment QR Code"
                  className="w-64 h-64 mx-auto"
                  onError={(e) => (e.currentTarget.src = "https://syspro.asia/img/default.png")}
                />
                <p className="text-xs text-gray-500 mt-2">Amount: ${total.toFixed(2)}</p>
              </div>

              <button
                onClick={handleDownloadQR}
                className="py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 w-full flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download QR
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setShowQRPopup(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedCheckoutPage;