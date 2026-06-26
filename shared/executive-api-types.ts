export type ExecutiveBillRole = "primary" | "conditional" | "related" | "mentioned";

export interface ExecutiveBillRef {
  congress: number;
  type: string;
  number: number;
  title?: string | null;
}

export interface ExecutiveBillLink extends ExecutiveBillRef {
  role: ExecutiveBillRole;
  confidence: number;
  rationale?: string;
}

export interface ExecutiveSignal {
  post_id: string;
  posted_at: string;
  /** LLM banner line for site alerts; not a substitute for the post quote. */
  summary: string;
  /** Verbatim Truth Social post text. */
  quote: string;
  source_url: string;
  archive_url?: string | null;
  informal: boolean;
}

export interface RelatedExecutiveBill extends ExecutiveBillRef {
  reason: string;
  role: ExecutiveBillRole;
}

export interface ExecutiveAlert extends ExecutiveSignal {
  linked_bills: ExecutiveBillLink[];
}

export interface ExecutiveAlertsResponse {
  alerts: ExecutiveAlert[];
}

export interface ExecutiveLinkLlmResult {
  linked_bills: ExecutiveBillLink[];
  banner_summary: string;
  informal: boolean;
}

export interface ExecutiveCatalogBill extends ExecutiveBillRef {
  title: string | null;
  headline: string | null;
  policy_area: string | null;
}
