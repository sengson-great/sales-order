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

const containerStyle = { width: "100%", height: "400px" };
const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = 10;

export default function ShippingAddressPage() {
  const { user } = useAuth();
  const { salesUser } = useSalesAuth();
  const { setLoading } = useLoading();
  const { t } = useLanguage();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<number | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  const [imageFile, setImageFile] = useState<File | null>(null);

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

  // Current location detection state
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationImage, setLocationImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  // Determine if user is salesOnField
  const isSalesOnField = useMemo(() => {
    return salesUser?.role === 'salesOnField';
  }, [salesUser]);

  // Determine if user is salesOnline
  const isSalesOnline = useMemo(() => {
    return salesUser?.role === 'salesOnline';
  }, [salesUser]);

  async function fetchContacts() {
    setLoading(true);
    try {
      const res = await api.get<{ status: string; data: Contact[] }>("/contacts/all");
      console.log("Fetched contacts:", res.data.data);
      setContacts(res.data.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContacts();
  }, [setLoading]);

  // Function to check if phone number already exists
  const checkPhoneExists = (mobile: string, excludeId?: number | null): boolean => {
    if (!mobile) return false;
    
    const trimmedMobile = mobile.trim();
    return contacts.some(contact => {
      // Skip the current contact being edited
      if (excludeId && contact.id === excludeId) return false;
      return contact.mobile?.trim() === trimmedMobile;
    });
  };

  // Current location detection function
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
      
      // Store coordinates
      setNewContact(prev => ({
        ...prev,
        latitude: latitude,
        longitude: longitude,
        coordinates: coordinates,
        details: prev.details
      }));

      toast.success("Current location captured successfully!");
      
      if (!isSalesOnField && showMapModal) {
        setShowMapModal(true);
      } else if (!isSalesOnField) {
        setShowMapModal(true);
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
      setImageFile(file);
      
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
    setImageFile(null);
    setImagePreview("");
    setNewContact(prev => ({ ...prev, place_pic: "" }));
  };

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) {
      return contacts;
    }

    const query = searchQuery.toLowerCase().trim();
    return contacts.filter(contact => {
      const nameMatch = contact.name?.toLowerCase().includes(query) || false;
      const mobileMatch = contact.mobile?.toLowerCase().includes(query) || false;
      const emailMatch = contact.email?.toLowerCase().includes(query) || false;
      const addressMatch = contact.address_line_1?.toLowerCase().includes(query) || false;

      return nameMatch || mobileMatch || emailMatch || addressMatch;
    });
  }, [contacts, searchQuery]);

  // Calculate pagination
  const totalItems = filteredContacts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSaveContact = async () => {
    // Validation checks
    if (!newContact.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }

    // Mobile validation for all contacts
    if (!newContact.mobile?.trim()) {
      toast.error("Phone number is required.");
      return;
    }

    // Check for duplicate phone number
    const mobileToCheck = newContact.mobile.trim();
    if (mobileToCheck) {
      const phoneExists = checkPhoneExists(mobileToCheck, editingId);
      if (phoneExists) {
        toast.error("A customer with this phone number already exists.");
        return;
      }
    }

    // Location validation for salesOnField
    if (isSalesOnField && (!newContact.latitude || !newContact.longitude)) {
      toast.error("Please capture the GPS location for the field customer.");
      return;
    }

    // Address validation
    if (!newContact.address_line_1?.trim()) {
      toast.error("Address is required.");
      return;
    }
  
    const formData = new FormData();
    formData.append('name', newContact.name.trim());
    formData.append('type', 'customer');
    formData.append('mobile', newContact.mobile.trim());
    
    // Append optional fields if they exist
    if (newContact.email) formData.append('email', newContact.email.trim());
    if (newContact.address_line_1) formData.append('address_line_1', newContact.address_line_1.trim());
    if (newContact.address_line_2) formData.append('address_line_2', newContact.address_line_2.trim());
    if (newContact.city) formData.append('city', newContact.city.trim());
    if (newContact.state) formData.append('state', newContact.state.trim());
    if (newContact.country) formData.append('country', newContact.country.trim());
    if (newContact.zip_code) formData.append('zip_code', newContact.zip_code.trim());
    if (newContact.latitude) formData.append('latitude', String(newContact.latitude));
    if (newContact.longitude) formData.append('longitude', String(newContact.longitude));
    
    // Append image if exists
    if (imageFile) {
      formData.append('custom_field1', imageFile); // Using custom_field1 for image
    }
  
    setLoading(true);
    try {
      if (isEditing && editingId) {
        // Use POST + _method PUT for Laravel multipart
        formData.append('_method', 'PUT');
        await api.post(`/contacts/${editingId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success("Customer updated successfully");
      } else {
        await api.post("/contacts", formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success("Customer saved successfully");
      }
      fetchContacts();
      handleCancel();
    } catch (err: any) {
      console.error("Save error:", err);
      if (err.response?.status === 422) {
        // Handle validation errors from backend
        const errors = err.response.data.errors;
        if (errors?.mobile) {
          toast.error("Phone number already exists.");
        } else {
          toast.error("Validation failed. Please check your input.");
        }
      } else {
        toast.error("Failed to save customer");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditContact = (contact: Contact) => {
    console.log("Editing contact:", contact);
    setNewContact({
      ...contact,
      details: contact.address_line_1, // For UI display
      coordinates: contact.latitude && contact.longitude 
        ? { lat: contact.latitude, lng: contact.longitude }
        : undefined,
    });
    setEditingId(contact.id || null);
    setIsEditing(true);
    setShowFormModal(true);
    setSelectedContact(contact.id || null);
    
    // Set image preview if exists
    if (contact.custom_field1) {
      setImagePreview(contact.custom_field1);
    }
  };

  const handleAddNew = () => {
    resetForm();
    setShowFormModal(true);
  };

  const handleDeleteContact = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this customer?")) {
      return;
    }

    setLoading(true);
    try {
      console.log("Deleting contact ID:", id);
      
      await api.delete(`/contacts/${id}`);
      
      setContacts(prev => prev.filter(contact => contact.id !== id));
      
      if (selectedContact === id) {
        setSelectedContact(null);
      }
      
      toast.success("Customer deleted successfully");
    } catch (err: any) {
      console.error("Delete error:", err);
      
      try {
        await api.post(`/contacts/${id}`, {
          _method: 'DELETE'
        });
        
        setContacts(prev => prev.filter(contact => contact.id !== id));
        
        if (selectedContact === id) {
          setSelectedContact(null);
        }
        
        toast.success("Customer deleted successfully");
      } catch (err2) {
        console.error("Alternative delete also failed:", err2);
        toast.error("Failed to delete customer");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewContact({
      name: "",
      mobile: (isSalesOnline || isSalesOnField) ? "" : user?.phone || user?.mobile || "",
      type: "customer",
      email: "",
      address_line_1: "",
      city: "",
      state: "",
      country: "",
      zip_code: "",
      details: "",
      coordinates: undefined,
      place_pic: ""
    });
    setIsEditing(false);
    setEditingId(null);
    setShowMapModal(false);
    setLocationImage(null);
    setImageFile(null);
    setImagePreview("");
  };

  const handleCancel = () => {
    resetForm();
    setShowFormModal(false);
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
        "Customer Management"
      } />

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search customers by name, phone, or email..."
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
            Showing {paginatedContacts.length} of {totalItems} customers
            {searchQuery.trim() && ` (filtered from ${contacts.length} total)`}
          </div>
          {/* Add New Button */}
          <button
            onClick={handleAddNew}
            className="mt-4 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span>
            {isSalesOnField ? "Add Field Customer" : "Add New Customer"}
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

      {/* Customers List */}
      <div className="flex flex-col gap-3">
        {paginatedContacts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery.trim() ? (
              <div>
                <p>No customers found for "{searchQuery}"</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </div>
            ) : (
              isSalesOnField 
                ? "No field customers saved yet. Add your first customer below."
                : "No customers saved yet. Add your first customer below."
            )}
          </div>
        ) : (
          paginatedContacts.map((contact) => (
            <div
              key={contact.id}
              className={`p-4 rounded-xl border flex justify-between items-start gap-4 shadow hover:shadow-md transition cursor-pointer relative ${
                selectedContact === contact.id 
                  ? "border-blue-500 bg-blue-50" 
                  : "border-gray-200 bg-white"
              }`}
              onClick={() => setSelectedContact(contact.id!)}
            >
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{contact.name}</span>
                      {isSalesOnField && contact.custom_field1 && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          📍 Has Location Photo
                        </span>
                      )}
                      {contact.contact_status === 'inactive' && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mt-1">
                      📞 {contact.mobile}
                      {contact.email && ` • ✉️ ${contact.email}`}
                    </p>
                    <p className="text-gray-600 text-sm mt-1">
                      {contact.address_line_1}
                      {contact.city && `, ${contact.city}`}
                      {contact.state && `, ${contact.state}`}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditContact(contact);
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteContact(contact.id!);
                      }}
                      className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                    >
                      Delete
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
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
          />
        </div>

        {/* Phone Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone {isSalesOnField || salesUser?.role === "sale" ? "*" : ""}
            {(isSalesOnField || salesUser?.role === "sale") && newContact.mobile?.trim() && 
             checkPhoneExists(newContact.mobile.trim(), editingId) && (
              <span className="ml-2 text-xs text-red-600">
                ⚠️ Phone number already exists
              </span>
            )}
          </label>
          
          <input
            type="tel"
            placeholder="Customer phone number"
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              (isSalesOnField || salesUser?.role === "sale") && newContact.mobile?.trim() && 
              checkPhoneExists(newContact.mobile.trim(), editingId)
                ? "border-red-300 bg-red-50"
                : "border-gray-300"
            }`}
            value={newContact.mobile || ""}
            onChange={(e) => setNewContact({ ...newContact, mobile: e.target.value })}
          />
        </div>

        {/* Location Details with Integrated GPS Button Row */}
        <div className="w-full">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {isSalesOnField ? "Location Details *" : 
             salesUser?.role === "sale" ? "Delivery Address *" : "Address Details *"}
          </label>
          
          <div className="flex gap-2 items-stretch">
            <div className="flex-[2.5]">
              <textarea
                placeholder={isSalesOnField ? "Describe location..." : "Street, building..."}
                className="w-full h-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                value={newContact.address_line_1}
                onChange={(e) => setNewContact({ ...newContact, address_line_1: e.target.value })}
                rows={3}
              />
            </div>

            {isSalesOnField && (
              <div className="flex-1 min-w-[100px]">
                <button
                  type="button"
                  onClick={handleDetectCurrentLocation}
                  disabled={isDetectingLocation}
                  className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                    isDetectingLocation 
                      ? "bg-gray-100 border-gray-200" 
                      : newContact.coordinates
                        ? "bg-green-50 border-green-500 text-green-700 shadow-inner"
                        : "bg-blue-600 border-blue-600 text-white shadow-md"
                  }`}
                >
                  {isDetectingLocation ? (
                    <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <div className="text-xl mb-1">{newContact.coordinates ? "✅" : "📍"}</div>
                      <span className="text-[10px] font-bold uppercase text-center leading-tight">
                        {newContact.coordinates ? "Saved" : "Tap GPS"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {isSalesOnField && !newContact.coordinates && !isDetectingLocation && (
            <p className="text-[10px] font-medium text-red-500 mt-1.5 flex items-center gap-1">
              <span>⚠️</span> Required: Tap the GPS button
            </p>
          )}
        </div>

        {/* Image Upload Area */}
        {!isSalesOnline && (
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
        )}
      </div>

      {/* Modal Footer with Logic Validation */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveContact}
            disabled={
              !newContact.name || 
              !newContact.address_line_1 || 
              (isSalesOnField && (!newContact.mobile || !newContact.coordinates)) ||
              (isSalesOnline && !newContact.mobile) ||
              (salesUser?.role === "sale" && !newContact.mobile) ||
              (!!newContact.mobile?.trim() && checkPhoneExists(newContact.mobile.trim(), editingId))
            }
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isEditing 
              ? (isSalesOnField ? "Update Field Customer" : "Update Customer")
              : (isSalesOnField ? "Save Field Customer" : "Save Customer")
            }
          </button>
        </div>
      </div>
    </div>
  </div>
)}

      {/* Map Modal - Only show for non-salesOnField users if needed */}
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
              center={newContact.coordinates || { lat: 11.567, lng: 104.928 }}
              zoom={15}
              onClick={(e) => {
                if (e.latLng) {
                  setNewContact({
                    ...newContact,
                    latitude: e.latLng.lat(),
                    longitude: e.latLng.lng(),
                    coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() },
                  });
                }
              }}
            >
              {newContact.coordinates && (
                <Marker
                  position={newContact.coordinates}
                  draggable
                  onDragEnd={(e) => {
                    if (e.latLng) {
                      setNewContact({
                        ...newContact,
                        latitude: e.latLng.lat(),
                        longitude: e.latLng.lng(),
                        coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() },
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
                    setNewContact({
                      ...newContact,
                      latitude: undefined,
                      longitude: undefined,
                      coordinates: undefined,
                    });
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Clear Selection
                </button>
              </div>
              
              {newContact.coordinates ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Latitude</p>
                      <p className="text-sm font-medium">
                        {newContact.coordinates.lat.toFixed(6)}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Longitude</p>
                      <p className="text-sm font-medium">
                        {newContact.coordinates.lng.toFixed(6)}
                      </p>
                    </div>
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
                  if (newContact.coordinates) {
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