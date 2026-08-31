import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { mediaDevices, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView } from "react-native-webrtc";

type Props = { roomId: string; token: string };

export function VideoCall({ roomId, token }: Props) {
  const [localStream, setLocalStream] = useState<any>(null); const [remoteStreams, setRemoteStreams] = useState<any[]>([]); const [status, setStatus] = useState("Conectando à sala segura..."); const socketRef = useRef<WebSocket | null>(null); const peers = useRef(new Map<string, RTCPeerConnection>()); const pending = useRef(new Map<string, any[]>());
  useEffect(() => {
    let active = true;
    const connect = async () => {
      try {
        const local = await mediaDevices.getUserMedia({ audio: true, video: true });
        if (!active) return;
        setLocalStream(local);
        const socket = new WebSocket(`${process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/^http/, "ws")}/api/video/ws/${roomId}?token=${encodeURIComponent(token)}`);
        socketRef.current = socket;
        const makePeer = (id: string) => { const pc = new RTCPeerConnection({ iceServers: [] }); local.getTracks().forEach((track: any) => pc.addTrack(track, local)); pc.onicecandidate = (event: any) => { if (event.candidate) socket.send(JSON.stringify({ type: "ice", to: id, candidate: event.candidate })); }; pc.ontrack = (event: any) => setRemoteStreams((current) => current.some((item) => item.id === id) ? current : [...current, { id, stream: event.streams[0] }]); peers.current.set(id, pc); return pc; };
        socket.onopen = () => setStatus("Sala privada conectada");
        socket.onmessage = async (event) => { const message = JSON.parse(event.data); if (message.type === "peers") { for (const id of message.peers) { const pc = makePeer(id); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.send(JSON.stringify({ type: "offer", to: id, description: offer })); } return; } const pc = peers.current.get(message.from) || makePeer(message.from); if (message.type === "offer") { await pc.setRemoteDescription(new RTCSessionDescription(message.description)); for (const candidate of pending.current.get(message.from) || []) await pc.addIceCandidate(candidate); pending.current.delete(message.from); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.send(JSON.stringify({ type: "answer", to: message.from, description: answer })); } else if (message.type === "answer") await pc.setRemoteDescription(new RTCSessionDescription(message.description)); else if (message.type === "ice") { const candidate = new RTCIceCandidate(message.candidate); if (pc.remoteDescription) await pc.addIceCandidate(candidate); else pending.current.set(message.from, [...(pending.current.get(message.from) || []), candidate]); } };
        socket.onerror = () => setStatus("Não foi possível conectar à sinalização segura");
      } catch { setStatus("Permissão de câmera ou microfone necessária"); }
    };
    connect();
    return () => { active = false; socketRef.current?.close(); peers.current.forEach((peer) => peer.close()); localStream?.getTracks?.().forEach((track: any) => track.stop()); };
  }, [roomId, token]);
  if (!localStream) return <View style={styles.wait}><ActivityIndicator color="#fff" /><Text style={styles.status}>{status}</Text></View>;
  return <View style={styles.grid}><RTCView streamURL={localStream.toURL()} style={styles.local} objectFit="cover" mirror />{remoteStreams.map((item) => <RTCView key={item.id} streamURL={item.stream.toURL()} style={styles.remote} objectFit="cover" />)}<View style={styles.overlay}><Text style={styles.status}>{status}</Text><Text style={styles.encryption}>● Mídia P2P criptografada · sem gravação</Text></View></View>;
}

const styles = StyleSheet.create({ wait: { flex: 1, minHeight: 280, backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center", gap: 12 }, status: { color: "#fff", fontSize: 14, textAlign: "center" }, grid: { minHeight: 360, backgroundColor: "#1C1C1E", borderRadius: 18, overflow: "hidden", position: "relative" }, local: { flex: 1, minHeight: 360 }, remote: { position: "absolute", right: 12, top: 12, width: 110, height: 150, borderRadius: 12 }, overlay: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 5 }, encryption: { color: "#DCE5E2", fontSize: 11 }, });