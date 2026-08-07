import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

// Bilingual UI strings. Dashboard defaults to Tamil (ta) since this is
// built for Tamil Nadu tradespeople; English (en) is available via toggle.
const STRINGS = {
  ta: {
    title: "மனோவின் வேலை பலகை",
    subtitle: "குரல் குறிப்புகள் உள்ளே, வேலை ஆணைகள் வெளியே",
    synced: "ஒத்திசைக்கப்பட்டது",
    justNow: "இப்போதுதான்",
    secAgo: (s) => `${s} வி முன்பு`,
    minAgo: (m) => `${m} நிமி முன்பு`,
    tabs: { all: "அனைத்தும்", pending: "நிலுவையில்", in_progress: "நடந்து கொண்டிருக்கிறது", done: "முடிந்தது" },
    unknownCustomer: "தெரியாத வாடிக்கையாளர்",
    startJob: "வேலையைத் தொடங்கு",
    markDone: "முடிந்ததாகக் குறி",
    showOriginal: "அசல் செய்தியைக் காட்டு ▼",
    hideOriginal: "அசல் செய்தியை மறை ▲",
    loading: "வேலை அட்டைகள் ஏற்றப்படுகின்றன…",
    emptyTitle: "இதுவரை வேலைகள் இல்லை.",
    emptyBody:
      "வாடிக்கையாளரிடம் பிரச்சனையை விவரிக்கும் குரல் குறிப்பை அனுப்பச் சொல்லுங்கள் — ஒரு வேலை அட்டை தானாகவே இங்கே தோன்றும்.",
    urgency: { high: "அதிக முன்னுரிமை", medium: "நடுத்தரம்", low: "குறைவு" },
    langToggle: "English",
  },
  en: {
    title: "Mano's Job Board",
    subtitle: "Voice notes in, work orders out",
    synced: "Synced",
    justNow: "just now",
    secAgo: (s) => `${s}s ago`,
    minAgo: (m) => `${m}m ago`,
    tabs: { all: "All jobs", pending: "Pending", in_progress: "In progress", done: "Done" },
    unknownCustomer: "Unknown customer",
    startJob: "Start job",
    markDone: "Mark done",
    showOriginal: "Show original message ▼",
    hideOriginal: "Hide original message ▲",
    loading: "Loading job cards…",
    emptyTitle: "No jobs here yet.",
    emptyBody:
      "Ask a customer to send a voice note describing the problem — a job card will show up here automatically.",
    urgency: { high: "HIGH PRIORITY", medium: "MEDIUM", low: "LOW" },
    langToggle: "தமிழ்",
  },
};

const STATUS_COLORS = {
  pending: { color: "#C97A0C", bg: "#FBEBD2" },
  in_progress: { color: "#2554C7", bg: "#E1E9FB" },
  done: { color: "#157A4A", bg: "#DCF1E5" },
};

const URGENCY_COLORS = {
  high: "#B3261E",
  medium: "#8A5A00",
  low: "#3A6B4C",
};

function timeAgo(seconds, t) {
  if (seconds < 5) return t.justNow;
  if (seconds < 60) return t.secAgo(seconds);
  return t.minAgo(Math.floor(seconds / 60));
}

