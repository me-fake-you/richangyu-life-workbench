package com.richangyu.lifeworkbench;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Local navigation metadata only: no account, endpoint, or network state. */
final class NativeFeatureCatalog {
    enum Scope { ALL, NATIVE, WEB }

    static final class Entry {
        final String key;
        final String title;
        final String description;
        final String icon;
        final boolean nativeInApp;
        private final String searchable;

        Entry(String key, String title, String description, String icon,
              boolean nativeInApp, String keywords) {
            this.key = key;
            this.title = title;
            this.description = description;
            this.icon = icon;
            this.nativeInApp = nativeInApp;
            this.searchable = (title + " " + description + " " + keywords).toLowerCase(Locale.ROOT);
        }
    }

    private static final List<Entry> ENTRIES = Collections.unmodifiableList(Arrays.asList(
        new Entry("nutrition", "热量与饮食", "拍照或手填一餐，查看热量、营养素与饮水。", "nutrition", true,
            "卡路里 食物 早餐 午餐 晚餐 饮食 健康"),
        new Entry("work-hours", "兼职工时", "创建兼职项目、记录工时，结束后核对应收，到账再记收入。", "schedule", true,
            "兼职 打卡 工时 工作 时长"),
        new Entry("records", "生活记录", "写下生活与想法，查看已同步到手机的记录。", "records", true,
            "日记 笔记 记录 文字"),
        new Entry("schedule", "日程安排", "安排时间、查找与筛选日程，查看计划状态。", "schedule", true,
            "行程 时间表 日历 安排 提醒"),
        new Entry("checkin", "专注打卡", "开始或结束打卡，保存实际投入的时间。", "schedule", true,
            "专注 学习 计时 打卡"),
        new Entry("capture", "随手收集", "把文字或想法放进收件箱；完整整理仍在网页版。", "inbox", true,
            "收件箱 灵感 收集"),
        new Entry("ai", "AI 助手", "询问与规划，预览确认后保存；需要工作台配置模型。", "ai", true,
            "ai 人工智能 计划 问答"),

        new Entry("drafts", "本机草稿", "离线保存文字与日程，联网后逐条确认提交；不会自动上传。", "inbox", true,
            "离线 草稿 同步 恢复"),
        new Entry("finance", "财务与账本", "账户、预算和完整收支管理尚未迁移为原生页面。", "records", false,
            "记账 财务 收入 支出 钱 预算"),
        new Entry("settlement", "兼职项目与结算", "查看待结算项目，按实际到账金额分次收款；完整账本仍在网页版。", "schedule", true,
            "兼职 收入 应收 结算 工资"),
        new Entry("photos", "相册与照片", "完整相册、照片故事和整理功能仍在网页版。", "records", false,
            "相册 照片 图片"),
        new Entry("tables", "表格与专题", "自定义表格、专题空间和关联组织仍在网页版。", "records", false,
            "表格 专题 看板 数据库"),
        new Entry("intelligence", "情报与资讯", "新闻、研究雷达和岗位机会仍在网页版。", "inbox", false,
            "情报 资讯 新闻 热点 研究 求职"),
        new Entry("review", "总结与回顾", "完整日周月回顾和计划实际分析仍在网页版。", "records", false,
            "回顾 总结 周报 月报"),
        new Entry("tasks", "任务与目标", "完整任务中心和目标管理仍在网页版；日程可在 App 内安排。", "schedule", false,
            "任务 待办 目标"),
        new Entry("backup", "备份与恢复", "数据健康、云端快照和恢复操作仍在网页版。", "me", false,
            "备份 恢复 导入 导出"),
        new Entry("vault", "私密空间", "私密内容的完整管理仍在网页版，不在此地图读取或展示。", "me", false,
            "私密 隐私 密码")
    ));

    static List<Entry> search(String query, Scope scope) {
        String normalized = query == null ? "" : query.replace('\u3000', ' ').trim().toLowerCase(Locale.ROOT);
        String[] terms = normalized.isEmpty() ? new String[0] : normalized.split("\\s+");
        List<Entry> matches = new ArrayList<>();
        for (Entry entry : ENTRIES) {
            if (scope == Scope.NATIVE && !entry.nativeInApp) continue;
            if (scope == Scope.WEB && entry.nativeInApp) continue;
            boolean matchesAll = true;
            for (String term : terms) {
                if (!entry.searchable.contains(term)) { matchesAll = false; break; }
            }
            if (matchesAll) matches.add(entry);
        }
        return Collections.unmodifiableList(matches);
    }
}
