"use client";

import { useState, useEffect } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { UserProfile } from "@/components/auth/user-profile";
import { QuestionPreview } from "@/components/PrivateDataGame/QuestionPreview";
import { AppUser } from "@/types/types";

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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-4 py-6 sm:py-8 lg:py-12">
        <div className="container mx-auto h-full">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">
              {process.env.NEXT_PUBLIC_APP_TITLE || "passkey-demo"}
            </h1>
            <div className="max-w-2xl mx-auto space-y-1 sm:space-y-2">
              <p className="text-sm sm:text-base lg:text-lg xl:text-xl text-gray-600 leading-relaxed">
                <span className="text-blue-600">{">"}</span>{" "}
                <span className="inline-block">
                  {process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
                    "Secure, passwordless authentication using WebAuthn passkeys"}
                </span>
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-normal leading-relaxed">
                {/* */}{" "}
                <span className="inline-block">
                  {process.env.NEXT_PUBLIC_APP_SUBTITLE ||
                    "No passwords required - just your device's biometrics"}
                </span>
              </p>
            </div>
          </div>

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mx-auto  h-full">
              <div className="flex justify-center md:justify-end">
                <AuthForm onAuthSuccess={handleAuthSuccess} />
              </div>
              <div className="flex justify-center md:justify-start">
                <div className="w-full max-w-xl h-full">
                  <QuestionPreview />
                </div>
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
