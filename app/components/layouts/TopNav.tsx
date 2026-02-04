"use client";
import React from "react";
import Icon from "../Icon";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { usePoints } from "@/context/PointsContext";  // ← New
//import SpinWheelPic from "@/../public/spin-the-wheel.png";
import Image from "next/image";

const TopNav = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { points } = usePoints(); 

  const [location, setLocation] = React.useState<string>("Fetching location...");
  const [error, setError] = React.useState<string | null>(null);

  // Location code unchanged (same as before)
  React.useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      setLocation("");
      return;
    }

    let mounted = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!mounted) return;
        const { latitude, longitude } = position.coords;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.village || "";
          const country = data.address.country || "";

          if (mounted) {
            setLocation(city && country ? `${city}, ${country}` : "Unknown location");
          }
        } catch (err) {
          if (mounted) setLocation(`Lat: ${latitude}, Lon: ${longitude}`);
        }
      },
      (err) => {
        if (mounted) {
          setError(err.message);
          setLocation("");
        }
      }
    );

    return () => { mounted = false; };
  }, []);

  const handleProfileClick = () => {
    if (user) router.push("/account");
    else router.push("/sign-in-sale");
  };

  const handleWheelClick = () => {
    if (user) router.push("/wheel");
    else router.push("/sign-in-sale");
  };

  const handleCustomerViewClick = () => {
    if (user) router.push("/account/shipping-address");
    else router.push("/sign-in-sale");
  };

  return (
    <section className="flex flex-col gap-1">
      <div className="flex flex-row justify-between items-center">
        <h1 className="text-[18px] font-bold main-text">SOB</h1>

        <div className="flex flex-row gap-2">
          {/* <button onClick={handleWheelClick} className="p-1 flex items-center rounded-[10px] cursor-pointer transition">
            <Image src={SpinWheelPic} alt="wheel" width={20} height={20} />
          </button> */}

          <button onClick={toggleLanguage} className="p-1 text-sm flex items-center rounded-[10px] border border-gray-300 cursor-pointer hover:bg-gray-100 transition">
            {language === "en" ? "ភាសាខ្មែរ" : "English"}
          </button>

          <div onClick={handleProfileClick} className="p-1 flex items-center rounded-[10px] border border-gray-300 cursor-pointer hover:bg-gray-100 transition">
            <Icon className="text-gray-500" icon="mdi:account" width={18} height={18} />
          </div>
          {user?.role === "sale" && <div onClick={handleCustomerViewClick} className="p-1 flex items-center rounded-[10px] border border-gray-300 cursor-pointer hover:bg-gray-100 transition">
            Customer
          </div>}
        </div>
      </div>

      <div className="flex flex-row justify-between items-center mt-1">
        <div className="flex items-center gap-1">
          <Icon icon="mdi:map-marker-outline" width={18} height={18} className="text-gray-600" />
          <p className="text-[10px] font-medium text-gray-600">
            {t.yourCurrentLocationIs} {location}
          </p>
        </div>

        {/* Points - Now updates instantly every time */}
        {/* <div
          onClick={() => router.push("/account/reward")}
          className="p-1 flex flex-row items-center min-w-[75px] rounded-[10px] bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-md cursor-pointer hover:from-yellow-500 hover:to-yellow-600 transition"
        >
          <Icon className="text-white" icon="vaadin:database" width={15} height={15} />
          <p className="text-[12px] font-medium ml-1">
            {points.toLocaleString()}
          </p>
        </div> */}
      </div>

      {error && <p className="text-red-500 text-[12px]">{error}</p>}
    </section>
  );
};

export default TopNav;