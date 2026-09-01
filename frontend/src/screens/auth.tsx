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
  forgotPassword,
  isStrongPassword,
  PASSWORD_POLICY,
  resetPassword,
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

type AuthMode = "signin" | "signup" | "forgot" | "reset";

export function AuthScreen({
  role,
  onBack,
  onAuthenticated,
  initialResetToken,
  onResetTokenConsumed,
}: {
  role: Role;
  onBack: () => void;
  onAuthenticated: (user: User) => void;
  initialResetToken?: string | null;
  onResetTokenConsumed?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState(initialResetToken ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const clearMessages = () => {
    setError("");
    setInfo("");
  };

  const submitSignInSignUp = async () => {
    Keyboard.dismiss();
    clearMessages();
    const create = mode === "signup";
    if (!email) {
      setError("Informe seu e-mail.");
      return;
    }
    if (create) {
      if (!isStrongPassword(password)) {
        setError(PASSWORD_POLICY);
        return;
      }
      if (password !== confirmPassword) {
        setError("A confirmação de senha não confere.");
        return;
      }
    } else if (password.length < 1) {
      setError("Informe sua senha.");
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

  const submitForgot = async () => {
    Keyboard.dismiss();
    clearMessages();
    if (!email) {
      setError("Informe seu e-mail.");
      return;
    }
    setBusy(true);
    try {
      const result = await forgotPassword(email);
      setInfo(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    Keyboard.dismiss();
    clearMessages();
    if (!resetToken.trim()) {
      setError("Cole o código recebido por e-mail ou abra pelo link.");
      return;
    }
    if (!isStrongPassword(password)) {
      setError(PASSWORD_POLICY);
      return;
    }
    if (password !== confirmPassword) {
      setError("A confirmação de senha não confere.");
      return;
    }
    setBusy(true);
    try {
      const result = await resetPassword(resetToken.trim(), password);
      setInfo(result.message);
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      onResetTokenConsumed?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    clearMessages();
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
        <Pressable
          testID="auth-back"
          onPress={() => {
            if (mode === "signin") onBack();
            else {
              setMode("signin");
              clearMessages();
            }
          }}
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>

        <View style={styles.authHead}>
          <View style={styles.brandMarkLarge}>
            <Ionicons name={role === "candidate" ? "person" : "briefcase"} size={26} color="#fff" />
          </View>
          <Text style={styles.authTitle}>{titleFor(mode)}</Text>
          <Text style={styles.authSub}>{subtitleFor(mode, role)}</Text>
        </View>

        {error ? <ErrorBox text={error} /> : null}
        {info ? (
          <View style={styles.info}>
            <Ionicons name="information-circle-outline" size={18} color={colors.blue} />
            <Text style={styles.infoText}>{info}</Text>
          </View>
        ) : null}

        {mode === "reset" ? (
          <>
            <Field
              testID="reset-token"
              label="CÓDIGO DO E-MAIL"
              value={resetToken}
              onChangeText={setResetToken}
              placeholder="Cole aqui o código recebido"
              autoCapitalize="none"
            />
            <Field
              testID="reset-password"
              label="NOVA SENHA"
              value={password}
              onChangeText={setPassword}
              placeholder="10+ chars, maiúscula, número e símbolo"
              secure
            />
            <Field
              testID="reset-confirm"
              label="CONFIRMAR NOVA SENHA"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repita a nova senha"
              secure
            />
            <Button testID="reset-submit" title="Redefinir senha" onPress={submitReset} loading={busy} />
            <Text style={styles.policyHint}>{PASSWORD_POLICY}</Text>
          </>
        ) : mode === "forgot" ? (
          <>
            <Field
              testID="forgot-email"
              label="E-MAIL"
              value={email}
              onChangeText={setEmail}
              placeholder="voce@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button testID="forgot-submit" title="Enviar link de recuperação" onPress={submitForgot} loading={busy} />
            <Pressable
              testID="forgot-open-reset"
              onPress={() => {
                setMode("reset");
                clearMessages();
              }}
              style={styles.switch}
            >
              <Text style={styles.switchText}>Já tenho o código do e-mail</Text>
            </Pressable>
          </>
        ) : (
          <>
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
              placeholder={mode === "signup" ? "10+ chars, maiúscula, número e símbolo" : "Sua senha"}
              secure
            />
            {mode === "signup" ? (
              <Field
                testID="auth-confirm-password"
                label="CONFIRMAR SENHA"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repita sua senha"
                secure
              />
            ) : null}
            <Button
              testID={mode === "signup" ? "auth-signup" : "auth-login"}
              title={mode === "signup" ? "Criar conta" : "Entrar"}
              onPress={submitSignInSignUp}
              loading={busy}
            />
            {mode === "signup" ? <Text style={styles.policyHint}>{PASSWORD_POLICY}</Text> : null}
            {mode === "signin" ? (
              <Pressable
                testID="auth-forgot"
                onPress={() => {
                  setMode("forgot");
                  clearMessages();
                }}
                style={styles.switch}
              >
                <Text style={styles.switchText}>Esqueci minha senha</Text>
              </Pressable>
            ) : null}
            {role === "candidate" && mode === "signin" ? (
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
            ) : null}
            {role === "recruiter" && mode === "signin" ? (
              <Text style={styles.providerNote}>
                Login social liberado após validação da identidade corporativa.
              </Text>
            ) : null}
            <Pressable
              testID="auth-switch"
              onPress={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                clearMessages();
                setConfirmPassword("");
              }}
              style={styles.switch}
            >
              <Text style={styles.switchText}>
                {mode === "signup" ? "Já tenho uma conta" : "Ainda não tenho conta"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function titleFor(mode: AuthMode): string {
  if (mode === "signup") return "Crie sua conta";
  if (mode === "forgot") return "Recuperar senha";
  if (mode === "reset") return "Definir nova senha";
  return "Bem-vindo de volta";
}
function subtitleFor(mode: AuthMode, role: Role): string {
  if (mode === "forgot") return "Enviaremos um link seguro por e-mail em instantes.";
  if (mode === "reset") return "Use o código recebido por e-mail para escolher uma nova senha.";
  return role === "candidate"
    ? "Seu próximo passo profissional começa aqui."
    : "Encontre pessoas que combinam com sua vaga.";
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
  authTitle: { fontSize: 28, lineHeight: 34, fontWeight: "500", color: colors.ink, textAlign: "center" },
  authSub: { color: colors.muted, fontSize: 15, textAlign: "center", marginTop: 8, paddingHorizontal: 8 },
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
  info: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 13,
    backgroundColor: colors.pale,
    marginTop: 14,
  },
  infoText: { color: colors.blue, fontSize: 14, lineHeight: 20, flex: 1 },
});
