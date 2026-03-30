import { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { db, doc, getDoc, setDoc, OperationType, handleFirestoreError } from "../firebase";
import { Profile } from "../types";
import { UserCircle, Upload, Sparkles, CheckCircle2, AlertCircle, Eye, EyeOff, Save, Trash2, Plus, Briefcase, GraduationCap, X, FileText, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { parseCV } from "../services/geminiService";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Global worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ProfileEditor({ user, onAdminAccess }: { user: User, onAdminAccess?: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [cvText, setCvText] = useState("");
  const [showCvInput, setShowCvInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const docRef = doc(db, "profiles", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as Profile);
        } else {
          // Create initial empty profile
          const initialProfile: Profile = {
            id: user.uid,
            userId: user.uid,
            fullName: user.displayName || "",
            title: "",
            summary: "",
            skills: [],
            experience: [],
            education: [],
            tags: [],
            isPublic: false,
            completenessScore: 0,
            suggestions: ["Téléchargez votre CV pour commencer !"]
          };
          setProfile(initialProfile);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
        setError("Impossible de charger votre profil. Veuillez vérifier votre connexion.");
        // We still set a fallback profile so the UI can render if possible
        if (!profile) {
          setProfile({
            id: user.uid,
            userId: user.uid,
            fullName: user.displayName || "",
            title: "",
            summary: "",
            skills: [],
            experience: [],
            education: [],
            tags: [],
            isPublic: false,
            completenessScore: 0,
            suggestions: []
          });
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [user.uid]);

  const calculateCompleteness = (p: Profile) => {
    let score = 0;
    if (p.fullName) score += 10;
    if (p.title) score += 10;
    if (p.summary) score += 20;
    if (p.skills && p.skills.length >= 3) score += 20;
    if (p.experience && p.experience.length > 0) score += 20;
    if (p.education && p.education.length > 0) score += 20;
    return score;
  };

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const updatedProfile = {
        ...profile,
        completenessScore: calculateCompleteness(profile)
      };
      setProfile(updatedProfile);
      await setDoc(doc(db, "profiles", user.uid), updatedProfile);
      alert("Profil mis à jour avec succès !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "profiles/" + user.uid);
    } finally {
      setIsSaving(false);
    }
  };

  const handleParseCV = async (text?: string) => {
    const textToParse = text || cvText;
    if (!textToParse.trim()) return;
    setIsParsing(true);
    try {
      const parsedData = await parseCV(textToParse);
      const profileWithParsedData = {
        ...profile!,
        ...parsedData,
        userId: user.uid,
        isPublic: profile?.isPublic ?? false
      };
      
      const updatedProfile = {
        ...profileWithParsedData,
        completenessScore: calculateCompleteness(profileWithParsedData)
      };
      
      setProfile(updatedProfile);
      
      // Auto-save after parsing
      await setDoc(doc(db, "profiles", user.uid), updatedProfile);
      
      setShowCvInput(false);
      setCvText("");
      
      if (!updatedProfile.isPublic) {
        alert("CV analysé et enregistré avec succès ! Votre profil est actuellement en mode 'Privé'. Activez le mode 'Public' pour apparaître dans la liste des talents.");
      } else {
        alert("CV analysé et profil mis à jour avec succès !");
      }
    } catch (error) {
      console.error("Failed to parse CV", error);
      alert("Une erreur est survenue lors de l'analyse du CV.");
    } finally {
      setIsParsing(false);
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
      });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText;
    } catch (error) {
      console.error("PDF extraction error:", error);
      throw new Error("Impossible de lire le contenu du PDF.");
    }
  };

  const extractTextFromWord = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      let extractedText = "";
      if (file.type === "application/pdf") {
        extractedText = await extractTextFromPDF(file);
      } else if (
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.endsWith(".docx")
      ) {
        extractedText = await extractTextFromWord(file);
      } else if (file.type === "text/plain") {
        extractedText = await file.text();
      } else {
        alert("Format de fichier non supporté. Veuillez utiliser PDF, Word (.docx) ou Texte.");
        setIsParsing(false);
        return;
      }

      if (extractedText.trim()) {
        await handleParseCV(extractedText);
      } else {
        alert("Le fichier semble vide ou illisible.");
      }
    } catch (error) {
      console.error("File parsing error", error);
      alert("Erreur lors de la lecture du fichier.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        {error ? (
          <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <p className="text-[#1a1a1a]/60 font-sans">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-brand-blue text-white rounded-full font-bold hover:bg-brand-blue/90 transition-all"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 border-4 border-[#5A5A40] border-t-transparent rounded-full"
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#1a1a1a]/5 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-brand-blue/10 rounded-3xl flex items-center justify-center text-brand-blue text-3xl sm:text-4xl font-bold">
            {profile.fullName.charAt(0) || user.displayName?.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1">{profile.fullName || "Votre Nom"}</h2>
            <p className="text-[#1a1a1a]/60 font-sans mb-4">{profile.title || "Votre Titre Professionnel"}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
              <div className="flex items-center gap-2 text-xs font-bold font-sans">
                <div className="w-20 sm:w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${profile.completenessScore}%` }}
                    className="h-full bg-brand-blue"
                  />
                </div>
                <span className="text-brand-blue">{profile.completenessScore}% complété</span>
              </div>
              <button
                onClick={() => setProfile({ ...profile, isPublic: !profile.isPublic })}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all",
                  profile.isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                )}
              >
                {profile.isPublic ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {profile.isPublic ? "Public" : "Privé"}
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {user.email === "leevykouassi@gmail.com" && onAdminAccess && (
            <button
              onClick={onAdminAccess}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue/10 text-brand-blue rounded-full font-sans font-bold hover:bg-brand-blue/20 transition-all"
            >
              <ShieldCheck className="w-5 h-5" />
              Administration
            </button>
          )}
          <button
            onClick={() => setShowCvInput(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue/10 text-brand-blue rounded-full font-sans font-bold hover:bg-brand-blue/20 transition-all"
          >
            <Upload className="w-5 h-5" />
            Importer CV
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 px-8 py-3 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
          >
            {isSaving ? "Enregistrement..." : (
              <>
                <Save className="w-5 h-5" />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Main Info */}
        <div className="lg:col-span-2 space-y-8">
          {/* Summary Section */}
          <div className="bg-white p-8 rounded-3xl border border-[#1a1a1a]/5 shadow-sm space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#5A5A40]" />
              Résumé Professionnel
            </h3>
            <textarea
              value={profile.summary}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
              placeholder="Décrivez votre parcours et vos aspirations..."
              className="w-full h-32 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans text-sm resize-none"
            />
          </div>

          {/* Experience Section */}
          <div className="bg-white p-8 rounded-3xl border border-[#1a1a1a]/5 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#5A5A40]" />
                Expériences
              </h3>
              <button
                onClick={() => setProfile({
                  ...profile,
                  experience: [...profile.experience, { company: "", role: "", period: "", description: "" }]
                })}
                className="p-2 bg-gray-50 text-[#5A5A40] rounded-full hover:bg-gray-100"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              {profile.experience.map((exp, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-2xl space-y-3 relative group">
                  <button
                    onClick={() => {
                      const newExp = [...profile.experience];
                      newExp.splice(i, 1);
                      setProfile({ ...profile, experience: newExp });
                    }}
                    className="absolute top-2 right-2 p-1 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Entreprise"
                      value={exp.company}
                      onChange={(e) => {
                        const newExp = [...profile.experience];
                        newExp[i].company = e.target.value;
                        setProfile({ ...profile, experience: newExp });
                      }}
                      className="bg-white p-2 rounded-lg border-none text-sm font-sans"
                    />
                    <input
                      type="text"
                      placeholder="Poste"
                      value={exp.role}
                      onChange={(e) => {
                        const newExp = [...profile.experience];
                        newExp[i].role = e.target.value;
                        setProfile({ ...profile, experience: newExp });
                      }}
                      className="bg-white p-2 rounded-lg border-none text-sm font-sans"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Période (ex: 2020 - 2023)"
                    value={exp.period}
                    onChange={(e) => {
                      const newExp = [...profile.experience];
                      newExp[i].period = e.target.value;
                      setProfile({ ...profile, experience: newExp });
                    }}
                    className="w-full bg-white p-2 rounded-lg border-none text-sm font-sans"
                  />
                  <textarea
                    placeholder="Description des missions..."
                    value={exp.description}
                    onChange={(e) => {
                      const newExp = [...profile.experience];
                      newExp[i].description = e.target.value;
                      setProfile({ ...profile, experience: newExp });
                    }}
                    className="w-full h-20 bg-white p-2 rounded-lg border-none text-sm font-sans resize-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Skills & Suggestions */}
        <div className="space-y-8">
          {/* Skills Section */}
          <div className="bg-white p-8 rounded-3xl border border-[#1a1a1a]/5 shadow-sm space-y-4">
            <h3 className="text-lg font-bold">Compétences</h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, i) => (
                <span key={i} className="group flex items-center gap-1.5 px-3 py-1.5 bg-[#5A5A40]/5 text-[#5A5A40] text-xs font-bold font-sans rounded-lg">
                  {skill}
                  <button
                    onClick={() => {
                      const newSkills = [...profile.skills];
                      newSkills.splice(i, 1);
                      setProfile({ ...profile, skills: newSkills });
                    }}
                    className="hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="+ Ajouter"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    const input = e.target as HTMLInputElement;
                    if (input.value.trim()) {
                      setProfile({ ...profile, skills: [...profile.skills, input.value.trim()] });
                      input.value = "";
                    }
                  }
                }}
                className="px-3 py-1.5 bg-gray-50 text-xs font-sans rounded-lg border-none w-24 focus:w-32 transition-all"
              />
            </div>
          </div>

          {/* Suggestions Section */}
          <div className="bg-brand-blue p-8 rounded-3xl text-white shadow-xl shadow-brand-blue/20 space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Conseils IA
            </h3>
            <div className="space-y-4">
              {profile.suggestions.map((s, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                  <p className="text-sm font-sans opacity-90 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CV Upload Modal */}
      <AnimatePresence>
        {showCvInput && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-2xl font-bold">Analyse de CV par IA</h3>
                <button onClick={() => setShowCvInput(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-brand-blue/5 p-4 rounded-2xl border border-brand-blue/10">
                  <p className="text-sm text-brand-blue font-sans leading-relaxed">
                    <strong>Comment ça marche ?</strong> Importez votre CV au format PDF ou Word. Notre IA va extraire vos expériences, formations et compétences pour remplir automatiquement votre profil Sangcoolheur.
                  </p>
                </div>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="w-full h-64 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-16 h-16 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-brand-blue group-hover:scale-110 transition-transform">
                    {isParsing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full"
                      />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-[#1a1a1a]">
                      {isParsing ? "Analyse en cours..." : "Cliquez pour importer votre CV"}
                    </p>
                    <p className="text-sm text-[#1a1a1a]/40 font-sans mt-1">
                      PDF, Word ou Texte (max. 10MB)
                    </p>
                  </div>
                </button>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setShowCvInput(false)}
                    className="px-6 py-3 text-[#1a1a1a]/60 font-sans font-bold hover:text-[#1a1a1a]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
