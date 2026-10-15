import { MobileActionError } from "./mobile-actions.mjs";
const fail = (message, status = 422) => { throw new MobileActionError(status, message); };
const text = (id, label, max, extra = {}) => ({ id, label, type: "text", max, ...extra });
const date = (id, label, nullable = true) => ({ id, label, type: "datetime", nullable });
const money = (id, label, extra = {}) => ({ id, label, type: "money", ...extra });
const ref = (id, label, source, nullable = true) => ({ id, label, type: "reference", source, nullable });
const field = (id, label, type, extra = {}) => ({ id, label, type, ...extra });
const transactionFields = [field("type", "账目类型（编辑时不可转换）", "choice", { choices: ["收入", "支出", "转账"], locked: true }),
  money("amount", "实际金额（元）"), text("category", "分类", 100), ref("accountId", "账户", "accounts"),
  ref("transferAccountId", "转入账户（仅转账）", "accounts"), date("occurredAt", "发生时间（北京时间）", false),
  field("note", "备注", "note", { max: 2000 })];
const definitions = {
  goal: { table: "projects", title: "目标管理", financial: false, fields: [
    text("title", "目标名称", 160), text("kind", "目标类型", 40, { default: "个人目标" }),
    field("status", "状态", "choice", { choices: ["规划中", "未开始", "进行中", "已暂停", "暂停", "已完成", "已取消", "已归档"], default: "进行中" }),
    field("progress", "已存进度（0至100）", "integer", { min: 0, max: 100, default: 0 }),
    field("description", "目标说明", "note", { max: 2000 }), date("startAt", "开始时间"), date("targetAt", "目标时间"),
  ] },
  milestone: { table: "milestones", title: "里程碑", financial: false, fields: [
    text("title", "里程碑名称", 180), ref("projectId", "关联目标", "goals"),
    date("happenedAt", "里程碑时间（北京时间）", false), field("note", "说明", "note", { max: 1000 }),
    field("completed", "已完成", "boolean", { default: false }),
  ] },
  account: { table: "financial_accounts", title: "账户管理", financial: true, fields: [
    text("name", "账户名称", 100), text("type", "类型", 40, { default: "现金" }),
    money("initialBalance", "初始余额（元，可为负数）", { signed: true, zero: true, default: "0.00" }),
    field("isArchived", "归档账户（保留历史，不再用于新增）", "boolean", { default: false }),
  ] },
  budget: { table: "finance_budgets", title: "分类预算", financial: true, fields: [
    field("month", "预算月份（例如2026-10）", "month"), text("category", "分类（与账目分类完全一致）", 100),
    money("amount", "预算金额（元）", { zero: true, default: "0.00" }), field("note", "说明", "note", { max: 1000 }),
  ] },
  savings: { table: "savings_goals", title: "储蓄目标", financial: true, fields: [
    text("title", "储蓄目标名称", 160), money("targetAmount", "目标金额（元）"),
    money("savedAmount", "手动登记的已储蓄金额（元）", { zero: true, default: "0.00" }), date("targetAt", "目标时间"),
  ] },
  transaction: { table: "finance_transactions", title: "已有账目", financial: true, create: false, fields: transactionFields },
  transfer: { table: "finance_transactions", title: "账户转账", financial: true, update: false, fields: [
    money("amount", "转账金额（元）"), ref("accountId", "转出账户", "accounts", false),
    ref("transferAccountId", "转入账户", "accounts", false), date("occurredAt", "转账时间（北京时间）", false),
    field("note", "备注", "note", { max: 2000 }),
  ] },
};
const columns = { startAt: "start_at", targetAt: "target_at", happenedAt: "happened_at", projectId: "project_id",
  initialBalance: "initial_balance", isArchived: "is_archived", targetAmount: "target_amount", savedAmount: "saved_amount",
  accountId: "account_id", transferAccountId: "transfer_account_id", occurredAt: "occurred_at" };
