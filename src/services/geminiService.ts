import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const parseMultipleJobs = async (text: string) => {
  console.log("Gemini: Parsing multiple jobs. Total text length:", text.length);
  
  // Split text into chunks of ~12,000 characters to stay within output token limits
  // We try to split at double newlines to avoid cutting a job description in half
  const chunkSize = 12000;
  const chunks: string[] = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    let endPos = currentPos + chunkSize;
    if (endPos < text.length) {
      // Look for a good split point (double newline) within the last 2000 characters of the chunk
      const searchStart = Math.max(currentPos, endPos - 2000);
      const splitPoint = text.lastIndexOf("\n\n", endPos);
      if (splitPoint > searchStart) {
        endPos = splitPoint;
      }
    }
    chunks.push(text.substring(currentPos, endPos));
    currentPos = endPos;
  }

  console.log(`Gemini: Processing ${chunks.length} chunks for job extraction...`);

  const results = await Promise.all(chunks.map(async (chunk, index) => {
    console.log(`Gemini: Processing chunk ${index + 1}/${chunks.length} (length: ${chunk.length})...`);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following text which is an extraction from a job digest PDF. 
        Each page or section usually contains one or more job titles, a company name, a contact method (email or URL), and a deadline date.
        
        Extract ALL job offers found in THIS SPECIFIC SECTION and return an array of structured job data in JSON format.
        
        Rules:
        1. For each job title found, create a separate entry even if they share the same company/deadline.
        2. Convert dates like "08 Avril 2026" or "31 Mars 2026" into ISO format (YYYY-MM-DD).
        3. If a company name is mentioned (often at the top of a section or page), use it.
        4. If a contact method (email or URL) is provided, include it in the 'url' field (prefix with mailto: for emails).
        5. Clean up job titles (remove numbers in parentheses like "(1)").
        6. For 'type', map it to:
           - "Stage" if it mentions "Stage" or "Stagiaire".
           - "Consultance" if it mentions "Consultant" or "Consultance".
           - "Freelance" if it's a freelance role.
           - "CDI" or "CDD" based on context, default to "CDI" if not specified.
        
        Text Section:
        ${chunk}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Titre du poste" },
                company: { type: Type.STRING, description: "Nom de l'entreprise" },
                location: { type: Type.STRING, description: "Lieu du poste" },
                salary: { type: Type.STRING, description: "Salaire ou 'Non spécifié'" },
                type: { type: Type.STRING, enum: ["CDI", "CDD", "Freelance", "Stage", "Alternance", "Consultance"] },
                description: { type: Type.STRING, description: "Description courte des missions" },
                requirements: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Liste des pré-requis" },
                tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Mots-clés (ex: React, Management, etc.)" },
                expiresAt: { type: Type.STRING, description: "Date d'expiration ISO (YYYY-MM-DD)" },
                url: { type: Type.STRING, description: "Lien de candidature ou email" }
              },
              required: ["title", "company", "location", "type", "description", "requirements", "tags"]
            }
          }
        }
      });

      if (!response.text) return [];
      const parsed = JSON.parse(response.text);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch (e) {
      console.error(`Gemini: Error processing chunk ${index + 1}:`, e);
      return [];
    }
  }));

  const allJobs = results.flat();
  console.log(`Gemini: Extracted a total of ${allJobs.length} jobs from ${chunks.length} chunks.`);
  return allJobs;
};

export const parseSingleJob = async (text: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following text and extract ONE job description. 
    Even if the text contains multiple offers, only extract the first or most prominent one.
    Return a structured job object in JSON format.
    
    Rules:
    1. If a contact method (email or URL) is provided, include it in the 'url' field (prefix with mailto: for emails).
    2. Convert dates like "08 Avril 2026" into ISO format (YYYY-MM-DD).
    3. Map 'type' to: CDI, CDD, Freelance, Stage, Alternance, Consultance.
    
    Text:
    ${text}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          company: { type: Type.STRING },
          location: { type: Type.STRING },
          salary: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["CDI", "CDD", "Freelance", "Stage", "Alternance", "Consultance"] },
          description: { type: Type.STRING },
          requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          expiresAt: { type: Type.STRING, description: "ISO date (YYYY-MM-DD)" },
          url: { type: Type.STRING, description: "Application URL or mailto:email" }
        },
        required: ["title", "company", "location", "type", "description", "requirements", "tags"]
      }
    }
  });

  const parsed = JSON.parse(response.text);
  console.log("Gemini parsed single job:", parsed);
  return parsed;
};

