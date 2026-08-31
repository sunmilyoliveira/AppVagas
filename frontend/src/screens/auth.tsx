import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  authenticate,
  authenticateWithGoogle,
  isStrongPassword,
  PASSWORD_POLICY,
  Role,
  User,
} from "@/src/api";
import { Button, ErrorBox, Field } from "@/src/components";
import { colors } from "@/src/theme";

export function RoleSelection({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <LinearGradient colors={["#10111B", "#1F51FF", "#F9F9FB"]} style={styles.roleRoot}>
      <View style={styles.roleHero}>
        <View style={styles.heroIcon}>
          <Ionicons name="sparkles" size={30} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>Encontre a próxima{`\n`}grande oportunidade.</Text>
        <Text style={styles.heroSub}>Compatibilidade inteligente para decisões de carreira mais humanas.</Text>
      </View>
      <View style={styles.roleSheet}>
        <Text style={styles.eyebrow}>COMECE POR AQUI</Text>
        <Text style={styles.sheetTitle}>Como você vai usar?</Text>
        <RoleCard
          testID="role-candidate"
          icon="person-outline"
          title="Sou candidato"
          description="Encontre vagas e crie currículos sob medida."
          onPress={() => onSelect("candidate")}
        />
        <RoleCard
          testID="role-recruiter"
          icon="briefcase-outline"
          title="Sou anunciante"
          description="Publique uma vaga e encontre talentos compatíveis."
          onPress={() => onSelect("recruiter")}
        />
      </View>
    </LinearGradient>
  );
}

function RoleCard({
  testID,
  icon,
  title,
  description,
  onPress,
}: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.roleCard, pressed && styles.pressed]}>
      <View style={styles.roleIcon}>
        <Ionicons name={icon} size={24} color={colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardText}>{description}</Text>
      </View>
      <Ionicons name="arrow-forward" size={20} color={colors.blue} />
    </Pressable>
  );
}

export function AuthScreen({
  role,
  onBack,
  onAuthenticated,
}: {
  role: Role;
  onBack: () => void;
  onAuthenticated: (user: User) => void;
}) {
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    Keyboard.dismiss();
    setError("");
    if (!email || (create ? !isStrongPassword(password) : password.length < 1)) {
      setError(create ? PASSWORD_POLICY : "Informe seu e-mail e senha.");
      return;
    }
    setBusy(true);
    try {
      onAuthenticated(await authenticate(email, password, role, create));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const google = async () => {
    setError("");
    setBusy(true);
    try {
      onAuthenticated(await authenticateWithGoogle());
    } catch (err) {
      const message = (err as Error).message;
      if (!message.includes("Redirecionando")) setError(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.authRoot}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable testID="auth-back" onPress={onBack} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>
        <View style={styles.authHead}>
          <View style={styles.brandMarkLarge}>
            <Ionicons name={role === "candidate" ? "person" : "briefcase"} size={26} color="#fff" />
          </View>
          <Text style={styles.authTitle}>{create ? "Crie sua conta" : "Bem-vindo de volta"}</Text>
          <Text style={styles.authSub}>
            {role === "candidate"
              ? "Seu próximo passo profissional começa aqui."
              : "Encontre pessoas que combinam com sua vaga."}
          </Text>
        </View>
        {error ? <ErrorBox text={error} /> : null}
        <Field
          testID="auth-email"
          label="E-MAIL"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          testID="auth-password"
          label="SENHA"
          value={password}
          onChangeText={setPassword}
          placeholder={create ? "10+ chars, maiúscula, número e símbolo" : "Sua senha"}
          secure
        />
        <Button testID={create ? "auth-signup" : "auth-login"} title={create ? "Criar conta" : "Entrar"} onPress={submit} loading={busy} />
        {create ? <Text style={styles.policyHint}>{PASSWORD_POLICY}</Text> : null}
        {role === "candidate" ? (
          <>
            <Text style={styles.or}>ou continue com</Text>
            <Pressable
              testID="google-login"
              onPress={google}
              style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}
            >
              <Ionicons name="logo-google" size={19} color={colors.ink} />
              <Text style={styles.socialText}>Continuar com Google</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.providerNote}>Login social liberado após validação da identidade corporativa.</Text>
        )}
        <Pressable
          testID="auth-switch"
          onPress={() => {
            setCreate(!create);
            setError("");
          }}
          style={styles.switch}
        >
          <Text style={styles.switchText}>{create ? "Já tenho uma conta" : "Ainda não tenho conta"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  roleRoot: { flex: 1 },
  roleHero: { flex: 1, paddingHorizontal: 28, paddingTop: 90 },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  heroTitle: { color: "#fff", fontSize: 34, lineHeight: 40, fontWeight: "500", letterSpacing: -1 },
  heroSub: { color: "#E6ECFF", fontSize: 16, lineHeight: 24, marginTop: 18, maxWidth: 320 },
  roleSheet: {
    backgroundColor: "rgba(249,249,251,.96)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 34,
  },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: colors.blue, fontWeight: "600", marginBottom: 10 },
  sheetTitle: { fontSize: 24, fontWeight: "500", color: colors.ink, marginBottom: 18 },
  roleCard: {
    minHeight: 86,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  roleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  pressed: { opacity: 0.72 },
  authRoot: { flex: 1, backgroundColor: colors.bg },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { color: colors.ink, fontSize: 15 },
  authHead: { alignItems: "center", marginVertical: 34 },
  brandMarkLarge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  authTitle: { fontSize: 28, lineHeight: 34, fontWeight: "500", color: colors.ink },
  authSub: { color: colors.muted, fontSize: 15, textAlign: "center", marginTop: 8 },
  policyHint: { color: colors.muted, fontSize: 12, marginTop: 12 },
  or: { color: colors.muted, textAlign: "center", marginTop: 22, fontSize: 12 },
  socialButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  socialText: { color: colors.ink, fontSize: 15, fontWeight: "500" },
  providerNote: { marginTop: 18, color: colors.muted, fontSize: 12, textAlign: "center" },
  switch: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  switchText: { color: colors.blue, fontSize: 15, fontWeight: "500" },
});
