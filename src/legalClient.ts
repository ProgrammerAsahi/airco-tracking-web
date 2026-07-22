export type VatStatus = "registered" | "not_registered";

export type PublicLegalConfiguration = {
  readyForLivePayments: boolean;
  vatStatus: VatStatus | null;
  missingFields: string[];
};

export function parsePublicLegalConfiguration(value: unknown): PublicLegalConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_legal_configuration");
  }
  const record = value as Record<string, unknown>;
  const vatStatus = record.vatStatus;
  const missingFields = record.missingFields;
  if (
    typeof record.readyForLivePayments !== "boolean"
    || (vatStatus !== null && vatStatus !== "registered" && vatStatus !== "not_registered")
    || !Array.isArray(missingFields)
    || !missingFields.every((field) => typeof field === "string")
  ) {
    throw new Error("invalid_legal_configuration");
  }
  return {
    readyForLivePayments: record.readyForLivePayments,
    vatStatus,
    missingFields,
  };
}

export async function getPublicLegalConfiguration(signal?: AbortSignal): Promise<PublicLegalConfiguration> {
  const response = await fetch("/api/legal/config", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("legal_configuration_unavailable");
  return parsePublicLegalConfiguration(await response.json());
}
