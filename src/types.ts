export type Hub = "emploi" | "business" | "formation" | null;

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: "CDI" | "CDD" | "Freelance" | "Stage" | "Alternance" | "Consultance";
  description: string;
  requirements: string[];
  postedAt: any;
  expiresAt?: string;
  url?: string;
  applicationLink?: string;
  applicationEmail?: string;
  fileUrl?: string;
  isExpired: boolean;
  tags: string[];
  authorUid: string;
  viewCount?: number;
  isArchived?: boolean;
}

export interface BusinessOpportunity {
  id: string;
  title: string;
  company: string;
  location: string;
  budget?: string;
  sector?: string;
  type: "Appel d'offres" | "Partenariat" | "Sous-traitance" | "Emploi" | "Autre";
  description: string;
  requirements: string[];
  postedAt: any;
  expiresAt?: string;
  url?: string;
  applicationLink?: string;
  applicationEmail?: string;
  fileUrl?: string;
  isExpired: boolean;
  tags: string[];
  authorUid: string;
  viewCount?: number;
  isArchived?: boolean;
}

export interface ContractGuarantee {
  id: string;
  submitterUid: string;
  submitterInfo: {
    fullName: string;
    phone: string;
    company: string;
    position: string;
  };
  providerInfo: {
    fullName: string;
    phone: string;
    company: string;
  };
  marketDetails: {
    description: string;
    expectedResults: string;
    budget?: string;
    deadline?: string;
  };
  status: "pending" | "validated" | "rejected" | "completed";
  createdAt: any;
  validatedAt?: any;
  adminNote?: string;
  successStatus?: "success" | "failure" | "mixed";
}

export interface RecapLink {
  id: string;
  url: string;
  updatedAt: any;
}

export interface TrainingOffer {
  id: string;
  title: string;
  trainer: string;
  description: string;
  duration: string;
  price: string;
  link?: string;
  applicationLink?: string;
  applicationEmail?: string;
  fileUrl?: string;
  postedAt: any;
  authorUid: string;
  viewCount?: number;
  isArchived?: boolean;
}

export interface Profile {
  id: string;
  userId: string;
  fullName: string;
  title: string;
  summary: string;
  skills: string[];
  experience: {
    company: string;
    role: string;
    period: string;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    year: string;
  }[];
  tags: string[];
  isPublic: boolean;
  completenessScore: number;
  suggestions: string[];
  checklist?: string[];
}

export interface AdviceMessage {
  role: "user" | "model";
  text: string;
}
