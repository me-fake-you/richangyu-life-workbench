import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const lifeEvents = sqliteTable(
  "life_events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    kind: text("kind").notNull().default("生活"),
    mood: text("mood").notNull().default("平静"),
    energy: integer("energy").notNull().default(3),
    tags: text("tags").notNull().default("[]"),
    person: text("person").notNull().default(""),
    place: text("place").notNull().default(""),
    project: text("project").notNull().default(""),
    isPrivate: integer("is_private", { mode: "boolean" })
      .notNull()
      .default(false),
    recordStatus: text("record_status").notNull().default("published"),
    revision: integer("revision").notNull().default(1),
    happenedAt: text("happened_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("life_events_happened_at_idx").on(table.happenedAt),
    index("life_events_kind_idx").on(table.kind),
  ],
);

export const lifeEventVersions = sqliteTable(
  "life_event_versions",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => lifeEvents.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: text("snapshot_json").notNull().default("{}"),
    changeNote: text("change_note").notNull().default(""),
    deviceId: text("device_id").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("life_event_versions_event_revision_unique").on(
      table.eventId,
      table.revision,
    ),
    index("life_event_versions_created_idx").on(table.createdAt),
  ],
);

export const recordDrafts = sqliteTable(
  "record_drafts",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").references(() => lifeEvents.id, {
      onDelete: "cascade",
    }),
    draft: text("draft_json").notNull().default("{}"),
    deviceId: text("device_id").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("record_drafts_updated_idx").on(table.updatedAt),
    uniqueIndex("record_drafts_event_device_unique").on(
      table.eventId,
      table.deviceId,
    ),
  ],
);

export const clientMutations = sqliteTable(
  "client_mutations",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull().default(""),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    action: text("action").notNull(),
    baseRevision: integer("base_revision").notNull().default(0),
    payload: text("payload_json").notNull().default("{}"),
    status: text("status").notNull().default("processed"),
    resultRevision: integer("result_revision").notNull().default(0),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processed_at"),
  },
  (table) => [
    index("client_mutations_device_created_idx").on(
      table.deviceId,
      table.createdAt,
    ),
    index("client_mutations_status_idx").on(table.status),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    deviceId: text("device_id").notNull().default(""),
    detail: text("detail_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => lifeEvents.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("media_event_id_idx").on(table.eventId)],
);

export const scheduleEvents = sqliteTable(
  "schedule_events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull().default("学习"),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    place: text("place").notNull().default(""),
    person: text("person").notNull().default(""),
    project: text("project").notNull().default(""),
    note: text("note").notNull().default(""),
    repeatRule: text("repeat_rule").notNull().default("不重复"),
    status: text("status").notNull().default("计划中"),
    plannedMinutes: integer("planned_minutes").notNull().default(0),
    actualMinutes: integer("actual_minutes").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("schedule_events_start_at_idx").on(table.startAt)],
);

