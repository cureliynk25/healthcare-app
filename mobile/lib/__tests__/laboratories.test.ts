import { distanceKm, findNearbyLaboratories } from "@/lib/laboratories";

const mockMedicalRequest = jest.fn();

jest.mock("@/lib/medical-api", () => ({
  medicalRequest: (...args: unknown[]) => mockMedicalRequest(...args),
}));

// Guwahati city centre.
const origin = { lat: 26.1445, lng: 91.7362 };

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(origin, origin)).toBeCloseTo(0, 5);
  });

  it("matches a known distance (Guwahati to Shillong is about 98 km)", () => {
    const shillong = { lat: 25.5788, lng: 91.8933 };
    expect(distanceKm(origin, shillong)).toBeGreaterThan(60);
    expect(distanceKm(origin, shillong)).toBeLessThan(110);
  });
});

describe("findNearbyLaboratories", () => {
  beforeEach(() => {
    mockMedicalRequest.mockReset();
  });

  it("asks the backend with a GET and the location in the query string", async () => {
    mockMedicalRequest.mockResolvedValue({ count: 0, laboratories: [] });

    await findNearbyLaboratories(origin, { radiusKm: 5, limit: 8 });

    const [path, body, options] = mockMedicalRequest.mock.calls[0];
    expect(path).toContain("/api/v1/medical/laboratories/nearby?");
    expect(path).toContain("latitude=26.1445");
    expect(path).toContain("longitude=91.7362");
    expect(path).toContain("radius_km=5");
    expect(path).toContain("limit=8");
    expect(body).toBeUndefined();
    expect(options.method).toBe("GET");
  });

  it("sorts nearest first, and puts labs with no coordinates last", async () => {
    mockMedicalRequest.mockResolvedValue({
      count: 3,
      laboratories: [
        { name: "No coords", address: "Somewhere", place_id: "c" },
        { name: "Far Lab", address: "Far", latitude: 26.25, longitude: 91.85, place_id: "b" },
        { name: "Near Lab", address: "Near", latitude: 26.146, longitude: 91.737, place_id: "a" },
      ],
    });

    const labs = await findNearbyLaboratories(origin);

    expect(labs.map((lab) => lab.name)).toEqual(["Near Lab", "Far Lab", "No coords"]);
    expect(labs[0].distanceKm).toBeLessThan(labs[1].distanceKm as number);
    expect(labs[2].distanceKm).toBeNull();
  });

  it("uses Google's Maps link, and builds one from coordinates when it is missing", async () => {
    mockMedicalRequest.mockResolvedValue({
      count: 3,
      laboratories: [
        { name: "Has link", latitude: 26.15, longitude: 91.74, place_id: "a", google_maps_url: "https://maps.google.com/?cid=1" },
        { name: "Coords only", latitude: 26.16, longitude: 91.75, place_id: "b" },
        { name: "Nothing", place_id: "c" },
      ],
    });

    const labs = await findNearbyLaboratories(origin);
    const byName = Object.fromEntries(labs.map((lab) => [lab.name, lab]));

    expect(byName["Has link"].mapsUrl).toBe("https://maps.google.com/?cid=1");
    expect(byName["Coords only"].mapsUrl).toContain("query=26.16,91.75");
    expect(byName["Nothing"].mapsUrl).toBeNull();
  });

  it("fills in a name and a stable key when the backend omits them", async () => {
    mockMedicalRequest.mockResolvedValue({
      count: 1,
      laboratories: [{ latitude: 26.15, longitude: 91.74, place_id: null, name: null, address: "MG Road" }],
    });

    const [lab] = await findNearbyLaboratories(origin);

    expect(lab.name).toBe("Medical Laboratory");
    expect(lab.placeId).toBe("Medical Laboratory|MG Road");
  });

  it("returns an empty list when the reply has none", async () => {
    mockMedicalRequest.mockResolvedValue({ count: 0 });

    await expect(findNearbyLaboratories(origin)).resolves.toEqual([]);
  });

  it("lets a backend failure propagate so the screen can show an error", async () => {
    mockMedicalRequest.mockRejectedValue(new Error("503"));

    await expect(findNearbyLaboratories(origin)).rejects.toThrow("503");
  });
});
