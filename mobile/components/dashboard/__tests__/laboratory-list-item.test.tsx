import { fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

import { LaboratoryListItem } from "@/components/dashboard/laboratory-list-item";
import type { Laboratory } from "@/lib/laboratories";

import { renderWithProviders } from "@/test/dashboard-test-utils";

const baseLab: Laboratory = {
  name: "Apex Diagnostics",
  address: "GS Road, Guwahati",
  distanceKm: 1.24,
  placeId: "place-1",
  mapsUrl: "https://maps.google.com/?cid=1",
};

describe("LaboratoryListItem", () => {
  let openURLSpy: jest.SpyInstance;

  beforeEach(() => {
    openURLSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  afterEach(() => {
    openURLSpy.mockRestore();
  });

  it("renders the lab's name, address and distance", async () => {
    const { getByText } = await renderWithProviders(<LaboratoryListItem laboratory={baseLab} />);

    expect(getByText("Apex Diagnostics")).toBeTruthy();
    expect(getByText("GS Road, Guwahati")).toBeTruthy();
    expect(getByText("1.2 km away")).toBeTruthy();
  });

  it("opens the lab in maps when pressed", async () => {
    const { getByText } = await renderWithProviders(<LaboratoryListItem laboratory={baseLab} />);

    fireEvent.press(getByText("Apex Diagnostics"));

    expect(openURLSpy).toHaveBeenCalledWith(baseLab.mapsUrl);
  });

  it("omits the distance when it is unknown", async () => {
    const lab: Laboratory = { ...baseLab, distanceKm: null };
    const { queryByText } = await renderWithProviders(<LaboratoryListItem laboratory={lab} />);

    expect(queryByText(/km away/)).toBeNull();
  });

  it("does nothing when there is no maps link", async () => {
    const lab: Laboratory = { ...baseLab, mapsUrl: null };
    const { getByText } = await renderWithProviders(<LaboratoryListItem laboratory={lab} />);

    fireEvent.press(getByText("Apex Diagnostics"));

    expect(openURLSpy).not.toHaveBeenCalled();
  });
});
