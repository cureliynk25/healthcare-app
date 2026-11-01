import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Linking, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LaboratoryListItem } from "@/components/dashboard/laboratory-list-item";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { findNearbyLaboratories, type Laboratory } from "@/lib/laboratories";
import { useThemeColors } from "@/lib/theme";

type RequestState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; laboratories: Laboratory[] };

export function LabsNearMeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state: locationState, retry: retryLocation } = useCurrentLocation();
  // Bumped by "Try again" so a retry genuinely re-runs the effect: it is part
  // of the request key, and nothing else about the search changes.
  const [attempt, setAttempt] = useState(0);

  // What the current location describes. Null while there is nowhere to search.
  const requestKey =
    locationState.status === "granted"
      ? `${attempt}|${locationState.coords.lat},${locationState.coords.lng}`
      : null;

  const [resolved, setResolved] = useState<{ key: string; state: RequestState } | null>(null);

  // Derived during render: a result carrying an older key belongs to a search
  // we have moved on from, so it reads as "loading" rather than showing stale
  // labs for a frame.
  const requestState: RequestState =
    resolved !== null && resolved.key === requestKey ? resolved.state : { status: "loading" };

  useEffect(() => {
    if (locationState.status !== "granted" || requestKey === null) return;

    const controller = new AbortController();

    findNearbyLaboratories(locationState.coords, { signal: controller.signal })
      .then((laboratories) => {
        if (!controller.signal.aborted) {
          setResolved({ key: requestKey, state: { status: "success", laboratories } });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setResolved({ key: requestKey, state: { status: "error" } });
      });

    return () => controller.abort();
  }, [locationState, requestKey]);

  const renderBody = () => {
    if (locationState.status === "denied") {
      return (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Ionicons name="location-outline" size={40} color={colors.icon} />
          <Text className="text-content dark:text-content-dark text-base font-bold text-center">
            {t("dashboard.doctorsResults.locationDeniedTitle")}
          </Text>
          <Text className="text-muted dark:text-muted-dark text-sm text-center">
            {t("dashboard.doctorsResults.locationDeniedMessage")}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openSettings()}
            className="bg-brand-dark dark:bg-brand rounded-full px-5 py-2.5 mt-2"
          >
            <Text className="text-white dark:text-[#052E16] text-sm font-semibold">
              {t("dashboard.doctorsResults.openSettings")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={retryLocation} className="mt-1">
            <Text className="text-brand-dark dark:text-brand text-sm font-semibold">
              {t("dashboard.doctorsResults.tryAgain")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (locationState.status === "error" || requestState.status === "error") {
      return (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Ionicons name="alert-circle-outline" size={40} color={colors.icon} />
          <Text className="text-muted dark:text-muted-dark text-sm text-center">
            {t("dashboard.doctorsResults.genericError")}
          </Text>
          <TouchableOpacity
            onPress={locationState.status === "error" ? retryLocation : () => setAttempt((n) => n + 1)}
            className="bg-brand-dark dark:bg-brand rounded-full px-5 py-2.5 mt-2"
          >
            <Text className="text-white dark:text-[#052E16] text-sm font-semibold">
              {t("dashboard.doctorsResults.tryAgain")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (locationState.status === "loading" || requestState.status === "loading") {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
          <Text className="text-muted dark:text-muted-dark text-sm mt-3">
            {t("dashboard.labsResults.loading")}
          </Text>
        </View>
      );
    }

    if (requestState.laboratories.length === 0) {
      return (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="flask-outline" size={40} color={colors.icon} />
          <Text className="text-muted dark:text-muted-dark text-sm text-center mt-3">
            {t("dashboard.labsResults.emptyResults")}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={requestState.laboratories}
        keyExtractor={(item) => item.placeId}
        renderItem={({ item }) => <LaboratoryListItem laboratory={item} />}
        contentContainerStyle={{ padding: 20 }}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark">
      <View className="flex-row items-center px-5 pt-2 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          className="w-10 h-10 items-center justify-center -ml-2"
        >
          <Ionicons name="arrow-back" size={24} color={colors.content} />
        </TouchableOpacity>
        <Text className="text-content dark:text-content-dark text-lg font-bold ml-1">
          {t("dashboard.features.labsNearMe.title")}
        </Text>
      </View>
      {renderBody()}
    </SafeAreaView>
  );
}