function JobCard({ job, onStatusChange, lang, t }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[job.status] || STATUS_COLORS.pending;
  const statusLabel = t.tabs[job.status] || t.tabs.pending;
  const urgencyColor = URGENCY_COLORS[job.urgency];
  const urgencyLabel = t.urgency[job.urgency];
  const ticketNumber = (job.id || "").slice(-6).toUpperCase();

  // Prefer the Tamil translation when available and Tamil is selected;
  // location/time don't have stored Tamil translations yet, so those
  // stay in their original (usually English) form regardless of lang.
  const issueText = lang === "ta" && job.issue_ta ? job.issue_ta : job.issue;

  return (
    <div style={styles.ticketWrap}>
      <div style={styles.perforation} aria-hidden="true" />
      <div style={styles.card}>
        <div style={styles.ticketTop}>
          <span style={styles.ticketNo}>#{ticketNumber || "000000"}</span>
          {urgencyLabel && (
            <span style={{ ...styles.stamp, color: urgencyColor, borderColor: urgencyColor }}>
              {urgencyLabel}
            </span>
          )}
        </div>

        <div style={styles.cardHeader} onClick={() => setExpanded(!expanded)}>
          <div style={styles.who}>
            <span style={styles.name}>{job.customer_name || t.unknownCustomer}</span>
            <span style={styles.phone}>
              {job.customer_phone?.replace("whatsapp:", "") || "—"}
            </span>
          </div>
          <span style={{ ...styles.statusBadge, color: statusColor.color, background: statusColor.bg }}>
            {statusLabel}
          </span>
        </div>

        <p style={styles.issue}>{issueText}</p>

        <div style={styles.metaRow}>
          {job.location && <span style={styles.metaItem}>📍 {job.location}</span>}
          {job.requested_time && <span style={styles.metaItem}>🕒 {job.requested_time}</span>}
          {job.alternate_contact && (
            <span style={styles.metaItem}>📞 {job.alternate_contact}</span>
          )}
        </div>

        {job.raw_transcript && (
          <button style={styles.transcriptToggle} onClick={() => setExpanded(!expanded)}>
            {expanded ? t.hideOriginal : t.showOriginal}
          </button>
        )}

        {expanded && job.raw_transcript && (
          <div style={styles.transcript}>{job.raw_transcript}</div>
        )}

        <div style={styles.actions}>
          {job.status !== "in_progress" && job.status !== "done" && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => onStatusChange(job.id, "in_progress")}
            >
              {t.startJob}
            </button>
          )}
          {job.status !== "done" && (
            <button style={styles.btn} onClick={() => onStatusChange(job.id, "done")}>
              {t.markDone}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);
  // Dashboard defaults to Tamil (ta); toggle switches to English (en).
  const [lang, setLang] = useState("ta");
  const t = STRINGS[lang];

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      const data = await res.json();
      setJobs(data);
      setSecondsSinceSync(0);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const poll = setInterval(fetchJobs, 5000);
    const tick = setInterval(() => setSecondsSinceSync((s) => s + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const handleStatusChange = async (jobId, status) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status } : j)));
    try {
      await fetch(`${API_BASE}/api/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error("Failed to update status:", err);
      fetchJobs();
    }
  };

  const filteredJobs = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const counts = {
    all: jobs.length,
    pending: jobs.filter((j) => j.status === "pending").length,
    in_progress: jobs.filter((j) => j.status === "in_progress").length,
    done: jobs.filter((j) => j.status === "done").length,
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.brandBar} aria-hidden="true" />
          <div>
            <h1 style={styles.title}>{t.title}</h1>
            <p style={styles.subtitle}>{t.subtitle}</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.liveIndicator}>
            <span style={styles.liveDot} />
            {t.synced} {timeAgo(secondsSinceSync, t)}
          </div>
          <button
            style={styles.langToggle}
            onClick={() => setLang((l) => (l === "ta" ? "en" : "ta"))}
          >
            {t.langToggle}
          </button>
        </div>
      </header>

      <nav style={styles.tabs}>
        {["all", "pending", "in_progress", "done"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.tab,
              ...(filter === f ? styles.tabActive : {}),
            }}
          >
            {t.tabs[f]}
            <span style={styles.tabCount}>{counts[f]}</span>
          </button>
        ))}
      </nav>

      <main>
        {loading && <p style={styles.loadingText}>{t.loading}</p>}

        {!loading && filteredJobs.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>{t.emptyTitle}</p>
            <p style={styles.emptyBody}>{t.emptyBody}</p>
          </div>
        )}

        {filteredJobs.map((job) => (
          <JobCard key={job.id} job={job} onStatusChange={handleStatusChange} lang={lang} t={t} />
        ))}
      </main>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 640,
    margin: "0 auto",
    padding: "28px 20px 60px",
    fontFamily: "'Inter', system-ui, sans-serif",
    background: "#EDE7DA",
    minHeight: "100vh",
    color: "#22201C",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: { display: "flex", gap: 14, alignItems: "flex-start" },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  langToggle: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
    color: "#1F3A3D",
    background: "#FFFDF8",
    border: "1px solid #DDD5C2",
    borderRadius: 20,
    padding: "6px 12px",
    cursor: "pointer",
  },
  brandBar: {
    width: 6,
    height: 46,
    borderRadius: 3,
    background: "#1F3A3D",
    marginTop: 4,
  },
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 28,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 13.5,
    color: "#5C574C",
  },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#5C574C",
    background: "#FFFDF8",
    padding: "6px 10px",
    borderRadius: 20,
    border: "1px solid #DDD5C2",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#157A4A",
    display: "inline-block",
  },
  tabs: {
    display: "flex",
    gap: 6,
    marginBottom: 20,
    borderBottom: "1px solid #DDD5C2",
    paddingBottom: 0,
    flexWrap: "wrap",
  },
  tab: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    fontSize: 13.5,
    fontWeight: 500,
    color: "#5C574C",
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  tabActive: {
    color: "#1F3A3D",
    borderBottom: "2px solid #1F3A3D",
    fontWeight: 600,
  },
  tabCount: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    background: "#E3DDCC",
    borderRadius: 10,
    padding: "1px 6px",
  },
  loadingText: { color: "#5C574C", fontSize: 14 },
  empty: {
    background: "#FFFDF8",
    border: "1px dashed #C9BFA6",
    borderRadius: 10,
    padding: "28px 20px",
    textAlign: "center",
  },
  emptyTitle: { fontWeight: 600, margin: "0 0 6px", fontSize: 15 },
  emptyBody: { margin: 0, fontSize: 13.5, color: "#5C574C", lineHeight: 1.5 },
  ticketWrap: {
    display: "flex",
    marginBottom: 16,
  },
  perforation: {
    width: 14,
    flexShrink: 0,
    borderRadius: "10px 0 0 10px",
    backgroundImage:
      "repeating-linear-gradient(to bottom, transparent 0 4px, #C9BFA6 4px 5px)",
    backgroundPosition: "center",
    backgroundSize: "1px 100%",
    backgroundColor: "#FFFDF8",
    border: "1px solid #DDD5C2",
    borderRight: "none",
  },
  card: {
    flex: 1,
    background: "#FFFDF8",
    border: "1px solid #DDD5C2",
    borderLeft: "none",
    borderRadius: "0 10px 10px 0",
    padding: "14px 18px 16px",
  },
  ticketTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ticketNo: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    color: "#9A9282",
    letterSpacing: "0.03em",
  },
  stamp: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    border: "1.5px solid",
    borderRadius: 4,
    padding: "2px 7px",
    transform: "rotate(-3deg)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    gap: 10,
  },
  who: { display: "flex", flexDirection: "column" },
  name: { fontWeight: 600, fontSize: 15.5 },
  phone: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#8A8374",
    marginTop: 1,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 20,
    whiteSpace: "nowrap",
  },
  issue: { margin: "10px 0 8px", fontSize: 15, lineHeight: 1.45 },
  metaRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    fontSize: 12.5,
    color: "#5C574C",
    marginBottom: 6,
  },
  metaItem: { display: "inline-flex", alignItems: "center" },
  transcriptToggle: {
    background: "none",
    border: "none",
    color: "#1F3A3D",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 0",
    cursor: "pointer",
  },
  transcript: {
    marginTop: 6,
    padding: "10px 12px",
    background: "#F4F0E6",
    borderRadius: 8,
    fontSize: 13,
    color: "#4A463C",
    fontStyle: "italic",
    lineHeight: 1.5,
  },
  actions: { marginTop: 12, display: "flex", gap: 8 },
  btn: {
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 14px",
    border: "1px solid #DDD5C2",
    borderRadius: 7,
    background: "#FFFDF8",
    color: "#22201C",
    cursor: "pointer",
  },
  btnPrimary: {
    background: "#1F3A3D",
    color: "#FFFDF8",
    border: "1px solid #1F3A3D",
  },
};
