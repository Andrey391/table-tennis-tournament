import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { formatAgo } from "../lib/format";
import { AppNotification, notificationText, notificationsChanged } from "../lib/notifications";
import { card, pageTitle } from "../lib/ui";

// The inbox. Opening it counts as reading it: everything is marked read on the
// server as soon as the list arrives, while the rows that were unread keep their
// marker for this visit so it is still clear what is new.
export default function NotificationsPage() {
  const { t, lang } = useT();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    apiService.notifications.list()
      .then(async (r) => {
        setItems(r.data.items);
        if (r.data.unread > 0) { await apiService.notifications.markRead(); notificationsChanged(); }
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{t("notif.title")}</h1>
      {items === null ? <Loader /> : items.length === 0 ? <EmptyState text={t("notif.empty")} /> : (
        <div className={`${card} divide-y divide-[#1c3350]`}>
          {items.map(n => {
            const body = (
              <div className="flex gap-3 p-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? "bg-transparent" : "bg-[#ccff00]"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.readAt ? "text-[#93a8c2]" : "text-white"}`}>{notificationText(n, t, lang)}</p>
                  <p className="text-xs text-[#4d6480] mt-0.5">{formatAgo(n.createdAt, lang)}</p>
                </div>
              </div>
            );
            return n.link ? <Link key={n.id} to={n.link} className="block active:bg-[#1c3350]">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </div>
      )}
    </Layout>
  );
}
