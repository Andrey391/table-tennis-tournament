import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import EventForm from "../components/EventForm";
import { useT } from "../i18n";
import { pageTitle } from "../lib/ui";

// A tournament's rounds need a venue, so this is the same form as /bookings —
// just opened with "tournament" preselected — and creating one always books
// the club's tables for it (see EventForm).
export default function CreateTournament() {
  const navigate = useNavigate();
  const { t } = useT();

  const onCreated = (created: any) => {
    const eventId = created?.tournament?.id || created?.id;
    if (eventId) navigate(`/tournament/${eventId}`); else navigate("/");
  };

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{t("create.title")}</h1>
      <EventForm defaultEventType="TOURNAMENT" onCreated={onCreated} />
    </Layout>
  );
}
