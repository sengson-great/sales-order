"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/layouts/Header";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useCheckout, Address } from "@/context/CheckOutContext";
import { useAuth } from "@/context/AuthContext";
import { useLoading } from "@/context/LoadingContext";
import api from "@/api/api";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

const containerStyle = { width: "100%", height: "400px" };

export default function ShippingAddressPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { setLoading } = useLoading();
  const {
    selectedAddress,
    setSelectedAddress,
    currentAddress,
    setCurrentAddress,
  } = useCheckout();

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const [tempAddress, setTempAddress] = useState<Address>({
    label: "",
    phone: "",
    details: "",
    coordinates: { lat: 11.567, lng: 104.928 },
  });

  useEffect(() => {
    fetchSavedAddresses();
  }, []);

  const fetchSavedAddresses = async () => {
    setLoading(true);
    try {
      const res = await api.get("/addresses/all"); // your backend endpoint
      const data = res.data?.data;
      setSavedAddresses(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load addresses");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSavedAddress = (addr: Address) => {
    setSelectedAddress(addr); // hold full object
    setIsAdding(false);
  };

  const handleSelectCurrentAddress = () => {
    if (!tempAddress.label || !tempAddress.phone || !tempAddress.details || !tempAddress.coordinates) {
      toast.error("Please fill all fields and select a location.");
      return;
    }

    const shortAddress = `${tempAddress.details}, ${Number(tempAddress.coordinates.lat.toFixed(5))}, ${Number(tempAddress.coordinates.lng.toFixed(5))}`;

    const updatedAddress = {
      ...tempAddress,
      short_address: shortAddress, // <-- set it here
    };

    setCurrentAddress(updatedAddress); // update context
    setSelectedAddress("current"); // mark as current
    setIsAdding(false);
  };


  const handleNext = () => {
    const addressToSend =
      selectedAddress === "current" ? currentAddress : selectedAddress;
    if (!addressToSend) {
      toast.error("Please select an address before proceeding.");
      return;
    }
    console.log("Address to send to backend:", addressToSend);
    router.push("/checkout/payment");
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Shipping Address" />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto mt-4 flex flex-col gap-3">
        {/* Saved Addresses */}
        {savedAddresses.map((addr) => (
          <div
            key={addr.id}
            onClick={() => handleSelectSavedAddress(addr)}
            className={`p-4 rounded-xl border cursor-pointer flex flex-col transition ${selectedAddress && (selectedAddress as Address).id === addr.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200"
              }`}
          >
            <p className="font-semibold">{addr.label}</p>
            <p className="text-sm text-gray-600">{addr.details}</p>
            <p className="text-sm text-gray-600">Phone: {addr.phone}</p>
          </div>
        ))}

        {/* Current / Custom Address Form */}
        {isAdding && (
          <div className="px-4 py-3 border-t bg-white flex flex-col gap-2">
            <input
              type="text"
              placeholder="Label"
              value={tempAddress.label}
              onChange={(e) =>
                setTempAddress({ ...tempAddress, label: e.target.value })
              }
              className="w-full p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Phone"
              value={tempAddress.phone}
              onChange={(e) =>
                setTempAddress({ ...tempAddress, phone: e.target.value })
              }
              className="w-full p-2 border rounded"
            />
            <textarea
              placeholder="Details"
              value={tempAddress.details}
              onChange={(e) =>
                setTempAddress({ ...tempAddress, details: e.target.value })
              }
              className="w-full p-2 border rounded"
            />
            {/* Map */}
            <input
              type="text"
              readOnly
              value={
                tempAddress.coordinates
                  ? `Lat: ${tempAddress.coordinates.lat.toFixed(
                    5
                  )}, Lng: ${tempAddress.coordinates.lng.toFixed(5)}`
                  : ""
              }
              onClick={() => setShowMap(true)}
              className="w-full p-2 border rounded cursor-pointer"
            />

            <button
              onClick={handleSelectCurrentAddress}
              className="w-full py-3 bg-blue-600 text-white rounded"
            >
              Use This Address
            </button>
          </div>
        )}

        {/* Add / Use Current Location Button */}
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="mt-2 w-full py-3 bg-gray-200 rounded"
          >
            + Add / Use Current Location
          </button>
        )}
      </div>

      {/* Bottom Next Button */}
      <div className="border-t bg-white">
        <button
          onClick={handleNext}
          className="w-full py-3 bg-green-600 text-white rounded font-semibold"
        >
          Next: Payment
        </button>
      </div>

      {/* Map Modal */}
      {showMap && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-4 rounded w-[90%] max-w-lg">
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={tempAddress.coordinates}
              zoom={15}
              onClick={(e) =>
                setTempAddress({
                  ...tempAddress,
                  coordinates: { lat: e.latLng!.lat(), lng: e.latLng!.lng() },
                })
              }
            >
              {tempAddress.coordinates && (
                <Marker
                  position={tempAddress.coordinates}
                  draggable
                  onDragEnd={(e) =>
                    setTempAddress({
                      ...tempAddress,
                      coordinates: { lat: e.latLng!.lat(), lng: e.latLng!.lng() },
                    })
                  }
                />
              )}
            </GoogleMap>

            <button
              onClick={() => setShowMap(false)}
              className="mt-2 w-full py-2 bg-blue-600 text-white rounded"
            >
              Select
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
