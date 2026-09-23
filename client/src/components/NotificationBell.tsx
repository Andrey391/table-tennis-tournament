import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { AppNotification, notificationText, notificationsChanged, onNotificationsChanged } from "../lib/notifications";

const POLL_MS = 20000;

// The newest unread notification this device has already seen, per account.
// Module-level rather than state because every page mounts its own Layout, and
// a toast must not replay on each navigation.
let seen: { userId: string; id: string | null } | null = null;

// Header bell: the unread count, and a short toast when something new arrives
// while the app is open — the next round being paired is exactly the kind of
// thing a player standing by a table should not have to go looking for.
export default function NotificationBell() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<AppNotification | null>(null);

  const check = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await apiService.notifications.unread();
      setUnread(data.unread);
      const latest: AppNotification | null = data.latest ?? null;
      const known = seen?.userId === user.id;
      // The first answer after opening the app only sets the baseline: the inbox
      // is where old news lives, the toast is for what arrives while you look.
      if (known && latest && latest.id !== seen!.id && location.pathname !== "/notifications") {
        setToast(latest);
        try { navigator.vibrate?.(150); } catch { /* not supported */ }
      }
      seen = { userId: user.id, id: latest?.id ?? null };
    } catch { /* offline for a moment; the next poll will catch up */ }
  }, [user, location.pathname]);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onFocus);
    const off = onNotificationsChanged(check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onFocus); off(); };
  }, [check]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const openToast = () => {
    if (toast) apiService.notifications.markRead([toast.id]).then(notificationsChanged).catch(() => {});
    setToast(null);
  };

  return (
    <>
      <Link to="/notifications" aria-label={t("notif.title")} data-unread={unread}
        className="relative w-8 h-8 flex items-center justify-center text-[#93a8c2] hover:text-white border border-[#1c3350] rounded-full">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ccff00] text-[#0a1628] text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      {toast && (
        <div className="fixed top-14 left-0 right-0 z-50 px-3 pointer-events-none">
          <Link to={toast.link || "/notifications"} onClick={openToast} role="status"
            className="pointer-events-auto block max-w-2xl mx-auto bg-[#101f36] border border-[#ccff00]/40 rounded-lg p-3 shadow-lg shadow-black/40 text-sm text-white">
            <span className="block text-[10px] uppercase tracking-wider text-[#ccff00] mb-0.5">{t("notif.new")}</span>
            {notificationText(toast, t, lang)}
          </Link>
        </div>
      )}
    </>
  );
}