const col = id => columns[id] || id;
const plain = value => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => plain(value) && keys.length === Object.keys(value).length && keys.every(key => Object.hasOwn(value, key));
const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f]/.test(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const revisionPattern = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const timestamp = value => typeof value === "string" && /^(20\d{2}|2100)-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const boundedMonth = value => typeof value === "string" && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
export const managementRevision = row => hash(JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]])));
function decimal(value, spec) {
  if (typeof value !== "string" || !(spec.signed ? /^-?(0|[1-9]\d{0,6})(\.\d{1,2})?$/ : /^(0|[1-9]\d{0,6})(\.\d{1,2})?$/).test(value))
    fail(spec.label + "须为最多两位小数的数字。");
  const negative = value.startsWith("-"), parts = value.replace(/^-/, "").split(".");
  const cents = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
  if ((!spec.zero && cents === 0) || cents > 999999999) fail(spec.label + "超出范围。");
  return (negative && cents ? "-" : "") + Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0");
}
export function managementValues(section, input) {
  const def = definitions[section];
  if (!def || !exact(input, def.fields.map(f => f.id))) fail("管理字段不完整或含未知字段。");
  const output = {};
  for (const spec of def.fields) {
    const value = input[spec.id];
    if (spec.type === "money") output[spec.id] = decimal(value, spec);
    else if (spec.type === "boolean") {
      if (typeof value !== "boolean") fail(spec.label + "无效。");
      output[spec.id] = value;
    } else if (spec.type === "integer") {
      if (!Number.isInteger(value) || value < spec.min || value > spec.max) fail(spec.label + "超出范围。");
      output[spec.id] = value;
    } else if (spec.type === "reference") {
      if (!(spec.nullable && value === null) && !identifier(value)) fail(spec.label + "无效。");
      output[spec.id] = value;
    } else if (spec.type === "datetime") {
      if (!(spec.nullable && value === null) && !timestamp(value)) fail(spec.label + "无效，请重新选择。");
      output[spec.id] = value;
    } else if (spec.type === "choice") {
      if (!spec.choices.includes(value)) fail(spec.label + "暂不支持，请在网页版处理原状态。");
      output[spec.id] = value;
    } else if (spec.type === "month") {
      if (!boundedMonth(value)) fail("预算月份无效。");
      output[spec.id] = value;
    } else {
      if (typeof value !== "string" || value.length > spec.max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ||
          (spec.type !== "note" && !value.trim())) fail(spec.label + "为空、过长或含无效字符。");
      output[spec.id] = spec.type === "note" ? value : value.trim();
    }
  }
  if (section === "goal" && output.startAt && output.targetAt && Date.parse(output.targetAt) < Date.parse(output.startAt))
    fail("目标时间不能早于开始时间。");
  if (section === "transaction" || section === "transfer") {
    const transfer = section === "transfer" || output.type === "转账";
    if (transfer && (!output.accountId || !output.transferAccountId || output.accountId === output.transferAccountId))
      fail("转账需要两个不同的有效账户。");
    if (!transfer && output.transferAccountId !== null) fail("普通收支不能指定转入账户。");
  }
  return output;
}
function rowValues(section, row) {
  const values = {};
  for (const spec of definitions[section].fields) {
    const raw = row[col(spec.id)];
    if (spec.type === "money") {
      const value = Number(raw);
      values[spec.id] = raw !== null && Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001
        ? value.toFixed(2) : String(raw ?? "");
    } else if (spec.type === "boolean") values[spec.id] = raw === 1 ? true : raw === 0 ? false : raw;
    else if (spec.type === "datetime") {
      const source = raw == null ? null : String(raw);
      const legacy = source && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(source) ? source.replace(" ", "T") + ".000Z" : source;
      const candidate = legacy && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(legacy) ? legacy.slice(0,-1) + ".000Z" : legacy;
      values[spec.id] = candidate && timestamp(candidate) ? candidate : source;
    } else if (spec.type === "reference") values[spec.id] = raw == null || raw === "" ? null : String(raw);
    else values[spec.id] = raw ?? (spec.type === "note" ? "" : null);
  }
  return values;
}
function protectedTransaction(row) {
  return row.deleted_at !== null || !["收入", "支出", "转账"].includes(row.type) ||
    ["side_hustle_project_id", "work_session_id", "receivable_id", "related_transaction_id", "split_group_id", "recurring_transaction_id"]
      .some(key => row[key] !== null && row[key] !== "");
}
const incomingSql = "EXISTS(SELECT 1 FROM finance_transactions child WHERE child.related_transaction_id=p.id AND child.deleted_at IS NULL) OR " +
  "EXISTS(SELECT 1 FROM settlements st WHERE st.transaction_id=p.id)";
