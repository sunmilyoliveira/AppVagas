import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

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
  pipeline_stages?: string[];
  retention_minutes?: number;
};

export type CandidateApplication = {
  id: string;
  job_id: string;
  job_title: string;
  job_company: string;
  stage: string;
  score: number;
  fit_summary: string;
  updated_at?: string;
};

export type RecruiterApplication = Match & {
  id: string;
  candidate_id: string;
  candidate_name: string;
  profile: Profile;
  stage?: string;
  pre_screen_score?: number;
  video_score?: number;
  stage_scores?: Record<string, number>;
  resume_text?: string;
};

export type ApplicationsPayload = {
  job: Job;
  total: number;
  essential_fully_met: number;
  differentiator_fully_met: number;
  applications: RecruiterApplication[];
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  meta?: Record<string, string>;
};

export type ChatMessage = {
  id: string;
  application_id: string;
  sender_id: string;
  sender_role: Role;
  body: string;
  created_at: string;
};

export type ChatContext = {
  application: { id: string; candidate_id: string; candidate_name: string; stage: string };
  job: { id: string; title: string; company: string };
  messages: ChatMessage[];
};

export type Dashboard = {
  totals: { jobs: number; applications: number; reached_final: number; conversion_rate: number };
  stage_totals: Record<string, number>;
  jobs: { job_id: string; title: string; company: string; total: number; avg_score: number; in_final_stage: number }[];
};

export type SecurityStatus = {
  password_policy: string;
  google_enabled: boolean;
  consent?: { privacy_version: string; profile_visibility: string; accepted_at: string };
  recruiter_verification?: Record<string, string>;
};

export type Verification = {
  email_status: string;
  domain_status: string;
  company_name?: string;
  corporate_email?: string;
  domain?: string;
  dns_record?: { type: string; name: string; value: string };
  email_sent?: boolean;
};

export type VideoRoom = { room_id: string; code: string; expires_at: string; recording: false };
export type VideoJoin = { participant_token: string; participant_id: string; room_id: string; expires_at: string };

const extra = Constants.expoConfig?.extra as { EXPO_PUBLIC_BACKEND_URL?: string; EXPO_BACKEND_URL?: string } | undefined;
const backendUrl =
  extra?.EXPO_PUBLIC_BACKEND_URL ??
  extra?.EXPO_BACKEND_URL ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  process.env.EXPO_BACKEND_URL ??
  "";
const API_BASE = `${backendUrl.replace(/\/$/, "")}/api`;
export const BACKEND_URL = backendUrl.replace(/\/$/, "");
const TOKEN_KEY = "vaga_ai_auth_token";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) await storage.secureRemove(TOKEN_KEY);
  if (!response.ok) throw new Error(body.detail || "Não foi possível concluir a solicitação");
  return body as T;
}

export const PASSWORD_POLICY =
  "Mínimo de 10 caracteres, com maiúscula, minúscula, número e caractere especial.";
export const isStrongPassword = (password: string): boolean =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$/.test(password);

export async function authenticate(email: string, password: string, role: Role, create: boolean): Promise<User> {
  const result = await request<{ token: string; user: User }>(create ? "/auth/register" : "/auth/login", {
    method: "POST",
    body: JSON.stringify(create ? { email, password, role } : { email, password }),
  });
  await storage.secureSet(TOKEN_KEY, result.token);
  return result.user;
}

