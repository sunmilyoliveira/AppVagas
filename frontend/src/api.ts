import Constants from "expo-constants";

import { storage } from "@/src/utils/storage";

export type Role = "candidate" | "recruiter";

export type Profile = {
  name?: string;
  headline?: string;
  summary?: string;
  phone?: string;
  location?: string;
  experiences?: Record<string, string>[];
  education?: Record<string, string>[];
  skills?: string[];
  languages?: string[];
  portfolio?: Record<string, string>[];
  preferences?: Record<string, string>;
};

export type User = { id: string; email: string; role: Role; profile: Profile };

export type Match = {
  score: number;
  essential_score: number;
  differentiator_score: number;
  essential_met: string[];
  essential_missing: string[];
  differentiators_met: string[];
  differentiators_missing: string[];
  advantages: string[];
  disadvantages: string[];
  fit_summary: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  modality: string;
  description: string;
  essential_requirements: string[];
  differentiators: string[];
  match?: Match;
};

const extra = Constants.expoConfig?.extra as { EXPO_PUBLIC_BACKEND_URL?: string; EXPO_BACKEND_URL?: string } | undefined;
const backendUrl = extra?.EXPO_PUBLIC_BACKEND_URL ?? extra?.EXPO_BACKEND_URL ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? process.env.EXPO_BACKEND_URL ?? "";
const API_BASE = `${backendUrl.replace(/\/$/, "")}/api`;
const TOKEN_KEY = "vaga_ai_auth_token";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Não foi possível concluir a solicitação");
  return body as T;
}

export async function authenticate(email: string, password: string, role: Role, create: boolean): Promise<User> {
  const result = await request<{ token: string; user: User }>(create ? "/auth/register" : "/auth/login", {
    method: "POST",
    body: JSON.stringify(create ? { email, password, role } : { email, password }),
  });
  await storage.secureSet(TOKEN_KEY, result.token);
  return result.user;
}

export async function getMe(): Promise<User> { return request<User>("/me"); }
export async function signOut(): Promise<void> { await storage.secureRemove(TOKEN_KEY); }
export async function getJobs(query = ""): Promise<Job[]> { return request<Job[]>(`/jobs${query ? `?q=${encodeURIComponent(query)}` : ""}`); }
export async function getJob(id: string): Promise<Job> { return request<Job>(`/jobs/${id}`); }
export async function saveProfile(profile: Profile): Promise<User> { return request<User>("/me/profile", { method: "PUT", body: JSON.stringify(profile) }); }
export async function generateResume(jobId: string): Promise<{ resume: Record<string, unknown> }> { return request<{ resume: Record<string, unknown> }>("/ai/resume", { method: "POST", body: JSON.stringify({ job_id: jobId }) }); }
export async function apply(jobId: string, resume: Record<string, unknown>): Promise<{ message: string }> { return request<{ message: string }>(`/jobs/${jobId}/apply`, { method: "POST", body: JSON.stringify({ resume_text: JSON.stringify(resume), resume_title: String(resume.title || "Currículo personalizado") }) }); }
export async function createJob(job: Omit<Job, "id" | "match">): Promise<Job> { return request<Job>("/jobs", { method: "POST", body: JSON.stringify(job) }); }
export async function getRecruiterJobs(): Promise<Job[]> { return request<Job[]>("/recruiter/jobs"); }
export async function getApplications(jobId: string): Promise<{ total: number; essential_fully_met: number; differentiator_fully_met: number; applications: (Match & { candidate_name: string; profile: Profile })[] }> { return request(`/jobs/${jobId}/applications`); }