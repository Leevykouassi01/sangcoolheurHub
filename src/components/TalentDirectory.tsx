import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { db, collection, onSnapshot, query, where, OperationType, handleFirestoreError } from "../firebase";
import { Profile } from "../types";
import { Users, Search, Filter, Mail, Award, CheckCircle2, X, ChevronRight, Briefcase, GraduationCap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function TalentDirectory({ user }: { user: User | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  useEffect(() => {
    // Only fetch public profiles
    const q = query(collection(db, "profiles"), where("isPublic", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const profilesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
      setProfiles(profilesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "profiles");
    });
    return () => unsubscribe();
  }, []);

  const filteredProfiles = profiles.filter(profile => {
    const matchesSearch = profile.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          profile.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          profile.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          profile.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold mb-2">Talents</h2>
          <p className="text-[#1a1a1a]/60">Découvrez les profils exceptionnels de notre communauté.</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-[#1a1a1a]/5 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#1a1a1a]/30" />
          <input
            type="text"
            placeholder="Nom, métier, compétences..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans"
          />
        </div>
      </div>

      {/* Talent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProfiles.length > 0 ? (
          filteredProfiles.map((profile) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={profile.id}
              onClick={() => setSelectedProfile(profile)}
              className="group bg-white p-6 rounded-3xl border border-[#1a1a1a]/5 hover:border-brand-blue/30 transition-all hover:shadow-xl hover:shadow-brand-blue/5 cursor-pointer relative overflow-hidden"
            >
              {/* Completeness Badge */}
              {profile.completenessScore > 80 && (
                <div className="absolute top-4 right-4 text-brand-blue">
                  <CheckCircle2 className="w-5 h-5 fill-brand-blue/10" />
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-brand-blue text-2xl font-bold font-sans">
                    {profile.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold group-hover:text-brand-blue transition-colors">{profile.fullName}</h3>
                    <p className="text-sm text-[#1a1a1a]/60 font-sans">{profile.title}</p>
                  </div>
                </div>
                
                <p className="text-sm text-[#1a1a1a]/80 line-clamp-2 font-sans italic leading-relaxed">
                  "{profile.summary}"
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  {profile.skills.slice(0, 4).map(skill => (
                    <span key={skill} className="text-[10px] uppercase tracking-widest font-bold text-[#1a1a1a]/40 bg-gray-100 px-2 py-1 rounded">
                      {skill}
                    </span>
                  ))}
                  {profile.skills.length > 4 && (
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#1a1a1a]/20 px-2 py-1">
                      +{profile.skills.length - 4}
                    </span>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-gray-50">
                  <div className="flex gap-1">
                    {profile.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] font-bold text-brand-blue bg-brand-blue/5 px-2 py-0.5 rounded uppercase">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#1a1a1a]/20 group-hover:text-brand-blue group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-[#1a1a1a]/10">
            <Users className="w-12 h-12 text-[#1a1a1a]/10 mx-auto mb-4" />
            <p className="text-[#1a1a1a]/40 font-sans">Aucun talent trouvé pour cette recherche.</p>
          </div>
        )}
      </div>

      {/* Profile Detail Modal */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-blue/10 rounded-xl flex items-center justify-center text-brand-blue text-xl font-bold">
                    {selectedProfile.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedProfile.fullName}</h3>
                    <p className="text-sm text-[#1a1a1a]/60 font-sans">{selectedProfile.title}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedProfile(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-10">
                {/* Summary */}
                <section>
                  <h4 className="text-xs uppercase tracking-widest font-bold text-brand-blue mb-4 flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Résumé Professionnel
                  </h4>
                  <p className="text-lg italic leading-relaxed text-[#1a1a1a]/80">
                    "{selectedProfile.summary}"
                  </p>
                </section>

                {/* Skills */}
                <section>
                  <h4 className="text-xs uppercase tracking-widest font-bold text-[#5A5A40] mb-4">Compétences Clés</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.skills.map(skill => (
                      <span key={skill} className="px-3 py-1 bg-gray-100 text-[#1a1a1a]/60 text-sm font-sans rounded-lg">
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Experience */}
                  <section>
                    <h4 className="text-xs uppercase tracking-widest font-bold text-brand-blue mb-6 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Expériences
                    </h4>
                    <div className="space-y-6">
                      {selectedProfile.experience?.map((exp, i) => (
                        <div key={i} className="relative pl-6 border-l border-gray-100">
                          <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 bg-brand-blue rounded-full" />
                          <h5 className="font-bold text-sm">{exp.role}</h5>
                          <p className="text-xs text-brand-blue font-sans font-semibold mb-1">{exp.company} • {exp.period}</p>
                          <p className="text-xs text-[#1a1a1a]/60 font-sans leading-relaxed">{exp.description}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Education */}
                  <section>
                    <h4 className="text-xs uppercase tracking-widest font-bold text-[#5A5A40] mb-6 flex items-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      Formation
                    </h4>
                    <div className="space-y-6">
                      {selectedProfile.education?.map((edu, i) => (
                        <div key={i} className="relative pl-6 border-l border-gray-100">
                          <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 bg-[#5A5A40] rounded-full opacity-30" />
                          <h5 className="font-bold text-sm">{edu.degree}</h5>
                          <p className="text-xs text-[#5A5A40] font-sans font-semibold mb-1">{edu.school} • {edu.year}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-center">
                <button
                  onClick={() => alert("Fonctionnalité de contact bientôt disponible !")}
                  className="flex items-center gap-2 px-12 py-4 bg-brand-blue text-white rounded-full font-sans font-bold hover:bg-brand-blue/90 transition-all shadow-xl shadow-brand-blue/20"
                >
                  <Mail className="w-5 h-5" />
                  Contacter ce talent
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
