/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Role = 'PENDING' | 'USER' | 'TECH' | 'ADMIN' | 'INACTIVE';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'FINISHED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  secretariat: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  secretariat: string;
  created_by: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  ai_suggestion?: string;
}

export interface TicketInteraction {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  ticket_id?: string;
  user_id: string;
  action: string;
  previous_state?: any;
  new_state?: any;
  created_at: string;
}

// AI Service Logic
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeTicketWithAI(title: string, description: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise este chamado de suporte técnico da prefeitura e retorne um JSON com a categoria sugerida (Hardware, Software, Rede, Telefonia ou Outros), a prioridade (LOW, MEDIUM, HIGH) e uma breve sugestão técnica inicial.
      Título: ${title}
      Descrição: ${description}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            priority: { type: Type.STRING },
            suggestion: { type: Type.STRING }
          },
          required: ["category", "priority", "suggestion"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return null;
  }
}
