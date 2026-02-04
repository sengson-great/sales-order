"use client";

import Icon from "../Icon";
import { useRouter } from "next/navigation";
import { useCheckout } from "@/context/CheckOutContext";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { toast } from "react-toastify";
import axios from "axios";
import { useLanguage } from "@/context/LanguageContext";

const BottomNav: React.FC = () => {
  const router = useRouter();
  const {
    total,
    placeOrder,
    placeRewardOrder,
    cart,
    rewards,
    paymentMethod,
    selectedAddress,
  } = useCheckout();
  const [activePage, setActivePage] = useState<"home" | "chat">("home");
  const { t } = useLanguage();

  const { user } = useAuth();
  const pathname = usePathname();
  const isCheckoutPage = pathname === "/checkout";

  const isCartEmpty = cart.length === 0 && rewards.length === 0;
  const isPaymentMissing = !paymentMethod;
  const isAddressMissing = !selectedAddress;

  const formatPrice = (value: number) =>
    typeof value !== "number" || isNaN(value) ? "$0.00" : `$${value.toFixed(2)}`;

  const handleClickCheckout = () => {
    if (!user) return router.push("/sign-in-sale");

    if (isCheckoutPage) {
      const errors: string[] = [];
      if (cart.length > 0 && rewards.length > 0) {
        errors.push("Cannot mix products and rewards!");
      }
      if (cart.length === 0 && rewards.length === 0) errors.push(t.yourCartIsEmpty);
      if (isPaymentMissing) errors.push(t.pleaseSelectAPaymentMethod);
      if (isAddressMissing) errors.push(t.pleaseSelectAShippingAddress);

      if (errors.length > 0) {
        errors.forEach((err) => toast.error(err));
        return;
      }

      if (rewards.length > 0) {
        placeRewardOrder?.();
      } else {
        placeOrder?.();
      }
    } else {
      router.push("/checkout");
    }
  };

  const handleChatRedirect = async () => {
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/telegram-link`,
        { withCredentials: true }
      );
  
      if (res.data?.telegram_link) {
        window.location.href = res.data.telegram_link;
      } else {
        toast.error("Telegram link not found!");
      }
    } catch (error) {
      toast.error("Failed to open Telegram chat");
    }
  };

  const iconColor = (page: "home" | "chat") =>
    activePage === page ? "#1E40AF" : "#6B7280";

  // Page translations mapping
  const getPageName = (page: string) => {
    const pageTranslations: Record<string, string> = {
      home: t.home || "Home",
      chat: t.chat || "Chat",
    };
    return pageTranslations[page] || page.charAt(0).toUpperCase() + page.slice(1);
  };

  return (
    <section className="flex items-center justify-between my-2">
      <div className="flex items-center gap-4">
        {["home", "chat"].map((page) => (
          <div
            key={page}
            onClick={() => {
              if (page === "chat") {
                handleChatRedirect();
                return;
              }
              router.push(`/${page === "home" ? "" : page}`);
              setActivePage(page as "home" | "chat");
            }}
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            <Icon
              icon={
                page === "home"
                  ? "solar:home-2-linear"
                  : page === "chat"
                  ? "solar:chat-dots-linear"
                  : "lets-icons:order-light"
              }
              width={24}
              height={24}
              style={{ color: iconColor(page as "home" | "chat") }}
            />
            <p
              className="text-[13px] font-medium"
              style={{ color: iconColor(page as "home" | "chat") }}
            >
              {getPageName(page)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center">
        <p className="text-[17px] font-semibold leading-none">{formatPrice(total)}</p>
        <p className="text-[13px] leading-none pt-1 text-gray-500">{t.total}</p>
      </div>

      <button
        onClick={handleClickCheckout}
        className="border rounded-[8px] px-6 py-3 font-semibold shadow-sm bg-[#1E40AF] text-white hover:opacity-80 active:scale-95 transition"
      >
        {t.checkout}
      </button>
    </section>
  );
};

export default BottomNav;