export const inboxItems = sqliteTable(
  "inbox_items",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    sourceType: text("source_type").notNull().default("文字"),
    status: text("status").notNull().default("待整理"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("inbox_items_status_idx").on(table.status)],
);

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("表"),
  description: text("description").notNull().default(""),
  fields: text("fields").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const collectionRows = sqliteTable(
  "collection_rows",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    values: text("values_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("collection_rows_collection_idx").on(table.collectionId)],
);

export const scheduleRuleSettings = sqliteTable("schedule_rule_settings", {
  scheduleId: text("schedule_id")
    .primaryKey()
    .references(() => scheduleEvents.id, { onDelete: "cascade" }),
  repeatUntil: text("repeat_until"),
  reminderMinutes: integer("reminder_minutes").notNull().default(10),
  customInterval: integer("custom_interval").notNull().default(1),
  customUnit: text("custom_unit").notNull().default("week"),
  weekdays: text("weekdays").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const scheduleInstances = sqliteTable(
  "schedule_instances",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => scheduleEvents.id, { onDelete: "cascade" }),
    occurrenceStart: text("occurrence_start").notNull(),
    occurrenceEnd: text("occurrence_end").notNull(),
    status: text("status").notNull().default("计划中"),
    actualMinutes: integer("actual_minutes").notNull().default(0),
    actualStartAt: text("actual_start_at"),
    actualEndAt: text("actual_end_at"),
    interruptionReason: text("interruption_reason").notNull().default(""),
    reflection: text("reflection").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("schedule_instances_start_idx").on(table.occurrenceStart),
    uniqueIndex("schedule_instances_schedule_start_unique").on(
      table.scheduleId,
      table.occurrenceStart,
    ),
  ],
);

export const scheduleExceptions = sqliteTable(
  "schedule_exceptions",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => scheduleEvents.id, { onDelete: "cascade" }),
    occurrenceStart: text("occurrence_start").notNull(),
    reason: text("reason").notNull().default("取消本次"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("schedule_exceptions_schedule_start_unique").on(
      table.scheduleId,
      table.occurrenceStart,
    ),
  ],
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("个人目标"),
  status: text("status").notNull().default("进行中"),
  progress: integer("progress").notNull().default(0),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#76528b"),
  startAt: text("start_at"),
  targetAt: text("target_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  happenedAt: text("happened_at").notNull(),
  note: text("note").notNull().default(""),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerValue: text("trigger_value").notNull().default(""),
  actionType: text("action_type").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    runKey: text("run_key").notNull(),
    status: text("status").notNull().default("running"),
    scheduledFor: text("scheduled_for").notNull(),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: text("finished_at"),
    outcome: text("outcome_json").notNull().default("{}"),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("automation_runs_key_unique").on(
      table.automationId,
      table.runKey,
    ),
    index("automation_runs_started_idx").on(table.startedAt),
  ],
);

export const automationMessages = sqliteTable(
  "automation_messages",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => automationRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("reminder"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    actionTarget: text("action_target").notNull().default(""),
    dueAt: text("due_at").notNull(),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("automation_messages_run_unique").on(table.runId),
    index("automation_messages_unread_idx").on(table.readAt),
  ],
);

