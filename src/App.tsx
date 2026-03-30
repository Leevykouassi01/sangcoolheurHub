/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db, doc, onSnapshot, collection, query, where, getDocs, setDoc, serverTimestamp, getDoc } from "./firebase";
import { User } from "firebase/auth";
import { Layout, Briefcase, Users, MessageSquare, UserCircle, LogIn, LogOut, Menu, X, AlertCircle, GraduationCap, ShieldCheck, Phone, CheckCircle2, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import React, { Component, ErrorInfo, ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import JobBoard from "./components/JobBoard";
import TalentDirectory from "./components/TalentDirectory";
import CareerCoach from "./components/CareerCoach";
import ProfileEditor from "./components/ProfileEditor";
import BusinessHub from "./components/BusinessHub";
import FormationHub from "./components/FormationHub";
import AdminDashboard from "./components/AdminDashboard";
import { Hub } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = "jobs" | "talents" | "coach" | "profile" | "business" | "formation" | "admin";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-red-100 shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-2 font-sans">Oups ! Quelque chose s'est mal passé.</h2>
          <p className="text-[#1a1a1a]/60 text-center max-w-md mb-6 font-serif italic">
            Une erreur inattendue est survenue. Veuillez rafraîchir la page ou réessayer plus tard.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-brand-blue text-white rounded-full font-medium hover:bg-brand-blue/90 transition-colors"
          >
            Rafraîchir la page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-red-50 text-red-800 text-xs rounded-lg overflow-auto max-w-full">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("jobs");
  const [activeHub, setActiveHub] = useState<Hub>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);

  useEffect(() => {
    // Generate or retrieve Device ID
    let id = localStorage.getItem("sangcool_device_id");
    if (!id) {
      try {
        id = crypto.randomUUID();
      } catch (e) {
        id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      localStorage.setItem("sangcool_device_id", id);
    }
    setDeviceId(id);

    // Anti-copy / Anti-screenshot listeners
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleCopy = (e: ClipboardEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || (e.ctrlKey && (e.key === "c" || e.key === "u" || e.key === "s"))) {
        e.preventDefault();
        alert("Action non autorisée pour des raisons de sécurité.");
      }
    };
    const handleBlur = () => setIsWindowFocused(false);
    const handleFocus = () => setIsWindowFocused(true);

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Check if already authorized in this session
  useEffect(() => {
    const savedPhone = localStorage.getItem("sangcool_auth_phone");
    if (savedPhone) {
      setIsAuthorized(true);
    }
  }, []);

  useEffect(() => {
    if (user && isAuthReady) {
      const unsubscribe = onSnapshot(doc(db, "profiles", user.uid), (doc) => {
        if (doc.exists()) {
          const profile = doc.data();
          // Consider profile complete if it has a fullName and title
          setIsProfileComplete(!!(profile.fullName && profile.title));
        } else {
          setIsProfileComplete(false);
        }
      });
      return () => unsubscribe();
    } else {
      setIsProfileComplete(null);
    }
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("sangcool_auth_phone");
      setIsAuthorized(false);
      setPhoneNumber("");
      setActiveTab("jobs");
      setActiveHub(null);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleSecurityCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    if (!phoneNumber.trim()) {
      setAuthError("Veuillez entrer votre numéro de téléphone.");
      return;
    }

    try {
      // Fetch IP
      let ip = "Unknown";
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        ip = ipData.ip;
      } catch (e) {
        console.error("IP fetch failed", e);
      }

      // Clean phone number (remove spaces, etc.)
      const cleanPhone = phoneNumber.replace(/\s+/g, "");
      
      // SUPER ADMIN BYPASS & AUTO-BOOTSTRAP
      const isAdminNumber = cleanPhone === "0747147385";
      
      // Check whitelist directly by ID (phone number)
      const whitelistDoc = await getDoc(doc(db, "whitelist_numbers", cleanPhone));

      if (!whitelistDoc.exists() && !isAdminNumber) {
        setAuthError("Ce numéro n'est pas autorisé. Contactez l'administration.");
        return;
      }

      let memberData = whitelistDoc.exists() ? whitelistDoc.data() : null;
      let memberDocId = cleanPhone;

      // Device Locking Logic (Bypassed for Super Admin if needed, but kept for security)
      if (memberData?.authorizedDeviceId && memberData.authorizedDeviceId !== deviceId && !isAdminNumber) {
        setAuthError("Cet identifiant est déjà utilisé sur un autre appareil. Contactez l'administration pour réinitialiser votre accès.");
        return;
      }

      // If first login, Super Admin, or same device, authorize
      if (!memberData || !memberData.authorizedDeviceId) {
        await setDoc(doc(db, "whitelist_numbers", memberDocId), {
          phone: cleanPhone,
          name: isAdminNumber ? "Super Admin" : (memberData?.name || ""),
          authorizedDeviceId: deviceId,
          lastLogin: serverTimestamp(),
          lastIp: ip,
          createdAt: memberData?.createdAt || serverTimestamp()
        }, { merge: true });
      } else {
        await setDoc(doc(db, "whitelist_numbers", memberDocId), {
          lastLogin: serverTimestamp(),
          lastIp: ip
        }, { merge: true });
      }

      localStorage.setItem("sangcool_auth_phone", cleanPhone);
      setIsAuthorized(true);
    } catch (error: any) {
      console.error("Security check failed:", error);
      setAuthError(`Une erreur est survenue lors de la vérification: ${error.message || "Erreur inconnue"}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // Security Gate
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-blue p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 sm:p-12 rounded-[40px] shadow-2xl w-full max-w-md text-center space-y-8"
        >
          <div className="w-20 h-20 bg-brand-blue rounded-3xl flex items-center justify-center text-white text-4xl font-bold mx-auto shadow-xl">S</div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-sans">Sangcoolheur</h1>
            <p className="text-gray-400 font-sans text-sm tracking-widest uppercase font-bold">Accès Sécurisé</p>
          </div>

          {!user ? (
            <div className="space-y-6">
              <div className="p-4 bg-brand-blue/5 rounded-2xl text-sm text-brand-blue font-medium">
                Veuillez vous connecter avec votre compte Google pour continuer la vérification.
              </div>
              <button
                onClick={handleLogin}
                className="w-full py-4 bg-white border-2 border-gray-100 text-[#1a1a1a] rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center justify-center gap-3"
              >
                <Globe className="w-5 h-5 text-brand-blue" />
                Se connecter avec Google
              </button>
            </div>
          ) : (
            <form onSubmit={handleSecurityCheck} className="space-y-4">
              <div className="p-3 bg-green-50 text-green-700 rounded-xl text-xs font-medium flex items-center gap-2 justify-center">
                <CheckCircle2 className="w-4 h-4" />
                Connecté en tant que {user.email}
              </div>
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Numéro de téléphone autorisé</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    required
                    type="tel"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="Ex: +225 0707070707"
                    className="w-full p-4 pl-12 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-brand-blue/20 font-bold"
                  />
                </div>
              </div>
              {authError && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-xl">{authError}</p>
              )}
              <button className="w-full py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20">
                Vérifier mon accès
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-bold text-gray-400 hover:text-red-600 transition-colors uppercase tracking-widest"
              >
                Changer de compte Google
              </button>
            </form>
          )}
          <p className="text-[10px] text-gray-400 font-sans leading-relaxed">
            L'accès est réservé aux membres enregistrés. Votre compte est lié à cet appareil pour des raisons de sécurité.
          </p>
        </motion.div>
      </div>
    );
  }

  // Hub Selection Landing
  if (!activeHub) {
    return (
      <div className={cn(
        "min-h-screen bg-brand-blue flex flex-col items-center justify-center p-8 transition-all duration-500",
        !isWindowFocused && "blur-xl grayscale pointer-events-none"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-12 w-full max-w-6xl"
        >
          <div className="space-y-4">
            <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center text-brand-blue text-5xl font-bold mx-auto shadow-2xl">S</div>
            <h1 className="text-5xl font-bold text-white font-sans tracking-tight">Sangcoolheur Hub</h1>
            <p className="text-white/60 text-xl font-serif italic">"Le talent au cœur de la communauté"</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { id: "emploi", title: "Emploi HUB", desc: "Recrutement, Talents & Carrière", icon: Briefcase, color: "bg-white" },
              { id: "business", title: "Opportunité HUB", desc: "Marchés, Appels d'offres & Garanties", icon: Layout, color: "bg-white" },
              { id: "formation", title: "Formation HUB", desc: "Cours, Ateliers & Montée en compétences", icon: GraduationCap, color: "bg-white" }
            ].map((hub) => (
              <motion.button
                key={hub.id}
                whileHover={{ scale: 1.05, y: -10 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setActiveHub(hub.id as Hub);
                  setActiveTab(hub.id === "emploi" ? "jobs" : hub.id === "business" ? "business" : "formation");
                }}
                className={`${hub.color} p-10 rounded-[40px] shadow-2xl text-left space-y-6 transition-all group`}
              >
                <div className="w-16 h-16 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-brand-blue group-hover:bg-brand-blue group-hover:text-white transition-all">
                  <hub.icon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#1a1a1a] mb-2">{hub.title}</h3>
                  <p className="text-gray-500 font-sans text-sm leading-relaxed">{hub.desc}</p>
                </div>
                <div className="pt-4 flex items-center gap-2 text-brand-blue font-bold text-sm uppercase tracking-widest">
                  Entrer dans l'univers
                  <Menu className="w-4 h-4 rotate-[-90deg]" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [];
  
  if (activeHub === "emploi") {
    tabs.push(
      { id: "jobs", label: "Emplois", icon: Briefcase },
      { id: "talents", label: "Talents", icon: Users },
      { id: "coach", label: "Coach IA", icon: MessageSquare }
    );
  } else if (activeHub === "business") {
    tabs.push({ id: "business", label: "Opportunités", icon: Layout });
  } else if (activeHub === "formation") {
    tabs.push({ id: "formation", label: "Formations", icon: GraduationCap });
  }

  if (user) {
    tabs.push({ id: "profile", label: "Mon Profil", icon: UserCircle });
    if (user.email === "leevykouassi@gmail.com") {
      tabs.push({ id: "admin", label: "Admin", icon: ShieldCheck });
    }
  }

  return (
    <div className={cn(
      "min-h-screen bg-[#F5F5F0] text-[#1a1a1a] font-serif transition-all duration-500",
      !isWindowFocused && "blur-xl grayscale pointer-events-none"
    )}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#1a1a1a]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <button onClick={() => setActiveHub(null)} className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-brand-blue rounded-lg flex items-center justify-center text-white font-bold group-hover:scale-110 transition-transform">S</div>
              <h1 className="text-xl font-bold tracking-tight font-sans hidden sm:block">Sangcoolheur</h1>
            </button>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium transition-colors hover:text-brand-blue",
                    activeTab === tab.id ? "text-brand-blue underline underline-offset-8" : "text-[#1a1a1a]/60"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
              {!user ? (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-full text-sm font-medium hover:bg-brand-blue/90 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Connexion
                </button>
              ) : (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Déconnexion
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-b border-[#1a1a1a]/10 overflow-hidden"
            >
              <div className="px-4 pt-2 pb-6 space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as Tab);
                      setIsMenuOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 w-full p-3 rounded-xl text-left transition-colors",
                      activeTab === tab.id ? "bg-brand-blue/10 text-brand-blue" : "text-[#1a1a1a]/60 hover:bg-gray-50"
                    )}
                  >
                    <tab.icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setActiveHub(null);
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full p-3 rounded-xl text-brand-blue bg-brand-blue/5 mt-2"
                >
                  <Layout className="w-5 h-5" />
                  Changer de Hub
                </button>
                {!user ? (
                  <button
                    onClick={handleLogin}
                    className="flex items-center gap-3 w-full p-3 rounded-xl bg-brand-blue text-white mt-4"
                  >
                    <LogIn className="w-5 h-5" />
                    Connexion
                  </button>
                ) : (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full p-3 rounded-xl text-red-600 mt-4"
                  >
                    <LogOut className="w-5 h-5" />
                    Déconnexion
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user && isProfileComplete === false && activeTab !== "profile" && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-brand-blue/5 border border-brand-blue/20 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm"
          >
            <div className="flex items-center gap-4 text-brand-blue">
              <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center">
                <UserCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-lg">Profil Incomplet</h4>
                <p className="text-sm opacity-80 font-sans">Veuillez compléter votre profil pour être visible par la communauté.</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab("profile")}
              className="w-full sm:w-auto px-8 py-3 bg-brand-blue text-white font-bold rounded-full hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
            >
              Compléter mon profil
            </button>
          </motion.div>
        )}
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "jobs" && <JobBoard user={user} />}
              {activeTab === "talents" && <TalentDirectory user={user} />}
              {activeTab === "coach" && <CareerCoach user={user} />}
              {activeTab === "profile" && user && (
                <ProfileEditor 
                  user={user} 
                  onAdminAccess={() => {
                    setActiveHub("business");
                    setActiveTab("admin");
                  }} 
                />
              )}
              {activeTab === "business" && user && <BusinessHub user={user} />}
              {activeTab === "formation" && user && <FormationHub user={user} />}
              {activeTab === "admin" && user && <AdminDashboard user={user} />}
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#1a1a1a]/10 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-6 h-6 bg-brand-blue rounded flex items-center justify-center text-white text-xs font-bold">S</div>
            <span className="text-lg font-bold font-sans">Sangcoolheur</span>
          </div>
          <p className="text-[#1a1a1a]/60 text-sm italic mb-8">"Le talent au cœur de la communauté"</p>
          <div className="flex justify-center gap-8 text-xs uppercase tracking-widest font-sans font-semibold opacity-50">
            <a href="#" className="hover:text-brand-blue">À propos</a>
            <a href="#" className="hover:text-brand-blue">Confidentialité</a>
            <a href="#" className="hover:text-brand-blue">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
