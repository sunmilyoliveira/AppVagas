import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  ChatContext,
  ChatMessage,
  getChat,
  joinVideoRoom,
  sendChatMessage,
  User,
} from "@/src/api";
import { Button, ErrorBox, Loading, Section } from "@/src/components";
import { colors } from "@/src/theme";
import { VideoCall } from "@/src/video/VideoCall";

export function ChatScreen({
  applicationId,
  title,
  onBack,
  user,
}: {
  applicationId: string;
  title: string;
  onBack: () => void;
  user: User;
}) {
  const [chat, setChat] = useState<ChatContext | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);
  const load = () => {
    getChat(applicationId)
      .then((data) => {
        setChat(data);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 30);
      })
      .catch((err) => setError((err as Error).message));
  };
  useEffect(() => {
    load();
  }, [applicationId]);
  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await sendChatMessage(applicationId, message.trim());
      setMessage("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={styles.headerBar}>
        <Pressable testID="chat-back" onPress={onBack} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      </View>
      {error ? <ErrorBox text={error} /> : null}
      {!chat ? (
        <Loading />
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.messagesWrap}>
          {chat.messages.length === 0 ? (
            <Text style={styles.emptyChat}>
              Nenhuma mensagem ainda. Envie a primeira e mantenha um registro do processo.
            </Text>
          ) : (
            chat.messages.map((item) => <Bubble key={item.id} message={item} me={item.sender_id === user.id} />)
          )}
        </ScrollView>
      )}
      <View style={styles.inputBar}>
        <TextInput
          testID="chat-input"
          value={message}
          onChangeText={setMessage}
          placeholder="Escreva uma mensagem"
          placeholderTextColor="#9999A5"
          style={styles.input}
          multiline
        />
        <Pressable testID="chat-send" onPress={send} disabled={busy || !message.trim()} style={styles.sendBtn}>
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, me }: { message: ChatMessage; me: boolean }) {
  return (
    <View style={[styles.bubble, me ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={[styles.bubbleBody, me && { color: "#fff" }]}>{message.body}</Text>
      <Text style={[styles.bubbleTime, me && { color: "#DCE5E2" }]}>
        {new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </Text>
    </View>
  );
}

export function VideoRoomScreen({
  room,
  onLeave,
}: {
  room: { roomId: string; code: string; token?: string; expiresAt?: string };
  onLeave: () => void;
}) {
  const [participantToken, setParticipantToken] = useState<string | null>(room.token ?? null);
  const [status, setStatus] = useState("Pronto para entrar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const join = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await joinVideoRoom(room.roomId, room.code);
      setParticipantToken(data.participant_token);
      setStatus("Sala aberta — mídia conectando");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable testID="video-back" onPress={onLeave} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
        <Text style={styles.backText}>Sair da sala</Text>
      </Pressable>
      <Text style={styles.eyebrow}>ENTREVISTA POR VÍDEO</Text>
      <Text style={styles.pageTitle}>Sala privada.</Text>
      <Text style={styles.pageSub}>
        Mídia ponto a ponto criptografada (DTLS-SRTP). O código expira automaticamente ao final do tempo definido.
      </Text>
      <Section title="Credenciais">
        <Text style={styles.body}>Código de entrada:</Text>
        <Text testID="video-code" style={styles.code}>
          {room.code}
        </Text>
        {room.expiresAt ? <Text style={styles.body}>Expira em: {new Date(room.expiresAt).toLocaleString("pt-BR")}</Text> : null}
        {!participantToken ? (
          <Button testID="video-join" title="Entrar na sala" onPress={join} loading={busy} />
        ) : null}
        {error ? <ErrorBox text={error} /> : null}
      </Section>
      <Section title="Chamada">
        {participantToken ? (
          <VideoCall roomId={room.roomId} token={participantToken} />
        ) : (
          <View style={styles.callPlaceholder}>
            <Ionicons name="videocam-outline" size={38} color={colors.blue} />
            <Text style={styles.body}>{status}</Text>
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
    gap: 10,
  },
  back: { minHeight: 44, minWidth: 44, alignItems: "flex-start", justifyContent: "center", flexDirection: "row", gap: 8 },
  backText: { color: colors.ink, fontSize: 15 },
  headerTitle: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: "500" },
  messagesWrap: { padding: 16, paddingBottom: 90, gap: 8 },
  emptyChat: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 40 },
  bubble: { padding: 12, borderRadius: 14, maxWidth: "82%" },
  bubbleMine: { backgroundColor: colors.blue, alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: colors.card, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.line },
  bubbleBody: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  bubbleTime: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "right" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 40 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: colors.blue, fontWeight: "600", marginBottom: 10 },
  pageTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "500", letterSpacing: -0.5 },
  pageSub: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  code: {
    color: colors.blue,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 1,
    marginVertical: 8,
    fontFamily: "Menlo, monospace",
  },
  callPlaceholder: {
    minHeight: 200,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },
});
