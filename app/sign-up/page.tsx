"use client";
import React, { useState } from "react";
import { AxiosError } from "axios";
import api from "@/api/api";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";

export default function Signup() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const { t } = useLanguage();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await api.post<{
        success: boolean;
        otp: string;
        message?: string;
      }>("/register", { phone, name: username }, { withCredentials: true });

      if (res.data.success) {
        const otp = res.data.otp; // fake OTP
        router.push(
          `/verify-otp?phone=${encodeURIComponent(
            phone
          )}&username=${encodeURIComponent(username)}&otp=${otp}`
        );
      } else {
        setMessage(res.data.message || "Failed to generate OTP");
      }
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        setMessage(error.response?.data?.message || "Something went wrong ❌");
      } else {
        setMessage("Something went wrong ❌");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex justify-center items-center w-full">
      <form onSubmit={handleSignup} className="mt-4 w-full max-w-md">
        <h1 onClick={() => router.push('/')} className="text-2xl font-bold text-center text-gray-800">SOB</h1>
        <h2 className="text-lg font-medium text-center text-gray-600 mb-6">
          {t.fillYourDetails}
        </h2>

        {/* First Name */}
        <div className="w-full mt-4">
          <label className="text-[16px] font-medium text-gray-700">
            {t.username}
          </label>
          <input
            type="text"
            placeholder={t.enterYourUsername}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 min-h-[45px] py-2 border focus:outline-0 rounded-[5px] focus:border-blue-600 mt-2"
            required
          />
        </div>

        {/* Phone */}
        <div className="w-full mt-4">
          <label className="text-[16px] font-medium text-gray-700">
            {t.phoneNumber}
          </label>
          <input
            type="text"
            placeholder={t.enterYourPhoneNumber}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 min-h-[45px] py-2 border focus:outline-0 rounded-[5px] focus:border-blue-600 mt-2"
            required
          />
        </div>

        {/* Password
        <div className="w-full mt-4">
          <label className="text-[16px] font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 min-h-[45px] py-2 border focus:outline-0 rounded-[5px] focus:border-blue-600 mt-2"
            required
          />
        </div> */}

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-6 bg-gray-700 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 active:scale-95 transition"
        >
          {loading ? "Signing up..." : "Sign Up"}
        </button>

        {message && (
          <p className="text-center mt-2 text-sm text-red-500">{message}</p>
        )}

        <div className="mt-2 w-full">
          <p className="text-center text-[14px] font-medium">
            {t.alreadyHaveAnAccount} {""}
            <span
              onClick={() => router.push("/sign-in-sale")}
              className="text-blue-600 cursor-pointer"
            >
              {t.logInToYourAccount}
            </span>
          </p>
        </div>
      </form>
    </div>
  );
}
