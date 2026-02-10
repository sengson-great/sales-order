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

// Define the Contact type (from contacts table)
type Contact = {
  id?: number;
  business_id?: number;
  type: "customer" | "supplier" | "both";
  name: string;
  email?: string;
  contact_id?: string;
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
  contact_status?: "active" | "inactive";
  created_by?: number;
  custom_field1?: string;
  custom_field2?: string;
  custom_field3?: string;
  custom_field4?: string;
  credit_limit?: number;
  created_at?: string;
  updated_at?: string;
  // For compatibility with context
  label?: string;
  phone?: string;
  details?: string;
  coordinates?: { lat: number; lng: number };
  place_pic?: string;
};

// Extended type that includes both context and API properties
type ExtendedContact = Contact & ContextAddress;

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

  const [contacts, setContacts] = useState<ExtendedContact[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [tempContact, setTempContact] = useState<Partial<Contact>>({
    name: "",
    mobile: "",
    email: "",
    address_line_1: "",
    city: "",
    state: "",
    country: "",
    zip_code: "",
    type: "customer",
    contact_status: "active",
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

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodType[]>([]);
  const [showAllPaymentMethods, setShowAllPaymentMethods] = useState(false);

  const IMAGE_URL = process.env.NEXT_PUBLIC_IMAGE_URL!;
  const currentSelectedAddress = selectedAddress === "current" ? currentAddress : selectedAddress;

  // Check if user is actively searching
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

  // Fetch payment methods
  useEffect(() => {
    const fetchAllPaymentMethods = async () => {
      try {
        setLoading(true);
        
        const allMethods: PaymentMethodType[] = [
          { id: 'qr', name: t.QR || 'QR', image: "/qr.jpg", type: 'default' },
          { id: 'cash', name: t.cash || 'Cash', image: "/cash.jpg", type: 'default' },
        ];
        
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
  }, [user, setLoading, t.QR, t.cash]);

  // Fetch contacts from API
  useEffect(() => {
    const fetchContacts = async () => {
      setLoading(true);
      try {
        const res = await api.get("/contacts/all");
        const contactsData: ExtendedContact[] = res.data?.data.map((contact: any) => ({
          ...contact,
          label: contact.name, // For compatibility with existing code
          phone: contact.mobile, // Map mobile to phone
          details: contact.address_line_1, // Map address_line_1 to details
          coordinates: contact.latitude && contact.longitude 
            ? { lat: contact.latitude, lng: contact.longitude } 
            : undefined,
        })) || [];
        setContacts(contactsData);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load customers");
      } finally {
        setLoading(false);
      }
    };
    if (user) {
      fetchContacts();
    }
  }, [setLoading, user]);

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    return contacts.filter(contact => {
      const nameMatch = contact.name?.toLowerCase().includes(query) || false;
      const phoneMatch = contact.mobile?.toLowerCase().includes(query) || false;
      const emailMatch = contact.email?.toLowerCase().includes(query) || false;
      const addressMatch = contact.address_line_1?.toLowerCase().includes(query) || false;

      return nameMatch || phoneMatch || emailMatch || addressMatch;
    });
  }, [contacts, searchQuery]);

  // Calculate pagination data
  const paginatedContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredContacts.slice(startIndex, endIndex);
  }, [filteredContacts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);

  // AUTO-POPULATE FORM FIELDS: Open form automatically when customer is not found
  useEffect(() => {
    if (searchQuery.trim() && user?.role === "sale") {
      // First, check if the search matches any existing contact
      const existingContact = contacts.find(contact => 
        contact.name?.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        contact.mobile?.includes(searchQuery.trim())
      );
      
      if (existingContact) {
        setShowSearchResults(true);
        setIsAdding(false);
      } else if (!isAdding) {
        // If contact doesn't exist AND we're not already in the form
        setIsAdding(true);
        setShowSearchResults(false);
        
        // Update the form fields based on current search
        if (isLikelyPhoneNumber) {
          setTempContact(prev => ({
            ...prev,
            mobile: searchQuery.trim(),
            name: prev.name || "",
            address_line_1: prev.address_line_1 || ""
          }));
        } else {
          setTempContact(prev => ({
            ...prev,
            name: searchQuery.trim(),
            mobile: prev.mobile || "",
            address_line_1: prev.address_line_1 || ""
          }));
        }
      }
    } else if (!searchQuery.trim() && isAdding) {
      setIsAdding(false);
    }
  }, [searchQuery, isLikelyPhoneNumber, user?.role, contacts, setSelectedAddress, isAdding]);

  // Also update the form fields in real-time while form is open
  useEffect(() => {
    if (isAdding && searchQuery.trim() && user?.role === "sale") {
      if (isLikelyPhoneNumber) {
        setTempContact(prev => ({
          ...prev,
          mobile: searchQuery.trim(),
        }));
      } else {
        setTempContact(prev => ({
          ...prev,
          name: searchQuery.trim(),
        }));
      }
    }
  }, [searchQuery, isLikelyPhoneNumber, isAdding, user?.role]);

  // Clear form fields when form disappears
  useEffect(() => {
    if (!isAdding && !searchQuery.trim() && user?.role === "sale") {
      setTempContact({
        name: "",
        mobile: "",
        email: "",
        address_line_1: "",
        city: "",
        state: "",
        country: "",
        zip_code: "",
        type: "customer",
        contact_status: "active",
      });
    }
  }, [isAdding, searchQuery, user]);

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
      
      // Update tempContact directly
      setTempContact(prev => ({
        ...prev,
        latitude: latitude,
        longitude: longitude,
      }));
      
      // Also update context if needed
      setCurrentAddress({
        coordinates: { lat: latitude, lng: longitude },
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
      if (!file.type.startsWith('image/')) {
        toast.error("Please upload an image file");
        return;
      }
  
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
  
      setImageFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectContact = (contact: ExtendedContact) => {
    setSelectedAddress(contact);
    setShowSearchResults(true);
    setIsAdding(false);
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setTempContact({
        ...tempContact,
        latitude: e.latLng.lat(),
        longitude: e.latLng.lng(),
      });
    }
  };

  const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setTempContact({
        ...tempContact,
        latitude: e.latLng.lat(),
        longitude: e.latLng.lng(),
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
      setIsAdding(false);
      setSelectedAddress('current');
    }
  };

  const isValidPhone = (phone: string) => {
    // Regex for Cambodian phone numbers: 
    // Starts with 0, followed by 8-9 digits (total 9-10)
    const phoneRegex = /^0\d{8,9}$/;
    return phoneRegex.test(phone.trim());
  };

  // Save new contact to contacts table
  const handleSaveNewContact = async () => {
    const phone = tempContact.mobile?.trim() || "";

    if (!tempContact.name?.trim()) {
      toast.error("Please enter customer name");
      return;
    }

    if (!tempContact.mobile?.trim()) {
      toast.error("Please enter customer phone number");
      return;
    }

    if (!tempContact.address_line_1?.trim()) {
      toast.error("Please enter address");
      return;
    }

    if (!isValidPhone(phone)) {
      toast.error("Invalid phone format. Must start with 0 and be 9-10 digits.");
      return;
    }

    // Check for duplicate mobile number
    const phoneExists = contacts.some(contact => 
      contact.mobile?.trim() === tempContact.mobile?.trim() && 
      contact.id !== tempContact.id
    );
    
    if (phoneExists) {
      toast.error("A customer with this phone number already exists");
      return;
    }

    setLoading(true);

    try {
      // Create FormData to handle file upload
      const formData = new FormData();
      formData.append('name', tempContact.name.trim());
      formData.append('type', 'customer');
      formData.append('mobile', tempContact.mobile.trim());
      formData.append('address_line_1', tempContact.address_line_1.trim());
      
      if (tempContact.email) formData.append('email', tempContact.email.trim());
      if (tempContact.address_line_2) formData.append('address_line_2', tempContact.address_line_2.trim());
      if (tempContact.city) formData.append('city', tempContact.city.trim());
      if (tempContact.state) formData.append('state', tempContact.state.trim());
      if (tempContact.country) formData.append('country', tempContact.country.trim());
      if (tempContact.zip_code) formData.append('zip_code', tempContact.zip_code.trim());
      if (tempContact.latitude) formData.append('latitude', String(tempContact.latitude));
      if (tempContact.longitude) formData.append('longitude', String(tempContact.longitude));
      
      // Append image file to custom_field1
      if (imageFile) {
        formData.append('custom_field1', imageFile);
      }

      const res = await api.post("/contacts", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const apiResponse = res.data?.data;

      const newContact: ExtendedContact = {
        ...apiResponse,
        id: apiResponse.id,
        name: apiResponse.name,
        mobile: apiResponse.mobile,
        email: apiResponse.email,
        address_line_1: apiResponse.address_line_1,
        address_line_2: apiResponse.address_line_2,
        city: apiResponse.city,
        state: apiResponse.state,
        country: apiResponse.country,
        zip_code: apiResponse.zip_code,
        latitude: apiResponse.latitude,
        longitude: apiResponse.longitude,
        label: apiResponse.name, // For compatibility
        phone: apiResponse.mobile, // For compatibility
        details: apiResponse.address_line_1, // For compatibility
        coordinates: apiResponse.latitude && apiResponse.longitude 
          ? { lat: apiResponse.latitude, lng: apiResponse.longitude } 
          : undefined,
      };

      setContacts((prev) => [...prev, newContact]);
      setSelectedAddress(newContact);
      setIsAdding(false);
      setSearchQuery(newContact.name || "");
      setShowSearchResults(true);
      setCurrentPage(1);

      // Reset form fields AND image
      setTempContact({
        name: "",
        mobile: "",
        email: "",
        address_line_1: "",
        city: "",
        state: "",
        country: "",
        zip_code: "",
        type: "customer",
        contact_status: "active",
      });
      setImageFile(null);
      setImagePreview(null);

      toast.success("Customer saved successfully");
    } catch (err: any) {
      console.error("Save contact error:", err);
      if (err.response?.status === 422) {
        const errors = err.response.data.errors;
        if (errors?.mobile) {
          toast.error("Phone number already exists.");
        } else {
          toast.error("Validation failed. Please check your input.");
        }
      } else {
        toast.error(err.response?.data?.message || "Failed to save customer");
      }
    } finally {
      setLoading(false);
    }
  };

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

    // Calculate pagination
    const totalItems = filteredContacts.length;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

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
    setTempContact({
      name: "",
      mobile: "",
      email: "",
      address_line_1: "",
      city: "",
      state: "",
      country: "",
      zip_code: "",
      type: "customer",
      contact_status: "active",
    });
  };

  // Clear search and reset form
  const handleClearSearch = () => {
    setSearchQuery("");
    setShowSearchResults(false);
    setIsAdding(false);
    setSelectedAddress('current');
    setTempContact({
      name: "",
      mobile: "",
      email: "",
      address_line_1: "",
      city: "",
      state: "",
      country: "",
      zip_code: "",
      type: "customer",
      contact_status: "active",
    });
  };

  // Calculate how many methods to show initially
  const maxInitialPaymentMethods = 3;
  const defaultPaymentMethodsCount = Math.min(maxInitialPaymentMethods, paymentMethods.length);
  const paymentMethodsToShow = showAllPaymentMethods ? paymentMethods : paymentMethods.slice(0, defaultPaymentMethodsCount);

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
                    <p className="font-medium text-gray-900">{(selectedAddress as ExtendedContact).name}</p>
                    <p className="text-sm text-gray-600">Phone: {(selectedAddress as ExtendedContact).mobile}</p>
                    <p className="text-sm text-gray-600">Address: {(selectedAddress as ExtendedContact).address_line_1}</p>
                    {((selectedAddress as ExtendedContact).city || (selectedAddress as ExtendedContact).state) && (
                      <p className="text-sm text-gray-600">
                        {[(selectedAddress as ExtendedContact).city, (selectedAddress as ExtendedContact).state].filter(Boolean).join(', ')}
                      </p>
                    )}
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
                {filteredContacts.length > 0 ? (
                  <div className="flex justify-between items-center">
                    <span>Found {filteredContacts.length} customer(s)</span>
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
              {!isAdding && paginatedContacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  className={`p-4 rounded-xl border cursor-pointer flex flex-col transition ${selectedAddress &&
                    typeof selectedAddress !== 'string' &&
                    (selectedAddress as ExtendedContact).id === contact.id
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                    : "border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{contact.name}</p>
                        {selectedAddress &&
                          typeof selectedAddress !== 'string' &&
                          (selectedAddress as ExtendedContact).id === contact.id && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                              Selected
                            </span>
                          )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Phone: {contact.mobile}</p>
                      <p className="text-sm text-gray-600 mt-1">{contact.address_line_1}</p>
                      {contact.city && (
                        <p className="text-sm text-gray-600 mt-1">{contact.city}{contact.state ? `, ${contact.state}` : ''}</p>
                      )}
                    </div>
                    <span className="text-blue-500 text-lg">📍</span>
                  </div>
                </div>
              ))}

{/* Pagination Controls */}
{totalPages > 1 && (
  <div className="mt-8 flex flex-col items-center gap-4 px-2 py-6 border-t border-gray-100">
    
    {/* Summary Text: Centered for better mobile balance */}
    <div className="text-xs tracking-wide text-gray-400 uppercase font-bold">
      Showing <span className="text-gray-900">{startIndex + 1}</span> - <span className="text-gray-900">{Math.min(endIndex, totalItems)}</span> of <span className="text-gray-900">{totalItems}</span>
    </div>

    {/* Navigation Bar */}
    <div className="flex items-center bg-gray-50 p-1.5 rounded-2xl border border-gray-200 shadow-sm">
      {/* Previous Button */}
      <button
        onClick={goToPreviousPage}
        disabled={currentPage === 1}
        className="p-2.5 rounded-xl text-gray-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Dynamic Page Numbers */}
      <div className="flex items-center px-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(page => {
            // Logic: Always show 1, always show Last, and show Current +/- 1
            if (totalPages <= 5) return true; // Show all if total is small
            return (
              page === 1 || 
              page === totalPages || 
              (page >= currentPage - 1 && page <= currentPage + 1)
            );
          })
          .map((page, index, array) => (
            <React.Fragment key={page}>
              {/* Add Ellipsis if there is a gap between numbers */}
              {index > 0 && array[index - 1] !== page - 1 && (
                <span className="w-8 text-center text-gray-400 text-xs">...</span>
              )}
              
              <button
                onClick={() => goToPage(page)}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                  currentPage === page
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110 z-10"
                    : "text-gray-500 hover:bg-white hover:text-blue-600"
                }`}
              >
                {page}
              </button>
            </React.Fragment>
          ))}
      </div>

      {/* Next Button */}
      <button
        onClick={goToNextPage}
        disabled={currentPage === totalPages}
        className="p-2.5 rounded-xl text-gray-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
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
                      if (searchQuery.trim() && !contacts.some(contact => 
                        contact.name?.toLowerCase() === searchQuery.trim().toLowerCase() ||
                        contact.mobile === searchQuery.trim()
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
                      value={tempContact.name || ""}
                      onChange={(e) => setTempContact({ ...tempContact, name: e.target.value })}
                    />
                  </div>

                  {/* Phone Field - Auto-populated from search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone *
                      {tempContact.mobile?.trim() && contacts.some(contact => 
                        contact.mobile?.trim() === tempContact.mobile?.trim() && 
                        contact.id !== tempContact.id
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
                        tempContact.mobile?.trim() && contacts.some(contact => 
                          contact.mobile?.trim() === tempContact.mobile?.trim() && 
                          contact.id !== tempContact.id
                        )
                          ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500"
                          : "border-gray-300 focus:ring-blue-500"
                      }`}
                      value={tempContact.mobile || ""}
                      onChange={(e) => setTempContact({ ...tempContact, mobile: e.target.value })}
                    />
                    {/* Real-time Validation Message */}
                    {tempContact.mobile && !isValidPhone(tempContact.mobile) && (
                      <p className="mt-1 text-xs text-red-500">
                        Phone must start with 0 and be 9-10 digits total.
                      </p>
                    )}
                    {tempContact.mobile?.trim() && contacts.some(contact => 
                      contact.mobile?.trim() === tempContact.mobile?.trim() && 
                      contact.id !== tempContact.id
                    ) && (
                      <p className="mt-1 text-xs text-red-600">
                        A customer with this phone number already exists. Please use a different phone number.
                      </p>
                    )}
                  </div>

                  {/* Address Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Address Details *
                      </label>
                      <div className="flex flex-1 space-x-2">
                        <input
                          type="text"
                          placeholder="Street address, P.O. Box, etc."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={tempContact.address_line_1 || ""}
                          onChange={(e) => setTempContact({ ...tempContact, address_line_1: e.target.value })}
                        />
                                                    {/* GPS Location */}
                                                    <button
                      type="button"
                      onClick={handleDetectCurrentLocation}
                      disabled={isDetectingLocation}
                      className={`w-1/3 p-3 border-2 rounded-lg flex flex-col items-center justify-center transition-all ${
                        isDetectingLocation 
                          ? "bg-gray-100 border-gray-200" 
                          : tempContact.latitude
                            ? "bg-green-50 border-green-500 text-green-700"
                            : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
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
                            {tempContact.latitude ? "✅" : "📍"}
                          </div>
                          <span className="text-sm font-medium">
                            {tempContact.latitude ? "Location Captured" : "Capture GPS Location"}
                          </span>
                        </>
                      )}
                    </button>
                      </div>
                  <div>
                    {!tempContact.latitude && !isDetectingLocation && (
                      <p className="text-sm text-red-500 mt-2">
                        ⚠️ Required: Capture GPS location for customer
                      </p>
                    )}
                  </div>
                    </div>
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
                        if (searchQuery.trim() && !contacts.some(contact => 
                          contact.name?.toLowerCase() === searchQuery.trim().toLowerCase() ||
                          contact.mobile === searchQuery.trim()
                        )) {
                          setSearchQuery("");
                        }
                      }}
                      className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNewContact}
                      disabled={
                        !tempContact.name?.trim() ||
                        !tempContact.mobile?.trim() ||
                        !tempContact.address_line_1?.trim() ||
                        !tempContact.latitude
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

          {/* Payment Method Section */}
          <section className="flex flex-col gap-3">
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
              center={tempContact.latitude ? { lat: tempContact.latitude, lng: tempContact.longitude || 0 } : { lat: 0, lng: 0 }}
              zoom={15}
              onClick={handleMapClick}
            >
              {tempContact.latitude && (
                <Marker
                  position={{ lat: tempContact.latitude, lng: tempContact.longitude || 0 }}
                  draggable
                  onDragEnd={handleMarkerDragEnd}
                />
              )}
            </GoogleMap>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700">{t.selectedCoordinates}:</p>
              {tempContact.latitude ? (
                <p className="text-sm text-gray-600 mt-1">
                  Lat: {tempContact.latitude.toFixed(6)}
                  <br />
                  Lng: {tempContact.longitude?.toFixed(6)}
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">{t.clickToSelectLocation}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setTempContact({ ...tempContact, latitude: undefined, longitude: undefined })}
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
                disabled={!tempContact.latitude}
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