import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type Props = { roomId: string; token: string };

export function VideoCall({ roomId, token }: Props) {
  const video = useRef<HTMLVideoElement>(null); const [status, setStatus] = useState("Conectando à sala segura...");
  useEffect(() => { let stream: MediaStream | null = null; let socket: WebSocket | null = null; const run = async () => { try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); if (video.current) { video.current.srcObject = stream; await video.current.play(); } const backend = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/^http/, "ws"); socket = new WebSocket(`${backend}/api/video/ws/${roomId}?token=${encodeURIComponent(token)}`); socket.onopen = () => setStatus("Sala privada conectada"); socket.onerror = () => setStatus("Sinalização segura indisponível neste preview"); } catch { setStatus("Câmera/microfone indisponíveis neste navegador"); } }; run(); return () => { socket?.close(); stream?.getTracks().forEach((track) => track.stop()); }; }, [roomId, token]);
  return <View style={styles.container}>{status.includes("indisponíveis") ? <ActivityIndicator color="#fff" /> : <video ref={video} muted playsInline style={{ width: "100%", height: 300, objectFit: "cover" }} />}<Text style={styles.status}>{status}</Text><Text style={styles.note}>Preview web: a mídia remota requer sinalização completa e TURN configurado.</Text></View>;
}

const styles = StyleSheet.create({ container: { minHeight: 360, borderRadius: 18, backgroundColor: "#1C1C1E", overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 14, gap: 12 }, status: { color: "#fff", fontSize: 14, textAlign: "center" }, note: { color: "#DCE5E2", fontSize: 11, textAlign: "center" } });