import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  deleteAccount,
  exportData,
  getAudit,
  getNotifications,
  getRecruiterVerification,
  getSecurity,
  markNotificationsRead,
  Notification,
  saveConsent,
  SecurityStatus,
  startRecruiterVerification,
  User,
  Verification,
  verifyDomain,
} from "@/src/api";
import { Button, EmptyState, ErrorBox, Field, Loading, Section } from "@/src/components";
import { colors } from "@/src/theme";

export function NotificationsScreen({ onOpen }: { onOpen: (n: Notification) => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    getNotifications()
      .then(setItems)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const markAll = async () => {
    await markNotificationsRead();
    load();
  };
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>NOTIFICAÇÕES</Text>
          <Text style={styles.pageTitle}>O que aconteceu.</Text>
        </View>
        <Pressable testID="notifications-mark-read" onPress={markAll} style={styles.markRead}>
          <Text style={styles.markReadText}>Marcar lidas</Text>
        </Pressable>
      </View>
      {error ? (
        <ErrorBox text={error} onRetry={load} />
      ) : loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-outline" title="Nada por aqui" text="Você será avisado quando algo acontecer." />
      ) : (
        items.map((item) => (
          <Pressable
            testID={`notification-${item.id}`}
            key={item.id}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.notifCard, !item.read && styles.notifUnread, pressed && styles.pressed]}
          >
            <View style={styles.notifIcon}>
              <Ionicons name={iconFor(item.kind)} size={20} color={colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifBody}>{item.body}</Text>
              <Text style={styles.notifTime}>{formatDate(item.created_at)}</Text>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function iconFor(kind: string): keyof typeof Ionicons.glyphMap {
  if (kind === "application") return "person-add-outline";
  if (kind === "stage") return "trending-up-outline";
  if (kind === "video") return "videocam-outline";
  if (kind === "message") return "chatbubbles-outline";
  return "notifications-outline";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PrivacyScreen({ user, onDeleted }: { user: User; onDeleted: () => void }) {
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [visibility, setVisibility] = useState<"public" | "matched_only" | "private">("matched_only");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    getSecurity()
      .then((data) => {
        setSecurity(data);
        if (data.consent?.profile_visibility)
          setVisibility(data.consent.profile_visibility as "public" | "matched_only" | "private");
      })
      .catch(() => null);
    getAudit()
      .then(setAudit)
      .catch(() => null);
  }, []);
  const saveConsentAndReload = async (next: "public" | "matched_only" | "private") => {
    setVisibility(next);
    try {
      await saveConsent(next);
    } catch (err) {
      Alert.alert("Não foi possível salvar", (err as Error).message);
    }
  };
  const exportPersonalData = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      Alert.alert("Exportação pronta", `Recebemos ${Object.keys(data).length} conjuntos de dados. Peça o arquivo completo por chat.`);
    } catch (err) {
      Alert.alert("Erro na exportação", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirmDelete = () => {
    Alert.alert("Apagar conta e dados", "Esta ação é irreversível. Confirma?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteAccount();
            onDeleted();
          } catch (err) {
            Alert.alert("Falha ao apagar", (err as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>PRIVACIDADE E DADOS</Text>
      <Text style={styles.pageTitle}>Você no controle.</Text>
      <Text style={styles.pageSub}>
        LGPD por padrão: escolha a visibilidade do seu perfil, exporte ou apague seus dados quando quiser.
      </Text>
      <Section title="Visibilidade do perfil">
        {(["public", "matched_only", "private"] as const).map((option) => (
          <Pressable
            testID={`visibility-${option}`}
            key={option}
            onPress={() => saveConsentAndReload(option)}
            style={[styles.visibilityRow, visibility === option && styles.visibilityActive]}
          >
            <Ionicons
              name={visibility === option ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={colors.blue}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{labelFor(option)}</Text>
              <Text style={styles.cardText}>{descriptionFor(option)}</Text>
            </View>
          </Pressable>
        ))}
      </Section>
      <Section title="Seus dados">
        <Text style={styles.body}>
          Nome, e-mail, perfil, candidaturas, mensagens e histórico de eventos ficam sob seu controle. Peça exportação
          para receber uma cópia estruturada.
        </Text>
        <Button testID="export-data" title="Exportar meus dados" onPress={exportPersonalData} loading={busy} variant="ghost" />
        <Button testID="delete-account" title="Apagar minha conta" onPress={confirmDelete} loading={busy} variant="danger" />
      </Section>
      <Section title="Registros de auditoria">
        {audit.length === 0 ? (
          <Text style={styles.body}>Ainda não há eventos registrados nesta conta.</Text>
        ) : (
          audit.slice(0, 8).map((entry) => (
            <View key={String(entry.id)} style={styles.auditRow}>
              <Text style={styles.auditAction}>{String(entry.action)}</Text>
              <Text style={styles.auditTime}>{formatDate(String(entry.created_at))}</Text>
            </View>
          ))
        )}
      </Section>
      {security ? <Text style={styles.policyHint}>{security.password_policy}</Text> : null}
      <Text style={styles.policyHint}>Usuário: {user.email}</Text>
    </ScrollView>
  );
}

function labelFor(option: string): string {
  if (option === "public") return "Público";
  if (option === "matched_only") return "Somente com match";
  return "Privado";
}
function descriptionFor(option: string): string {
  if (option === "public") return "Todo recrutador pode ver seu perfil profissional.";
  if (option === "matched_only") return "Somente recrutadores das vagas em que você aplicou.";
  return "Apenas você acessa seus dados profissionais.";
}

export function RecruiterVerificationScreen() {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [form, setForm] = useState({ company_name: "", corporate_email: "", corporate_domain: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    getRecruiterVerification()
      .then(setVerification)
      .catch(() => null);
  }, []);
  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const response = await startRecruiterVerification(form);
      setVerification(response);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const validateDomain = async () => {
    if (!verification?.domain) return;
    setBusy(true);
    try {
      await verifyDomain(verification.domain);
      setVerification(await getRecruiterVerification());
    } catch (err) {
      Alert.alert("Não foi validado", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>VERIFICAÇÃO CORPORATIVA</Text>
      <Text style={styles.pageTitle}>Prove que sua vaga{`\n`}é real.</Text>
      <Text style={styles.pageSub}>
        Verificamos e-mail corporativo e domínio para reduzir vagas fraudulentas e proteger candidatos.
      </Text>
      {error ? <ErrorBox text={error} /> : null}
      <Section title="Dados corporativos">
        <Field
          testID="verify-company"
          label="EMPRESA"
          value={form.company_name}
          onChangeText={(v) => setForm({ ...form, company_name: v })}
          placeholder="Nome da empresa"
        />
        <Field
          testID="verify-email"
          label="E-MAIL CORPORATIVO"
          value={form.corporate_email}
          onChangeText={(v) => setForm({ ...form, corporate_email: v })}
          placeholder="voce@empresa.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          testID="verify-domain"
          label="DOMÍNIO CORPORATIVO"
          value={form.corporate_domain}
          onChangeText={(v) => setForm({ ...form, corporate_domain: v })}
          placeholder="empresa.com"
          autoCapitalize="none"
        />
        <Button testID="verify-start" title="Iniciar verificação" onPress={start} loading={busy} />
      </Section>
      {verification && verification.email_status !== "not_started" ? (
        <Section title="Status">
          <StatusRow label="E-mail corporativo" value={verification.email_status} />
          <StatusRow label="Domínio" value={verification.domain_status} />
          {verification.dns_record ? (
            <View style={styles.dnsBox}>
              <Text style={styles.miniLabel}>REGISTRO TXT — adicione ao seu DNS</Text>
              <Text style={styles.mono}>Nome: {verification.dns_record.name}</Text>
              <Text style={styles.mono}>Valor: {verification.dns_record.value}</Text>
              <Button
                testID="verify-domain-check"
                title="Já publiquei o TXT — verificar"
                onPress={validateDomain}
                loading={busy}
                variant="ghost"
              />
            </View>
          ) : null}
          {verification.email_sent === false ? (
            <Text style={styles.warn}>Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.</Text>
          ) : null}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const color = value === "verified" ? colors.green : value === "pending" ? colors.amber : colors.muted;
  return (
    <View style={styles.statusRow}>
      <Text style={styles.body}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>{translateStatus(value)}</Text>
    </View>
  );
}
function translateStatus(value: string): string {
  if (value === "verified") return "Verificado";
  if (value === "pending") return "Pendente";
  if (value === "not_started") return "Não iniciado";
  return value;
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 40 },
  headRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: colors.blue, fontWeight: "600", marginBottom: 10 },
  pageTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "500", letterSpacing: -0.5 },
  pageSub: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  markRead: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.pale,
  },
  markReadText: { color: colors.blue, fontSize: 12, fontWeight: "600" },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
  },
  notifUnread: { backgroundColor: "#F5FAF7", borderColor: colors.pale },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  notifTitle: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  notifBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  notifTime: { color: colors.muted, fontSize: 11, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue, marginTop: 6 },
  pressed: { opacity: 0.7 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "500" },
  cardText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  visibilityActive: {},
  auditRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  auditAction: { color: colors.ink, fontSize: 13 },
  auditTime: { color: colors.muted, fontSize: 12 },
  policyHint: { color: colors.muted, fontSize: 11, marginTop: 12 },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  statusValue: { fontWeight: "600", fontSize: 13 },
  dnsBox: { marginTop: 14, backgroundColor: colors.bg, borderRadius: 12, padding: 12 },
  mono: { fontFamily: "Menlo, monospace", color: colors.ink, fontSize: 12, marginTop: 4 },
  miniLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "600",
    marginBottom: 5,
  },
  warn: { color: colors.amber, marginTop: 10, fontSize: 13 },
});