WebBrowser.maybeCompleteAuthSession();
const exchangedSessions = new Set<string>();
const sessionIdFromUrl = (value: string | null): string | null =>
  value?.match(/[?#&]session_id=([^&#]+)/)?.[1] ?? null;

export async function authenticateWithGoogle(): Promise<User> {
  const redirectUrl = Platform.OS === "web" ? `${globalThis.location.origin}/` : Linking.createURL("");
  const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  if (Platform.OS === "web") {
    globalThis.location.href = authUrl;
    throw new Error("Redirecionando para o Google");
  }
  let callbackUrl: string | null = null;
  const listener = Linking.addEventListener("url", ({ url }) => {
    callbackUrl = url;
  });
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
  listener.remove();
  callbackUrl = result.type === "success" && result.url ? result.url : callbackUrl || (await Linking.getInitialURL());
  const sessionId = sessionIdFromUrl(callbackUrl);
  if (!sessionId || exchangedSessions.has(sessionId))
    throw new Error("Não foi possível concluir o retorno do Google");
  exchangedSessions.add(sessionId);
  const response = await request<{ session_token: string; user: User }>("/auth/session", {
    method: "POST",
    body: JSON.stringify({ session_id: decodeURIComponent(sessionId) }),
  });
  await storage.secureSet(TOKEN_KEY, response.session_token);
  return response.user;
}

export async function getMe(): Promise<User> {
  return request<User>("/me");
}
export async function signOut(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}
export async function getJobs(query = ""): Promise<Job[]> {
  return request<Job[]>(`/jobs${query ? `?q=${encodeURIComponent(query)}` : ""}`);
}
export async function getJob(id: string): Promise<Job> {
  return request<Job>(`/jobs/${id}`);
}
export async function saveProfile(profile: Profile): Promise<User> {
  return request<User>("/me/profile", { method: "PUT", body: JSON.stringify(profile) });
}
export async function generateResume(jobId: string): Promise<{ resume: Record<string, unknown> }> {
  return request<{ resume: Record<string, unknown> }>("/ai/resume", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId }),
  });
}
export async function apply(jobId: string, resume: Record<string, unknown>): Promise<{ message: string }> {
  return request(`/jobs/${jobId}/apply`, {
    method: "POST",
    body: JSON.stringify({
      resume_text: JSON.stringify(resume),
      resume_title: String(resume.title || "Currículo personalizado"),
    }),
  });
}
export async function createJob(job: Omit<Job, "id" | "match">): Promise<Job> {
  return request<Job>("/jobs", { method: "POST", body: JSON.stringify(job) });
}
export async function getRecruiterJobs(): Promise<Job[]> {
  return request<Job[]>("/recruiter/jobs");
}
export async function getApplications(jobId: string): Promise<ApplicationsPayload> {
  return request<ApplicationsPayload>(`/jobs/${jobId}/applications`);
}
export async function getCandidateApplications(): Promise<CandidateApplication[]> {
  return request<CandidateApplication[]>("/candidate/applications");
}
export async function getSecurity(): Promise<SecurityStatus> {
  return request<SecurityStatus>("/me/security");
}
export async function saveConsent(visibility: "public" | "matched_only" | "private"): Promise<void> {
  await request("/me/consent", {
    method: "POST",
    body: JSON.stringify({ privacy_version: "2026-08", profile_visibility: visibility }),
  });
}
export async function getAudit(): Promise<Record<string, unknown>[]> {
  return request<Record<string, unknown>[]>("/me/audit");
}
export async function exportData(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/me/export");
}
export async function deleteAccount(): Promise<void> {
  await request("/me", { method: "DELETE" });
  await signOut();
}
export async function startRecruiterVerification(payload: {
  company_name: string;
  corporate_email: string;
  corporate_domain: string;
  phone?: string;
}): Promise<Verification> {
  return request<Verification>("/recruiter/verification/start", {
    method: "POST",
    body: JSON.stringify({ phone: "", ...payload }),
  });
}
export async function getRecruiterVerification(): Promise<Verification> {
  return request<Verification>("/recruiter/verification");
}
export async function verifyDomain(domain: string): Promise<void> {
  await request("/recruiter/verification/domain", { method: "POST", body: JSON.stringify({ domain }) });
}
export async function updateApplicationStage(
  jobId: string,
  applicationId: string,
  stage: string,
  score: number,
  notes = ""
): Promise<void> {
  await request(`/jobs/${jobId}/applications/${applicationId}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage, score, notes }),
  });
}
export async function createVideoRoom(jobId: string, applicationId = "", retentionMinutes = 60): Promise<VideoRoom> {
  return request<VideoRoom>("/video/rooms", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      application_id: applicationId,
      retention_minutes: retentionMinutes,
      max_participants: 4,
    }),
  });
}
export async function joinVideoRoom(roomId: string, code: string): Promise<VideoJoin> {
  return request<VideoJoin>(`/video/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
export async function getNotifications(): Promise<Notification[]> {
  return request<Notification[]>("/notifications");
}
export async function markNotificationsRead(): Promise<void> {
  await request("/notifications/read", { method: "POST" });
}
export async function getChat(applicationId: string): Promise<ChatContext> {
  return request<ChatContext>(`/applications/${applicationId}/messages`);
}
export async function sendChatMessage(applicationId: string, body: string): Promise<ChatMessage> {
  return request<ChatMessage>(`/applications/${applicationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
export async function getDashboard(): Promise<Dashboard> {
  return request<Dashboard>("/recruiter/dashboard");
}