export const parseCV = async (text: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this CV and extract professional data in JSON format.
    Generate a professional summary (3-4 sentences) and identify key skills and tags.
    Provide suggestions for profile improvement.
    
    CV Content:
    ${text}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          experience: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                company: { type: Type.STRING },
                role: { type: Type.STRING },
                period: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          },
          education: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                school: { type: Type.STRING },
                degree: { type: Type.STRING },
                year: { type: Type.STRING }
              }
            }
          },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          completenessScore: { type: Type.NUMBER, description: "0 to 100" },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["fullName", "title", "summary", "skills", "experience", "education", "tags", "completenessScore", "suggestions"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const parseBusinessOpportunity = async (text: string) => {
  console.log("Gemini: Parsing business opportunity. Text length:", text.length);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following text and extract the MAIN business opportunity (Appel d'offres, Partenariat, etc.).
      If multiple opportunities are present, focus on the first one or provide a summary.
      Return a structured JSON object.
      
      Rules:
      1. Map 'type' to: "Appel d'offres", "Partenariat", "Sous-traitance", "Emploi", or "Autre".
      2. Extract the budget if mentioned, otherwise leave empty.
      3. Extract the sector (e.g., BTP, Informatique, Santé, etc.).
      4. Extract the expiration date (expiresAt) in ISO format (YYYY-MM-DD) if mentioned.
      5. Generate 3-5 relevant tags.
      
      Text:
      ${text.substring(0, 30000)}`, // Truncate to avoid context limits
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            company: { type: Type.STRING },
            location: { type: Type.STRING },
            budget: { type: Type.STRING },
            sector: { type: Type.STRING, description: "Secteur d'activité (ex: BTP, IT, etc.)" },
            expiresAt: { type: Type.STRING, description: "Date d'expiration ISO (YYYY-MM-DD)" },
            type: { type: Type.STRING, enum: ["Appel d'offres", "Partenariat", "Sous-traitance", "Emploi", "Autre"] },
            description: { type: Type.STRING },
            requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "company", "location", "type", "description", "requirements", "tags"]
        }
      }
    });

    if (!response.text) {
      throw new Error("L'IA n'a pas pu générer de contenu. Le texte est peut-être trop complexe ou contient des éléments non autorisés.");
    }

    const cleanedText = response.text.trim();
    if (!cleanedText) {
      throw new Error("L'IA a renvoyé une réponse vide.");
    }

    try {
      const parsed = JSON.parse(cleanedText);
      console.log("Gemini: Parsing successful.");
      return parsed;
    } catch (parseError) {
      console.error("Gemini JSON parse error:", parseError, "Raw text:", cleanedText);
      throw new Error("Erreur de formatage des données par l'IA.");
    }
  } catch (error) {
    console.error("Gemini parseBusinessOpportunity error:", error);
    throw new Error("Erreur d'analyse IA : " + (error instanceof Error ? error.message : "Erreur inconnue"));
  }
};

export const parseMultipleOpportunities = async (text: string) => {
  console.log("Gemini: Parsing multiple business opportunities. Total text length:", text.length);
  
  // Split text into chunks of ~12,000 characters to stay within output token limits
  const chunkSize = 12000;
  const chunks: string[] = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    let endPos = currentPos + chunkSize;
    if (endPos < text.length) {
      const searchStart = Math.max(currentPos, endPos - 2000);
      const splitPoint = text.lastIndexOf("\n\n", endPos);
      if (splitPoint > searchStart) {
        endPos = splitPoint;
      }
    }
    chunks.push(text.substring(currentPos, endPos));
    currentPos = endPos;
  }

  console.log(`Gemini: Processing ${chunks.length} chunks for business opportunities...`);

  const results = await Promise.all(chunks.map(async (chunk, index) => {
    console.log(`Gemini: Processing chunk ${index + 1}/${chunks.length} (length: ${chunk.length})...`);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following text and extract ALL distinct business opportunities (Appel d'offres, Partenariat, Marché, etc.) found in THIS SPECIFIC SECTION.
        Return an array of structured JSON objects.
        
        Rules:
        1. If the text is a list of opportunities, extract each one separately.
        2. For each, identify: title, company, location, budget (if any), sector, expiration date (expiresAt), type, a short description, and requirements.
        3. Map 'type' to: "Appel d'offres", "Partenariat", "Sous-traitance", "Emploi", or "Autre".
        
        Text Section:
        ${chunk}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                company: { type: Type.STRING },
                location: { type: Type.STRING },
                budget: { type: Type.STRING },
                sector: { type: Type.STRING, description: "Secteur d'activité" },
                expiresAt: { type: Type.STRING, description: "Date d'expiration ISO (YYYY-MM-DD)" },
                type: { type: Type.STRING, enum: ["Appel d'offres", "Partenariat", "Sous-traitance", "Emploi", "Autre"] },
                description: { type: Type.STRING },
                requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "company", "location", "type", "description", "requirements", "tags"]
            }
          }
        }
      });

      if (!response.text) return [];
      const parsed = JSON.parse(response.text);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch (e) {
      console.error(`Gemini: Error processing chunk ${index + 1}:`, e);
      return [];
    }
  }));

  const allOpportunities = results.flat();
  console.log(`Gemini: Extracted a total of ${allOpportunities.length} opportunities from ${chunks.length} chunks.`);
  return allOpportunities;
};

export const getCareerAdvice = async (messages: { role: "user" | "model"; text: string }[]) => {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `Tu es un coach de carrière expert pour la communauté Sangcoolheur. 
      Ton but est d'aider les membres à trouver un emploi, améliorer leur CV, préparer leurs entretiens et naviguer dans le marché du travail.
      Sois encourageant, professionnel et pragmatique. Utilise le tutoiement pour créer une proximité communautaire si approprié, ou le vouvoiement pour rester formel selon le ton de l'utilisateur.
      Réponds toujours en français.`
    }
  });

  // Since chat.sendMessage only takes a single message, we need to handle history differently if we want to pass it.
  // Actually, the SDK handles history if we use the chat object.
  // For simplicity, we'll just send the last message for now, or we could rebuild the chat if we had the history.
  
  // Rebuilding history for the chat
  const lastMessage = messages[messages.length - 1].text;
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }]
  }));

  // The chat.create doesn't take history directly in the same way as sendMessage.
  // Let's use generateContent for simplicity if we want to pass full history easily.
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: messages.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    })),
    config: {
      systemInstruction: `Tu es un coach de carrière expert pour la communauté Sangcoolheur. 
      Ton but est d'aider les membres à trouver un emploi, améliorer leur CV, préparer leurs entretiens et naviguer dans le marché du travail.
      Sois encourageant, professionnel et pragmatique. Réponds toujours en français.`
    }
  });

  return response.text;
};

export const extractTextFromImage = async (base64Image: string, mimeType: string) => {
  console.log("Gemini: Extracting text from image...");
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Extract all the text from this image. If it's a job offer or business opportunity, extract all details clearly. Return only the extracted text." },
            { inlineData: { data: base64Image, mimeType } }
          ]
        }
      ]
    });

    if (!response.text) {
      throw new Error("L'IA n'a pas pu extraire de texte de l'image.");
    }

    return response.text;
  } catch (error) {
    console.error("Gemini extractTextFromImage error:", error);
    throw new Error("Erreur d'extraction de texte de l'image : " + (error instanceof Error ? error.message : "Erreur inconnue"));
  }
};
