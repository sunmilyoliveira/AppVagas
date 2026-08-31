import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/src/theme";

export function Button({
  testID,
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: {
  testID?: string;
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const isPrimary = variant === "primary";
  const style = variant === "danger" ? styles.buttonDanger : isPrimary ? styles.buttonPrimary : styles.buttonGhost;
  const textStyle = isPrimary || variant === "danger" ? styles.buttonText : styles.buttonGhostText;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [style, (pressed || disabled) && styles.buttonPressed]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary || variant === "danger" ? "#fff" : colors.blue} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  testID,
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secure = false,
  keyboardType,
  autoCapitalize,
}: {
  testID?: string;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9999A5"
        multiline={multiline}
        secureTextEntry={secure}
        keyboardType={keyboardType || "default"}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

export function Chip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={38} color={colors.blue} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{text}</Text>
    </View>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle-outline" size={19} color={colors.red} />
      <View style={{ flex: 1 }}>
        <Text style={styles.errorText}>{text}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry}>
            <Text style={styles.retry}>Tentar novamente</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.blue} size="large" />
    </View>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  buttonPrimary: {
    minHeight: 52,
    backgroundColor: colors.blue,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingHorizontal: 18,
  },
  buttonDanger: {
    minHeight: 52,
    backgroundColor: colors.red,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingHorizontal: 18,
  },
  buttonGhost: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 18,
  },
  buttonPressed: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonGhostText: { color: colors.blue, fontSize: 16, fontWeight: "600" },
  label: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
    marginTop: 18,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.card,
    paddingHorizontal: 15,
    color: colors.ink,
    fontSize: 15,
  },
  multiline: { minHeight: 108, textAlignVertical: "top", paddingTop: 14 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipText: { color: colors.muted, fontSize: 12 },
  empty: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 30,
    marginTop: 12,
    gap: 6,
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4, textAlign: "center" },
  error: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#FDECEC",
    marginTop: 14,
  },
  errorText: { color: colors.red, fontSize: 14, lineHeight: 20 },
  retry: { color: colors.red, fontSize: 14, fontWeight: "600", marginTop: 6 },
  section: {
    backgroundColor: colors.card,
    padding: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 14,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "500", marginBottom: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, minHeight: 200 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
  },
  statValue: { color: colors.blue, fontSize: 24, fontWeight: "500" },
  statLabel: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
});