async function incomingLinks(DB, ids) {
  if (!ids.length) return new Set();
  const result = await DB.prepare("SELECT p.id FROM finance_transactions p WHERE p.id IN (" +
    ids.map(() => "?").join(",") + ") AND (" + incomingSql + ")").bind(...ids).all();
  return new Set(resultRows(result).map(row => row.id));
}
export function managementOptions(params) {
  const keys = [...params.keys()];
  if (keys.some(k => !["section", "page"].includes(k)) || new Set(keys).size !== keys.length) fail("管理读取参数无效。");
  const section = params.get("section"), page = params.get("page") ?? "0";
  if (!Object.hasOwn(definitions, section) || !/^(0|[1-9]\d{0,2})$/.test(page)) fail("管理页面或页码无效。");
  return { section, page: Number(page) };
}
const resultRows = response => {
  if (!response || response.success === false || !Array.isArray(response.results)) throw new Error("Management read failed");
  return response.results;
};
export async function readManagement(DB, options, now = Date.now()) {
  const def = definitions[options.section];
  if (!def) fail("管理页面无效。");
  const financialTable = ["transaction", "transfer"].includes(options.section);
  const where = financialTable ? " WHERE deleted_at IS NULL" + (options.section === "transfer" ? " AND type='转账'" : "") : "";
  const response = await DB.batch([
    DB.prepare("SELECT * FROM " + def.table + where + " ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?").bind(options.page * 50),
    DB.prepare("SELECT COUNT(*) AS count FROM " + def.table + where),
    DB.prepare(def.fields.some(f => f.source === "goals") ? "SELECT id,title FROM projects ORDER BY updated_at DESC,id LIMIT 201" : "SELECT id,title FROM projects WHERE 0=1"),
    DB.prepare(def.fields.some(f => f.source === "accounts") ? "SELECT id,name FROM financial_accounts WHERE is_archived=0 ORDER BY created_at,id LIMIT 201" : "SELECT id,name FROM financial_accounts WHERE 0=1"),
  ]);
  const [rows, counts, goals, accounts] = response.map(resultRows);
  const fields = def.fields.map(spec => ({ ...spec, options: spec.type === "reference"
    ? (spec.source === "goals" ? goals : accounts).slice(0, 200).map(r => ({ id: r.id, label: String(r.title || r.name).slice(0, 200) }))
    : spec.choices?.map(v => ({ id: v, label: v })) || [],
    default: spec.default ?? (spec.type === "datetime" ? spec.nullable ? null : new Date(now).toISOString() :
      spec.type === "reference" ? null : spec.type === "month" ? new Date(now + 28800000).toISOString().slice(0, 7) :
      spec.type === "boolean" ? false : spec.type === "note" ? "" : spec.type === "choice" ? spec.choices[0] : "") }));
  const linked = financialTable ? await incomingLinks(DB, rows.slice(0, 50).map(row => row.id)) : new Set();
  const items = [];
  for (const row of rows.slice(0, 50)) {
    let editable = def.update !== false && !(financialTable && (protectedTransaction(row) || linked.has(row.id)));
    const values = rowValues(options.section, row);
    try { managementValues(options.section, values); } catch { editable = false; }
    const title = String(row.title || row.name || row.category || row.type || "未命名").slice(0, 200);
    items.push({ id: row.id, title, values, revision: await managementRevision(row), editable,
      removable: options.section === "transaction" && !protectedTransaction(row) && !linked.has(row.id),
      description: editable ? "编辑需明确确认，不自动更改其他业务记录。" : "关联账目、旧状态或原始数据格式受保护，请在原业务入口处理。" });
  }
  return { schemaVersion: 1, managementActions: true, section: options.section, title: def.title, page: options.page,
    nextPage: rows.length > 50 && options.page < 999 ? options.page + 1 : null,
    truncated: rows.length > 50 && options.page === 999, choicesTruncated: goals.length > 200 || accounts.length > 200,
    total: Number(counts[0]?.count || 0), readAt: new Date(now).toISOString(), financial: def.financial,
    createAllowed: def.create !== false, fields, items,
    notice: "每页50项，引用选项最多200项；仅本次读取，不是离线完整副本。修改需完整版本一致，冲突时不会覆盖网页新内容。" +
      (def.financial ? "金额默认隐藏。本页不连接银行、不调用AI。初始余额会影响历史余额；储蓄仅手工进度，不自动转账。" :
        "完成目标不会完成关联任务或日程；已存目标进度不会自动推算。") };
}
function normalizeCommand(action, payload) {
  if (!["manage.create", "manage.update", "manage.remove"].includes(action)) fail("不支持这个管理操作。");
  const keys = action === "manage.create" ? ["section", "values"] : ["section", "values", "id", "expectedRevision"];
  if (!exact(payload, keys) || !Object.hasOwn(definitions, payload.section)) fail("管理提交字段无效。");
  const def = definitions[payload.section];
  if (action === "manage.create" && def.create === false) fail("新增普通收支请使用记账入口。");
  if (action !== "manage.create" && (!identifier(payload.id) || !revisionPattern(payload.expectedRevision))) fail("缺少有效版本，请重新读取。");
  if (action === "manage.update" && def.update === false) fail("已有转账请到已有账目入口编辑。");
  if (action === "manage.remove" && (payload.section !== "transaction" || !exact(payload.values, []))) fail("只允许软删除未关联的普通账目。");
  const values = action === "manage.remove" ? {} : managementValues(payload.section, payload.values);
  return { section: payload.section, values, ...(action === "manage.create" ? {} : { id: payload.id, expectedRevision: payload.expectedRevision }) };
}
export async function applyManagement(DB, subject, input, now = Date.now()) {
  if (typeof subject !== "string" || !subject || subject.length > 500) fail("账号无效。", 401);
  if (!exact(input, ["requestId", "action", "payload"]) || !uuid(input.requestId)) fail("提交编号或字段无效。");
  const control = ["manage.status", "manage.discard"].includes(input.action);
  if (control && !exact(input.payload, ["action", "payload"])) fail("核对必须包含原提交。");
  const action = control ? input.payload.action : input.action;
  const payload = normalizeCommand(action, control ? input.payload.payload : input.payload), def = definitions[payload.section];
  const owner = await hash(subject), digest = await hash(JSON.stringify({ action, payload }));
  const id = action === "manage.create" ? "managed-" + owner.slice(0, 16) + "-" + input.requestId : payload.id;
  const receipt = state => ({ schemaVersion: 1, requestId: input.requestId, operation: action, section: payload.section, id, state });
  await DB.prepare("CREATE TABLE IF NOT EXISTS mobile_management_receipts_v1 (" +
    "owner_hash TEXT NOT NULL,request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,nonce TEXT NOT NULL," +
    "state TEXT NOT NULL CHECK(state IN ('applied','cancelled')),entity_id TEXT NOT NULL,created_at TEXT NOT NULL," +
    "PRIMARY KEY(owner_hash,request_id))").run();
  const read = async () => {
    const row = await DB.prepare("SELECT payload_hash,state,entity_id FROM mobile_management_receipts_v1 WHERE owner_hash=? AND request_id=?")
      .bind(owner, input.requestId).first();
    if (row && row.payload_hash !== digest) fail("同一编号不能用于不同内容。", 409);
    if (row && (row.entity_id !== id || !["applied", "cancelled"].includes(row.state))) fail("回执校验未通过。", 503);
    return row ? receipt(row.state) : null;
  };
  const prior = await read();
  if (prior) return prior;
  if (input.action === "manage.status") return receipt("not-confirmed");
  const nonce = crypto.randomUUID(), at = new Date(now).toISOString();
  if (input.action === "manage.discard") {
    await DB.prepare("INSERT INTO mobile_management_receipts_v1 VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_hash,request_id) DO NOTHING")
      .bind(owner, input.requestId, digest, nonce, "cancelled", id, at).run();
    return await read();
  }
  let old = null;
  const guard = [], guardValues = [];
  if (action !== "manage.create") {
    old = await DB.prepare("SELECT * FROM " + def.table + " WHERE id=?").bind(id).first();
    if (!old) fail("原项目已不存在，请核对或放弃原提交。", 409);
    if (["transaction", "transfer"].includes(payload.section) && (protectedTransaction(old) || (await incomingLinks(DB, [id])).has(id))) fail("关联账目受保护，请到兼职结算、退款、拆分或周期规则原入口处理。", 409);
    if (action === "manage.update" && payload.section === "transaction" && payload.values.type !== old.type)
      fail("编辑不能转换原账目类型。", 409);
    if (await managementRevision(old) !== payload.expectedRevision) fail("内容已更新，请重新读取，未覆盖新内容。", 409);
    const keys = Object.keys(old).sort();
    if (keys.length > 50 || keys.some(key => !/^[a-z_]+$/.test(key))) fail("当前数据结构需升级后编辑。", 503);
    guard.push("EXISTS(SELECT 1 FROM " + def.table + " WHERE " + keys.map(key => '"' + key + '" IS ?').join(" AND ") + ")");
    guardValues.push(...keys.map(key => old[key]));
    if (payload.section === "transaction") {
      guard.push("NOT EXISTS(SELECT 1 FROM finance_transactions p WHERE p.id=? AND (" + incomingSql + "))");
      guardValues.push(id);
    }
  }
  if (action !== "manage.remove") {
    for (const spec of def.fields.filter(f => f.type === "reference")) {
      const value = payload.values[spec.id], account = spec.source === "accounts";
      guard.push("(? IS NULL OR EXISTS(SELECT 1 FROM " + (account ? "financial_accounts" : "projects") + " WHERE id=?" + (account ? " AND is_archived=0" : "") + "))");
      guardValues.push(value, value);
    }
    if (payload.section === "budget") {
      guard.push("NOT EXISTS(SELECT 1 FROM finance_budgets WHERE month=? AND category=? AND id<>?)");
      guardValues.push(payload.values.month, payload.values.category, id);
    }
  }
  const claim = "owner_hash=? AND request_id=? AND nonce=? AND state='applied'";
  const statements = [DB.prepare("INSERT INTO mobile_management_receipts_v1 SELECT ?,?,?,?,?,?,? WHERE " +
    (guard.length ? guard.join(" AND ") : "1=1") + " ON CONFLICT(owner_hash,request_id) DO NOTHING")
    .bind(owner, input.requestId, digest, nonce, "applied", id, at, ...guardValues)];
  const fields = action === "manage.remove" ? { deleted_at: at } :
    Object.fromEntries(def.fields.map(spec => [col(spec.id), spec.type === "boolean" ? (payload.values[spec.id] ? 1 : 0) :
      spec.type === "money" ? Number(payload.values[spec.id]) : payload.values[spec.id]]));
  if (payload.section === "transfer") Object.assign(fields, { type: "转账", category: "转账", is_private: 1 });
  if (action === "manage.create") {
    if (["goal", "account", "savings"].includes(payload.section)) fields.color = "#477c6a";
    const keys = ["id", ...Object.keys(fields)];
    statements.push(DB.prepare("INSERT INTO " + def.table + " (" + keys.join(",") + ") SELECT " +
      keys.map(() => "?").join(",") + " WHERE EXISTS(SELECT 1 FROM mobile_management_receipts_v1 WHERE " + claim + ")")
      .bind(id, ...Object.values(fields), owner, input.requestId, nonce));
  } else {
    if (Object.hasOwn(old, "updated_at")) fields.updated_at = at;
    statements.push(DB.prepare("UPDATE " + def.table + " SET " + Object.keys(fields).map(key => key + "=?").join(",") +
      " WHERE id=? AND EXISTS(SELECT 1 FROM mobile_management_receipts_v1 WHERE " + claim + ")")
      .bind(...Object.values(fields), id, owner, input.requestId, nonce));
  }
  statements.push(DB.prepare("INSERT INTO audit_logs(id,action,entity_type,entity_id,detail_json) " +
    "SELECT ?,?,?,?,'{\"source\":\"android-native-management\"}' WHERE EXISTS(SELECT 1 FROM mobile_management_receipts_v1 WHERE " + claim + ")")
    .bind("management-" + owner.slice(0,16) + "-" + input.requestId, action, payload.section, id, owner, input.requestId, nonce));
  await DB.batch(statements);
  const saved = await read();
  if (!saved) fail("原内容、引用账户或预算已变化，未覆盖新数据。请核对或放弃原提交。", 409);
  return saved;
}
