import { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { db, collection, onSnapshot, query, orderBy, OperationType, handleFirestoreError, setDoc, doc, serverTimestamp, deleteDoc, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Job } from "../types";
import { Briefcase, MapPin, Clock, Plus, Search, Filter, ExternalLink, Calendar, X, FileText, Upload, Trash2, Archive, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { parseMultipleJobs, parseSingleJob } from "../services/geminiService";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import ApplicationChecklist from "./ApplicationChecklist";

// Global worker for PDF.js - Using a more compatible format
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.mjs`;

const ADMIN_EMAIL = "leevykouassi@gmail.com";

export default function JobBoard({ user }: { user: User | null }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isPosting, setIsPosting] = useState(false);
  const [newJobText, setNewJobText] = useState("");
  const [newJobFields, setNewJobFields] = useState({
    applicationEmail: "",
    applicationLink: "",
    fileUrl: "",
    expiresAt: ""
  });
  const [isParsing, setIsParsing] = useState(false);

  // Safety timeout for parsing state
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isParsing) {
      console.log("Job parsing started...");
      timeout = setTimeout(() => {
        console.warn("Job parsing timed out after 30s. Resetting state.");
        setIsParsing(false);
      }, 30000);
    }
    return () => clearTimeout(timeout);
  }, [isParsing]);
  const [isUploading, setIsUploading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const analytics = {
    totalActive: jobs.filter(j => !j.isArchived).length,
    totalViews: jobs.reduce((acc, j) => acc + (j.viewCount || 0), 0),
    topType: jobs.length > 0 ? Array.from(new Set(jobs.map(j => j.type))).reduce((a, b) => 
      jobs.filter(j => j.type === a).length >= jobs.filter(j => j.type === b).length ? a : b
    ) : "N/A"
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = 
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === "all" || job.type === filterType;
    return matchesSearch && matchesType && !job.isArchived;
  });

  const archivedJobs = jobs.filter(job => job.isArchived);

  // Auto-archive effect
  useEffect(() => {
    if (!jobs.length || !isAdmin) return;

    const now = new Date();
    jobs.forEach(async (job) => {
      if (job.expiresAt && !job.isArchived) {
        const expiryDate = new Date(job.expiresAt);
        if (expiryDate < now) {
          console.log(`Auto-archiving expired job: ${job.title}`);
          try {
            await setDoc(doc(db, "jobs", job.id), { 
              isArchived: true,
              isExpired: true 
            }, { merge: true });
          } catch (e) {
            console.error("Auto-archive failed", e);
          }
        }
      }
    });
  }, [jobs, isAdmin]);

  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("postedAt", "desc"));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: false }, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => {
        const data = doc.data({ serverTimestamps: 'estimate' });
        // Handle both string and Firestore Timestamp
        let postedAt = data.postedAt;
        if (postedAt && typeof postedAt !== 'string' && typeof postedAt === 'object' && 'toDate' in postedAt) {
          postedAt = (postedAt as any).toDate().toISOString();
        }
        
        let expiresAt = data.expiresAt;
        if (expiresAt && typeof expiresAt !== 'string' && typeof expiresAt === 'object' && 'toDate' in expiresAt) {
          expiresAt = (expiresAt as any).toDate().toISOString();
        }

        return { 
          ...data, 
          id: doc.id, 
          postedAt: postedAt || new Date().toISOString(),
          expiresAt,
          tags: data.tags || [],
          requirements: data.requirements || [],
          viewCount: data.viewCount || 0,
          isArchived: data.isArchived || false
        } as Job;
      });
      setJobs(jobsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "jobs");
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteJob = async (jobId: string) => {
    try {
      await deleteDoc(doc(db, "jobs", jobId));
      setShowConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "jobs/" + jobId);
    }
  };

  const handleArchiveJob = async (jobId: string) => {
    try {
      await setDoc(doc(db, "jobs", jobId), { isArchived: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "jobs/" + jobId);
    }
  };

  const handleIncrementView = async (jobId: string, currentViews: number) => {
    try {
      await setDoc(doc(db, "jobs", jobId), { viewCount: (currentViews || 0) + 1 }, { merge: true });
    } catch (error) {
      console.error("Failed to increment view count", error);
    }
  };

  const handlePostJob = async (textToParse: string) => {
    if (!user || !textToParse.trim()) return;
    setIsParsing(true);
    console.log("Starting job extraction for text:", textToParse.substring(0, 100) + "...");
    
    try {
      let count = 0;
      
      if (isAdmin) {
        const parsedJobs = await parseMultipleJobs(textToParse);
        console.log("Gemini returned parsedJobs:", parsedJobs);
        
        if (Array.isArray(parsedJobs) && parsedJobs.length > 0) {
          for (const parsedJob of parsedJobs) {
            const jobRef = doc(collection(db, "jobs"));
            const jobId = jobRef.id;
            
            // Defensive defaults to satisfy Firestore rules
              const jobData: any = {
                title: parsedJob.title || "Titre non spécifié",
                company: parsedJob.company || "Entreprise non spécifiée",
                location: parsedJob.location || "Lieu non spécifié",
                salary: parsedJob.salary || "",
                type: ["CDI", "CDD", "Freelance", "Stage", "Alternance", "Consultance"].includes(parsedJob.type) 
                  ? parsedJob.type 
                  : "CDI",
                description: parsedJob.description || "Aucune description fournie",
                requirements: Array.isArray(parsedJob.requirements) ? parsedJob.requirements : [],
                tags: Array.isArray(parsedJob.tags) ? parsedJob.tags : [],
                url: parsedJob.url || "",
                expiresAt: newJobFields.expiresAt || parsedJob.expiresAt || "",
                applicationEmail: newJobFields.applicationEmail || "",
                applicationLink: newJobFields.applicationLink || "",
                fileUrl: newJobFields.fileUrl || "",
                id: jobId,
                postedAt: serverTimestamp(),
                isExpired: false,
                isArchived: false,
                authorUid: user.uid,
              };
            
            console.log("Saving job to Firestore:", jobData);
            await setDoc(jobRef, jobData);
            count++;
          }
          alert(`${count} offres ont été extraites et publiées avec succès !`);
        } else {
          alert("Aucune offre n'a pu être extraite du texte fourni. Essayez un format plus clair.");
        }
      } else {
        const parsedJob = await parseSingleJob(textToParse);
        console.log("Gemini returned parsedJob:", parsedJob);
        
        const jobRef = doc(collection(db, "jobs"));
        const jobId = jobRef.id;
        
        const jobData: any = {
          title: parsedJob.title || "Titre non spécifié",
          company: parsedJob.company || "Entreprise non spécifiée",
          location: parsedJob.location || "Lieu non spécifié",
          salary: parsedJob.salary || "",
          type: ["CDI", "CDD", "Freelance", "Stage", "Alternance", "Consultance"].includes(parsedJob.type) 
            ? parsedJob.type 
            : "CDI",
          description: parsedJob.description || "Aucune description fournie",
          requirements: Array.isArray(parsedJob.requirements) ? parsedJob.requirements : [],
          tags: Array.isArray(parsedJob.tags) ? parsedJob.tags : [],
          url: parsedJob.url || "",
          expiresAt: newJobFields.expiresAt || parsedJob.expiresAt || "",
          applicationEmail: newJobFields.applicationEmail || "",
          applicationLink: newJobFields.applicationLink || "",
          fileUrl: newJobFields.fileUrl || "",
          id: jobId,
          postedAt: serverTimestamp(),
          isExpired: false,
          isArchived: false,
          authorUid: user.uid,
        };
        
        console.log("Saving single job to Firestore:", jobData);
        await setDoc(jobRef, jobData);
        alert("Votre offre a été extraite et publiée avec succès !");
      }
      
      setIsPosting(false);
      setNewJobText("");
      setNewJobFields({ applicationEmail: "", applicationLink: "", fileUrl: "", expiresAt: "" });
    } catch (error) {
      console.error("Error in handlePostJob:", error);
      alert("Une erreur est survenue lors de la publication des offres. Vérifiez la console pour plus de détails.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `jobs/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setNewJobFields(prev => ({ ...prev, fileUrl: downloadURL }));
      alert("Document chargé avec succès !");
    } catch (error) {
      console.error("Upload error", error);
      alert("Erreur lors du chargement du document.");
    } finally {
      setIsUploading(false);
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
      throw new Error("Impossible de lire le contenu du PDF. Assurez-vous qu'il n'est pas protégé par mot de passe.");
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

      setNewJobText(extractedText);
      // Optionally auto-trigger parsing if the user wants
      // await handlePostJob(extractedText);
    } catch (error) {
      console.error("File parsing error", error);
      alert("Erreur lors de la lecture du fichier.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const safeFormatDistance = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Date inconnue";
      return formatDistanceToNow(date, { addSuffix: true, locale: fr });
    } catch (e) {
      return "Date inconnue";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <h2 className="text-4xl font-bold">Offres d'Emploi</h2>
            {isAdmin && (
              <div className="hidden lg:flex items-center gap-6 px-6 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm ml-4">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actives</p>
                  <p className="text-lg font-bold text-brand-blue">{analytics.totalActive}</p>
                </div>
                <div className="w-px h-8 bg-gray-100" />
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vues</p>
                  <p className="text-lg font-bold text-brand-blue">{analytics.totalViews}</p>
                </div>
                <div className="w-px h-8 bg-gray-100" />
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Top Type</p>
                  <p className="text-lg font-bold text-brand-blue">{analytics.topType}</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-[#1a1a1a]/60">Trouvez votre prochaine opportunité professionnelle parmi les offres de la communauté Sangcoolheur.</p>
        </div>
        {user && (
          <button
            onClick={() => setIsPosting(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
          >
            <Plus className="w-5 h-5" />
            Publier une offre
          </button>
        )}
      </div>

      {user && <ApplicationChecklist user={user} />}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-[#1a1a1a]/5 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#1a1a1a]/30" />
          <input
            type="text"
            placeholder="Poste, entreprise, compétences..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans text-sm"
          >
            <option value="all">Tous les types</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Freelance">Freelance</option>
            <option value="Stage">Stage</option>
            <option value="Alternance">Alternance</option>
            <option value="Consultance">Consultance</option>
          </select>
        </div>
      </div>

      {/* Job List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length > 0 ? (
          filteredJobs.map((job) => (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              key={job.id}
              className="group bg-white p-6 rounded-3xl border border-[#1a1a1a]/5 hover:border-[#5A5A40]/30 transition-all hover:shadow-xl hover:shadow-[#5A5A40]/5"
            >
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-[#5A5A40]/10 text-[#5A5A40] text-xs font-bold rounded-full uppercase tracking-wider font-sans">
                        {job.type}
                      </span>
                      <span className="text-xs text-[#1a1a1a]/40 flex items-center gap-1 font-sans">
                        <Clock className="w-3 h-3" />
                        {safeFormatDistance(job.postedAt)}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleArchiveJob(job.id)}
                          className="p-2 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all"
                          title="Archiver l'offre"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowConfirmDelete(job.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                          title="Supprimer l'offre"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold group-hover:text-[#5A5A40] transition-colors">{job.title}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-[#1a1a1a]/60 font-sans">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4" />
                      {job.company}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      {job.location}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                      <Eye className="w-3 h-3" />
                      {job.viewCount || 0} vues
                    </span>
                    {job.salary && (
                      <span className="font-semibold text-brand-blue">
                        {job.salary}
                      </span>
                    )}
                    {job.expiresAt && (
                      <span className="flex items-center gap-1.5 text-orange-600 font-semibold">
                        <Calendar className="w-4 h-4" />
                        Expire le {new Date(job.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {job.tags.map(tag => (
                      <span key={tag} className="text-[10px] uppercase tracking-widest font-bold text-[#1a1a1a]/40 bg-gray-100 px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {job.url && (
                    <div className="mt-4 pt-4 border-t border-dashed border-[#1a1a1a]/5 flex flex-col gap-1 text-sm text-[#1a1a1a]/60 font-sans">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#5A5A40]" />
                        <span className="font-semibold text-[#1a1a1a]">Candidature :</span>
                      </div>
                      <div className="pl-6 break-all space-y-2">
                        {job.url && (
                          <div>
                            <span className="text-xs text-gray-400 block">Lien source :</span>
                            {job.url.startsWith('mailto:') ? (
                              <a href={job.url} className="text-[#5A5A40] hover:underline italic">
                                {job.url.replace('mailto:', '')}
                              </a>
                            ) : (
                              <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-[#5A5A40] hover:underline italic">
                                {job.url}
                              </a>
                            )}
                          </div>
                        )}
                        {job.applicationEmail && (
                          <div>
                            <span className="text-xs text-gray-400 block">Email de contact :</span>
                            <a href={`mailto:${job.applicationEmail}`} className="text-brand-blue hover:underline font-bold">
                              {job.applicationEmail}
                            </a>
                          </div>
                        )}
                        {job.applicationLink && (
                          <div>
                            <span className="text-xs text-gray-400 block">Lien direct :</span>
                            <a href={job.applicationLink} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline font-bold">
                              {job.applicationLink}
                            </a>
                          </div>
                        )}
                        {job.fileUrl && (
                          <div>
                            <span className="text-xs text-gray-400 block">Document joint :</span>
                            <a href={job.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-brand-blue hover:underline font-bold">
                              <FileText className="w-4 h-4" />
                              Consulter le document
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-end md:items-center">
                  <a
                    href={job.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleIncrementView(job.id, job.viewCount || 0)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-white border-2 border-brand-blue text-brand-blue rounded-full font-sans font-bold hover:bg-brand-blue hover:text-white transition-all"
                  >
                    Postuler
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-[#1a1a1a]/10">
            <Briefcase className="w-12 h-12 text-[#1a1a1a]/10 mx-auto mb-4" />
            <p className="text-[#1a1a1a]/40 font-sans">Aucune offre ne correspond à votre recherche.</p>
          </div>
        )}
      </div>

      {/* Post Job Modal */}
      <AnimatePresence>
        {isPosting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-bold">Publier des offres</h3>
                <button onClick={() => setIsPosting(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="bg-[#5A5A40]/5 p-4 rounded-2xl border border-[#5A5A40]/10 flex flex-col gap-3">
                  <p className="text-sm text-[#5A5A40] font-sans leading-relaxed">
                    <strong>Import intelligent :</strong> Collez le texte de vos offres ou importez un fichier (PDF, Word). Notre IA peut détecter et extraire plusieurs offres simultanément.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#5A5A40]/20 text-[#5A5A40] rounded-xl text-xs font-bold font-sans hover:bg-white/50 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      Importer PDF / Word
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                    />
                  </div>
                </div>
                <textarea
                  value={newJobText}
                  onChange={(e) => setNewJobText(e.target.value)}
                  placeholder="Collez ici le texte de vos annonces..."
                  className="w-full h-48 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans resize-none"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Email de candidature (Direct)</label>
                    <input
                      type="email"
                      value={newJobFields.applicationEmail}
                      onChange={(e) => setNewJobFields(prev => ({ ...prev, applicationEmail: e.target.value }))}
                      placeholder="rh@entreprise.com"
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Lien de candidature (Direct)</label>
                    <input
                      type="url"
                      value={newJobFields.applicationLink}
                      onChange={(e) => setNewJobFields(prev => ({ ...prev, applicationLink: e.target.value }))}
                      placeholder="https://..."
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Date d'expiration (Optionnel)</label>
                  <input
                    type="date"
                    value={newJobFields.expiresAt}
                    onChange={(e) => setNewJobFields(prev => ({ ...prev, expiresAt: e.target.value }))}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Document de l'offre (PDF/Word)</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      {newJobFields.fileUrl ? "Document chargé" : "Charger un document"}
                    </button>
                    <input
                      type="file"
                      ref={docInputRef}
                      onChange={handleDocUpload}
                      accept=".pdf,.docx,.doc"
                      className="hidden"
                    />
                    {newJobFields.fileUrl && (
                      <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        Prêt
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 shrink-0 border-t border-gray-100 p-6 bg-white">
                  <button
                    onClick={() => setIsPosting(false)}
                    className="px-6 py-3 text-[#1a1a1a]/60 font-sans font-bold hover:text-[#1a1a1a]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => handlePostJob(newJobText)}
                    disabled={isParsing || !newJobText.trim()}
                    className="flex items-center gap-2 px-8 py-3 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isParsing ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                        />
                        Extraction & Publication...
                      </>
                    ) : (
                      "Générer les offres"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
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
              <h3 className="text-2xl font-bold mb-2">Supprimer l'offre ?</h3>
              <p className="text-gray-500 font-sans mb-8">Cette action est irréversible. L'offre sera définitivement supprimée de la plateforme.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmDelete(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDeleteJob(showConfirmDelete)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
