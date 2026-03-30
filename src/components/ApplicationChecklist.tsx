import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { db, doc, getDoc, setDoc, OperationType, handleFirestoreError } from "../firebase";
import { Profile } from "../types";
import { APPLICATION_CHECKLIST } from "../constants/checklist";
import { CheckCircle2, X, Info, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ApplicationChecklist({ user }: { user: User }) {
  const [isOpen, setIsOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, "profiles", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Profile;
          setProfile(data);
          setCheckedItems(data.checklist || []);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "profiles/" + user.uid);
      }
    };
    fetchProfile();
  }, [user]);

  const toggleItem = async (id: string) => {
    const newChecked = checkedItems.includes(id)
      ? checkedItems.filter(i => i !== id)
      : [...checkedItems, id];
    
    setCheckedItems(newChecked);
    
    if (profile) {
      try {
        await setDoc(doc(db, "profiles", user.uid), {
          ...profile,
          checklist: newChecked
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "profiles/" + user.uid);
      }
    }
  };

  const progress = Math.round((checkedItems.length / APPLICATION_CHECKLIST.length) * 100);

  return (
    <>
      {/* Card Trigger */}
      <div className="bg-white p-8 rounded-3xl border border-[#1a1a1a]/5 shadow-xl space-y-4">
        <h3 className="text-2xl font-bold">Checklist candidature</h3>
        <p className="text-[#1a1a1a]/60 font-sans leading-relaxed">
          Vérifie que ton dossier est complet avant d'envoyer. Ne rate plus aucun détail qui ferait la différence.
        </p>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
        >
          Voir la checklist
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <h3 className="text-2xl font-bold">Checklist candidature</h3>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-bold font-sans">
                    <span className="text-[#1a1a1a]/60">Progression</span>
                    <span className="text-brand-blue">{progress}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-brand-blue"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {APPLICATION_CHECKLIST.map((item) => (
                    <div key={item.id} className="space-y-2">
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                          checkedItems.includes(item.id)
                            ? "bg-brand-blue/5 border-brand-blue/20"
                            : "bg-white border-gray-100 hover:border-brand-blue/20"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                          checkedItems.includes(item.id)
                            ? "bg-brand-blue border-brand-blue text-white"
                            : "border-gray-200"
                        )}>
                          {checkedItems.includes(item.id) && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <span className={cn(
                          "flex-1 font-sans font-semibold",
                          checkedItems.includes(item.id) ? "text-brand-blue" : "text-[#1a1a1a]"
                        )}>
                          {item.label}
                        </span>
                      </button>
                      
                      {/* Advice */}
                      <div className="pl-14 pr-4">
                        <div className="flex gap-2 items-start p-3 bg-gray-50 rounded-xl text-xs text-[#1a1a1a]/60 font-sans italic">
                          <Info className="w-4 h-4 shrink-0 text-brand-blue/40" />
                          <p>{item.advice}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-center">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-8 py-3 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
                >
                  J'ai tout vérifié !
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
