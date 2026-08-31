import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  apply,
  CandidateApplication,
  generateResume,
  getCandidateApplications,
  getJobs,
  Job,
  Profile,
  saveProfile,
  User,
} from "@/src/api";
import { Button, Chip, EmptyState, ErrorBox, Field, Loading, Section } from "@/src/components";
import { colors } from "@/src/theme";

export function CandidateHome({ onOpenJob }: { onOpenJob: (job: Job) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async (query = "") => {
    setLoading(true);
    setError("");
    try {
      setJobs(await getJobs(query));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>PARA VOCÊ</Text>
      <Text style={styles.pageTitle}>Vagas que combinam{`\n`}com seu momento.</Text>
      <Text style={styles.pageSub}>Use seu perfil para descobrir onde você pode fazer a diferença.</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          testID="candidate-search"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load(search)}
          placeholder="Buscar cargo ou empresa"
          placeholderTextColor="#9999A5"
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>
      {error ? (
        <ErrorBox text={error} onRetry={() => load(search)} />
      ) : loading ? (
        <Loading />
      ) : jobs.length === 0 ? (
        <EmptyState icon="search-outline" title="Ainda não há vagas" text="Tente outra busca ou volte mais tarde." />
      ) : (
        jobs.map((job) => <JobCard key={job.id} job={job} onPress={() => onOpenJob(job)} />)
      )}
    </ScrollView>
  );
}

function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const score = job.match?.score ?? 0;
  return (
    <Pressable
      testID={`job-${job.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.jobCard, pressed && styles.pressed]}
    >
      <View style={styles.jobTop}>
        <View style={styles.companyIcon}>
          <Ionicons name="business-outline" size={22} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{job.title}</Text>
          <Text style={styles.cardText}>{job.company}</Text>
        </View>
        <View style={styles.matchBadge}>
          <Text style={styles.matchNumber}>{score}%</Text>
          <Text style={styles.matchLabel}>match</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Chip icon="location-outline" text={job.location} />
        <Chip icon="time-outline" text={job.modality} />
      </View>
      <Text style={styles.jobDesc} numberOfLines={2}>
        {job.description}
      </Text>
      <View style={styles.openRow}>
        <Text style={styles.openText}>Ver detalhes</Text>
        <Ionicons name="arrow-forward" size={17} color={colors.blue} />
      </View>
    </Pressable>
  );
}

export function JobDetail({ job, onBack }: { job: Job; onBack: () => void }) {
  const [resume, setResume] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const match = job.match;
  const makeResume = async () => {
    setBusy(true);
    try {
      const data = await generateResume(job.id);
      setResume(data.resume);
    } catch (err) {
      Alert.alert("A IA não conseguiu gerar agora", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendApplication = async () => {
    if (!resume) return;
    setBusy(true);
    try {
      await apply(job.id, resume);
      setApplied(true);
      Alert.alert("Candidatura enviada", "Seu currículo personalizado foi encaminhado para o anunciante.");
    } catch (err) {
      Alert.alert("Não foi possível candidatar", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable testID="job-back" onPress={onBack} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
        <Text style={styles.backText}>Voltar às vagas</Text>
      </Pressable>
      <View style={styles.detailHero}>
        <View style={styles.companyIconLarge}>
          <Ionicons name="business-outline" size={30} color={colors.blue} />
        </View>
        <Text style={styles.eyebrow}>{job.company.toUpperCase()}</Text>
        <Text style={styles.detailTitle}>{job.title}</Text>
        <View style={styles.metaRow}>
          <Chip icon="location-outline" text={job.location} />
          <Chip icon="time-outline" text={job.modality} />
        </View>
      </View>
      {match ? (
        <View testID="job-match" style={styles.scorePanel}>
          <View>
            <Text style={styles.miniLabel}>SUA COMPATIBILIDADE</Text>
            <Text style={styles.scoreText}>{match.score}%</Text>
          </View>
          <View style={styles.scoreCopy}>
            <Text style={styles.cardTitle}>
              {match.score >= 70 ? "Ótima combinação" : "Veja como melhorar"}
            </Text>
            <Text style={styles.cardText}>{match.fit_summary}</Text>
          </View>
        </View>
      ) : null}
      <Section title="Sobre a vaga">
        <Text style={styles.body}>{job.description}</Text>
      </Section>
      <Section title="Requisitos imprescindíveis">
        <RequirementList items={job.essential_requirements} />
      </Section>
      {job.differentiators.length > 0 ? (
        <Section title="Diferenciais">
          <RequirementList items={job.differentiators} orange />
        </Section>
      ) : null}
      <Section title="Currículo personalizado">
        <Text style={styles.body}>
          A IA reorganiza suas experiências para destacar o que importa nesta vaga, sem inventar informações.
        </Text>
        {resume ? (
          <View testID="resume-preview" style={styles.resumeBox}>
            <Text style={styles.resumeTitle}>{String(resume.title || "Currículo personalizado")}</Text>
            <Text style={styles.body}>{String(resume.summary || "")}</Text>
            {Array.isArray(resume.skills) ? (
              <Text style={styles.body}>
                <Text style={styles.bold}>Habilidades: </Text>
                {(resume.skills as string[]).join(", ")}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Button
          testID={resume ? "apply-button" : "generate-resume-button"}
          title={resume ? "Candidatar-se com este currículo" : "Criar currículo com IA"}
          onPress={resume ? sendApplication : makeResume}
          loading={busy}
          disabled={applied}
        />
      </Section>
      {applied ? (
        <View testID="application-success" style={styles.success}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={styles.successText}>Você já se candidatou a esta vaga.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function RequirementList({ items, orange = false }: { items: string[]; orange?: boolean }) {
  return (
    <View>
      {items.map((item) => (
        <View key={item} style={styles.requirement}>
          <Ionicons name="checkmark-circle" size={19} color={orange ? colors.orange : colors.green} />
          <Text style={styles.body}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function CandidateProfile({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const profile = user.profile || {};
  const [form, setForm] = useState({
    name: profile.name || "",
    headline: profile.headline || "",
    summary: profile.summary || "",
    location: profile.location || "",
    skills: profile.skills?.join(", ") || "",
    languages: profile.languages?.join(", ") || "",
    experience: profile.experiences?.map((item) => `${item.role || ""} — ${item.detail || ""}`).join("\n") || "",
    education: profile.education?.map((item) => `${item.course || ""} — ${item.school || ""}`).join("\n") || "",
    portfolio: profile.portfolio?.map((item) => item.url || "").join(", ") || "",
    preferences: profile.preferences?.desiredRole || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      const next: Profile = {
        name: form.name,
        headline: form.headline,
        summary: form.summary,
        location: form.location,
        skills: form.skills.split(",").map((item) => item.trim()).filter(Boolean),
        languages: form.languages.split(",").map((item) => item.trim()).filter(Boolean),
        experiences: form.experience
          .split("\n")
          .filter(Boolean)
          .map((item) => {
            const [role, detail] = item.split("—");
            return { role: role?.trim() || item, detail: detail?.trim() || "" };
          }),
        education: form.education
          .split("\n")
          .filter(Boolean)
          .map((item) => {
            const [course, school] = item.split("—");
            return { course: course?.trim() || item, school: school?.trim() || "" };
          }),
        portfolio: form.portfolio
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url) => ({ url })),
        preferences: { desiredRole: form.preferences },
      };
      const updated = await saveProfile(next);
      onSaved(updated);
      Alert.alert("Perfil salvo", "Seu perfil está pronto para melhorar seus matches.");
    } catch (err) {
      Alert.alert("Não foi possível salvar", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>SEU PERFIL</Text>
        <Text style={styles.pageTitle}>Mostre seu melhor{`\n`}trabalho.</Text>
        <Text style={styles.pageSub}>Quanto mais completo o perfil, mais preciso será seu match.</Text>
        <Field testID="profile-name" label="NOME COMPLETO" value={form.name} onChangeText={(v) => set("name", v)} placeholder="Seu nome" />
        <Field testID="profile-headline" label="TÍTULO PROFISSIONAL" value={form.headline} onChangeText={(v) => set("headline", v)} placeholder="Ex.: Product Designer" />
        <Field testID="profile-location" label="LOCALIZAÇÃO" value={form.location} onChangeText={(v) => set("location", v)} placeholder="Cidade, estado" />
        <Field testID="profile-summary" label="RESUMO PROFISSIONAL" value={form.summary} onChangeText={(v) => set("summary", v)} placeholder="Conte brevemente sua experiência" multiline />
        <Field testID="profile-skills" label="HABILIDADES" value={form.skills} onChangeText={(v) => set("skills", v)} placeholder="Separe por vírgulas" />
        <Field testID="profile-languages" label="IDIOMAS" value={form.languages} onChangeText={(v) => set("languages", v)} placeholder="Ex.: Português, Inglês" />
        <Field testID="profile-experience" label="EXPERIÊNCIAS" value={form.experience} onChangeText={(v) => set("experience", v)} placeholder="Uma por linha: cargo — descrição" multiline />
        <Field testID="profile-education" label="FORMAÇÃO" value={form.education} onChangeText={(v) => set("education", v)} placeholder="Uma por linha: curso — instituição" multiline />
        <Field testID="profile-portfolio" label="PORTFÓLIO" value={form.portfolio} onChangeText={(v) => set("portfolio", v)} placeholder="Links separados por vírgula" />
        <Field testID="profile-preferences" label="CARGO DESEJADO" value={form.preferences} onChangeText={(v) => set("preferences", v)} placeholder="Ex.: Designer de produto" />
        <Button testID="profile-save" title="Salvar perfil" onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function CandidateApplications({ onOpenChat }: { onOpenChat: (applicationId: string, title: string) => void }) {
  const [items, setItems] = useState<CandidateApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getCandidateApplications()
      .then(setItems)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>MINHAS CANDIDATURAS</Text>
      <Text style={styles.pageTitle}>Acompanhe cada{`\n`}processo.</Text>
      <Text style={styles.pageSub}>Veja em qual etapa você está e converse com o recrutador.</Text>
      {error ? (
        <ErrorBox text={error} />
      ) : loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="paper-plane-outline" title="Nenhuma candidatura" text="Ao se candidatar, seus processos aparecem aqui." />
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            testID={`my-application-${item.id}`}
            onPress={() => onOpenChat(item.id, `${item.job_title} · ${item.job_company}`)}
            style={({ pressed }) => [styles.jobCard, pressed && styles.pressed]}
          >
            <View style={styles.jobTop}>
              <View style={styles.companyIcon}>
                <Ionicons name="briefcase-outline" size={22} color={colors.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.job_title}</Text>
                <Text style={styles.cardText}>{item.job_company}</Text>
              </View>
              <View style={styles.matchBadge}>
                <Text style={styles.matchNumber}>{item.score}%</Text>
                <Text style={styles.matchLabel}>match</Text>
              </View>
            </View>
            <Text style={styles.stageBadge}>Etapa: {item.stage}</Text>
            <Text style={styles.openText}>Abrir chat</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 40 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: colors.blue, fontWeight: "600", marginBottom: 10 },
  pageTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "500", letterSpacing: -0.5 },
  pageSub: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  search: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  searchInput: { flex: 1, marginLeft: 10, color: colors.ink, fontSize: 15 },
  jobCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 17,
    marginBottom: 14,
  },
  jobTop: { flexDirection: "row", alignItems: "center" },
  companyIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  companyIconLarge: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  matchBadge: {
    minWidth: 55,
    borderRadius: 12,
    backgroundColor: "#EAF5EA",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  matchNumber: { color: colors.green, fontSize: 16, fontWeight: "600" },
  matchLabel: { color: colors.green, fontSize: 10, marginTop: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  jobDesc: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 13 },
  openRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  openText: { color: colors.blue, fontSize: 13, fontWeight: "600", marginTop: 8 },
  pressed: { opacity: 0.72 },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { color: colors.ink, fontSize: 15 },
  detailHero: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 20,
    marginTop: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  detailTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "500", marginBottom: 4 },
  scorePanel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.pale,
    borderRadius: 18,
    padding: 17,
    marginBottom: 6,
  },
  scoreText: { color: colors.blue, fontSize: 30, fontWeight: "500", marginTop: 2 },
  scoreCopy: { flex: 1, marginLeft: 18 },
  miniLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 5,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  requirement: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 10 },
  resumeBox: { backgroundColor: colors.bg, borderRadius: 13, padding: 13, marginTop: 14, gap: 6 },
  resumeTitle: { fontSize: 16, fontWeight: "600", color: colors.ink, marginBottom: 8 },
  bold: { fontWeight: "600", color: colors.ink },
  success: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EAF5EA",
    padding: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  successText: { color: colors.green, fontSize: 14 },
  stageBadge: { marginTop: 10, color: colors.blue, fontSize: 13, fontWeight: "600" },
});
