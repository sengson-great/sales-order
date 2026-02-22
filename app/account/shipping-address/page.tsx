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
  place_pic?: string | string[];
};

const containerStyle = { width: "100%", height: "400px" };
const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = 10;
const MAX_IMAGES = 4;

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
    details: "",
    coordinates: undefined,
    place_pic: "",
  });

  // Image handling states
  const [locationImages, setLocationImages] = useState<File[]>([]); // new files to upload
  const [imagePreviews, setImagePreviews] = useState<string[]>([]); // URLs + data: previews

  // Current location detection state
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const isSalesOnField = useMemo(() => salesUser?.role === "salesOnField", [salesUser]);
  const isSalesOnline = useMemo(() => salesUser?.role === "salesOnline", [salesUser]);

  // ── Helpers ───────────────────────────────────────────────
  const getPlacePicArray = (contact: Contact): string[] => {
    if (!contact.place_pic) return [];
    if (typeof contact.place_pic === "string") return [contact.place_pic.trim()].filter(Boolean);
    if (Array.isArray(contact.place_pic)) return contact.place_pic.filter(Boolean);
    return [];
  };

// Add this to your fetchContacts function
async function fetchContacts() {
  setLoading(true);
  try {
    console.log("📥 Fetching contacts...");
    const res = await api.get<{ status: string; data: Contact[] }>("/contacts/all");
    
    // Check if previously deleted contacts are coming back
    if (contacts.length > 0) {
      const previousIds = new Set(contacts.map(c => c.id));
      const newIds = res.data.data.map(c => c.id);
      const reappearedIds = newIds.filter(id => !previousIds.has(id));
      
      if (reappearedIds.length > 0) {
        console.warn("⚠️ These contacts reappeared:", 
          res.data.data.filter(c => reappearedIds.includes(c.id))
        );
        
        // Check if they have the exact same data as before
        reappearedIds.forEach(id => {
          const oldContact = contacts.find(c => c.id === id);
          const newContact = res.data.data.find(c => c.id === id);
          console.log(`🔄 Contact ${id} reappeared:`, {
            old: oldContact,
            new: newContact,
            isSame: JSON.stringify(oldContact) === JSON.stringify(newContact)
          });
        });
      }
    }
    
    setContacts(res.data.data);
    
  } catch (err) {
    console.error(err);
    toast.error("Failed to load customers");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    fetchContacts();
  }, [setLoading]);

  const checkPhoneExists = (mobile: string, excludeId?: number | null): boolean => {
    if (!mobile) return false;
    const trimmedMobile = mobile.trim();
    return contacts.some((contact) => {
      if (excludeId && contact.id === excludeId) return false;
      return contact.mobile?.trim() === trimmedMobile;
    });
  };

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
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;
      setNewContact((prev) => ({
        ...prev,
        latitude,
        longitude,
        coordinates: { lat: latitude, lng: longitude },
      }));

      toast.success("Current location captured successfully!");
    } catch (error: any) {
      console.error("Geolocation error:", error);
      let errorMessage = "Failed to detect location";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location permission denied.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information unavailable.";
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
    if (!e.target.files?.length) return;

    const newFiles = Array.from(e.target.files);
    const validFiles = newFiles.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image`);
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" > 5MB`);
        return false;
      }
      return true;
    });

    if (imagePreviews.length + validFiles.length > MAX_IMAGES) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    setLocationImages((prev) => [...prev, ...validFiles]);

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImagePreviews((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));

    // Remove from new files if it was newly added
    const existingCount = imagePreviews.length - locationImages.length;
    if (index >= existingCount) {
      const newFileIndex = index - existingCount;
      setLocationImages((prev) => prev.filter((_, i) => i !== newFileIndex));
    }
  };

  const isValidPhone = (phone: string) => /^0\d{8,9}$/.test(phone.trim());

  const handleSaveContact = async () => {
    if (!newContact.name.trim()) return toast.error("Customer name is required.");
    const mobileToCheck = newContact.mobile.trim();
    if (!isValidPhone(mobileToCheck)) return toast.error("Invalid phone format (0 + 8-9 digits).");
    if (!mobileToCheck) return toast.error("Phone number is required.");
    if (checkPhoneExists(mobileToCheck, editingId)) return toast.error("Phone number already exists.");
    if (isSalesOnField && (!newContact.latitude || !newContact.longitude))
      return toast.error("Please capture GPS location.");
    if (!newContact.address_line_1?.trim()) return toast.error("Address is required.");

    const formData = new FormData();
    formData.append("name", newContact.name.trim());
    formData.append("type", "customer");
    formData.append("mobile", mobileToCheck);

    if (newContact.email) formData.append("email", newContact.email.trim());
    if (newContact.address_line_1) formData.append("address_line_1", newContact.address_line_1.trim());
    if (newContact.city) formData.append("city", newContact.city.trim());
    if (newContact.state) formData.append("state", newContact.state.trim());
    if (newContact.country) formData.append("country", newContact.country.trim());
    if (newContact.zip_code) formData.append("zip_code", newContact.zip_code.trim());

    if (newContact.latitude && newContact.longitude) {
      const coords = {
        lat: newContact.latitude,
        lng: newContact.longitude,
        type: "gps",
        timestamp: new Date().toISOString(),
      };
      formData.append("address_line_2", JSON.stringify(coords));
      formData.append("latitude", String(newContact.latitude));
      formData.append("longitude", String(newContact.longitude));
    }

    // ── Multiple Images ────────────────────────────────
    locationImages.forEach((file) => {
      formData.append("location_images[]", file);
    });

    const existingUrlsToKeep = imagePreviews.filter((url) => !url.startsWith("data:"));
    if (existingUrlsToKeep.length > 0) {
      formData.append("existing_place_pics", JSON.stringify(existingUrlsToKeep));
    }

    setLoading(true);
    try {
      if (isEditing && editingId) {
        formData.append("_method", "PUT");
        await api.post(`/contacts/${editingId}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Customer updated successfully");
      } else {
        await api.post("/contacts", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Customer saved successfully");
      }
      fetchContacts();
      handleCancel();
    } catch (err: any) {
      console.error("Save error:", err);
      if (err.response?.status === 422) {
        const errors = err.response.data.errors;
        toast.error(errors?.mobile ? "Phone number already exists." : "Validation failed.");
      } else {
        toast.error("Failed to save customer");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditContact = (contact: Contact) => {
    // Verify the contact has an ID
    if (!contact.id) {
      toast.error("Cannot edit: Contact ID is missing");
      return;
    }
    
    // Check if this contact exists in our current list
    const contactExists = contacts.find(c => c.id === contact.id);
    if (!contactExists) {
      toast.error("Cannot edit: Contact not found in current list");
      fetchContacts(); // Refresh the list
      return;
    }
    
    const existingUrls = getPlacePicArray(contact);
    setImagePreviews(existingUrls);
    setLocationImages([]);
  
    setNewContact({
      ...contact,
      details: contact.address_line_1 || "",
      coordinates: contact.latitude && contact.longitude
        ? { lat: contact.latitude, lng: contact.longitude }
        : undefined,
    });
  
    setEditingId(contact.id);
    setIsEditing(true);
    setShowFormModal(true);
    setSelectedContact(contact.id);
  };

  const handleAddNew = () => {
    resetForm();
    setShowFormModal(true);
  };

  const handleDeleteContact = async (id: number) => {
    if (!window.confirm("Delete this customer?")) return;
  
    setLoading(true);
    try {
      console.log("🗑️ Attempting to delete contact ID:", id);
      
      const res = await api.delete(`/contacts/${id}`);
      console.log("✅ Delete response:", res.data);
      
      // Remove from local state immediately
      setContacts((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        console.log(`📋 Removed from local state. Before: ${prev.length}, After: ${filtered.length}`);
        return filtered;
      });
      
      if (selectedContact === id) setSelectedContact(null);
      toast.success("Customer deleted successfully");
      
      // Check if the contact is recreated immediately
      setTimeout(async () => {
        try {
          const checkRes = await api.get(`/contacts/${id}`);
          console.error("🚨 Contact was recreated immediately!", checkRes.data);
          toast.error("Contact was automatically recreated!");
        } catch (err) {
          console.log("✅ Contact still deleted after 2 seconds");
        }
      }, 2000);
      
      // Check again after 10 seconds
      setTimeout(async () => {
        try {
          const checkRes = await api.get(`/contacts/${id}`);
          console.error("🚨 Contact was recreated after 10 seconds!", checkRes.data);
        } catch (err) {
          console.log("✅ Contact still deleted after 10 seconds");
        }
      }, 10000);
      
    } catch (err: any) {
      // ... error handling
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
      place_pic: "",
    });
    setIsEditing(false);
    setEditingId(null);
    setShowMapModal(false);
    setLocationImages([]);
    setImagePreviews([]);
  };

  const handleCancel = () => {
    resetForm();
    setShowFormModal(false);
  };

  // Pagination logic
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase().trim();
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(query) ||
        c.mobile?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.address_line_1?.toLowerCase().includes(query),
    );
  }, [contacts, searchQuery]);

  const totalItems = filteredContacts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const goToPage = (page: number) => setCurrentPage(page);
  const goToNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);
  const goToPreviousPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };
  const handleClearSearch = () => setSearchQuery("");

  return (
    <div className="flex flex-col h-full gap-6">
      <Header
        title={
          isSalesOnField
            ? "Field Customer Management"
            : salesUser?.role === "sale"
              ? "Customer Information"
              : "Customer Management"
        }
      />

      {/* Search & Add Button */}
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
          <button onClick={handleClearSearch} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
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
          <button
            onClick={handleAddNew}
            className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            {isSalesOnField ? "Add Field Customer" : "Add New Customer"}
          </button>
        </div>
      </div>

      {/* Items per page */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Items per page:</span>
          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {ITEMS_PER_PAGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        {totalItems > 0 && <div className="text-sm text-gray-600">Page {currentPage} of {totalPages}</div>}
      </div>

      {/* Customer List */}
      <div className="flex flex-col gap-3">
        {paginatedContacts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery.trim()
              ? `No customers found for "${searchQuery}"`
              : isSalesOnField
                ? "No field customers saved yet."
                : "No customers saved yet."}
          </div>
        ) : (
          paginatedContacts.map((contact) => (
            <div
              key={contact.id}
              className={`p-4 rounded-xl border flex justify-between items-start gap-4 shadow hover:shadow-md transition cursor-pointer ${
                selectedContact === contact.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
              }`}
              onClick={() => setSelectedContact(contact.id!)}
            >
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{contact.name}</span>
                      {isSalesOnField && getPlacePicArray(contact).length > 0 && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                          <span>📸</span> {getPlacePicArray(contact).length}
                        </span>
                      )}
                      {contact.contact_status === "inactive" && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Inactive</span>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex flex-col items-center gap-4 px-2 py-6 border-t border-gray-100">
          <div className="text-xs tracking-wide text-gray-400 uppercase font-bold">
            Showing <span className="text-gray-900">{startIndex + 1}</span> -{" "}
            <span className="text-gray-900">{Math.min(endIndex, totalItems)}</span> of{" "}
            <span className="text-gray-900">{totalItems}</span>
          </div>

          <div className="flex items-center bg-gray-50 p-1.5 rounded-2xl border border-gray-200 shadow-sm">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="p-2.5 rounded-xl text-gray-600 hover:bg-white disabled:opacity-30"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  if (totalPages <= 5) return true;
                  return page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1);
                })
                .map((page, index, array) => (
                  <React.Fragment key={page}>
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="w-8 text-center text-gray-400 text-xs">...</span>
                    )}
                    <button
                      onClick={() => goToPage(page)}
                      className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                        currentPage === page
                          ? "bg-blue-600 text-white shadow-lg scale-110"
                          : "text-gray-500 hover:bg-white hover:text-blue-600"
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))}
            </div>

            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="p-2.5 rounded-xl text-gray-600 hover:bg-white disabled:opacity-30"
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
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">
                {isEditing
                  ? isSalesOnField
                    ? "Edit Field Customer"
                    : "Edit Customer"
                  : isSalesOnField
                    ? "Add Field Customer"
                    : "Add New Customer"}
              </h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 text-2xl p-1">
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
                <input
                  type="text"
                  placeholder="Enter customer name"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone *
                  {newContact.mobile?.trim() && checkPhoneExists(newContact.mobile.trim(), editingId) && (
                    <span className="ml-2 text-xs text-red-600">⚠️ Already exists</span>
                  )}
                  {newContact.mobile && !isValidPhone(newContact.mobile) && (
                    <p className="mt-1 text-xs text-red-500">Must start with 0 and be 9-10 digits.</p>
                  )}
                </label>
                <input
                  type="tel"
                  placeholder="Customer phone number"
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    checkPhoneExists(newContact.mobile?.trim() || "", editingId)
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  value={newContact.mobile || ""}
                  onChange={(e) => setNewContact({ ...newContact, mobile: e.target.value })}
                />
              </div>

              {/* Location Details + GPS */}
              <div className="w-full">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isSalesOnField ? "Location Details *" : "Delivery Address *"}
                </label>
                <div className="flex gap-2 items-stretch">
                  <div className="flex-[2.5]">
                    <textarea
                      placeholder={isSalesOnField ? "Describe location..." : "Street, building..."}
                      className="w-full h-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm resize-none"
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
                        className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 transition-all ${
                          isDetectingLocation
                            ? "bg-gray-100 border-gray-200"
                            : newContact.coordinates
                              ? "bg-green-50 border-green-500 text-green-700"
                              : "bg-blue-600 border-blue-600 text-white"
                        }`}
                      >
                        {isDetectingLocation ? (
                          <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                        ) : (
                          <>
                            <div className="text-xl mb-1">{newContact.coordinates ? "✅" : "📍"}</div>
                            <span className="text-[10px] font-bold uppercase text-center">
                              {newContact.coordinates ? "Saved" : "Tap GPS"}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                {isSalesOnField && !newContact.coordinates && !isDetectingLocation && (
                  <p className="text-[10px] text-red-500 mt-1.5 flex items-center gap-1">
                    <span>⚠️</span> Required: Tap the GPS button
                  </p>
                )}
              </div>

              {/* Multiple Images Upload */}
              {!isSalesOnline && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Location Photos
                    <span className="ml-2 text-xs text-gray-500">
                      ({imagePreviews.length} / {MAX_IMAGES})
                    </span>
                    {isSalesOnField && imagePreviews.length === 0 && (
                      <span className="ml-2 text-xs text-amber-600">recommended</span>
                    )}
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {imagePreviews.map((preview, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 shadow-sm group"
                      >
                        <img src={preview} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute top-1.5 right-1.5 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow opacity-90 hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {imagePreviews.length < MAX_IMAGES && (
                      <label className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                        <span className="text-3xl mb-1">📸+</span>
                        <span className="text-xs text-gray-500 text-center px-2">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          capture={isSalesOnField ? "environment" : undefined}
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

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
                    !newContact.name.trim() ||
                    !newContact.address_line_1?.trim() ||
                    (isSalesOnField && (!newContact.mobile.trim() || !newContact.coordinates)) ||
                    (!!newContact.mobile?.trim() && checkPhoneExists(newContact.mobile.trim(), editingId))
                  }
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {isEditing
                    ? isSalesOnField
                      ? "Update Field Customer"
                      : "Update Customer"
                    : isSalesOnField
                      ? "Save Field Customer"
                      : "Save Customer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {showMapModal && !isSalesOnField && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[60] p-4">
          <div className="bg-white rounded-lg p-4 w-[90%] max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Select Location</h3>
                <p className="text-sm text-gray-500">Click on the map to select a location</p>
              </div>
              <button onClick={() => setShowMapModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl p-1">
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