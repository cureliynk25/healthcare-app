import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type DashboardFeatureId = "medicineReminder" | "labsNearMe" | "healthInsurance" | "ayurvedic";

export type DashboardFeatureOption = {
  id: DashboardFeatureId;
  icon: ComponentProps<typeof Ionicons>["name"];
  badgeColor: string;
  route: "/medicine-reminder" | "/labs-near-me" | "/health-insurance" | "/ayurvedic";
};

export const DASHBOARD_FEATURE_OPTIONS: DashboardFeatureOption[] = [
  { id: "medicineReminder", icon: "alarm", badgeColor: "#0EA5E9", route: "/medicine-reminder" },
  { id: "labsNearMe", icon: "flask", badgeColor: "#7C3AED", route: "/labs-near-me" },
  { id: "healthInsurance", icon: "shield-checkmark", badgeColor: "#16A34A", route: "/health-insurance" },
  { id: "ayurvedic", icon: "leaf", badgeColor: "#F59E0B", route: "/ayurvedic" },
];
