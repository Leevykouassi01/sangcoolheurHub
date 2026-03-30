export interface ChecklistItem {
  id: string;
  label: string;
  advice: string;
}

export const APPLICATION_CHECKLIST: ChecklistItem[] = [
  {
    id: "cv_update",
    label: "CV à jour (moins de 6 mois)",
    advice: "Un CV récent montre que vous êtes actif. Vérifiez que vos dernières expériences et compétences y figurent."
  },
  {
    id: "photo",
    label: "Photo professionnelle récente",
    advice: "Une photo nette, sur fond neutre, avec une tenue professionnelle renforce votre crédibilité."
  },
  {
    id: "cover_letter",
    label: "Lettre de motivation personnalisée",
    advice: "Évitez les copier-coller. Citez le nom de l'entreprise et expliquez pourquoi ce poste précis vous intéresse."
  },
  {
    id: "email_subject",
    label: "Objet du mail clair (poste + nom)",
    advice: "Exemple : 'Candidature Développeur Fullstack - Jean Dupont'. Cela aide le recruteur à classer votre mail."
  },
  {
    id: "proofreading",
    label: "Relecture orthographe CV + LM",
    advice: "Les fautes sont éliminatoires. Utilisez un correcteur ou faites-vous relire par un proche."
  },
  {
    id: "diplomas",
    label: "Copies diplômes joints si demandés",
    advice: "Préparez des scans propres de vos diplômes et certifications au format PDF."
  },
  {
    id: "references",
    label: "Références / contacts disponibles",
    advice: "Ayez sous la main les coordonnées de 2 ou 3 anciens managers prêts à vous recommander."
  }
];
