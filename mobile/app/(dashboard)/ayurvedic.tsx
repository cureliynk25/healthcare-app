import { useTranslation } from "react-i18next";

import { ComingSoonScreen } from "@/components/dashboard/coming-soon-screen";

export default function Ayurvedic() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="leaf"
      title={t("dashboard.features.ayurvedic.title")}
      message={t("dashboard.comingSoon.genericMessage")}
    />
  );
}
