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
};

// Payment Method Interface
type PaymentMethodType = {
  id: string;
  name: string;
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

  // State to control when to show search results
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Payment methods state - FIXED: Initialize with proper structure
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodType[]>([
    { id: 'qr', name: t.QR || 'QR', image: "/qr.jpg", type: 'default' },
    { id: 'cash', name: t.cash || 'Cash', image: "/cash.jpg", type: 'default' },
  ]);

  const IMAGE_URL = process.env.NEXT_PUBLIC_IMAGE_URL!;
  const currentSelectedAddress = selectedAddress === "current" ? currentAddress : selectedAddress;

// FIXED VERSION of the custom payment fetch:
useEffect(() => {
  const fetchCustomPaymentMethods = async () => {
    try {
      setLoading(true);
      const response = await api.get('/business/1/custom-payments');
      
      if (response.data.success && response.data.custom_payments) {
        const customPayments = response.data.custom_payments;
        const customMethods: any[] = [];
        
        // SAFER: Use Object.entries instead of keyof
        Object.entries(customPayments).forEach(([key, value]) => {
          if (key.startsWith('custom_pay_') && value && value !== null) {
            customMethods.push({
              id: key,
              name: value,
              image: `/${key}.jpg` || '/payment-default.jpg',
              type: 'custom' as const
            });
          }
        });
        
        setPaymentMethods(prev => [...prev, ...customMethods]);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      toast.error('Failed to load custom payment methods');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    fetchCustomPaymentMethods();
  }
}, [user, setLoading]);

  // Check if user is actively searching or has search results
  const isSearching = useMemo(() => {
    return searchQuery.trim().length > 0 || showSearchResults;
  }, [searchQuery, showSearchResults]);

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

  // Determine if search query starts with a number (phone) or not (name)
  const isLikelyPhoneNumber = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const firstChar = searchQuery.trim().charAt(0);
    return /^\d/.test(firstChar);
  }, [searchQuery]);

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

  // Update form fields in real-time as user types in search
  useEffect(() => {
    if (searchQuery.trim() && user?.role === "sale") {
      if (isLikelyPhoneNumber) {
        setTempAddress(prev => ({
          ...prev,
          phone: searchQuery.trim(),
          label: prev.label || ""
        }));
      } else {
        setTempAddress(prev => ({
          ...prev,
          label: searchQuery.trim(),
          phone: prev.phone || ""
        }));
      }
    }
  }, [searchQuery, isLikelyPhoneNumber, user?.role]);

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
    setIsDetectingLocation(true);
    try {
      await detectCurrentLocation();
      setSelectedAddress("current");
      toast.success("Current location detected!");
    } catch (err: any) {
      toast.error(err.message || "Failed to detect location");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleSelectSavedAddress = (addr: ExtendedAddress) => {
    setSelectedAddress(addr);
    setIsAdding(false);
    setShowSearchResults(true);
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
      setIsAdding(true);
    } else {
      setShowSearchResults(false);
      setIsAdding(false);
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

    if (!tempAddress.coordinates) {
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
      const addressData: APIAddress = {
        label: (tempAddress.label || "").trim(),
        phone: finalPhone,
        details: (tempAddress.details || "").trim(),
        coordinates: tempAddress.coordinates,
        api_user_id: tempAddress.api_user_id,
      };

      console.log("Saving address:", addressData);

      const res = await api.post("/addresses", addressData);
      const apiResponse = res.data?.data;

      const newAddress: ExtendedAddress = {
        ...apiResponse,
        id: apiResponse.id,
        label: apiResponse.label,
        phone: apiResponse.phone,
        details: apiResponse.details,
        coordinates: apiResponse.coordinates,
        api_user_id: apiResponse.api_user_id,
      };

      setSavedAddresses((prev) => [...prev, newAddress]);
      setSelectedAddress(newAddress);
      setIsAdding(false);
      setSearchQuery(newAddress.label || "");
      setShowSearchResults(true);
      setCurrentPage(1);

      // Reset form fields
      setTempAddress({
        label: "",
        phone: user?.role === "sale" ? "" : userPhone || "",
        details: "",
        coordinates: { lat: 0, lng: 0 },
        api_user_id: user?.id,
      });

      toast.success("Address saved successfully");
    } catch (err: any) {
      console.error("Save address error:", err);
      toast.error(err.response?.data?.message || "Failed to save address");
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
          {/* Search Bar */}
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

          {/* Selected Customer Display */}
          {selectedAddress && typeof selectedAddress !== 'string' && (
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

          {/* Show search results when searching OR when a customer is selected */}
          {(showSearchResults || (selectedAddress && typeof selectedAddress !== 'string')) && searchQuery.trim() && (
            <div className="space-y-3">
              {/* Search Results Header */}
              <div className="text-sm text-gray-500">
                {filteredAddresses.length > 0 ? (
                  <div className="flex justify-between items-center">
                    <span>Found {filteredAddresses.length} customer(s)</span>
                    {selectedAddress && typeof selectedAddress !== 'string' && (
                      <span className="text-blue-600 font-medium">
                        ✓ Selected
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span>No customer found with "{searchQuery}"</span>
                  </div>
                )}
              </div>

              {/* Search Results - Customer List */}
              {paginatedAddresses.map((addr) => (
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
              {totalPages > 1 && (
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

          {/* Customer Form - Show when actively adding OR when searching with no results */}
          {(isAdding || (searchQuery.trim() && filteredAddresses.length === 0)) && (
            <div className="bg-white flex flex-col gap-4 p-4 border border-gray-200 rounded-xl mt-3">
              <h3 className="text-lg font-semibold text-gray-800">
                {selectedAddress && typeof selectedAddress !== 'string'
                  ? "Update Customer Details"
                  : filteredAddresses.length === 0 && searchQuery.trim()
                    ? "Create New Customer"
                    : "Add New Customer"}
              </h3>

              {/* Name / Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name *
                  {isLikelyPhoneNumber && searchQuery.trim() && (
                    <span className="text-xs text-gray-500 ml-2">(Detected as phone number, please enter name)</span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="Enter customer name"
                  value={tempAddress.label || ""}
                  onChange={(e) => setTempAddress({ ...tempAddress, label: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.phone} *
                  {!isLikelyPhoneNumber && searchQuery.trim() && (
                    <span className="text-xs text-gray-500 ml-2">(Detected as name, please enter phone number)</span>
                  )}
                </label>
                <input
                  type="tel"
                  placeholder="Customer phone number"
                  value={tempAddress.phone || ""}
                  onChange={(e) => setTempAddress({ ...tempAddress, phone: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Address Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.details} *
                </label>
                <div className="flex justify-between items-center gap-2">
                  <textarea
                    placeholder="#123, Sen Sok"
                    value={tempAddress.details || ""}
                    onChange={(e) => setTempAddress({ ...tempAddress, details: e.target.value })}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                  {salesUser?.role === 'salesOnline' && <input
                    type="button"
                    readOnly
                    value={t.clickToSelectLocation}
                    onClick={() => setShowMap(true)}
                    className="p-2 border rounded-lg text-white cursor-pointer bg-blue-500 hover:bg-blue-600"
                    placeholder={t.clickToSelectLocation}
                  />}
                  {salesUser?.role === 'salesOnField' && <input
                    type="button"
                    readOnly
                    value={t.currentLocation}
                    onClick={handleDetectCurrentLocation}
                    className="p-2 border rounded-lg text-white cursor-pointer bg-blue-500 hover:bg-blue-600"
                    placeholder={t.currentLocation}
                  />}
                </div>
              </div>

              {/* Location Picker */}
              <div>
                {!tempAddress.coordinates && (
                  <p className="text-sm text-red-500 mt-1">{t.pleaseSelectALocationOnTheMap}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveNewAddress}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
                  disabled={
                    !tempAddress.details?.trim() ||
                    !tempAddress.coordinates ||
                    !tempAddress.label?.trim() ||
                    !tempAddress.phone?.trim()
                  }
                >
                  {selectedAddress && typeof selectedAddress !== 'string' ? "Update Customer" : "Save Customer"}
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setSearchQuery("");
                    setShowSearchResults(false);
                    setTempAddress({
                      label: "",
                      phone: "",
                      details: "",
                      coordinates: { lat: 0, lng: 0 },
                      api_user_id: user?.id,
                    });
                  }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hide other sections when searching */}
      {!isSearching && (
        <>
          {/* Order Summary */}
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

          {/* Shipping Address Section */}
          <section className="flex flex-col gap-3">
            {user?.role !== "sale" && <h2 className="text-2xl font-semibold text-gray-800">{t.shippingAddress}</h2>}

            {/* Current Location */}
            {user?.role !== "sale" && (
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
            )}

            {/* Regular Users: Saved Addresses List */}
            {user?.role !== "sale" && !isAdding && savedAddresses.length > 0 && (
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

            {/* Regular Users: Add New Address Button / Form */}
            {user?.role !== "sale" && isAdding ? (
              <div className="bg-white flex flex-col gap-4 p-4 border border-gray-200 rounded-xl">
                {/* Name / Label */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Label *
                  </label>
                  <input
                    type="text"
                    placeholder="Home, Work, etc."
                    value={tempAddress.label || ""}
                    onChange={(e) => setTempAddress({ ...tempAddress, label: e.target.value })}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.phone} *
                  </label>
                  <div className="w-full p-3 border rounded-lg bg-gray-50 text-gray-700">
                    {userPhone ? `${userPhone} (from account)` : "No phone in profile"}
                  </div>
                </div>

                {/* Address Details */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.details || "Address Details"} *
                  </label>
                  <textarea
                    placeholder="Street, building, floor, notes..."
                    value={tempAddress.details || ""}
                    onChange={(e) => setTempAddress({ ...tempAddress, details: e.target.value })}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>

                {/* Location Picker */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.clickToSelectLocation} *
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={
                      tempAddress.coordinates
                        ? `Lat: ${tempAddress.coordinates.lat.toFixed(5)}, Lng: ${tempAddress.coordinates.lng.toFixed(5)}`
                        : ""
                    }
                    onClick={() => setShowMap(true)}
                    className="w-full p-3 border rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                    placeholder={t.clickToSelectLocation}
                  />
                  {!tempAddress.coordinates && (
                    <p className="text-sm text-red-500 mt-1">{t.pleaseSelectALocationOnTheMap}</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveNewAddress}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
                    disabled={
                      !tempAddress.details?.trim() ||
                      !tempAddress.coordinates ||
                      !tempAddress.label?.trim() ||
                      !userPhone?.trim()
                    }
                  >
                    {t.saveAddress}
                  </button>
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
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : user?.role !== "sale" ? (
              <button
                onClick={() => setIsAdding(true)}
                className="mt-2 w-full py-3 bg-gray-100 border border-dashed border-gray-300 rounded-xl hover:bg-gray-50 font-medium flex items-center justify-center gap-2"
              >
                <span className="text-xl">+</span>
                {t.addNewAddress}
              </button>
            ) : null}
          </section>

          {/* ==================== FIXED: Payment Method Section ==================== */}
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-gray-800">{t.paymentMethod}</h2>
            
            {/* QR Payment Method */}
            <div
              onClick={() => handlePaymentMethodSelect(t.QR || 'QR')}
              className={`cursor-pointer border rounded-xl p-5 flex flex-col gap-2 transition-shadow ${
                paymentMethod === t.QR ? "border-blue-500 bg-blue-50 shadow-lg" : "border-gray-200 hover:shadow-md"
              }`}
            >
              <div className="flex items-center gap-4">
                <img
                  src="/qr.jpg"
                  alt="QR"
                  className="w-12 h-12 object-contain"
                  onError={(e) => (e.currentTarget.src = "https://syspro.asia/img/default.png")}
                />
                <div>
                  <p className="font-semibold text-gray-700">{t.QR || 'QR'}</p>
                  <p className="text-xs text-gray-500">Scan QR code to pay</p>
                </div>
              </div>
              {paymentMethod === t.QR && (
                <p className="text-sm text-gray-500 mt-2">
                  You will scan a QR code for payment
                </p>
              )}
            </div>

            {/* Cash Payment Method */}
            <div
              onClick={() => handlePaymentMethodSelect(t.cash || 'Cash')}
              className={`cursor-pointer border rounded-xl p-5 flex flex-col gap-2 transition-shadow ${
                paymentMethod === t.cash ? "border-blue-500 bg-blue-50 shadow-lg" : "border-gray-200 hover:shadow-md"
              }`}
            >
              <div className="flex items-center gap-4">
                <img
                  src="/cash.jpg"
                  alt="Cash"
                  className="w-12 h-12 object-contain"
                  onError={(e) => (e.currentTarget.src = "https://syspro.asia/img/default.png")}
                />
                <div>
                  <p className="font-semibold text-gray-700">{t.cash || 'Cash'}</p>
                  <p className="text-xs text-gray-500">Pay with cash on delivery</p>
                </div>
              </div>
              {paymentMethod === t.cash && (
                <p className="text-sm text-gray-500 mt-2">
                  You will pay with cash upon delivery
                </p>
              )}
            </div>

            {/* Custom Payment Methods */}
            {paymentMethods
              .filter(method => method.type === 'custom')
              .map((method) => (
                <div
                  key={method.id}
                  onClick={() => handlePaymentMethodSelect(method.name)}
                  className={`cursor-pointer border rounded-xl p-5 flex flex-col gap-2 transition-shadow ${
                    paymentMethod === method.name
                      ? "border-green-500 bg-green-50 shadow-lg"
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
                      <p className="text-xs text-gray-500">Custom Payment Method</p>
                    </div>
                  </div>
                  {paymentMethod === method.name && (
                    <p className="text-sm text-gray-500 mt-2">
                      Pay with {method.name}
                    </p>
                  )}
                </div>
              ))
            }
          </section>
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