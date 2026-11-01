import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Linking, Text, TouchableOpacity, View } from "react-native";

import type { Laboratory } from "@/lib/laboratories";
import { useThemeColors } from "@/lib/theme";

export function LaboratoryListItem({ laboratory }: { laboratory: Laboratory }) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <TouchableOpacity
      onPress={() => {
        if (laboratory.mapsUrl) Linking.openURL(laboratory.mapsUrl);
      }}
      disabled={laboratory.mapsUrl === null}
      activeOpacity={0.7}
      className="flex-row items-center gap-3 rounded-2xl bg-card dark:bg-card-dark border border-line dark:border-line-dark p-4 mb-3"
    >
      <View className="w-10 h-10 rounded-full items-center justify-center bg-brand/10">
        <Ionicons name="flask" size={18} color={colors.brand} />
      </View>

      <View className="flex-1">
        <Text className="text-content dark:text-content-dark text-sm font-bold">{laboratory.name}</Text>
        {laboratory.address ? (
          <Text className="text-muted dark:text-muted-dark text-xs mt-1">{laboratory.address}</Text>
        ) : null}
        {laboratory.distanceKm !== null ? (
          <Text className="text-brand-dark dark:text-brand text-xs font-semibold mt-2">
            {t("dashboard.doctorsResults.distanceAway", { distance: laboratory.distanceKm.toFixed(1) })}
          </Text>
        ) : null}
      </View>

      {laboratory.mapsUrl ? <Ionicons name="navigate-outline" size={20} color={colors.icon} /> : null}
    </TouchableOpacity>
  );
}
