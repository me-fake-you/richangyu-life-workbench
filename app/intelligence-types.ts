"use client";

export type FeedSource = {
  id: string;
  name: string;
  url: string;
  kind: string;
  authority: string;
  enabled: boolean;
  checkFrequency: string;
  lastCheckedAt: string | null;
};

export type FeedItem = {
  id: string;
  sourceId: string | null;
  kind: string;
  category: string;
  title: string;
  summary: string;
  importance: string;
  sourceUrl: string;
  sourceName: string;
  imageUrl: string;
  publishedAt: string | null;
  updatedAt: string;
  eventStatus: string;
  topics: string[];
  officialConfirmed: boolean;
  independentSources: number;
  unconfirmed: string;
  readStatus: string;
  isFavorite: boolean;
  isIgnored: boolean;
};

export type TopicSubscription = {
  id: string;
  kind: string;
  value: string;
  scope: string;
  priority: string;
  enabled: boolean;
};

export type ResearchPaper = {
  id: string;
  title: string;
  authors: string;
  organization: string;
  venue: string;
  publishedAt: string | null;
  paperUrl: string;
  codeUrl: string;
  projectUrl: string;
  researchQuestion: string;
  innovation: string;
  method: string;
  datasets: string;
  results: string;
  limitations: string;
  relevance: number;
  reproducibility: string;
  readingStatus: string;
  relatedProject: string;
  note: string;
  signal: {
    reviewScore: string;
    acceptanceStatus: string;
    venueLevel: string;
    heatSignal: string;
    citations: number;
    benchmarkSignal: string;
    codeAvailable: boolean;
    modelAvailable: boolean;
    dataAvailable: boolean;
  } | null;
};

export type JobOrganization = {
  id: string;
  name: string;
  kind: string;
  level: string;
  officialUrl: string;
  note: string;
};

export type JobPosting = {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  recruitmentBatch: string;
  organizationLevel: string;
  region: string;
  education: string;
  majors: string;
  openAt: string | null;
  deadlineAt: string | null;
  sourceUrl: string;
  openingStatus: string;
  lastCheckedAt: string | null;
  lastChange: string;
  sourceConfirmed: boolean;
  favorite: boolean;
  matchLevel: string;
  note: string;
  applicationId: string | null;
  applicationStatus: string | null;
};

export type JobChange = {
  id: string;
  postingId: string;
  postingTitle: string;
  organizationName: string;
  kind: string;
  summary: string;
  detectedAt: string;
  isImportant: boolean;
  acknowledged: boolean;
};

export type JobApplication = {
  id: string;
  postingId: string;
  postingTitle: string;
  organizationName: string;
  openingStatus: string;
  deadlineAt: string | null;
  status: string;
  appliedAt: string | null;
  nextAction: string;
  nextActionAt: string | null;
  resumeVersion: string;
  materialCompleteness: number;
  missingMaterials: string;
  note: string;
};

export type ApplicationEvent = {
  id: string;
  applicationId: string;
  postingTitle: string;
  organizationName: string;
  kind: string;
  title: string;
  startAt: string;
  endAt: string | null;
  place: string;
  link: string;
  reminderDays: number;
  status: string;
  scheduleId: string | null;
  note: string;
};

export type ApplicationDocument = {
  id: string;
  applicationId: string | null;
  name: string;
  kind: string;
  version: string;
  status: string;
  lastModifiedAt: string | null;
  filename: string | null;
  contentType: string | null;
  size: number;
  url: string | null;
  note: string;
};

export type AlertRule = {
  id: string;
  kind: string;
  targetId: string | null;
  title: string;
  triggerAt: string | null;
  leadDays: number[];
  priority: string;
  enabled: boolean;
};

export type IntelligenceData = {
  sources: FeedSource[];
  feedItems: FeedItem[];
  subscriptions: TopicSubscription[];
  papers: ResearchPaper[];
  organizations: JobOrganization[];
  postings: JobPosting[];
  changes: JobChange[];
  applications: JobApplication[];
  applicationEvents: ApplicationEvent[];
  documents: ApplicationDocument[];
  alerts: AlertRule[];
  monitorRuns: Array<{
    id: string;
    targetType: string;
    startedAt: string;
    completedAt: string | null;
    status: string;
    checkedCount: number;
    changedCount: number;
    message: string;
  }>;
  briefs: Array<{
    id: string;
    kind: string;
    title: string;
    content: string;
    periodStart: string;
    periodEnd: string;
    generatedBy: string;
    createdAt: string;
  }>;
  summary: {
    unreadNews: number;
    relevantNews: number;
    researchToRead: number;
    researchToReproduce: number;
    openJobs: number;
    urgentJobs: number;
    activeApplications: number;
    upcomingEvents: number;
  };
};

export const emptyIntelligenceData: IntelligenceData = {
  sources: [],
  feedItems: [],
  subscriptions: [],
  papers: [],
  organizations: [],
  postings: [],
  changes: [],
  applications: [],
  applicationEvents: [],
  documents: [],
  alerts: [],
  monitorRuns: [],
  briefs: [],
  summary: {
    unreadNews: 0,
    relevantNews: 0,
    researchToRead: 0,
    researchToReproduce: 0,
    openJobs: 0,
    urgentJobs: 0,
    activeApplications: 0,
    upcomingEvents: 0,
  },
};

export async function intelligenceAction(
  action: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch("/api/intelligence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error || "操作失败。"));
  }
  return body;
}
