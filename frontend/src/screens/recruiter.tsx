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
  ApplicationsPayload,
  createJob,
  getApplications,
  getDashboard,
  getRecruiterJobs,
  Job,
  RecruiterApplication,
  Dashboard,
  updateApplicationStage,
} from "@/src/api";
import { Button, Chip, EmptyState, ErrorBox, Field, Loading, Section, Stat } from "@/src/components";
import { colors } from "@/src/theme";

export function RecruiterHome({
  onCreate,
  onApplications,
}: {
  onCreate: () => void;
  onApplications: (job: Job) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getRecruiterJobs()
      .then(setJobs)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>PAINEL DO ANUNCIANTE</Text>
      <Text style={styles.pageTitle}>Encontre quem{`\n`}faz acontecer.</Text>
      <Text style={styles.pageSub}>Publique oportunidades e veja os talentos em ordem de compatibilidade.</Text>
      <Pressable
        testID="recruiter-create"
        onPress={onCreate}
        style={({ pressed }) => [styles.createBanner, pressed && styles.pressed]}
      >
        <View style={styles.createIcon}>
          <Ionicons name="add" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.createTitle}>Criar nova vaga</Text>
          <Text style={styles.createText}>Descreva os requisitos e diferenciais</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </Pressable>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Suas vagas</Text>
        <Text style={styles.count}>{jobs.length} publicadas</Text>
      </View>
      {error ? (
        <ErrorBox text={error} />
      ) : loading ? (
        <Loading />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="Sua primeira vaga começa aqui"
          text="Publique uma oportunidade para receber candidatos compatíveis."
        />
      ) : (
        jobs.map((job) => (
          <Pressable
            testID={`recruiter-job-${job.id}`}
            key={job.id}
            onPress={() => onApplications(job)}
            style={({ pressed }) => [styles.jobCard, pressed && styles.pressed]}
          >
            <View style={styles.jobTop}>
              <View style={styles.companyIcon}>
                <Ionicons name="briefcase-outline" size={22} color={colors.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{job.title}</Text>
                <Text style={styles.cardText}>
                  {job.company} · {job.modality}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </View>
            <Text style={styles.openText}>Ver candidatos e análise de compatibilidade</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

export function JobCreation({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "",
    modality: "Remoto",
    description: "",
    essential: "",
    differentiators: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!form.title || !form.company || !form.description || !form.essential) {
      Alert.alert(
        "Complete os campos essenciais",
        "Título, empresa, descrição e requisitos imprescindíveis são obrigatórios."
      );
      return;
    }
    setBusy(true);
    try {
      await createJob({
        title: form.title,
        company: form.company,
        location: form.location || "Remoto",
        modality: form.modality,
        description: form.description,
        essential_requirements: form.essential.split("\n").filter(Boolean),
        differentiators: form.differentiators.split("\n").filter(Boolean),
      });
      Alert.alert("Vaga publicada", "Sua oportunidade já pode receber candidaturas.");
      onCreated();
    } catch (err) {
      Alert.alert("Não foi possível publicar", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>NOVA OPORTUNIDADE</Text>
        <Text style={styles.pageTitle}>Conte a história{`\n`}desta vaga.</Text>
        <Text style={styles.pageSub}>Requisitos claros ajudam a IA a encontrar os candidatos certos.</Text>
        <Field testID="job-title" label="CARGO" value={form.title} onChangeText={(v) => set("title", v)} placeholder="Ex.: Engenheiro(a) de software" />
        <Field testID="job-company" label="EMPRESA" value={form.company} onChangeText={(v) => set("company", v)} placeholder="Nome da empresa" />
        <Field testID="job-location" label="LOCALIZAÇÃO" value={form.location} onChangeText={(v) => set("location", v)} placeholder="Cidade ou Remoto" />
        <Text style={styles.label}>MODALIDADE</Text>
        <View style={styles.optionRow}>
          {["Remoto", "Híbrido", "Presencial"].map((item) => (
            <Pressable
              testID={`modality-${item.toLowerCase()}`}
              key={item}
              onPress={() => set("modality", item)}
              style={[styles.option, form.modality === item && styles.optionActive]}
            >
              <Text style={[styles.optionText, form.modality === item && styles.optionTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          testID="job-description"
          label="DESCRIÇÃO DA VAGA"
          value={form.description}
          onChangeText={(v) => set("description", v)}
          placeholder="O que essa pessoa fará no dia a dia?"
          multiline
        />
        <Field
          testID="job-essential"
          label="REQUISITOS IMPRESCINDÍVEIS"
          value={form.essential}
          onChangeText={(v) => set("essential", v)}
          placeholder="Um requisito por linha"
          multiline
        />
        <Field
          testID="job-differentiators"
          label="DIFERENCIAIS"
          value={form.differentiators}
          onChangeText={(v) => set("differentiators", v)}
          placeholder="Um diferencial por linha"
          multiline
        />
        <Button testID="job-publish" title="Publicar vaga" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Applications({
  job,
  onCreateRoom,
  onOpenChat,
}: {
  job: Job;
  onCreateRoom: (applicationId: string) => void;
  onOpenChat: (applicationId: string, title: string) => void;
}) {
  const [data, setData] = useState<ApplicationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getApplications(job.id)
      .then(setData)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [job.id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>PIPELINE SELETIVO</Text>
      <Text style={styles.pageTitle}>{job.title}</Text>
      <Text style={styles.pageSub}>{job.company} · etapas e indicadores editáveis por candidato.</Text>
      {data ? (
        <>
          <View style={styles.statsRow}>
            <Stat value={String(data.total)} label="candidatos" />
            <Stat value={String(data.essential_fully_met)} label="essenciais completos" />
            <Stat value={String(data.differentiator_fully_met)} label="com diferenciais" />
          </View>
          {data.applications.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Aguardando candidatos"
              text="Quando alguém se candidatar, a análise aparecerá aqui."
            />
          ) : (
            data.applications.map((candidate, index) => (
              <CandidateCard
                key={candidate.id}
                jobId={job.id}
                candidate={candidate}
                position={index + 1}
                stages={
                  job.pipeline_stages || [
                    "Pré-triagem",
                    "Análise de currículo",
                    "Entrevista",
                    "Videochamada",
                    "Avaliação",
                    "Decisão final",
                  ]
                }
                onCreateRoom={() => onCreateRoom(candidate.id)}
                onOpenChat={() => onOpenChat(candidate.id, `${candidate.candidate_name} · ${job.title}`)}
              />
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function CandidateCard({
  jobId,
  candidate,
  position,
  stages,
  onCreateRoom,
  onOpenChat,
}: {
  jobId: string;
  candidate: RecruiterApplication;
  position: number;
  stages: string[];
  onCreateRoom: () => void;
  onOpenChat: () => void;
}) {
  const [stage, setStage] = useState(candidate.stage || stages[0]);
  const [score, setScore] = useState(
    String(
      candidate.stage === "Videochamada"
        ? candidate.video_score ?? candidate.score
        : candidate.pre_screen_score ?? candidate.score
    )
  );
  const saveStage = async (nextStage: string) => {
    setStage(nextStage);
    try {
      await updateApplicationStage(jobId, candidate.id, nextStage, Number(score) || 0);
    } catch {
      // silent — refreshed by parent
    }
  };
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{candidate.candidate_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {position}. {candidate.candidate_name}
          </Text>
          <Text style={styles.cardText}>{candidate.profile?.headline || "Perfil profissional"}</Text>
        </View>
        <View style={styles.matchBadge}>
          <Text style={styles.matchNumber}>{candidate.score}%</Text>
          <Text style={styles.matchLabel}>match</Text>
        </View>
      </View>
      <Text style={styles.cardText}>{candidate.fit_summary}</Text>
      {candidate.advantages.length > 0 ? (
        <>
          <Text style={styles.miniLabel}>DIFERENCIAIS ATENDIDOS</Text>
          {candidate.advantages.map((item) => (
            <Text key={item} style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </>
      ) : null}
      {candidate.disadvantages.length > 0 ? (
        <>
          <Text style={styles.miniLabel}>PONTOS DE ATENÇÃO</Text>
          {candidate.disadvantages.map((item) => (
            <Text key={item} style={styles.bulletMuted}>
              • {item}
            </Text>
          ))}
        </>
      ) : null}
      <Text style={styles.miniLabel}>ETAPA ATUAL</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRow}>
        {stages.map((item) => (
          <Pressable
            testID={`stage-${candidate.id}-${item}`}
            key={item}
            onPress={() => saveStage(item)}
            style={[styles.stageChip, stage === item && styles.stageChipActive]}
          >
            <Text style={[styles.stageText, stage === item && styles.stageTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.scoreEditRow}>
        <Text style={styles.breakdownText}>Indicador da etapa (%)</Text>
        <TextInput
          testID={`score-${candidate.id}`}
          value={score}
          onChangeText={setScore}
          onEndEditing={() => saveStage(stage)}
          keyboardType="number-pad"
          style={styles.scoreInput}
        />
      </View>
      <View style={styles.actions}>
        <Pressable testID={`video-${candidate.id}`} onPress={onCreateRoom} style={styles.videoButton}>
          <Ionicons name="videocam-outline" size={17} color="#fff" />
          <Text style={styles.videoButtonText}>Criar sala</Text>
        </Pressable>
        <Pressable testID={`chat-${candidate.id}`} onPress={onOpenChat} style={styles.chatButton}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.blue} />
          <Text style={styles.chatButtonText}>Chat</Text>
        </Pressable>
      </View>
      <View style={styles.matchBreakdown}>
        <Text style={styles.breakdownText}>Essenciais {candidate.essential_score}%</Text>
        <Text style={styles.breakdownText}>Diferenciais {candidate.differentiator_score}%</Text>
      </View>
    </View>
  );
}

export function RecruiterDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;
  if (!data) return null;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>DASHBOARD</Text>
      <Text style={styles.pageTitle}>Sua operação{`\n`}em números.</Text>
      <Text style={styles.pageSub}>Métricas do funil, conversão e desempenho por vaga.</Text>
      <View style={styles.statsRow}>
        <Stat value={String(data.totals.jobs)} label="vagas ativas" />
        <Stat value={String(data.totals.applications)} label="candidatos" />
        <Stat value={`${data.totals.conversion_rate}%`} label="chegam à decisão final" />
      </View>
      <Section title="Etapas do funil">
        {Object.keys(data.stage_totals).length === 0 ? (
          <Text style={styles.body}>Assim que houver candidaturas, o funil aparece aqui.</Text>
        ) : (
          Object.entries(data.stage_totals).map(([stage, count]) => (
            <View key={stage} style={styles.funnelRow}>
              <Text style={styles.funnelStage}>{stage}</Text>
              <View style={styles.funnelBarWrap}>
                <View
                  style={[
                    styles.funnelBarFill,
                    { width: `${Math.min(100, (count / Math.max(1, data.totals.applications)) * 100)}%` },
                  ]}
                />
              </View>
              <Text testID={`funnel-${stage}`} style={styles.funnelValue}>{count}</Text>
            </View>
          ))
        )}
      </Section>
      <Section title="Desempenho por vaga">
        {data.jobs.length === 0 ? (
          <Text style={styles.body}>Você ainda não tem vagas publicadas.</Text>
        ) : (
          data.jobs.map((job) => (
            <View key={job.job_id} style={styles.jobBreakdownRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{job.title}</Text>
                <Text style={styles.cardText}>{job.company}</Text>
              </View>
              <View style={styles.jobBreakdownStats}>
                <Text style={styles.jobBreakdownNumber}>{job.total}</Text>
                <Text style={styles.breakdownText}>candidatos</Text>
                <Text style={styles.breakdownText}>avg {job.avg_score}%</Text>
              </View>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 40 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: colors.blue, fontWeight: "600", marginBottom: 10 },
  pageTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "500", letterSpacing: -0.5 },
  pageSub: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
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
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  openText: { color: colors.blue, fontSize: 13, fontWeight: "600", marginTop: 10 },
  pressed: { opacity: 0.72 },
  createBanner: {
    backgroundColor: colors.blue,
    borderRadius: 18,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 26,
  },
  createIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  createTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  createText: { color: "#E6ECFF", fontSize: 13, marginTop: 4 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "500" },
  count: { color: colors.muted, fontSize: 13 },
  label: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
    marginTop: 18,
  },
  optionRow: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  optionActive: { backgroundColor: colors.pale, borderColor: colors.blue },
  optionText: { color: colors.muted, fontSize: 13 },
  optionTextActive: { color: colors.blue, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 9, marginVertical: 8 },
  candidateCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginTop: 13,
  },
  candidateHead: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  avatarText: { color: colors.blue, fontSize: 18, fontWeight: "600" },
  miniLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 5,
  },
  bullet: { color: colors.green, fontSize: 13, lineHeight: 20 },
  bulletMuted: { color: colors.orange, fontSize: 13, lineHeight: 20 },
  stageRow: { gap: 8, paddingHorizontal: 2, paddingVertical: 4 },
  stageChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  stageChipActive: { backgroundColor: colors.pale, borderColor: colors.blue },
  stageText: { color: colors.muted, fontSize: 12 },
  stageTextActive: { color: colors.blue, fontWeight: "600" },
  scoreEditRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 10,
    justifyContent: "space-between",
  },
  scoreInput: {
    width: 76,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    textAlign: "center",
    color: colors.ink,
    backgroundColor: colors.card,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  videoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.blue,
  },
  videoButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  chatButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.pale,
  },
  chatButtonText: { color: colors.blue, fontWeight: "600", fontSize: 13 },
  matchBreakdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 13,
    paddingTop: 11,
  },
  breakdownText: { color: colors.muted, fontSize: 12 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  funnelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  funnelStage: { width: 130, color: colors.ink, fontSize: 13 },
  funnelBarWrap: { flex: 1, height: 10, borderRadius: 6, backgroundColor: colors.bg, overflow: "hidden" },
  funnelBarFill: { height: 10, backgroundColor: colors.blue },
  funnelValue: { width: 30, textAlign: "right", color: colors.muted, fontSize: 13 },
  jobBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 10,
  },
  jobBreakdownStats: { alignItems: "flex-end" },
  jobBreakdownNumber: { color: colors.blue, fontSize: 20, fontWeight: "600" },
});
