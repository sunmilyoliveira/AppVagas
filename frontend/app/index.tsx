import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createVideoRoom,
  getJob,
  getMe,
  getNotifications,
  Job,
  Notification,
  Role,
  signOut,
  User,
} from "@/src/api";
import { Loading } from "@/src/components";
import { AuthScreen, RoleSelection } from "@/src/screens/auth";
import {
  CandidateApplications,
  CandidateHome,
  CandidateProfile,
  JobDetail,
} from "@/src/screens/candidate";
import { ChatScreen, VideoRoomScreen } from "@/src/screens/chat";
import {
  Applications,
  JobCreation,
  RecruiterDashboard,
  RecruiterHome,
} from "@/src/screens/recruiter";
import {
  NotificationsScreen,
  PrivacyScreen,
  RecruiterVerificationScreen,
} from "@/src/screens/settings";
import { colors } from "@/src/theme";

type CandidateScreen =
  | "home"
  | "applications"
  | "profile"
  | "notifications"
  | "privacy"
  | "job"
  | "chat"
  | "video";
type RecruiterScreen =
  | "home"
  | "create"
  | "applications"
  | "dashboard"
  | "verification"
  | "notifications"
  | "privacy"
  | "chat"
  | "video";
type Screen = CandidateScreen | RecruiterScreen;

export default function Index() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [chatContext, setChatContext] = useState<{ applicationId: string; title: string } | null>(null);
  const [videoRoom, setVideoRoom] = useState<{
    roomId: string;
    code: string;
    token?: string;
    expiresAt?: string;
  } | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => null)
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    getNotifications()
      .then((items: Notification[]) => setNotifCount(items.filter((n) => !n.read).length))
      .catch(() => null);
  }, [user, screen]);

  if (booting) return <Loading />;
  if (!user && !role) return <RoleSelection onSelect={setRole} />;
  if (!user && role) return <AuthScreen role={role} onBack={() => setRole(null)} onAuthenticated={setUser} />;
  if (!user) return <Loading />;

  const openJob = async (job: Job) => {
    try {
      setSelectedJob(await getJob(job.id));
      setScreen("job");
    } catch (err) {
      Alert.alert("Não foi possível abrir a vaga", (err as Error).message);
    }
  };
  const openApplications = (job: Job) => {
    setSelectedJob(job);
    setScreen("applications");
  };
  const openChat = (applicationId: string, title: string) => {
    setChatContext({ applicationId, title });
    setScreen("chat");
  };
  const createRoom = async (applicationId: string) => {
    if (!selectedJob) return;
    try {
      const data = await createVideoRoom(selectedJob.id, applicationId);
      setVideoRoom({ roomId: data.room_id, code: data.code, expiresAt: data.expires_at });
      setScreen("video");
    } catch (err) {
      Alert.alert("Sala não criada", (err as Error).message);
    }
  };
  const logout = async () => {
    await signOut();
    setUser(null);
    setRole(null);
    setScreen("home");
  };
  const onNotificationOpen = (n: Notification) => {
    if (n.meta?.application_id) openChat(n.meta.application_id, n.title);
    else if (n.meta?.room_id && n.meta?.code)
      setVideoRoom({ roomId: n.meta.room_id, code: n.meta.code, expiresAt: n.meta.expires_at }) || setScreen("video");
  };

  const content =
    user.role === "candidate"
      ? renderCandidate(screen, user, {
          openJob,
          openChat,
          setUser,
          selectedJob,
          setScreen,
          setUserLogout: logout,
          onNotificationOpen,
          chatContext,
          videoRoom,
          setVideoRoom,
        })
      : renderRecruiter(screen, user, {
          openApplications,
          selectedJob,
          openChat,
          setScreen,
          createRoom,
          chatContext,
          videoRoom,
          setVideoRoom,
          onNotificationOpen,
          setUserLogout: logout,
        });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.brandBar}>
        <View style={styles.brandMark}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </View>
        <Text style={styles.brand}>Vagas+</Text>
        <Pressable
          testID="header-notifications"
          onPress={() => setScreen("notifications")}
          style={styles.headerBtn}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.muted} />
          {notifCount > 0 ? (
            <View testID="notif-badge" style={styles.badge}>
              <Text style={styles.badgeText}>{notifCount > 9 ? "9+" : notifCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable testID="header-privacy" onPress={() => setScreen("privacy")} style={styles.headerBtn}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.muted} />
        </Pressable>
        <Pressable testID="logout" onPress={logout} style={styles.headerBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.content}>{content}</View>
      <BottomNav role={user.role} screen={screen} onNavigate={setScreen} bottom={insets.bottom} />
    </View>
  );
}

type CandidateHandlers = {
  openJob: (job: Job) => void;
  openChat: (applicationId: string, title: string) => void;
  setUser: (user: User) => void;
  selectedJob: Job | null;
  setScreen: (screen: Screen) => void;
  setUserLogout: () => void;
  onNotificationOpen: (n: Notification) => void;
  chatContext: { applicationId: string; title: string } | null;
  videoRoom: { roomId: string; code: string; token?: string; expiresAt?: string } | null;
  setVideoRoom: (value: null) => void;
};

