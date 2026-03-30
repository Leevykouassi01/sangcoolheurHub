import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { db, collection, onSnapshot, query, orderBy, doc, updateDoc, setDoc, deleteDoc, OperationType, handleFirestoreError, getDocs, getCountFromServer } from "../firebase";
import { ContractGuarantee } from "../types";
import { ShieldCheck, Clock, CheckCircle2, XCircle, User as UserIcon, Phone, Building, Target, DollarSign, Calendar, Key, RefreshCw, BarChart3, Briefcase, Users, Layout, PieChart as PieChartIcon, Trash2, Smartphone, Search, Plus, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

export default function AdminDashboard({ user }: { user: User }) {
  const [guarantees, setGuarantees] = useState<ContractGuarantee[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [adminNote, setAdminNote] = useState("");
  const [successStatus, setSuccessStatus] = useState<"success" | "failure" | "mixed">("success");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [newWeeklyCode, setNewWeeklyCode] = useState("");
  const [currentWeeklyCode, setCurrentWeeklyCode] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [activeAdminTab, setActiveAdminTab] = useState<"guarantees" | "members" | "stats" | "settings">("stats");
  const [bulkNumbers, setBulkNumbers] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [stats, setStats] = useState({
    jobs: 0,
    opportunities: 0,
    talents: 0,
    guarantees: 0
  });

  useEffect(() => {
    // Fetch stats
    const fetchStats = async () => {
      try {
        const [jobsCount, oppsCount, talentsCount, guaranteesCount] = await Promise.all([
          getCountFromServer(collection(db, "jobs")),
          getCountFromServer(collection(db, "business_opportunities")),
          getCountFromServer(collection(db, "profiles")),
          getCountFromServer(collection(db, "contract_guarantees"))
        ]);
        
        setStats({
          jobs: jobsCount.data().count,
          opportunities: oppsCount.data().count,
          talents: talentsCount.data().count,
          guarantees: guaranteesCount.data().count
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "security"), (doc) => {
      if (doc.exists()) {
        setCurrentWeeklyCode(doc.data().code || "");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateSecurityCode = async () => {
    if (!newWeeklyCode.trim()) return;
    try {
      await setDoc(doc(db, "settings", "security"), {
        code: newWeeklyCode.toUpperCase(),
        updatedAt: new Date(),
        updatedBy: user.uid
      });
      setNewWeeklyCode("");
      alert("Code hebdomadaire mis à jour !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "settings/security");
    }
  };

  useEffect(() => {
    const q = query(collection(db, "contract_guarantees"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContractGuarantee));
      setGuarantees(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "contract_guarantees");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "whitelist_numbers"), orderBy("phone", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMembers(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "whitelist_numbers");
    });
    return () => unsubscribe();
  }, []);

  const handleAddMember = async () => {
    if (!newMemberPhone.trim()) return;
    try {
      const cleanPhone = newMemberPhone.replace(/\s+/g, "");
      await setDoc(doc(db, "whitelist_numbers", cleanPhone), {
        phone: cleanPhone,
        name: newMemberName,
        createdAt: new Date(),
        authorizedDeviceId: null
      });
      setNewMemberPhone("");
      setNewMemberName("");
      alert("Membre ajouté !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "whitelist_numbers");
    }
  };

  const [isBulkLoading, setIsBulkLoading] = useState(false);

  const handleBulkAdd = async () => {
    const numbers = bulkNumbers.split(/[\n,]+/).map(n => n.trim().replace(/\s+/g, "")).filter(n => n.length > 0);
    if (numbers.length === 0) return;

    setIsBulkLoading(true);
    let successCount = 0;
    try {
      for (const phone of numbers) {
        try {
          await setDoc(doc(db, "whitelist_numbers", phone), {
            phone,
            name: "Membre Communauté",
            createdAt: new Date(),
            authorizedDeviceId: null
          }, { merge: true });
          successCount++;
        } catch (e) {
          console.error(`Failed to add ${phone}`, e);
        }
      }
      setBulkNumbers("");
      setIsBulkMode(false);
      alert(`${successCount} numéros ajoutés à la liste blanche !`);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleResetDevice = async (memberId: string) => {
    if (!confirm("Réinitialiser l'appareil pour ce membre ? Il pourra se connecter depuis un nouvel appareil.")) return;
    try {
      await updateDoc(doc(db, "whitelist_numbers", memberId), {
        authorizedDeviceId: null
      });
      alert("Appareil réinitialisé !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "whitelist_numbers/" + memberId);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm("Supprimer ce membre de la liste blanche ?")) return;
    try {
      await deleteDoc(doc(db, "whitelist_numbers", memberId));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "whitelist_numbers/" + memberId);
    }
  };

  const filteredMembers = members.filter(m => 
    m.phone.includes(memberSearch) || 
    (m.name && m.name.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  const updateStatus = async (id: string, status: "validated" | "rejected" | "completed") => {
    try {
      const updateData: any = { status };
      if (status === 'validated') updateData.validatedAt = new Date();
      if (status === 'completed') {
        updateData.adminNote = adminNote;
        updateData.successStatus = successStatus;
      }
      await updateDoc(doc(db, "contract_guarantees", id), updateData);
      setUpdatingId(null);
      setAdminNote("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "contract_guarantees/" + id);
    }
  };

  const filteredGuarantees = guarantees.filter(g => filterStatus === "all" || g.status === filterStatus);

  const chartData = [
    { name: "Emplois", value: stats.jobs, color: "#2563eb" },
    { name: "Opportunités", value: stats.opportunities, color: "#9333ea" },
    { name: "Talents", value: stats.talents, color: "#16a34a" },
    { name: "Garanties", value: stats.guarantees, color: "#000000" }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold mb-2">Dashboard Administration</h2>
          <p className="text-[#1a1a1a]/60">Gestion de la plateforme, des membres et de la sécurité.</p>
        </div>
        <div className="flex gap-2 bg-white p-1 rounded-xl border border-gray-100">
          {[
            { id: "stats", label: "Stats", icon: BarChart3 },
            { id: "members", label: "Membres & Accès", icon: Users },
            { id: "guarantees", label: "Garanties", icon: ShieldCheck },
            { id: "settings", label: "Réglages", icon: Key }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveAdminTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeAdminTab === tab.id ? "bg-brand-blue text-white" : "text-gray-400 hover:bg-gray-50"}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeAdminTab === "stats" && (
        <div className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-brand-blue" />
              Statistiques de la Plateforme
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Offres d'Emploi", value: stats.jobs, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Opportunités Biz", value: stats.opportunities, icon: Layout, color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Talents Inscrits", value: stats.talents, icon: Users, color: "text-green-600", bg: "bg-green-50" },
                  { label: "Garanties", value: stats.guarantees, icon: ShieldCheck, color: "text-brand-blue", bg: "bg-brand-blue/10" }
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4"
                  >
                    <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[200px] lg:h-auto flex flex-col">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4" />
                  Répartition Globale
                </h3>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeAdminTab === "members" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Add Member Form */}
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 h-fit">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-brand-blue">
                  <Users className="w-6 h-6" />
                  <h3 className="text-xl font-bold">{isBulkMode ? "Ajout en Masse" : "Ajouter un Membre"}</h3>
                </div>
                <button 
                  onClick={() => setIsBulkMode(!isBulkMode)}
                  className="text-[10px] font-bold text-brand-blue uppercase tracking-widest hover:underline"
                >
                  {isBulkMode ? "Mode Simple" : "Mode Liste"}
                </button>
              </div>

              {isBulkMode ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Liste de numéros</label>
                    <textarea
                      value={bulkNumbers}
                      onChange={e => setBulkNumbers(e.target.value)}
                      placeholder="Collez vos numéros ici (un par ligne ou séparés par des virgules)..."
                      className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-brand-blue/20 min-h-[200px] text-sm font-mono"
                    />
                  </div>
                  <button
                    onClick={handleBulkAdd}
                    disabled={isBulkLoading}
                    className="w-full py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBulkLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                    {isBulkLoading ? "Importation..." : "Importer la liste"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nom complet</label>
                    <input
                      type="text"
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      placeholder="Ex: Jean Dupont"
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Numéro de téléphone</label>
                    <input
                      type="tel"
                      value={newMemberPhone}
                      onChange={e => setNewMemberPhone(e.target.value)}
                      placeholder="Ex: +225 0707070707"
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                  <button
                    onClick={handleAddMember}
                    className="w-full py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue/90 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Autoriser le membre
                  </button>
                </div>
              )}
            </div>

            {/* Members List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold">Liste Blanche ({members.length})</h3>
                  <p className="text-xs text-gray-400">Gestion des accès et jumelage IP/Appareil</p>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Rechercher un numéro ou nom..."
                    className="w-full pl-10 pr-4 py-2 bg-white rounded-xl border border-gray-100 text-sm focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredMembers.map((member) => (
                  <motion.div
                    key={member.id}
                    layout
                    className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-brand-blue relative">
                        <UserIcon className="w-6 h-6" />
                        {member.authorizedDeviceId && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" title="Appareil lié" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold">{member.name || "Membre"}</h4>
                          {member.phone === "0747147385" && (
                            <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue text-[8px] font-bold uppercase rounded-full">Super Admin</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 font-mono">{member.phone}</p>
                        {(member.lastLogin || member.lastIp) && (
                          <div className="flex flex-wrap gap-3 mt-2">
                            {member.lastLogin && (
                              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(member.lastLogin.toDate(), { addSuffix: true, locale: fr })}
                              </span>
                            )}
                            {member.lastIp && (
                              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                IP: {member.lastIp}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end gap-1 mr-2">
                        {member.authorizedDeviceId ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-[9px] font-bold uppercase tracking-widest">
                            <Smartphone className="w-3 h-3" />
                            Jumelé
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-gray-400 rounded-lg text-[9px] font-bold uppercase tracking-widest">
                            <Clock className="w-3 h-3" />
                            Libre
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleResetDevice(member.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-brand-blue transition-colors group"
                        title="Réinitialiser le jumelage (Appareil/IP)"
                      >
                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                      </button>
                      {member.phone !== "0747147385" && (
                        <button
                          onClick={() => handleDeleteMember(member.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                          title="Supprimer l'accès"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {filteredMembers.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                    <p className="text-gray-400 text-sm">Aucun membre trouvé pour "{memberSearch}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeAdminTab === "settings" && (
        <div className="space-y-8">
          {/* Security Code Management */}
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 text-brand-blue">
              <Key className="w-6 h-6" />
              <h3 className="text-xl font-bold">Code de Sécurité Hebdomadaire (Legacy)</h3>
            </div>
            <p className="text-sm text-gray-500">Ce code est conservé comme méthode de secours secondaire.</p>
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1 w-full">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Code Actuel: <span className="text-brand-blue">{currentWeeklyCode}</span></p>
                <input
                  type="text"
                  value={newWeeklyCode}
                  onChange={e => setNewWeeklyCode(e.target.value)}
                  placeholder="Nouveau code (ex: SANG2024)"
                  className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-brand-blue/20 font-bold"
                />
              </div>
              <button
                onClick={handleUpdateSecurityCode}
                className="w-full md:w-auto px-8 py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
              >
                Mettre à jour le code
              </button>
            </div>
          </div>
        </div>
      )}
      {activeAdminTab === "guarantees" && (
        <div className="space-y-8">
          <div className="flex justify-end">
            <div className="flex gap-2 bg-white p-1 rounded-xl border border-gray-100">
              {["all", "pending", "validated", "rejected", "completed"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${filterStatus === status ? "bg-brand-blue text-white" : "text-gray-400 hover:bg-gray-50"}`}
                >
                  {status === "all" ? "Tous" : status}
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {filteredGuarantees.map((g) => (
              <motion.div
                key={g.id}
                layout
                className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-brand-blue">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">Garantie #{g.id.slice(0, 8)}</h4>
                      <p className="text-sm text-gray-500">
                        Soumis {formatDistanceToNow(g.createdAt.toDate(), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${
                    g.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                    g.status === 'validated' ? 'bg-green-50 text-green-700' :
                    g.status === 'rejected' ? 'bg-red-50 text-red-700' :
                    'bg-brand-blue/10 text-brand-blue'
                  }`}>
                    {g.status === 'pending' && <Clock className="w-3 h-3" />}
                    {g.status === 'validated' && <CheckCircle2 className="w-3 h-3" />}
                    {g.status === 'rejected' && <XCircle className="w-3 h-3" />}
                    {g.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                    {g.status}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-50">
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <UserIcon className="w-3 h-3" />
                      Informations Soumissionnaire
                    </h5>
                    <div className="space-y-2">
                      <p className="font-bold">{g.submitterInfo.fullName}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Phone className="w-4 h-4" /> {g.submitterInfo.phone}
                      </p>
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Building className="w-4 h-4" /> {g.submitterInfo.company} ({g.submitterInfo.position})
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Target className="w-3 h-3" />
                      Détails du Marché
                    </h5>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 font-serif italic">"{g.marketDetails.description}"</p>
                      <p className="text-sm text-gray-600"><span className="font-bold">Objectifs:</span> {g.marketDetails.expectedResults}</p>
                      {g.marketDetails.budget && (
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> {g.marketDetails.budget}
                        </p>
                      )}
                      {g.marketDetails.deadline && (
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> {g.marketDetails.deadline}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {g.status === 'pending' && (
                  <div className="flex gap-4 pt-6 border-t border-gray-50">
                    <button
                      onClick={() => updateStatus(g.id, 'validated')}
                      className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Valider la Garantie
                    </button>
                    <button
                      onClick={() => updateStatus(g.id, 'rejected')}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-5 h-5" />
                      Rejeter
                    </button>
                  </div>
                )}

                {g.status === 'validated' && (
                  <div className="space-y-4 pt-6 border-t border-gray-50">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Note d'administration (Bilan)</label>
                      <textarea
                        value={adminNote}
                        onChange={e => setAdminNote(e.target.value)}
                        placeholder="Détaillez le résultat de la garantie..."
                        className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-brand-blue/20 min-h-[100px]"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <select
                        value={successStatus}
                        onChange={e => setSuccessStatus(e.target.value as any)}
                        className="w-full sm:w-auto p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 font-bold"
                      >
                        <option value="success">Succès Total</option>
                        <option value="failure">Échec</option>
                        <option value="mixed">Résultat Mitigé</option>
                      </select>
                      <button
                        onClick={() => updateStatus(g.id, 'completed')}
                        className="w-full sm:flex-1 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue/90 transition-all"
                      >
                        Clôturer le Dossier
                      </button>
                    </div>
                  </div>
                )}

                {g.status === 'completed' && g.adminNote && (
                  <div className="pt-6 border-t border-gray-50 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        g.successStatus === 'success' ? 'bg-green-100 text-green-700' :
                        g.successStatus === 'failure' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        Bilan: {g.successStatus}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 font-serif italic bg-gray-50 p-4 rounded-2xl">
                      "{g.adminNote}"
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