export const generatedSummaries = sqliteTable(
  "generated_summaries",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceIds: text("source_ids").notNull().default("[]"),
    generatedBy: text("generated_by").notNull().default("local"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("generated_summaries_period_unique").on(
      table.kind,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull().default("question"),
    prompt: text("prompt").notNull().default(""),
    startAt: text("start_at"),
    endAt: text("end_at"),
    status: text("status").notNull().default("pending"),
    answer: text("answer").notNull().default(""),
    provider: text("provider").notNull().default(""),
    model: text("model").notNull().default(""),
    sourceIds: text("source_ids").notNull().default("[]"),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("ai_tasks_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const privateVaultSettings = sqliteTable("private_vault_settings", {
  id: text("id").primaryKey().default("default"),
  credentialHash: text("credential_hash").notNull(),
  salt: text("salt").notNull(),
  lockTimeoutMinutes: integer("lock_timeout_minutes").notNull().default(30),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const photoInsights = sqliteTable(
  "photo_insights",
  {
    mediaId: text("media_id")
      .primaryKey()
      .references(() => media.id, { onDelete: "cascade" }),
    sha256: text("sha256"),
    perceptualHash: text("perceptual_hash"),
    blurScore: real("blur_score"),
    duplicateOf: text("duplicate_of"),
    isScreenshot: integer("is_screenshot", { mode: "boolean" })
      .notNull()
      .default(false),
    note: text("note").notNull().default(""),
    exifRemoved: integer("exif_removed", { mode: "boolean" })
      .notNull()
      .default(false),
    scannedAt: text("scanned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("photo_insights_sha_idx").on(table.sha256)],
);

export const photoMetadata = sqliteTable(
  "photo_metadata",
  {
    mediaId: text("media_id")
      .primaryKey()
      .references(() => media.id, { onDelete: "cascade" }),
    caption: text("caption").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    takenAt: text("taken_at"),
    place: text("place").notNull().default(""),
    latitude: real("latitude"),
    longitude: real("longitude"),
    album: text("album").notNull().default(""),
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(false),
    coverDate: text("cover_date"),
    hiddenFromMemories: integer("hidden_from_memories", { mode: "boolean" })
      .notNull()
      .default(false),
    visionProvider: text("vision_provider").notNull().default(""),
    visionModel: text("vision_model").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("photo_metadata_taken_at_idx").on(table.takenAt),
    index("photo_metadata_cover_date_idx").on(table.coverDate),
  ],
);

export const photoStories = sqliteTable(
  "photo_stories",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    coverMediaId: text("cover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    mediaIds: text("media_ids").notNull().default("[]"),
    generatedBy: text("generated_by").notNull().default("local"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("photo_stories_period_unique").on(
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const inboxAttachments = sqliteTable("inbox_attachments", {
  id: text("id").primaryKey(),
  inboxId: text("inbox_id")
    .notNull()
    .references(() => inboxItems.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  filename: text("filename").notNull().default(""),
  importedCount: integer("imported_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  status: text("status").notNull().default("已完成"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const backupOperations = sqliteTable(
  "backup_operations",
  {
    id: text("id").primaryKey(),
    operationType: text("operation_type").notNull(),
    scope: text("scope").notNull().default("metadata"),
    filename: text("filename").notNull().default(""),
    status: text("status").notNull().default("completed"),
    tableCount: integer("table_count").notNull().default(0),
    rowCount: integer("row_count").notNull().default(0),
    fileCount: integer("file_count").notNull().default(0),
    includePrivate: integer("include_private", { mode: "boolean" })
      .notNull()
      .default(false),
    strategy: text("strategy").notNull().default("skip"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    index("backup_operations_created_at_idx").on(table.createdAt),
  ],
);

export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    mealType: text("meal_type").notNull().default("午餐"),
    eatenAt: text("eaten_at").notNull(),
    note: text("note").notNull().default(""),
    estimatedCalories: real("estimated_calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    analysisProvider: text("analysis_provider").notNull().default("manual"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("meals_eaten_at_idx").on(table.eatenAt)],
);

export const mealItems = sqliteTable("meal_items", {
  id: text("id").primaryKey(),
  mealId: text("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  portion: text("portion").notNull().default(""),
  calories: real("calories").notNull().default(0),
  proteinG: real("protein_g").notNull().default(0),
  carbsG: real("carbs_g").notNull().default(0),
  fatG: real("fat_g").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mealMedia = sqliteTable("meal_media", {
  id: text("id").primaryKey(),
  mealId: text("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const nutritionSettings = sqliteTable("nutrition_settings", {
  id: text("id").primaryKey(),
  calorieTarget: integer("calorie_target").notNull().default(2000),
  proteinTarget: integer("protein_target").notNull().default(90),
  carbsTarget: integer("carbs_target").notNull().default(250),
  fatTarget: integer("fat_target").notNull().default(65),
  waterTarget: integer("water_target").notNull().default(8),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const waterLogs = sqliteTable("water_logs", {
  id: text("id").primaryKey(),
  glasses: integer("glasses").notNull().default(1),
  loggedAt: text("logged_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dashboardPreferences = sqliteTable("dashboard_preferences", {
  id: text("id").primaryKey(),
  layoutJson: text("layout_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const syncPreferences = sqliteTable("sync_preferences", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  deviceId: text("device_id").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const savedSearches = sqliteTable("saved_searches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  queryJson: text("query_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const collectionViews = sqliteTable("collection_views", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  viewType: text("view_type").notNull().default("table"),
  filterJson: text("filter_json").notNull().default("{}"),
  sortJson: text("sort_json").notNull().default("{}"),
  groupBy: text("group_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lifeRelations = sqliteTable("life_relations", {
  id: text("id").primaryKey(),
  fromEventId: text("from_event_id")
    .notNull()
    .references(() => lifeEvents.id, { onDelete: "cascade" }),
  toType: text("to_type").notNull(),
  toId: text("to_id").notNull(),
  label: text("label").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const financialAccounts = sqliteTable("financial_accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("现金"),
  color: text("color").notNull().default("#76528b"),
  initialBalance: real("initial_balance").notNull().default(0),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sideHustleClients = sqliteTable("side_hustle_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  paymentHabit: text("payment_habit").notNull().default(""),
  note: text("note").notNull().default(""),
  nextFollowUpAt: text("next_follow_up_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sideHustleProjects = sqliteTable(
  "side_hustle_projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("兼职"),
    clientId: text("client_id").references(() => sideHustleClients.id, {
      onDelete: "set null",
    }),
    billingMode: text("billing_mode").notNull().default("按小时"),
    unitRate: real("unit_rate").notNull().default(0),
    settlementCycle: text("settlement_cycle").notNull().default("每次结束"),
    status: text("status").notNull().default("进行中"),
    incomeTarget: real("income_target").notNull().default(0),
    startAt: text("start_at"),
    note: text("note").notNull().default(""),
    color: text("color").notNull().default("#477c6a"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("side_hustle_projects_client_idx").on(table.clientId)],
);

export const workSessions = sqliteTable(
  "work_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sideHustleProjects.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    minutes: integer("minutes").notNull().default(0),
    hiddenMinutes: integer("hidden_minutes").notNull().default(0),
    pausedAt: text("paused_at"),
    pausedMinutes: integer("paused_minutes").notNull().default(0),
    workContent: text("work_content").notNull().default(""),
    result: text("result").notNull().default(""),
    place: text("place").notNull().default(""),
    expectedIncome: real("expected_income").notNull().default(0),
    cost: real("cost").notNull().default(0),
    feeling: text("feeling").notNull().default(""),
    status: text("status").notNull().default("进行中"),
    lifeEventId: text("life_event_id").references(() => lifeEvents.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("work_sessions_project_idx").on(table.projectId),
    index("work_sessions_started_idx").on(table.startedAt),
  ],
);

export const receivables = sqliteTable(
  "receivables",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sideHustleProjects.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => sideHustleClients.id, {
      onDelete: "set null",
    }),
    workSessionId: text("work_session_id").references(() => workSessions.id, {
      onDelete: "set null",
    }),
    amountDue: real("amount_due").notNull().default(0),
    amountReceived: real("amount_received").notNull().default(0),
    dueAt: text("due_at"),
    status: text("status").notNull().default("待结算"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("receivables_project_idx").on(table.projectId),
    index("receivables_status_idx").on(table.status),
  ],
);

export const financeTransactions = sqliteTable(
  "finance_transactions",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull().default("支出"),
    amount: real("amount").notNull(),
    category: text("category").notNull().default("其他"),
    accountId: text("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    transferAccountId: text("transfer_account_id").references(
      () => financialAccounts.id,
      { onDelete: "set null" },
    ),
    project: text("project").notNull().default(""),
    sideHustleProjectId: text("side_hustle_project_id").references(
      () => sideHustleProjects.id,
      { onDelete: "set null" },
    ),
    workSessionId: text("work_session_id").references(() => workSessions.id, {
      onDelete: "set null",
    }),
    receivableId: text("receivable_id").references(() => receivables.id, {
      onDelete: "set null",
    }),
    relatedTransactionId: text("related_transaction_id"),
    splitGroupId: text("split_group_id"),
    recurringTransactionId: text("recurring_transaction_id"),
    occurredAt: text("occurred_at").notNull(),
    note: text("note").notNull().default(""),
    isPrivate: integer("is_private", { mode: "boolean" })
      .notNull()
      .default(true),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("finance_transactions_occurred_idx").on(table.occurredAt),
    index("finance_transactions_account_idx").on(table.accountId),
    index("finance_transactions_side_project_idx").on(
      table.sideHustleProjectId,
    ),
    index("finance_transactions_related_idx").on(table.relatedTransactionId),
    index("finance_transactions_split_idx").on(table.splitGroupId),
    uniqueIndex("finance_transactions_recurring_occurrence_unique").on(
      table.recurringTransactionId,
      table.occurredAt,
    ),
  ],
);

export const settlements = sqliteTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    transactionId: text("transaction_id").references(
      () => financeTransactions.id,
      { onDelete: "set null" },
    ),
    amount: real("amount").notNull(),
    receivedAt: text("received_at").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("settlements_receivable_idx").on(table.receivableId),
  ],
);

export const financeBudgets = sqliteTable(
  "finance_budgets",
  {
    id: text("id").primaryKey(),
    month: text("month").notNull(),
    category: text("category").notNull(),
    amount: real("amount").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("finance_budgets_month_category_unique").on(
      table.month,
      table.category,
    ),
  ],
);

export const savingsGoals = sqliteTable("savings_goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  targetAmount: real("target_amount").notNull().default(0),
  savedAmount: real("saved_amount").notNull().default(0),
  targetAt: text("target_at"),
  color: text("color").notNull().default("#76528b"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const recurringTransactions = sqliteTable("recurring_transactions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("支出"),
  amount: real("amount").notNull().default(0),
  category: text("category").notNull().default("订阅服务"),
  accountId: text("account_id").references(() => financialAccounts.id, {
    onDelete: "set null",
  }),
  frequency: text("frequency").notNull().default("每月"),
  nextAt: text("next_at").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const financeDocuments = sqliteTable("finance_documents", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").references(
    () => financeTransactions.id,
    { onDelete: "cascade" },
  ),
  settlementId: text("settlement_id").references(() => settlements.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull().default("票据"),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const financeSettings = sqliteTable("finance_settings", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull().default("simple"),
  maskAmounts: integer("mask_amounts", { mode: "boolean" })
    .notNull()
    .default(false),
  showInTimeline: text("show_in_timeline").notNull().default("summary"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const feedSources = sqliteTable("feed_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("新闻"),
  authority: text("authority").notNull().default("媒体"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  checkFrequency: text("check_frequency").notNull().default("每日"),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const feedItems = sqliteTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").references(() => feedSources.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("新闻"),
    category: text("category").notNull().default("科技与AI"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    importance: text("importance").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    sourceName: text("source_name").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    publishedAt: text("published_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    eventStatus: text("event_status").notNull().default("待确认"),
    topics: text("topics").notNull().default("[]"),
    officialConfirmed: integer("official_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    independentSources: integer("independent_sources").notNull().default(1),
    unconfirmed: text("unconfirmed").notNull().default(""),
    readStatus: text("read_status").notNull().default("未读"),
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(false),
    isIgnored: integer("is_ignored", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("feed_items_updated_idx").on(table.updatedAt),
    index("feed_items_category_idx").on(table.category),
  ],
);

export const topicSubscriptions = sqliteTable(
  "topic_subscriptions",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("主题"),
    value: text("value").notNull(),
    scope: text("scope").notNull().default("全部"),
    priority: text("priority").notNull().default("普通"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("topic_subscriptions_kind_value_unique").on(
      table.kind,
      table.value,
    ),
  ],
);

export const researchPapers = sqliteTable(
  "research_papers",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    authors: text("authors").notNull().default(""),
    organization: text("organization").notNull().default(""),
    venue: text("venue").notNull().default(""),
    publishedAt: text("published_at"),
    paperUrl: text("paper_url").notNull().default(""),
    codeUrl: text("code_url").notNull().default(""),
    projectUrl: text("project_url").notNull().default(""),
    researchQuestion: text("research_question").notNull().default(""),
    innovation: text("innovation").notNull().default(""),
    method: text("method").notNull().default(""),
    datasets: text("datasets").notNull().default(""),
    results: text("results").notNull().default(""),
    limitations: text("limitations").notNull().default(""),
    relevance: integer("relevance").notNull().default(0),
    reproducibility: text("reproducibility").notNull().default("待判断"),
    readingStatus: text("reading_status").notNull().default("新发现"),
    relatedProject: text("related_project").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("research_papers_status_idx").on(table.readingStatus),
    index("research_papers_published_idx").on(table.publishedAt),
  ],
);

export const paperSignals = sqliteTable(
  "paper_signals",
  {
    id: text("id").primaryKey(),
    paperId: text("paper_id")
      .notNull()
      .references(() => researchPapers.id, { onDelete: "cascade" }),
    reviewScore: text("review_score").notNull().default("未公开"),
    acceptanceStatus: text("acceptance_status").notNull().default("未公开"),
    venueLevel: text("venue_level").notNull().default(""),
    heatSignal: text("heat_signal").notNull().default(""),
    citations: integer("citations").notNull().default(0),
    benchmarkSignal: text("benchmark_signal").notNull().default(""),
    codeAvailable: integer("code_available", { mode: "boolean" })
      .notNull()
      .default(false),
    modelAvailable: integer("model_available", { mode: "boolean" })
      .notNull()
      .default(false),
    dataAvailable: integer("data_available", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("paper_signals_paper_idx").on(table.paperId)],
);

export const jobOrganizations = sqliteTable("job_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("银行"),
  level: text("level").notNull().default("总行"),
  officialUrl: text("official_url").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const jobPostings = sqliteTable(
  "job_postings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => jobOrganizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    recruitmentBatch: text("recruitment_batch").notNull().default("秋招"),
    organizationLevel: text("organization_level").notNull().default("总行"),
    region: text("region").notNull().default("全国"),
    education: text("education").notNull().default("硕士"),
    majors: text("majors").notNull().default(""),
    openAt: text("open_at"),
    deadlineAt: text("deadline_at"),
    sourceUrl: text("source_url").notNull().default(""),
    openingStatus: text("opening_status").notNull().default("信息待确认"),
    lastCheckedAt: text("last_checked_at"),
    lastChange: text("last_change").notNull().default(""),
    sourceConfirmed: integer("source_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    favorite: integer("favorite", { mode: "boolean" })
      .notNull()
      .default(false),
    matchLevel: text("match_level").notNull().default("待评估"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("job_postings_deadline_idx").on(table.deadlineAt),
    index("job_postings_status_idx").on(table.openingStatus),
  ],
);

export const jobSnapshots = sqliteTable(
  "job_snapshots",
  {
    id: text("id").primaryKey(),
    postingId: text("posting_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    pageTitle: text("page_title").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    checkedAt: text("checked_at").notNull(),
    httpStatus: integer("http_status").notNull().default(200),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("job_snapshots_posting_idx").on(table.postingId)],
);

export const jobChanges = sqliteTable(
  "job_changes",
  {
    id: text("id").primaryKey(),
    postingId: text("posting_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("页面变化"),
    summary: text("summary").notNull(),
    beforeText: text("before_text").notNull().default(""),
    afterText: text("after_text").notNull().default(""),
    detectedAt: text("detected_at").notNull(),
    isImportant: integer("is_important", { mode: "boolean" })
      .notNull()
      .default(false),
    acknowledged: integer("acknowledged", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("job_changes_posting_idx").on(table.postingId)],
);

export const jobApplications = sqliteTable(
  "job_applications",
  {
    id: text("id").primaryKey(),
    postingId: text("posting_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("待了解"),
    appliedAt: text("applied_at"),
    nextAction: text("next_action").notNull().default(""),
    nextActionAt: text("next_action_at"),
    resumeVersion: text("resume_version").notNull().default(""),
    materialCompleteness: integer("material_completeness")
      .notNull()
      .default(0),
    missingMaterials: text("missing_materials").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("job_applications_posting_unique").on(table.postingId),
    index("job_applications_status_idx").on(table.status),
  ],
);

export const applicationEvents = sqliteTable(
  "application_events",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => jobApplications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("网申"),
    title: text("title").notNull(),
    startAt: text("start_at").notNull(),
    endAt: text("end_at"),
    place: text("place").notNull().default(""),
    link: text("link").notNull().default(""),
    reminderDays: integer("reminder_days").notNull().default(1),
    status: text("status").notNull().default("待完成"),
    scheduleId: text("schedule_id"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("application_events_start_idx").on(table.startAt)],
);

export const applicationDocuments = sqliteTable(
  "application_documents",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").references(
      () => jobApplications.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("简历"),
    version: text("version").notNull().default("V1"),
    status: text("status").notNull().default("可用"),
    lastModifiedAt: text("last_modified_at"),
    objectKey: text("object_key").unique(),
    filename: text("filename"),
    contentType: text("content_type"),
    size: integer("size").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("application_documents_application_idx").on(table.applicationId),
  ],
);

export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("截止提醒"),
  targetId: text("target_id"),
  title: text("title").notNull(),
  triggerAt: text("trigger_at"),
  leadDays: text("lead_days").notNull().default("[7,3,1,0]"),
  priority: text("priority").notNull().default("普通"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const monitorRuns = sqliteTable(
  "monitor_runs",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull().default("岗位"),
    targetId: text("target_id"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    status: text("status").notNull().default("进行中"),
    checkedCount: integer("checked_count").notNull().default(0),
    changedCount: integer("changed_count").notNull().default(0),
    message: text("message").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("monitor_runs_started_idx").on(table.startedAt)],
);