function renderCandidate(screen: Screen, user: User, handlers: CandidateHandlers) {
  if (screen === "applications") return <CandidateApplications onOpenChat={handlers.openChat} />;
  if (screen === "profile") return <CandidateProfile user={user} onSaved={handlers.setUser} />;
  if (screen === "notifications") return <NotificationsScreen onOpen={handlers.onNotificationOpen} />;
  if (screen === "privacy") return <PrivacyScreen user={user} onDeleted={handlers.setUserLogout} />;
  if (screen === "chat" && handlers.chatContext)
    return (
      <ChatScreen
        applicationId={handlers.chatContext.applicationId}
        title={handlers.chatContext.title}
        onBack={() => handlers.setScreen("applications")}
        user={user}
      />
    );
  if (screen === "video" && handlers.videoRoom)
    return (
      <VideoRoomScreen
        room={handlers.videoRoom}
        onLeave={() => {
          handlers.setVideoRoom(null);
          handlers.setScreen("applications");
        }}
      />
    );
  if (screen === "job" && handlers.selectedJob)
    return <JobDetail job={handlers.selectedJob} onBack={() => handlers.setScreen("home")} />;
  return <CandidateHome onOpenJob={handlers.openJob} />;
}

type RecruiterHandlers = {
  openApplications: (job: Job) => void;
  selectedJob: Job | null;
  openChat: (applicationId: string, title: string) => void;
  setScreen: (screen: Screen) => void;
  createRoom: (applicationId: string) => void;
  chatContext: { applicationId: string; title: string } | null;
  videoRoom: { roomId: string; code: string; token?: string; expiresAt?: string } | null;
  setVideoRoom: (value: null) => void;
  onNotificationOpen: (n: Notification) => void;
  setUserLogout: () => void;
};

function renderRecruiter(screen: Screen, user: User, handlers: RecruiterHandlers) {
  if (screen === "create") return <JobCreation onCreated={() => handlers.setScreen("home")} />;
  if (screen === "dashboard") return <RecruiterDashboard />;
  if (screen === "verification") return <RecruiterVerificationScreen />;
  if (screen === "notifications") return <NotificationsScreen onOpen={handlers.onNotificationOpen} />;
  if (screen === "privacy") return <PrivacyScreen user={user} onDeleted={handlers.setUserLogout} />;
  if (screen === "chat" && handlers.chatContext)
    return (
      <ChatScreen
        applicationId={handlers.chatContext.applicationId}
        title={handlers.chatContext.title}
        onBack={() => handlers.setScreen("applications")}
        user={user}
      />
    );
  if (screen === "video" && handlers.videoRoom)
    return (
      <VideoRoomScreen
        room={handlers.videoRoom}
        onLeave={() => {
          handlers.setVideoRoom(null);
          handlers.setScreen("applications");
        }}
      />
    );
  if (screen === "applications" && handlers.selectedJob)
    return (
      <Applications
        job={handlers.selectedJob}
        onCreateRoom={handlers.createRoom}
        onOpenChat={handlers.openChat}
      />
    );
  return <RecruiterHome onCreate={() => handlers.setScreen("create")} onApplications={handlers.openApplications} />;
}

function BottomNav({
  role,
  screen,
  onNavigate,
  bottom,
}: {
  role: Role;
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  bottom: number;
}) {
  const items =
    role === "candidate"
      ? ([
          { key: "home", icon: "search-outline", label: "Explorar" },
          { key: "applications", icon: "paper-plane-outline", label: "Aplicações" },
          { key: "profile", icon: "person-outline", label: "Perfil" },
        ] as const)
      : ([
          { key: "home", icon: "grid-outline", label: "Vagas" },
          { key: "create", icon: "add-circle-outline", label: "Nova" },
          { key: "dashboard", icon: "stats-chart-outline", label: "Dashboard" },
          { key: "verification", icon: "shield-checkmark-outline", label: "Selo" },
        ] as const);
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(bottom, 10) }]}>
      {items.map((item) => (
        <Pressable
          testID={`nav-${item.key}`}
          key={item.key}
          onPress={() => onNavigate(item.key as Screen)}
          style={styles.navItem}
        >
          <Ionicons
            name={item.icon as keyof typeof Ionicons.glyphMap}
            size={22}
            color={screen === item.key ? colors.blue : colors.muted}
          />
          <Text style={[styles.navLabel, screen === item.key && styles.navActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  brandBar: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    gap: 4,
  },
  brandMark: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  brand: { flex: 1, fontSize: 19, fontWeight: "600", color: colors.ink },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  nav: {
    minHeight: 62,
    backgroundColor: "rgba(255,255,255,.96)",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
  },
  navItem: { alignItems: "center", justifyContent: "center", minWidth: 60, minHeight: 44 },
  navLabel: { color: colors.muted, fontSize: 11, marginTop: 3 },
  navActive: { color: colors.blue, fontWeight: "600" },
});
