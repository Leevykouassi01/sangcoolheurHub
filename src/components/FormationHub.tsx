import { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { db, collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, OperationType, handleFirestoreError, doc, setDoc, deleteDoc, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { TrainingOffer, RecapLink } from "../types";
import { GraduationCap, Clock, Plus, Search, ExternalLink, X, User as UserIcon, DollarSign, BookOpen, Link as LinkIcon, Trash2, Archive, Eye, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export default function FormationHub({ user }: { user: User }) {
  const [trainings, setTrainings] = useState<TrainingOffer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isEditingRecap, setIsEditingRecap] = useState(false);
  const [recapLink, setRecapLink] = useState<RecapLink | null>(null);
  const [newRecapUrl, setNewRecapUrl] = useState("");
  const [newTraining, setNewTraining] = useState({
    title: "",
    description: "",
    duration: "",
    price: "",
    link: "",
    applicationEmail: "",
    applicationLink: "",
    fileUrl: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user.email === "leevykouassi@gmail.com";

  useEffect(() => {
    const q = query(collection(db, "training_offers"), orderBy("postedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          ...d,
          viewCount: d.viewCount || 0,
          isArchived: d.isArchived || false
        } as TrainingOffer;
      });
      setTrainings(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "training_offers");
    });

    const recapUnsubscribe = onSnapshot(doc(db, "recap_links", "main"), (doc) => {
      if (doc.exists()) {
        setRecapLink(doc.data() as RecapLink);
        setNewRecapUrl(doc.data().url);
      }
    });

    return () => {
      unsubscribe();
      recapUnsubscribe();
    };
  }, []);

  const handleDeleteFormation = async (formationId: string) => {
    try {
      await deleteDoc(doc(db, "training_offers", formationId));
      setShowConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "training_offers/" + formationId);
    }
  };

  const handleArchiveFormation = async (formationId: string) => {
    try {
      await setDoc(doc(db, "training_offers", formationId), { isArchived: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "training_offers/" + formationId);
    }
  };

  const handleIncrementView = async (formationId: string, currentViews: number) => {
    try {
      await setDoc(doc(db, "training_offers", formationId), { viewCount: (currentViews || 0) + 1 }, { merge: true });
    } catch (error) {
      console.error("Failed to increment view count", error);
    }
  };

  const handlePostTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "training_offers"), {
        ...newTraining,
        trainer: user.displayName || "Formateur Sangcoolheur",
        postedAt: serverTimestamp(),
        authorUid: user.uid
      });
      setIsPosting(false);
      setNewTraining({ 
        title: "", 
        description: "", 
        duration: "", 
        price: "", 
        link: "",
        applicationEmail: "",
        applicationLink: "",
        fileUrl: ""
      });
      alert("Offre de formation publiée !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "training_offers");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `formations/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setNewTraining(prev => ({ ...prev, fileUrl: downloadURL }));
      alert("Document chargé avec succès !");
    } catch (error) {
      console.error("Upload error", error);
      alert("Erreur lors du chargement du document.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateRecap = async () => {
    try {
      await setDoc(doc(db, "recap_links", "main"), {
        url: newRecapUrl,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      setIsEditingRecap(false);
      alert("Lien récapitulatif mis à jour !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "recap_links/main");
    }
  };

  const filteredTrainings = trainings.filter(t => {
    const matchesSearch = 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.trainer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && !t.isArchived;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold mb-2">Formation Hub</h2>
          <p className="text-[#1a1a1a]/60">Développez vos compétences avec les experts de la communauté.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={recapLink?.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold transition-all shadow-sm ${
              recapLink?.url 
                ? "bg-white border border-gray-100 text-brand-blue hover:bg-gray-50" 
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <BookOpen className="w-5 h-5" />
            Récap des formations
          </a>
          {isAdmin && (
            <button
              onClick={() => setIsEditingRecap(true)}
              className="p-3 bg-brand-blue/10 text-brand-blue rounded-full hover:bg-brand-blue/20 transition-all"
              title="Modifier le lien récap"
            >
              <LinkIcon className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setIsPosting(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-full font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
          >
            <Plus className="w-5 h-5" />
            Publier une formation
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#1a1a1a]/30" />
        <input
          type="text"
          placeholder="Rechercher une formation, un formateur..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-brand-blue/20"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTrainings.map((training) => (
          <motion.div
            key={training.id}
            layout
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group flex flex-col"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-brand-blue">
                <GraduationCap className="w-6 h-6" />
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleArchiveFormation(training.id)}
                    className="p-1.5 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all"
                    title="Archiver la formation"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowConfirmDelete(training.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                    title="Supprimer la formation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <h3 className="text-xl font-bold mb-1 group-hover:text-brand-blue transition-colors">{training.title}</h3>
            <div className="flex items-center gap-4 mb-4">
              <p className="text-sm text-gray-500 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5" />
                {training.trainer}
              </p>
              <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {training.viewCount || 0} vues
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-6 line-clamp-3 font-sans leading-relaxed">
              {training.description}
            </p>
            
            {(training.applicationEmail || training.applicationLink || training.fileUrl) && (
              <div className="mb-6 p-4 bg-gray-50 rounded-2xl space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Comment s'inscrire :</p>
                {training.applicationEmail && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400">Email :</span>
                    <a href={`mailto:${training.applicationEmail}`} className="text-sm text-brand-blue font-bold hover:underline">
                      {training.applicationEmail}
                    </a>
                  </div>
                )}
                {training.applicationLink && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400">Lien direct :</span>
                    <a href={training.applicationLink} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-blue font-bold hover:underline">
                      {training.applicationLink}
                    </a>
                  </div>
                )}
                {training.fileUrl && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400">Document :</span>
                    <a href={training.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-blue font-bold hover:underline flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      Voir le programme
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-auto space-y-4">
              <div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {training.duration}
                </div>
                <div className="flex items-center gap-1.5 text-brand-blue">
                  <DollarSign className="w-3.5 h-3.5" />
                  {training.price}
                </div>
              </div>
              <button 
                onClick={() => handleIncrementView(training.id, training.viewCount || 0)}
                className="w-full py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue/90 transition-all flex items-center justify-center gap-2"
              >
                S'inscrire
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Post Training Modal */}
      <AnimatePresence>
        {isEditingRecap && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-bold">Lien Récap Formation</h3>
                <button onClick={() => setIsEditingRecap(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">URL du récapitulatif</label>
                  <input
                    type="url"
                    value={newRecapUrl}
                    onChange={e => setNewRecapUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
                <button
                  onClick={handleUpdateRecap}
                  className="w-full py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue/90 transition-all"
                >
                  Enregistrer le lien
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isPosting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-bold">Publier une formation</h3>
                <button onClick={() => setIsPosting(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handlePostTraining} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Titre de la formation</label>
                  <input
                    required
                    type="text"
                    value={newTraining.title}
                    onChange={e => setNewTraining({...newTraining, title: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Description</label>
                  <textarea
                    required
                    value={newTraining.description}
                    onChange={e => setNewTraining({...newTraining, description: e.target.value})}
                    className="w-full h-32 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Durée</label>
                    <input
                      required
                      type="text"
                      value={newTraining.duration}
                      onChange={e => setNewTraining({...newTraining, duration: e.target.value})}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                      placeholder="Ex: 10 heures"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Prix</label>
                    <input
                      required
                      type="text"
                      value={newTraining.price}
                      onChange={e => setNewTraining({...newTraining, price: e.target.value})}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                      placeholder="Ex: 50 000 FCFA"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Lien d'inscription (Source)</label>
                  <input
                    type="url"
                    value={newTraining.link}
                    onChange={e => setNewTraining({...newTraining, link: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                    placeholder="https://..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Email direct</label>
                    <input
                      type="email"
                      value={newTraining.applicationEmail}
                      onChange={e => setNewTraining({...newTraining, applicationEmail: e.target.value})}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                      placeholder="contact@formation.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Lien direct</label>
                    <input
                      type="url"
                      value={newTraining.applicationLink}
                      onChange={e => setNewTraining({...newTraining, applicationLink: e.target.value})}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-brand-blue/20"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Document (PDF/Word)</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      {newTraining.fileUrl ? "Document chargé" : "Charger un document"}
                    </button>
                    <input
                      type="file"
                      ref={docInputRef}
                      onChange={handleDocUpload}
                      accept=".pdf,.docx,.doc"
                      className="hidden"
                    />
                    {newTraining.fileUrl && (
                      <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" />
                        Prêt
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 shrink-0 border-t border-gray-100 p-6 bg-white">
                  <button
                    type="button"
                    onClick={() => setIsPosting(false)}
                    className="px-6 py-3 text-gray-500 font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 bg-brand-blue text-white rounded-full font-bold hover:bg-brand-blue/90 disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? "Publication..." : "Publier"}
                  </button>
                </div>
              </form>
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
              <h3 className="text-2xl font-bold mb-2">Supprimer la formation ?</h3>
              <p className="text-gray-500 font-sans mb-8">Cette action est irréversible. La formation sera définitivement supprimée de la plateforme.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmDelete(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDeleteFormation(showConfirmDelete)}
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
