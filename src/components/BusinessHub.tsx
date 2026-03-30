import { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { db, collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, OperationType, handleFirestoreError, doc, setDoc, deleteDoc, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { BusinessOpportunity, ContractGuarantee } from "../types";
import { Briefcase, MapPin, Clock, Plus, Search, Filter, ExternalLink, Calendar, X, FileText, Upload, ShieldCheck, User as UserIcon, Phone, Building, Target, DollarSign, Trash2, Archive, Eye, Mail, Link as LinkIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { parseBusinessOpportunity, parseMultipleOpportunities, extractTextFromImage } from "../services/geminiService";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Global worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.mjs`;

export default function BusinessHub({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<"opportunities" | "guarantee">("opportunities");
  const [opportunities, setOpportunities] = useState<BusinessOpportunity[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email === "leevykouassi@gmail.com") {
      setIsAdmin(true);
    }
  }, [user]);

  const [selectedOpportunity, setSelectedOpportunity] = useState<BusinessOpportunity | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const isSubmittingRef = useRef(false);
  const [reviewItems, setReviewItems] = useState<Partial<BusinessOpportunity>[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [filterSector, setFilterSector] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "profiles", user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setUserProfile(snapshot.data());
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Safety timeout for parsing state
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isParsing) {
      console.log("Parsing started...");
      // Increase timeout to 90s for complex parsing
      timeout = setTimeout(() => {
        console.warn("Parsing timed out. Resetting state.");
        setIsParsing(false);
        setLoadingMessage("");
        isSubmittingRef.current = false;
      }, 90000);
    }
    return () => clearTimeout(timeout);
  }, [isParsing]);
  const [newOpportunityText, setNewOpportunityText] = useState("");
  const [applicationLink, setApplicationLink] = useState("");
  const [applicationEmail, setApplicationEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filterType, setFilterType] = useState("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guarantee Form State
  const [guaranteeForm, setGuaranteeForm] = useState({
    submitterPhone: "",
    submitterCompany: "",
    submitterPosition: "",
    providerName: "",
    providerPhone: "",
    providerCompany: "",
    marketDescription: "",
    expectedResults: "",
    budget: "",
    deadline: ""
  });
  const [isSubmittingGuarantee, setIsSubmittingGuarantee] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "business_opportunities"), orderBy("postedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          ...d,
          viewCount: d.viewCount || 0,
          isArchived: d.isArchived || false
        } as BusinessOpportunity;
      });
      setOpportunities(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "business_opportunities");
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteOpportunity = async (oppId: string) => {
    try {
      await deleteDoc(doc(db, "business_opportunities", oppId));
      setShowConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "business_opportunities/" + oppId);
    }
  };

  const handleArchiveOpportunity = async (oppId: string) => {
    try {
      await setDoc(doc(db, "business_opportunities", oppId), { isArchived: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "business_opportunities/" + oppId);
    }
  };

  const handleIncrementView = async (oppId: string, currentViews: number) => {
    try {
      await setDoc(doc(db, "business_opportunities", oppId), { viewCount: (currentViews || 0) + 1 }, { merge: true });
    } catch (error) {
      console.error("Failed to increment view count", error);
    }
  };

  const handlePostOpportunity = async (text?: string) => {
    if (isSubmittingRef.current) return;
    
    const textToParse = text || newOpportunityText;
    if (!textToParse.trim()) {
      alert("Veuillez entrer du texte ou importer un fichier.");
      return;
    }

    isSubmittingRef.current = true;
    setIsParsing(true);
    setLoadingMessage("Initialisation...");
    try {
      let fileUrl = "";
      if (selectedFile) {
        setLoadingMessage("Téléchargement du fichier...");
        console.log("Uploading file to Storage...");
        const fileRef = ref(storage, `opportunities/${Date.now()}_${selectedFile.name}`);
        const uploadResult = await uploadBytes(fileRef, selectedFile);
        fileUrl = await getDownloadURL(uploadResult.ref);
        console.log("File uploaded successfully:", fileUrl);
      }

      setLoadingMessage("Analyse par l'IA en cours...");
      console.log("Starting analysis of business opportunity... Text length:", textToParse.length);
      
      // If text is very long and user is admin, try multiple parsing
      if (isAdmin && textToParse.length > 1500) {
        setLoadingMessage("Analyse de plusieurs opportunités (cela peut prendre un moment)...");
        console.log("Large text detected, attempting multiple parsing...");
        const parsedItems = await parseMultipleOpportunities(textToParse);
        console.log("Multiple analysis complete:", parsedItems);

        if (Array.isArray(parsedItems) && parsedItems.length > 0) {
          setReviewItems(parsedItems.map(item => ({
            ...item,
            applicationLink: applicationLink || "",
            applicationEmail: applicationEmail || "",
            fileUrl: fileUrl || ""
          })));
          setIsReviewing(true);
          setIsPosting(false);
          return;
        } else {
          throw new Error("Aucune opportunité détectée dans le texte.");
        }
      } else {
        const parsedData = await parseBusinessOpportunity(textToParse); 
        console.log("Analysis complete:", parsedData);
        
        setReviewItems([{
          ...parsedData,
          applicationLink: applicationLink || "",
          applicationEmail: applicationEmail || "",
          fileUrl: fileUrl || ""
        }]);
        setIsReviewing(true);
        setIsPosting(false);
        return;
      }

      setIsPosting(false);
      setNewOpportunityText("");
      setApplicationLink("");
      setApplicationEmail("");
      setExpiresAt("");
      setSelectedFile(null);
    } catch (error) {
      console.error("Error posting opportunity:", error);
      alert("Erreur lors de la publication : " + (error instanceof Error ? error.message : "Erreur inconnue"));
    } finally {
      setIsParsing(false);
      setLoadingMessage("");
      isSubmittingRef.current = false;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setLoadingMessage("Lecture du fichier...");
    try {
      setSelectedFile(file);
      let extractedText = "";
      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          extractedText += content.items.map((item: any) => item.str).join(" ") + "\n";
        }
      } else if (file.name.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else if (file.type.startsWith("image/")) {
        setLoadingMessage("Extraction du texte de l'image...");
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;
        extractedText = await extractTextFromImage(base64, file.type);
      } else {
        extractedText = await file.text();
      }
      setNewOpportunityText(extractedText);
    } catch (error) {
      console.error("File upload error:", error);
      alert("Erreur lors de la lecture du fichier : " + (error instanceof Error ? error.message : "Erreur inconnue"));
    } finally {
      setIsParsing(false);
      setLoadingMessage("");
    }
  };

  const handleSubmitGuarantee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingGuarantee(true);
    try {
      await addDoc(collection(db, "contract_guarantees"), {
        submitterUid: user.uid,
        submitterInfo: {
          fullName: user.displayName || "Anonyme",
          phone: guaranteeForm.submitterPhone,
          company: guaranteeForm.submitterCompany,
          position: guaranteeForm.submitterPosition
        },
        providerInfo: {
          fullName: guaranteeForm.providerName,
          phone: guaranteeForm.providerPhone,
          company: guaranteeForm.providerCompany
        },
        marketDetails: {
          description: guaranteeForm.marketDescription,
          expectedResults: guaranteeForm.expectedResults,
          budget: guaranteeForm.budget,
          deadline: guaranteeForm.deadline
        },
        status: "pending",
        createdAt: serverTimestamp()
      });
      alert("Demande de garantie soumise ! Veuillez appeler l'administration pour une validation rapide.");
      setGuaranteeForm({
        submitterPhone: "",
        submitterCompany: "",
        submitterPosition: "",
        providerName: "",
        providerPhone: "",
        providerCompany: "",
        marketDescription: "",
        expectedResults: "",
        budget: "",
        deadline: ""
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "contract_guarantees");
    } finally {
      setIsSubmittingGuarantee(false);
    }
  };

  const handleConfirmPost = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoadingMessage("Publication en cours...");
    setIsParsing(true);

    try {
      for (const item of reviewItems) {
        const oppRef = doc(collection(db, "business_opportunities"));
        await setDoc(oppRef, {
          ...item,
          postedAt: serverTimestamp(),
          isExpired: false,
          expiresAt: expiresAt || item.expiresAt || "",
          authorUid: user.uid,
          viewCount: 0,
          isArchived: false
        });
      }
      alert(`${reviewItems.length} opportunité(s) publiée(s) avec succès !`);
      setIsReviewing(false);
      setReviewItems([]);
      setNewOpportunityText("");
      setApplicationLink("");
      setApplicationEmail("");
      setExpiresAt("");
      setSelectedFile(null);
    } catch (error) {
      console.error("Error confirming post:", error);
      alert("Erreur lors de la publication finale.");
    } finally {
      setIsParsing(false);
      setLoadingMessage("");
      isSubmittingRef.current = false;
    }
  };

  const updateReviewItem = (index: number, field: string, value: any) => {
    const updated = [...reviewItems];
    updated[index] = { ...updated[index], [field]: value };
    setReviewItems(updated);
  };

  const removeReviewItem = (index: number) => {
    setReviewItems(reviewItems.filter((_, i) => i !== index));
  };

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = 
      opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || opp.type === filterType;
    const matchesSector = filterSector === "all" || opp.sector === filterSector;
    
    // If showArchived is true, show only archived. If false, show only active.
    if (showArchived) return opp.isArchived && matchesSearch && matchesType && matchesSector;
    return !opp.isArchived && matchesSearch && matchesType && matchesSector;
  });

  // Auto-archive effect
  useEffect(() => {
    if (!opportunities.length || !isAdmin) return;

    const now = new Date();
    opportunities.forEach(async (opp) => {
      if (opp.expiresAt && !opp.isArchived) {
        const expiryDate = new Date(opp.expiresAt);
        if (expiryDate < now) {
          console.log(`Auto-archiving expired opportunity: ${opp.title}`);
          try {
            await setDoc(doc(db, "business_opportunities", opp.id), { 
              isArchived: true,
              isExpired: true 
            }, { merge: true });
          } catch (e) {
            console.error("Auto-archive failed", e);
          }
        }
      }
    });
  }, [opportunities, isAdmin]);

  const sectors = Array.from(new Set(opportunities.map(o => o.sector).filter(Boolean))) as string[];

  const isRecommended = (opp: BusinessOpportunity) => {
    if (!userProfile || !opp.tags) return false;
    const userSkills = userProfile.skills || [];
    const userTags = userProfile.tags || [];
    const allUserTags = [...userSkills, ...userTags].map(t => t.toLowerCase());
    return opp.tags.some(tag => allUserTags.includes(tag.toLowerCase()));
  };

  const analytics = {
    totalActive: opportunities.filter(o => !o.isArchived).length,
    totalViews: opportunities.reduce((acc, o) => acc + (o.viewCount || 0), 0),
    topSector: sectors.length > 0 ? sectors.reduce((a, b) => 
      opportunities.filter(o => o.sector === a).length >= opportunities.filter(o => o.sector === b).length ? a : b
    ) : "N/A"
  };

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-100">
        <button
          onClick={() => setActiveTab("opportunities")}
          className={`pb-4 px-2 font-bold transition-all ${activeTab === "opportunities" ? "text-brand-blue border-b-2 border-brand-blue" : "text-gray-400"}`}
        >
          Opportunités Business
        </button>
        <button
          onClick={() => setActiveTab("guarantee")}
          className={`pb-4 px-2 font-bold transition-all ${activeTab === "guarantee" ? "text-brand-blue border-b-2 border-brand-blue" : "text-gray-400"}`}
        >
          Garantie de Contrat
        </button>
      </div>

      {activeTab === "opportunities" ? (
        <>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-4xl font-bold mb-2">Opportunités Business</h2>
              <p className="text-[#1a1a1a]/60">Appels d'offres, partenariats et marchés au sein de la communauté.</p>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <div className="hidden lg:flex items-center gap-6 px-6 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm mr-4">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Actives</p>
                    <p className="text-lg font-bold text-brand-blue">{analytics.totalActive}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Vues</p>
                    <p className="text-lg font-bold text-brand-blue">{analytics.totalViews}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Top Secteur</p>
                    <p className="text-lg font-bold text-brand-blue">{analytics.topSector}</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setIsPosting(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
              >
                <Plus className="w-5 h-5" />
                Publier une opportunité
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#1a1a1a]/30" />
              <input
                type="text"
                placeholder="Rechercher un marché, une entreprise..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-brand-blue/20"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              <select
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
                className="px-4 py-2 bg-white rounded-xl border border-gray-100 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
              >
                <option value="all">Tous les secteurs</option>
                {sectors.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 bg-white rounded-xl border border-gray-100 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
              >
                <option value="all">Tous les types</option>
                <option value="Appel d'offres">Appel d'offres</option>
                <option value="Partenariat">Partenariat</option>
                <option value="Sous-traitance">Sous-traitance</option>
                <option value="Emploi">Emploi</option>
                <option value="Autre">Autre</option>
              </select>
              {isAdmin && (
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${showArchived ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-white border-gray-100 text-gray-500"}`}
                >
                  {showArchived ? "Voir Actifs" : "Voir Archives"}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredOpportunities.map((opp) => (
              <motion.div
                key={opp.id}
                layout
                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-brand-blue font-bold">
                    {opp.company.charAt(0)}
                  </div>
                  <div className="flex items-center gap-2">
                    {isRecommended(opp) && (
                      <span className="px-3 py-1 bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-green-100">
                        Recommandé
                      </span>
                    )}
                    <span className="px-3 py-1 bg-brand-blue/5 text-brand-blue text-[10px] font-bold uppercase tracking-wider rounded-full">
                      {opp.type}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveOpportunity(opp.id);
                          }}
                          className="p-1.5 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all"
                          title="Archiver l'opportunité"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowConfirmDelete(opp.id);
                          }}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                          title="Supprimer l'opportunité"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-1 group-hover:text-brand-blue transition-colors">{opp.title}</h3>
                <div className="flex items-center gap-4 mb-4">
                  <p className="text-brand-blue font-medium text-sm">{opp.company}</p>
                  <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {opp.viewCount || 0} vues
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-6">
                  {opp.sector && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-blue/5 rounded-lg">
                      <Target className="w-3.5 h-3.5 text-brand-blue" />
                      <span className="font-bold text-brand-blue">{opp.sector}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {opp.location}
                  </div>
                  {opp.expiresAt && (
                    <div className="flex items-center gap-1.5 text-orange-600 font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      Expire le {new Date(opp.expiresAt).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {opp.postedAt ? formatDistanceToNow(opp.postedAt.toDate(), { addSuffix: true, locale: fr }) : "À l'instant"}
                  </div>
                </div>
                <button 
                  onClick={() => {
                    console.log("Opening opportunity details:", opp);
                    handleIncrementView(opp.id, opp.viewCount || 0);
                    setSelectedOpportunity(opp);
                  }}
                  className="w-full py-3 bg-gray-50 text-[#1a1a1a] rounded-xl font-bold hover:bg-brand-blue hover:text-white transition-all"
                >
                  Voir les détails
                </button>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <div className="max-w-3xl mx-auto">
          <div className="bg-brand-blue/5 p-8 rounded-3xl border border-brand-blue/10 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-brand-blue text-white rounded-2xl flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Garantie de Contrat Sangcoolheur</h3>
                <p className="text-sm text-brand-blue font-medium">Sécurisez vos transactions au sein de la communauté.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              L'administration Sangcoolheur se porte garant du suivi millimétré de votre marché. Remplissez ce formulaire pour soumettre une demande de garantie. Une fois validée, vous pourrez exécuter le marché en toute sécurité.
            </p>
          </div>

          <form onSubmit={handleSubmitGuarantee} className="space-y-8 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
            {/* Submitter Info */}
            <div className="space-y-4">
              <h4 className="font-bold flex items-center gap-2 text-brand-blue">
                <UserIcon className="w-4 h-4" />
                Vos Informations (Donneur d'ordre)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Téléphone</label>
                  <input
                    required
                    type="tel"
                    value={guaranteeForm.submitterPhone}
                    onChange={e => setGuaranteeForm({...guaranteeForm, submitterPhone: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    placeholder="Ex: +225 ..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Entreprise</label>
                  <input
                    required
                    type="text"
                    value={guaranteeForm.submitterCompany}
                    onChange={e => setGuaranteeForm({...guaranteeForm, submitterCompany: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    placeholder="Nom de votre structure"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Poste</label>
                  <input
                    required
                    type="text"
                    value={guaranteeForm.submitterPosition}
                    onChange={e => setGuaranteeForm({...guaranteeForm, submitterPosition: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    placeholder="Votre fonction"
                  />
                </div>
              </div>
            </div>

            {/* Provider Info */}
            <div className="space-y-4">
              <h4 className="font-bold flex items-center gap-2 text-brand-blue">
                <Briefcase className="w-4 h-4" />
                Informations du Prestataire (Exécutant)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nom Complet</label>
                  <input
                    required
                    type="text"
                    value={guaranteeForm.providerName}
                    onChange={e => setGuaranteeForm({...guaranteeForm, providerName: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    placeholder="Nom du membre"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Téléphone</label>
                  <input
                    required
                    type="tel"
                    value={guaranteeForm.providerPhone}
                    onChange={e => setGuaranteeForm({...guaranteeForm, providerPhone: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Entreprise (Optionnel)</label>
                  <input
                    type="text"
                    value={guaranteeForm.providerCompany}
                    onChange={e => setGuaranteeForm({...guaranteeForm, providerCompany: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>
            </div>

            {/* Market Details */}
            <div className="space-y-4">
              <h4 className="font-bold flex items-center gap-2 text-brand-blue">
                <Target className="w-4 h-4" />
                Détails du Marché
              </h4>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Description du Marché</label>
                  <textarea
                    required
                    value={guaranteeForm.marketDescription}
                    onChange={e => setGuaranteeForm({...guaranteeForm, marketDescription: e.target.value})}
                    className="w-full h-32 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 resize-none"
                    placeholder="Expliquez l'objet du marché..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Résultats Attendus</label>
                  <textarea
                    required
                    value={guaranteeForm.expectedResults}
                    onChange={e => setGuaranteeForm({...guaranteeForm, expectedResults: e.target.value})}
                    className="w-full h-32 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 resize-none"
                    placeholder="Quels sont les livrables ?"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Budget (FCFA)</label>
                    <input
                      type="text"
                      value={guaranteeForm.budget}
                      onChange={e => setGuaranteeForm({...guaranteeForm, budget: e.target.value})}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Délai d'exécution</label>
                    <input
                      type="text"
                      value={guaranteeForm.deadline}
                      onChange={e => setGuaranteeForm({...guaranteeForm, deadline: e.target.value})}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                      placeholder="Ex: 2 semaines"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              disabled={isSubmittingGuarantee}
              className="w-full py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20 flex items-center justify-center gap-2"
            >
              {isSubmittingGuarantee ? "Soumission..." : "Soumettre la demande de garantie"}
            </button>
          </form>
        </div>
      )}

      {/* Post Opportunity Modal */}
      <AnimatePresence>
        {isPosting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-bold">Publier une opportunité</h3>
                <button onClick={() => setIsPosting(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-100 rounded-2xl hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-all"
                  >
                    <Upload className="w-6 h-6 text-brand-blue" />
                    <span className="text-xs font-bold text-gray-500">Importer PDF/Image</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.docx,.txt,image/*"
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-2 p-6 bg-gray-50 rounded-2xl border-2 border-transparent">
                    <FileText className="w-6 h-6 text-gray-400" />
                    <span className="text-xs font-bold text-gray-400">Texte libre</span>
                  </div>
                </div>

                <textarea
                  value={newOpportunityText}
                  onChange={(e) => setNewOpportunityText(e.target.value)}
                  placeholder="Collez ici le texte de l'appel d'offres ou de l'opportunité..."
                  className="w-full h-48 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-brand-blue/20 font-sans resize-none"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      Lien de redirection (Optionnel)
                    </label>
                    <input
                      type="url"
                      value={applicationLink}
                      onChange={(e) => setApplicationLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      Email de contact (Optionnel)
                    </label>
                    <input
                      type="email"
                      value={applicationEmail}
                      onChange={(e) => setApplicationEmail(e.target.value)}
                      placeholder="contact@exemple.com"
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Date d'expiration (Optionnel)
                    </label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 shrink-0 border-t border-gray-100 p-6 bg-white">
                  <button
                    onClick={() => setIsPosting(false)}
                    className="px-6 py-3 text-gray-500 font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => handlePostOpportunity()}
                    disabled={isParsing || (!newOpportunityText.trim() && !selectedFile)}
                    className="flex items-center gap-2 px-8 py-3 bg-brand-blue text-white rounded-full font-bold hover:bg-brand-blue/90 disabled:opacity-50 transition-all"
                  >
                    {isParsing ? (
                      <div className="flex flex-col items-center leading-none">
                        <span>Analyse...</span>
                        <span className="text-[10px] font-normal opacity-70 mt-1">{loadingMessage}</span>
                      </div>
                    ) : "Publier"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Opportunity Details Modal */}
      <AnimatePresence>
        {selectedOpportunity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-brand-blue font-bold">
                    {selectedOpportunity.company?.charAt(0) || "O"}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedOpportunity.title}</h3>
                    <p className="text-brand-blue font-medium text-sm">{selectedOpportunity.company}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedOpportunity(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Type</p>
                    <p className="text-sm font-bold">{selectedOpportunity.type}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Lieu</p>
                    <p className="text-sm font-bold">{selectedOpportunity.location}</p>
                  </div>
                  {selectedOpportunity.budget && (
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Budget</p>
                      <p className="text-sm font-bold">{selectedOpportunity.budget}</p>
                    </div>
                  )}
                  {selectedOpportunity.sector && (
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Secteur</p>
                      <p className="text-sm font-bold text-brand-blue">{selectedOpportunity.sector}</p>
                    </div>
                  )}
                  {selectedOpportunity.expiresAt && (
                    <div className="p-4 bg-orange-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-orange-400 uppercase mb-1">Expiration</p>
                      <p className="text-sm font-bold text-orange-600">{new Date(selectedOpportunity.expiresAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand-blue" />
                    Description
                  </h4>
                  <div className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {selectedOpportunity.description}
                  </div>
                </div>

                {selectedOpportunity.requirements && selectedOpportunity.requirements.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <Target className="w-5 h-5 text-brand-blue" />
                      Exigences
                    </h4>
                    <ul className="space-y-2">
                      {selectedOpportunity.requirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-blue mt-2 shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(selectedOpportunity.applicationEmail || selectedOpportunity.applicationLink || selectedOpportunity.fileUrl) && (
                  <div className="space-y-3 p-4 bg-brand-blue/5 rounded-2xl border border-brand-blue/10">
                    <h4 className="font-bold text-brand-blue flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Comment postuler
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      {selectedOpportunity.applicationEmail && (
                        <div className="flex items-center justify-between gap-2 p-3 bg-white rounded-xl border border-brand-blue/10">
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="w-4 h-4 text-brand-blue" />
                            <span className="text-gray-600">Email:</span>
                            <span className="font-bold text-brand-blue">{selectedOpportunity.applicationEmail}</span>
                          </div>
                          <a 
                            href={`mailto:${selectedOpportunity.applicationEmail}`} 
                            className="px-4 py-2 bg-brand-blue text-white text-xs font-bold rounded-lg hover:bg-brand-blue/90"
                          >
                            Envoyer un email
                          </a>
                        </div>
                      )}
                      {selectedOpportunity.applicationLink && (
                        <div className="flex items-center justify-between gap-2 p-3 bg-white rounded-xl border border-brand-blue/10">
                          <div className="flex items-center gap-2 text-sm">
                            <LinkIcon className="w-4 h-4 text-brand-blue" />
                            <span className="text-gray-600">Lien:</span>
                            <span className="font-bold text-brand-blue truncate max-w-[150px]">{selectedOpportunity.applicationLink}</span>
                          </div>
                          <a 
                            href={selectedOpportunity.applicationLink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="px-4 py-2 bg-brand-blue text-white text-xs font-bold rounded-lg hover:bg-brand-blue/90"
                          >
                            Ouvrir le lien
                          </a>
                        </div>
                      )}
                      {selectedOpportunity.fileUrl && (
                        <div className="flex items-center justify-between gap-2 p-3 bg-white rounded-xl border border-brand-blue/10">
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="w-4 h-4 text-brand-blue" />
                            <span className="text-gray-600">Document:</span>
                            <span className="font-bold text-brand-blue">Détails joints</span>
                          </div>
                          <a 
                            href={selectedOpportunity.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="px-4 py-2 bg-brand-blue text-white text-xs font-bold rounded-lg hover:bg-brand-blue/90"
                          >
                            Télécharger
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedOpportunity.tags && selectedOpportunity.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-4">
                    {selectedOpportunity.tags.map((tag, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => setSelectedOpportunity(null)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  Fermer
                </button>
                {selectedOpportunity.url && (
                  <a
                    href={selectedOpportunity.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-[2] py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue/90 transition-all flex items-center justify-center gap-2"
                  >
                    Postuler / Voir l'offre
                    <ExternalLink className="w-5 h-5" />
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Supprimer l'opportunité ?</h3>
              <p className="text-gray-500 font-sans mb-8">Cette action est irréversible. L'opportunité sera définitivement supprimée de la plateforme.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmDelete(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDeleteOpportunity(showConfirmDelete)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Review Modal */}
      <AnimatePresence>
        {isReviewing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-brand-blue text-white shrink-0">
                <div>
                  <h3 className="text-2xl font-bold">Révision des opportunités</h3>
                  <p className="text-white/80 text-sm">Vérifiez et modifiez les données extraites par l'IA avant publication.</p>
                </div>
                <button onClick={() => setIsReviewing(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-8 bg-gray-50/50">
                {reviewItems.map((item, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4 relative group">
                    <button 
                      onClick={() => removeReviewItem(idx)}
                      className="absolute top-4 right-4 p-2 text-red-400 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Titre de l'opportunité</label>
                        <input 
                          value={item.title} 
                          onChange={(e) => updateReviewItem(idx, "title", e.target.value)}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Entreprise / Organisme</label>
                        <input 
                          value={item.company} 
                          onChange={(e) => updateReviewItem(idx, "company", e.target.value)}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Secteur d'activité</label>
                        <input 
                          value={item.sector} 
                          onChange={(e) => updateReviewItem(idx, "sector", e.target.value)}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 text-brand-blue font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Lieu</label>
                        <input 
                          value={item.location} 
                          onChange={(e) => updateReviewItem(idx, "location", e.target.value)}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Budget (Optionnel)</label>
                        <input 
                          value={item.budget} 
                          onChange={(e) => updateReviewItem(idx, "budget", e.target.value)}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Date d'expiration (YYYY-MM-DD)</label>
                        <input 
                          type="date"
                          value={item.expiresAt} 
                          onChange={(e) => updateReviewItem(idx, "expiresAt", e.target.value)}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Description</label>
                      <textarea 
                        value={item.description} 
                        onChange={(e) => updateReviewItem(idx, "description", e.target.value)}
                        className="w-full h-24 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 resize-none text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-8 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                <p className="text-sm text-gray-500 font-medium">
                  {reviewItems.length} opportunité(s) prête(s) à être publiée(s)
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setIsReviewing(false)}
                    className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleConfirmPost}
                    disabled={isParsing || reviewItems.length === 0}
                    className="flex items-center gap-2 px-10 py-4 bg-brand-blue text-white rounded-full font-bold hover:bg-brand-blue/90 shadow-xl shadow-brand-blue/20 transition-all disabled:opacity-50"
                  >
                    {isParsing ? "Publication..." : "Confirmer la publication"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
