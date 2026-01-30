"use client";

import { useState, useEffect } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { UserProfile } from "@/components/auth/user-profile";
import { QuestionPreview } from "@/components/PrivateDataGame/QuestionPreview";
import { AppUser } from "@/types/types";
import Image from "next/image";

export default function Home() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appVersion, setAppVersion] = useState<string>("");
  const [prfKek, setPrfKek] = useState<CryptoKey | null>(null);

  useEffect(() => {
    checkAuthStatus();
    fetchVersion();
  }, []);

  const fetchVersion = async () => {
    try {
      const response = await fetch("/api/version");
      const data = await response.json();
      setAppVersion(data.version || "");
    } catch (error) {
      console.error("Error fetching version:", error);
    }
  };

  const checkAuthStatus = async () => {
    try {
      const response = await fetch("/api/auth/me");
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error("Auth check error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = (userData: AppUser, _prfKek?: CryptoKey | null) => {
    setUser(userData);

    if (_prfKek) {
      setPrfKek(_prfKek);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setPrfKek(null);

    // hard reload the app to reset any in-memory state
    window.location.href = "/";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white/90 via-white/80 to-white/70 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-white/90 via-white/80 to-white/70  flex flex-col">
      <div className="flex-1 flex flex-col justify-top px-4 py-6 sm:py-8 lg:py-6">
        <div className="container mx-auto h-full max-w-6xl">
          {user && (
            <div className="bgx-red-500 flex md:flex-row flex-col items-center justify-center md:gap-4 pb-2">
              <div className="flex justify-center bg-white rounded-full p-[10px] w-fit mx-auto overflow-hidden">
                <Image
                  src="/mora-cat-logo.png"
                  alt="MORA Cat Logo"
                  width={60}
                  height={20}
                  className=""
                />
              </div>
              <div className="">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
                  {process.env.NEXT_PUBLIC_APP_TITLE || ""}
                </h1>
              </div>
              <div className="w-full">
                <p className="text-sm sm:text-base lg:text-lg xl:text-xl text-gray-600 leading-relaxed text-center md:text-left">
                  <span className="inline-block">
                    {process.env.NEXT_PUBLIC_APP_DESCRIPTION || ""}
                  </span>
                </p>
                <p className="text-xs text-gray-500 font-normal leading-relaxed w-full hidden md:block">
                  {process.env.NEXT_PUBLIC_APP_SUBTITLE || ""}
                </p>
              </div>
            </div>
          )}

          {user ? (
            <div className="flex justify-center">
              <UserProfile
                user={user}
                prfKek={prfKek}
                onLogout={handleLogout}
                onSyncAuthStatusViaServer={checkAuthStatus}
              />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 bgx-red-500">
              <div className="mt-20">
                <div className="flex justify-center bg-white rounded-full p-[10px] w-fit mx-auto overflow-hidden">
                  <Image
                    src="/mora-cat-logo.png"
                    alt="MORA Cat Logo"
                    width={120}
                    height={40}
                    className=""
                  />
                </div>

                <div className="text-center mb-3">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">
                    {process.env.NEXT_PUBLIC_APP_TITLE || ""}
                  </h1>
                  <div className="max-w-2xl mx-auto space-y-1 sm:space-y-2">
                    <p className="text-sm sm:text-base lg:text-lg xl:text-xl text-gray-600 leading-relaxed">
                      <span className="inline-block">
                        {process.env.NEXT_PUBLIC_APP_DESCRIPTION || ""}
                      </span>
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 font-normal leading-relaxed">
                      {/* */}{" "}
                      <span className="inline-block">
                        {process.env.NEXT_PUBLIC_APP_SUBTITLE || ""}
                      </span>
                    </p>
                  </div>
                </div>

                <AuthForm onAuthSuccess={handleAuthSuccess} />
              </div>
              <div className="">
                <QuestionPreview />
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="w-full py-2 px-4">
        <div className="container mx-auto text-center">
          {appVersion && (
            <p className="text-[10px] text-gray-400">v{appVersion}</p>
          )}
        </div>
      </footer>
    </main>
  );
}
