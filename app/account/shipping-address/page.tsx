"use client";

import React, { useState, useEffect, useMemo } from "react";
import Header from "@/components/layouts/Header";
import { GoogleMap, Marker } from "@react-google-maps/api";
import api from "@/api/api";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { useLoading } from "@/context/LoadingContext";
import { useLanguage } from "@/context/LanguageContext";
import { useSalesAuth } from "@/context/SalesAuthContext";

export type Address = {
  id?: number;
  api_user_id: number | undefined,
  label: string;
  phone?: string;
  details?: string;
  coordinates?: { lat: number; lng: number };
  place_pic?: string; // Added for location image
};

const containerStyle = { width: "100%", height: "400px" };
const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = 10;

export default function ShippingAddressPage() {
  const { user } = useAuth();
  const { salesUser } = useSalesAuth(); // Get sales user context
  const { setLoading } = useLoading();
  const { t } = useLanguage();

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<number | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  const [imageFile, setImageFile] = useState<File | null>(null);

  const [newAddress, setNewAddress] = useState<Address>({
    label: "",
    phone: "",
    details: "",
    coordinates: undefined,
    api_user_id: user?.id || salesUser?.id || undefined,
    place_pic: "",
  });

  // Current location detection state
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationImage, setLocationImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  // Determine if user is salesOnField
  const isSalesOnField = useMemo(() => {
    return salesUser?.role === 'salesOnField';
  }, [salesUser]);

  async function fetchAddress() {
    setLoading(true);
    try {
      const res = await api.get<{ status: string; data: Address[] }>("/addresses/all");
      console.log("Fetched addresses:", res.data.data);
      setSavedAddresses(res.data.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load addresses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAddress();
  }, [setLoading]);

  // Function to check if phone number already exists
  const checkPhoneExists = (phone: string, excludeId?: number | null): boolean => {
    if (!phone) return false;
    
    const trimmedPhone = phone.trim();
    return savedAddresses.some(address => {
      // Skip the current address being edited
      if (excludeId && address.id === excludeId) return false;
      return address.phone?.trim() === trimmedPhone;
    });
  };

  // Current location detection function - store coordinates but don't show to user
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
      
      // Store coordinates but don't show them to the user
      setNewAddress(prev => ({
        ...prev,
        coordinates: coordinates,
        label: prev.label,
        // Keep the user's typed details, don't override with coordinates
        details: prev.details
      }));

      toast.success("Current location captured successfully!");
      
      // For salesOnField, we don't show the map modal
      if (!isSalesOnField && showMapModal) {
        setShowMapModal(true); // Keep modal open with new location
      } else if (!isSalesOnField) {
        setShowMapModal(true); // Open map modal to show the location
      }
      
    } catch (error: any) {
      console.error("Geolocation error:", error);
      let errorMessage = "Failed to detect location";
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location permission denied. Please enable location services in your browser settings.";
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

  // Handle image upload
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

      setLocationImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove uploaded image
  const handleRemoveImage = () => {
    setLocationImage(null);
    setImagePreview("");
    setNewAddress(prev => ({ ...prev, place_pic: "" }));
  };

  // Filter addresses based on search query
  const filteredAddresses = useMemo(() => {
    if (!searchQuery.trim()) {
      return savedAddresses;
    }

    const query = searchQuery.toLowerCase().trim();
    return savedAddresses.filter(address => {
      const labelMatch = address.label?.toLowerCase().includes(query) || false;
      const phoneMatch = address.phone?.toLowerCase().includes(query) || false;
      const detailsMatch = address.details?.toLowerCase().includes(query) || false;

      return labelMatch || phoneMatch || detailsMatch;
    });
  }, [savedAddresses, searchQuery]);

  // Calculate pagination
  const totalItems = filteredAddresses.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAddresses = filteredAddresses.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSaveAddress = async () => {
    // Validation checks
    if (!newAddress.label || !newAddress.details) {
      toast.error("Please fill in all required fields.");
      return;
    }

    // Phone validation for sales users
    if ((isSalesOnField || salesUser?.role === "sale") && !newAddress.phone?.trim()) {
      toast.error("Phone number is required for customers.");
      return;
    }

    // Check for duplicate phone number (only for sales users and when phone is provided)
    const phoneToCheck = newAddress.phone?.trim();
    if (phoneToCheck && (isSalesOnField || salesUser?.role === "sale")) {
      const phoneExists = checkPhoneExists(phoneToCheck, editingId);
      if (phoneExists) {
        toast.error("A customer with this phone number already exists.");
        return;
      }
    }

    // Location validation for salesOnField
    if (isSalesOnField && !newAddress.coordinates) {
      toast.error("Please capture the GPS location for the field customer.");
      return;
    }

    // Location validation for regular users
    if (!isSalesOnField && salesUser?.role !== "sale" && !newAddress.coordinates) {
      toast.error("Please select a location on the map.");
      return;
    }
  
    const formData = new FormData();
    formData.append('label', newAddress.label.trim());
    formData.append('details', newAddress.details.trim());
    formData.append('api_user_id', String(newAddress.api_user_id));
    
    // Always append phone if available, otherwise append empty string
    formData.append('phone', phoneToCheck || "");
    
    if (newAddress.coordinates) {
      formData.append('coordinates[lat]', String(newAddress.coordinates.lat));
      formData.append('coordinates[lng]', String(newAddress.coordinates.lng));
    }
    
    if (imageFile) {
      formData.append('place_pic', imageFile);
    }
  
    setLoading(true);
    try {
      if (isEditing && editingId) {
        // Laravel multipart bug fix: Use POST + _method PUT
        formData.append('_method', 'PUT');
        await api.post(`/addresses/${editingId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success("Updated successfully");
      } else {
        await api.post("/addresses", formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success("Saved successfully");
      }
      fetchAddress();
      handleCancel();
    } catch (err: any) {
      console.error("Save error:", err);
      if (err.response?.status === 422) {
        // Handle validation errors from backend
        const errors = err.response.data.errors;
        if (errors?.phone) {
          toast.error("Phone number already exists.");
        } else {
          toast.error("Validation failed. Please check your input.");
        }
      } else {
        toast.error("Failed to save address");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditAddress = (address: Address) => {
    console.log("Editing address:", address);
    setNewAddress({
      ...address,
      api_user_id: user?.id || salesUser?.id || undefined,
      coordinates: address.coordinates || undefined
    });
    setEditingId(address.id || null);
    setIsEditing(true);
    setShowFormModal(true);
    setSelectedAddress(address.id || null);
    
    // Set image preview if exists
    if (address.place_pic) {
      setImagePreview(address.place_pic);
    }
  };

  const handleAddNew = () => {
    resetForm();
    setShowFormModal(true);
  };

  const handleDeleteAddress = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this address?")) {
      return;
    }

    setLoading(true);
    try {
      console.log("Deleting address ID:", id);
      
      await api.delete(`/addresses/${id}`);
      
      setSavedAddresses(prev => prev.filter(addr => addr.id !== id));
      
      if (selectedAddress === id) {
        setSelectedAddress(null);
      }
      
      toast.success(t.addressDeletedSuccessfully || "Address deleted successfully");
    } catch (err: any) {
      console.error("Delete error:", err);
      
      try {
        await api.post(`/addresses/${id}`, {
          _method: 'DELETE'
        });
        
        setSavedAddresses(prev => prev.filter(addr => addr.id !== id));
        
        if (selectedAddress === id) {
          setSelectedAddress(null);
        }
        
        toast.success(t.addressDeletedSuccessfully || "Address deleted successfully");
      } catch (err2) {
        console.error("Alternative delete also failed:", err2);
        toast.error("Failed to delete address");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewAddress({
      label: "",
      phone: (salesUser?.role === "sale" || isSalesOnField) ? "" : user?.phone || user?.mobile || "",
      details: "",
      coordinates: undefined,
      api_user_id: user?.id || salesUser?.id || undefined,
      place_pic: ""
    });
    setIsEditing(false);
    setEditingId(null);
    setShowMapModal(false);
    setLocationImage(null);
    setImagePreview("");
  };

  const handleCancel = () => {
    resetForm();
    setShowFormModal(false);
  };

  // Function to get user phone for display
  const getUserPhone = () => {
    return user?.phone || user?.mobile || "";
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

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <Header title={
        isSalesOnField ? "Field Customer Management" : 
        salesUser?.role === "sale" ? "Customer Information" : 
        t.shippingAddress
      } />

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder={
            isSalesOnField ? "Search field customers by name or phone..." :
            salesUser?.role === "sale" ? "Search customers by name or phone..." :
            "Search by name, phone, or address..."
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
        <div className="mt-2 flex justify-between items-center">
           <div className="text-sm text-gray-500">
            Showing {paginatedAddresses.length} of {totalItems} { 
              isSalesOnField ? "field customers" :
              salesUser?.role === "sale" ? "customers" : "addresses"
            }
            {searchQuery.trim() && ` (filtered from ${savedAddresses.length} total)`}
          </div>
          {/* Add New Button */}
          <button
            onClick={handleAddNew}
            className="mt-4 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span>
            {isSalesOnField ? "Add Field Customer" :
             salesUser?.role === "sale" ? "Add New Customer" : t.addNewAddress}
          </button>
        </div>
      </div>

      {/* Items per page selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Items per page:</span>
          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
        {totalItems > 0 && (
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
        )}
      </div>

      {/* Saved Addresses / Customers List */}
      <div className="flex flex-col gap-3">
        {paginatedAddresses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery.trim() ? (
              <div>
                <p>No {isSalesOnField ? 'field customers' : salesUser?.role === 'sale' ? 'customers' : 'addresses'} found for "{searchQuery}"</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </div>
            ) : (
              isSalesOnField 
                ? "No field customers saved yet. Add your first customer below."
                : salesUser?.role === "sale" 
                  ? "No customers saved yet. Add your first customer below."
                  : t.noSavedAddressesYetAddYourFirstAddressBelow
            )}
          </div>
        ) : (
          paginatedAddresses.map((addr) => (
            <div
              key={addr.id}
              className={`p-4 rounded-xl border flex justify-between items-start gap-4 shadow hover:shadow-md transition cursor-pointer relative ${
                selectedAddress === addr.id 
                  ? "border-blue-500 bg-blue-50" 
                  : "border-gray-200 bg-white"
              }`}
              onClick={() => setSelectedAddress(addr.id!)}
            >
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{addr.label}</span>
                      {isSalesOnField && addr.place_pic && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          📍 Has Location Photo
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mt-1">{addr.details}</p>
                    <p className="text-gray-600 text-sm mt-1">
                      {t.phone}: {addr.phone}
                    </p>
                    {/* Don't show coordinates for salesOnField */}
                    {!isSalesOnField && addr.coordinates && (
                      <p className="text-gray-500 text-xs mt-1">
                        📍 Lat: {Number(addr.coordinates.lat.toFixed(5))}, Lng: {Number(addr.coordinates.lng.toFixed(5))}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditAddress(addr);
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 text-sm"
                    >
                      {t.edit}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAddress(addr.id!);
                      }}
                      className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                    >
                      {t.delete}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
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
            Page {currentPage} of {totalPages} • {totalItems} total items
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">
                {isEditing 
                  ? (isSalesOnField ? "Edit Field Customer" : 
                     salesUser?.role === "sale" ? "Edit Customer" : "Edit Address")
                  : (isSalesOnField ? "Add Field Customer" : 
                     salesUser?.role === "sale" ? "Add New Customer" : "Add New Address")
                }
              </h3>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 text-2xl p-1"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Name/Label Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isSalesOnField ? "Customer Name *" : 
                   salesUser?.role === "sale" ? "Customer Name *" : "Address Label *"}
                </label>
                <input
                  type="text"
                  placeholder={isSalesOnField ? "Enter customer name" : 
                              salesUser?.role === "sale" ? "Enter customer name" : "Home, Work, etc."}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={newAddress.label}
                  onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                />
              </div>

              {/* Phone Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone {isSalesOnField || salesUser?.role === "sale" ? "*" : ""}
                  {(isSalesOnField || salesUser?.role === "sale") && newAddress.phone?.trim() && 
                   checkPhoneExists(newAddress.phone.trim(), editingId) && (
                    <span className="ml-2 text-xs text-red-600">
                      ⚠️ Phone number already exists
                    </span>
                  )}
                </label>
                {!isSalesOnField && user?.role !== "sale" && getUserPhone() ? (
                  <div className="space-y-3 mb-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        id="profile-phone"
                        name="phone-source"
                        checked={!newAddress.phone}
                        onChange={() => setNewAddress({ ...newAddress, phone: "" })}
                        className="h-4 w-4 text-blue-600"
                      />
                      <label htmlFor="profile-phone" className="text-sm">
                        Use my phone: <span className="font-medium">{getUserPhone()}</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        id="custom-phone"
                        name="phone-source"
                        checked={!!newAddress.phone}
                        onChange={() => setNewAddress({ ...newAddress, phone: "" })}
                        className="h-4 w-4 text-blue-600"
                      />
                      <label htmlFor="custom-phone" className="text-sm">
                        Use different phone number
                      </label>
                    </div>
                  </div>
                ) : null}
                
                <input
                  type="tel"
                  placeholder={
                    isSalesOnField ? "Customer phone number" : 
                    salesUser?.role === "sale" ? "Customer phone number" : "Phone number"
                  }
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    !isSalesOnField && user?.role !== "sale" && !newAddress.phone && !!getUserPhone() 
                      ? "bg-gray-100 cursor-not-allowed" 
                      : (isSalesOnField || salesUser?.role === "sale") && newAddress.phone?.trim() && 
                        checkPhoneExists(newAddress.phone.trim(), editingId)
                      ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300"
                  }`}
                  value={newAddress.phone || ""}
                  onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                  disabled={!isSalesOnField && user?.role !== "sale" && !newAddress.phone && !!getUserPhone()}
                />
                {(isSalesOnField || salesUser?.role === "sale") && newAddress.phone?.trim() && 
                 checkPhoneExists(newAddress.phone.trim(), editingId) && (
                  <p className="mt-1 text-xs text-red-600">
                    A customer with this phone number already exists. Please use a different phone number.
                  </p>
                )}
              </div>

              <div className="w-full">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isSalesOnField ? "Location Details *" : 
                  salesUser?.role === "sale" ? "Delivery Address *" : "Address Details *"}
                </label>
                
                <div className="flex gap-2 items-stretch">
                  {/* Textarea - Takes up the most space */}
                  <div className="flex-[2.5]">
                    <textarea
                      placeholder={
                        isSalesOnField ? "Describe location..." : 
                        salesUser?.role === "sale" ? "Street, building..." : "Address..."
                      }
                      className="w-full h-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                      value={newAddress.details}
                      onChange={(e) => setNewAddress({ ...newAddress, details: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* GPS Button - Compact but vertically tall to match textarea */}
                  {isSalesOnField && (
                    <div className="flex-1 min-w-[100px]">
                      <button
                        type="button"
                        onClick={handleDetectCurrentLocation}
                        disabled={isDetectingLocation}
                        className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                          isDetectingLocation 
                            ? "bg-gray-100 border-gray-200" 
                            : newAddress.coordinates
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
                              {newAddress.coordinates ? "✅" : "📍"}
                            </div>
                            <span className="text-[10px] font-bold uppercase text-center leading-tight">
                              {newAddress.coordinates ? "Saved" : "Tap GPS"}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
              </div>

                  {/* Error message below the row */}
                  {isSalesOnField && !newAddress.coordinates && !isDetectingLocation && (
                    <p className="text-[10px] font-medium text-red-500 mt-1.5 flex items-center gap-1">
                      <span>⚠️</span> Required: Tap the GPS button
                    </p>
                  )}
              </div>

              {/* Image Upload Area */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl h-40 relative flex items-center justify-center overflow-hidden">
                {imagePreview ? (
                  <>
                    <img src={imagePreview} className="w-full h-full object-cover" />
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
                      type="file" capture="environment" accept="image/*" 
                      className="hidden" onChange={handleImageUpload} 
                    />
                  </label>
                )}
              </div>

              {/* Location Selection for Regular Users */}
              {!isSalesOnField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location on Map *
                  </label>
                  <div className="space-y-3">
                    {/* Current Location Detection Button */}
                    <button
                      type="button"
                      onClick={handleDetectCurrentLocation}
                      disabled={isDetectingLocation}
                      className={`w-full p-3 border rounded-lg flex items-center justify-center gap-2 ${
                        isDetectingLocation 
                          ? "bg-gray-100 text-gray-500 cursor-wait" 
                          : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                      }`}
                    >
                      {isDetectingLocation ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Detecting location...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Use Current Location</span>
                        </>
                      )}
                    </button>

                    {/* Map Selection Button */}
                    <div 
                      onClick={() => setShowMapModal(true)}
                      className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center text-center"
                    >
                      {newAddress.coordinates ? (
                        <div className="text-center">
                          <div className="text-green-600 text-lg mb-1">✓ Location Selected</div>
                          <p className="text-sm text-gray-600">
                            Lat: {newAddress.coordinates.lat.toFixed(6)}
                            <br />
                            Lng: {newAddress.coordinates.lng.toFixed(6)}
                          </p>
                          {newAddress.details && (
                            <p className="text-xs text-gray-500 mt-2 truncate max-w-full">
                              {newAddress.details}
                            </p>
                          )}
                          <p className="text-xs text-blue-600 mt-2">Click to change location</p>
                        </div>
                      ) : (
                        <>
                          <div className="text-gray-400 text-2xl mb-2">📍</div>
                          <p className="text-gray-600 font-medium">Click to select location on map</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Select your location by clicking on the map
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {!newAddress.coordinates && (
                    <p className="text-sm text-red-500 mt-2">
                      Please select a location on the map
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAddress}
                  disabled={
                    !newAddress.label || 
                    !newAddress.details || 
                    (isSalesOnField && (!newAddress.phone || !newAddress.coordinates)) ||
                    (salesUser?.role === "sale" && !newAddress.phone) ||
                    (!isSalesOnField && !newAddress.coordinates) ||
                    (!isSalesOnField && user?.role !== "sale" && !newAddress.phone && !getUserPhone()) ||
                    ((isSalesOnField || salesUser?.role === "sale") && 
                     !!newAddress.phone?.trim() && 
                     checkPhoneExists(newAddress.phone.trim(), editingId))
                  }
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {isEditing 
                    ? (isSalesOnField ? "Update Field Customer" : 
                       salesUser?.role === "sale" ? "Update Customer" : "Save Changes")
                    : (isSalesOnField ? "Save Field Customer" : 
                       salesUser?.role === "sale" ? "Save Customer" : "Save Address")
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal - Only show for non-salesOnField users */}
      {showMapModal && !isSalesOnField && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[60] p-4">
          <div className="bg-white rounded-lg p-4 w-[90%] max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Select Location</h3>
                <p className="text-sm text-gray-500">Click on the map to select a location</p>
              </div>
              <button
                onClick={() => setShowMapModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl p-1"
              >
                ×
              </button>
            </div>
            
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={newAddress.coordinates || { lat: 11.567, lng: 104.928 }}
              zoom={15}
              onClick={(e) => {
                if (e.latLng) {
                  setNewAddress({
                    ...newAddress,
                    coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() },
                  });
                }
              }}
            >
              {newAddress.coordinates && (
                <Marker
                  position={newAddress.coordinates}
                  draggable
                  onDragEnd={(e) => {
                    if (e.latLng) {
                      setNewAddress({
                        ...newAddress,
                        coordinates: { 
                          lat: e.latLng.lat(), 
                          lng: e.latLng.lng() 
                        },
                      });
                    }
                  }}
                />
              )}
            </GoogleMap>

            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Selected Coordinates:
                </p>
                <button
                  onClick={() => {
                    setNewAddress({
                      ...newAddress,
                      coordinates: undefined,
                    });
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Clear Selection
                </button>
              </div>
              
              {newAddress.coordinates ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Latitude</p>
                      <p className="text-sm font-medium">
                        {newAddress.coordinates.lat.toFixed(6)}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Longitude</p>
                      <p className="text-sm font-medium">
                        {newAddress.coordinates.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Current Location Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleDetectCurrentLocation}
                      disabled={isDetectingLocation}
                      className={`w-full p-2 border rounded flex items-center justify-center gap-2 text-sm ${
                        isDetectingLocation 
                          ? "bg-gray-100 text-gray-500 cursor-wait" 
                          : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                      }`}
                    >
                      {isDetectingLocation ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Detecting...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Use My Current Location</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Click on the map to select a location
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowMapModal(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newAddress.coordinates) {
                    setShowMapModal(false);
                    toast.success("Location selected successfully!");
                  } else {
                    toast.error("Please select a location on the map");
                  }
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}