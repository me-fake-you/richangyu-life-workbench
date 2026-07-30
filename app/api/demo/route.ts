import { ensureIntelligenceSchema } from "../../../lib/intelligence-store";
import { getLifeBindings } from "../../../lib/life-store";

const DEMO_PREFIX = "demo-v13-";

function at(dayOffset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function clearDemo(DB: D1Database) {
  const prefix = `${DEMO_PREFIX}%`;
  const targets = [
    { table: "settlements", column: "id" },
    { table: "finance_transactions", column: "id" },
    { table: "receivables", column: "id" },
    { table: "work_sessions", column: "id" },
    { table: "side_hustle_projects", column: "id" },
    { table: "side_hustle_clients", column: "id" },
    { table: "financial_accounts", column: "id" },
    { table: "meal_items", column: "id" },
    { table: "meals", column: "id" },
    { table: "collection_rows", column: "id" },
    { table: "collections", column: "id" },
    { table: "milestones", column: "id" },
    { table: "projects", column: "id" },
    { table: "schedule_instances", column: "id" },
    { table: "schedule_rule_settings", column: "schedule_id" },
    { table: "schedule_events", column: "id" },
    { table: "inbox_items", column: "id" },
    { table: "life_events", column: "id" },
  ];
  let removed = 0;
  for (const target of targets) {
    const result = await DB.prepare(
      `DELETE FROM ${target.table} WHERE ${target.column} LIKE ?`,
    )
      .bind(prefix)
      .run();
    removed += Number(result.meta.changes) || 0;
  }
  return removed;
}

async function demoCount(DB: D1Database) {
  const result = await DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM life_events WHERE id LIKE ?) +
       (SELECT COUNT(*) FROM schedule_events WHERE id LIKE ?) +
       (SELECT COUNT(*) FROM collection_rows WHERE id LIKE ?) +
       (SELECT COUNT(*) FROM finance_transactions WHERE id LIKE ?) +
       (SELECT COUNT(*) FROM work_sessions WHERE id LIKE ?) +
       (SELECT COUNT(*) FROM meals WHERE id LIKE ?) +
       (SELECT COUNT(*) FROM inbox_items WHERE id LIKE ?) AS count`,
  )
    .bind(
      ...Array.from({ length: 7 }, () => `${DEMO_PREFIX}%`),
    )
    .first<{ count: number }>();
  return Number(result?.count) || 0;
}

async function seedDemo(DB: D1Database) {
  await clearDemo(DB);
  const eventId = `${DEMO_PREFIX}event-growth`;
  const scheduleId = `${DEMO_PREFIX}schedule-study`;
  const collectionId = `${DEMO_PREFIX}collection-reading`;
  const accountId = `${DEMO_PREFIX}account-wallet`;
  const clientId = `${DEMO_PREFIX}client-lin`;
  const sideProjectId = `${DEMO_PREFIX}side-project-tutoring`;
  const sessionId = `${DEMO_PREFIX}session-tutoring`;
  const receivableId = `${DEMO_PREFIX}receivable-tutoring`;
  const mealId = `${DEMO_PREFIX}meal-lunch`;

  await DB.batch([
    DB.prepare(
      `INSERT INTO life_events
       (id, title, content, kind, mood, energy, tags, person, place, project,
        is_private, happened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).bind(
      eventId,
      "完成第一次公开课复盘（演示）",
      "课堂节奏比预期顺利，下一次需要给练习环节多留十分钟。这是一条可随时重置的虚构演示记录。",
      "教学",
      "有成就感",
      4,
      JSON.stringify(["演示数据", "教学", "成长"]),
      "林老师（虚构）",
      "计算机教室",
      "新教师成长（演示）",
      at(-1, 16, 30),
    ),
    DB.prepare(
      `INSERT INTO projects
       (id, title, kind, status, progress, description, color, start_at, target_at)
       VALUES (?, ?, '专题', '进行中', 42, ?, '#76528b', ?, ?)`,
    ).bind(
      `${DEMO_PREFIX}project-teacher`,
      "新教师成长（演示）",
      "串联课程、反思、资料和里程碑的虚构专题。",
      at(-14, 9),
      at(45, 18),
    ),
    DB.prepare(
      `INSERT INTO schedule_events
       (id, title, category, start_at, end_at, place, project, note,
        repeat_rule, status, planned_minutes, actual_minutes)
       VALUES (?, ?, '学习', ?, ?, '图书馆', '教资备考（演示）', ?,
               '每周', '计划中', 60, 0)`,
    ).bind(
      scheduleId,
      "教资科目二 · 教育心理学（演示）",
      at(1, 19),
      at(1, 20),
      "完成第一章思维导图；演示日程可直接编辑或删除。",
    ),
    DB.prepare(
      `INSERT INTO schedule_rule_settings
       (schedule_id, repeat_until, reminder_minutes, custom_interval,
        custom_unit, weekdays)
       VALUES (?, ?, 10, 1, 'week', ?)`,
    ).bind(scheduleId, at(35, 20), JSON.stringify([new Date(at(1, 19)).getDay()])),
    DB.prepare(
      `INSERT INTO collections (id, name, icon, description, fields)
       VALUES (?, '读书记录（演示）', '书', ?, ?)`,
    ).bind(
      collectionId,
      "展示自定义字段、进度和评分；重置演示不会触碰真实表格。",
      JSON.stringify([
        { id: "title", name: "书名", type: "text" },
        { id: "status", name: "状态", type: "select" },
        { id: "progress", name: "进度", type: "progress" },
        { id: "rating", name: "评分", type: "rating" },
      ]),
    ),
    DB.prepare(
      `INSERT INTO collection_rows (id, collection_id, values_json)
       VALUES (?, ?, ?)`,
    ).bind(
      `${DEMO_PREFIX}row-reading`,
      collectionId,
      JSON.stringify({
        title: "82年生的金智英（演示）",
        status: "在读",
        progress: 68,
        rating: 4,
      }),
    ),
    DB.prepare(
      `INSERT INTO financial_accounts
       (id, name, type, color, initial_balance)
       VALUES (?, '演示零钱账户', '虚拟账户', '#76528b', 1200)`,
    ).bind(accountId),
    DB.prepare(
      `INSERT INTO finance_transactions
       (id, type, amount, category, account_id, project, occurred_at, note,
        is_private)
       VALUES (?, '支出', 32, '餐饮', ?, '日常生活（演示）', ?, ?, 1)`,
    ).bind(
      `${DEMO_PREFIX}transaction-lunch`,
      accountId,
      at(0, 12, 20),
      "学校附近午饭；虚构演示账目。",
    ),
    DB.prepare(
      `INSERT INTO side_hustle_clients
       (id, name, contact, payment_habit, note)
       VALUES (?, '林同学家长（虚构）', '', '课后次日结算', '仅用于演示应收流程')`,
    ).bind(clientId),
    DB.prepare(
      `INSERT INTO side_hustle_projects
       (id, title, kind, client_id, billing_mode, unit_rate, settlement_cycle,
        status, income_target, start_at, note)
       VALUES (?, '物理家教（演示）', '家教', ?, '按小时', 180, '每次结束',
               '进行中', 2400, ?, '所有人物和金额均为虚构')`,
    ).bind(sideProjectId, clientId, at(-10, 9)),
    DB.prepare(
      `INSERT INTO work_sessions
       (id, project_id, started_at, ended_at, minutes, hidden_minutes,
        work_content, result, place, expected_income, cost, feeling, status,
        life_event_id)
       VALUES (?, ?, ?, ?, 120, 25, ?, ?, '线上', 360, 8, '顺利', '已完成', ?)`,
    ).bind(
      sessionId,
      sideProjectId,
      at(-2, 14),
      at(-2, 16),
      "浮力综合题与错题讲解",
      "完成两组练习，待下次复习受力分析。",
      eventId,
    ),
    DB.prepare(
      `INSERT INTO receivables
       (id, project_id, client_id, work_session_id, amount_due,
        amount_received, due_at, status, note)
       VALUES (?, ?, ?, ?, 360, 0, ?, '待结算', '演示待收款')`,
    ).bind(receivableId, sideProjectId, clientId, sessionId, at(2, 20)),
    DB.prepare(
      `INSERT INTO meals
       (id, meal_type, eaten_at, note, estimated_calories, protein_g,
        carbs_g, fat_g, confidence, analysis_provider)
       VALUES (?, '午餐', ?, '鸡肉饭＋蔬菜（演示估算）', 620, 32, 78, 18, 0.72, 'demo')`,
    ).bind(mealId, at(0, 12, 20)),
    DB.prepare(
      `INSERT INTO meal_items
       (id, meal_id, name, portion, calories, protein_g, carbs_g, fat_g)
       VALUES (?, ?, '鸡肉蔬菜饭（演示）', '约一份', 620, 32, 78, 18)`,
    ).bind(`${DEMO_PREFIX}meal-item-lunch`, mealId),
    DB.prepare(
      `INSERT INTO inbox_items (id, content, source_type, status)
       VALUES (?, ?, '链接', '待整理')`,
    ).bind(
      `${DEMO_PREFIX}inbox-reading`,
      "演示收藏：周末整理一份新学期课程资料清单",
    ),
  ]);
  return demoCount(DB);
}

export async function GET() {
  try {
    await ensureIntelligenceSchema();
    const { DB } = getLifeBindings();
    const count = await demoCount(DB);
    return Response.json({
      active: count > 0,
      count,
      prefix: DEMO_PREFIX,
      safety: "重置操作只删除带 demo-v13- 前缀的虚构数据。",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取演示模式失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "seed") {
      const count = await seedDemo(DB);
      return Response.json({ active: true, count });
    }
    if (action === "reset") {
      if (String(body.confirmation ?? "") !== "RESET DEMO") {
        return Response.json({ error: "演示重置确认缺失。" }, { status: 400 });
      }
      const removed = await clearDemo(DB);
      return Response.json({ active: false, count: 0, removed });
    }
    return Response.json({ error: "不支持的演示模式操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "演示模式操作失败。" },
      { status: 500 },
    );
  }
}
