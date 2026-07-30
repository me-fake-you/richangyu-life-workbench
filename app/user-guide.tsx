"use client";

import {
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarClock,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Command,
  DatabaseBackup,
  Inbox,
  Network,
  Newspaper,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TableProperties,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const guideSeenKey = "richangyu-guide-seen-v1";

const quickRoutes = [
  {
    eyebrow: "CAPTURE",
    title: "先记录，再整理",
    copy: "手机底部的“＋”可以直接写一句话、拍照、录音或记录饮食；链接和文件先放进生活收件箱。",
    action: "去生活收件箱",
    view: "inbox",
    icon: Inbox,
  },
  {
    eyebrow: "PLAN",
    title: "安排并复盘时间",
    copy: "在时间表创建课程、工作或时间块，结束后补充实际时长、完成结果和感受。",
    action: "去时间表中心",
    view: "schedule",
    icon: CalendarClock,
  },
  {
    eyebrow: "MEMORY",
    title: "用照片留下今天",
    copy: "上传生活照片后补充日期、地点和故事；饮食照片请到饮食与营养中估算热量。",
    action: "去照片回忆",
    view: "gallery",
    icon: Camera,
  },
  {
    eyebrow: "INTELLIGENCE",
    title: "每天读国内外热点",
    copy: "系统先读取默认可信来源，再让 AI 归纳重点与行动建议；结论旁保留原始来源，方便复核。",
    action: "去情报中心",
    view: "intelligence",
    icon: Newspaper,
  },
];

const dailyFlow = [
  ["早晨", "在“今日”查看激励文字、今日三件事和时间表，圈出唯一重点。"],
  ["白天", "手机点底部“＋”快速写字、拍照或录音；复杂操作再打开“更多指令”。"],
  ["吃饭", "进入“饮食与营养”上传餐食照片，确认 AI 估算的食物和份量。"],
  ["晚上", "补充实际投入、心情和照片，生成当天或本周总结。"],
];

const moduleMap = [
  {
    icon: CalendarClock,
    title: "安排生活",
    copy: "时间表、课程表、时间块、提醒，以及计划与实际投入对比。",
    view: "schedule",
  },
  {
    icon: Network,
    title: "连接经历",
    copy: "时间线、日历、生活图谱和专题空间，把人物、地点、照片与目标串起来。",
    view: "graph",
  },
  {
    icon: TableProperties,
    title: "管理长期内容",
    copy: "用表格、看板、日历和图表管理教学、科研、读书、旅行与愿望。",
    view: "tables",
  },
  {
    icon: CircleDollarSign,
    title: "看懂钱与投入",
    copy: "财务记录真实资金流；兼职区分工作、应收、到账、成本和有效时薪。",
    view: "finance",
  },
  {
    icon: Newspaper,
    title: "把信息变成行动",
    copy: "情报中心聚合公开来源，保留出处，并把值得跟进的内容转为任务或专题。",
    view: "intelligence",
  },
  {
    icon: DatabaseBackup,
    title: "回顾并带走数据",
    copy: "日周月年总结、专题总结、备份恢复和多格式导入导出共同保护长期记录。",
    view: "review",
  },
];

const firstWeek = [
  ["第 1 天", "只记录一件真实发生的事，并安排明天的一段时间。"],
  ["第 2—3 天", "开始使用收件箱，把来不及整理的文字、照片和链接先收下来。"],
  ["第 4—5 天", "完成日程后补充实际时长，第一次看见计划与实际的差异。"],
  ["第 6 天", "选择一个长期主题，建立专题或复制一张表格模板。"],
  ["第 7 天", "生成周总结草稿，检查来源后保存，并下载一次完整备份。"],
];

export function FirstRunGuide({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!window.localStorage.getItem(guideSeenKey)) setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function close() {
    window.localStorage.setItem(guideSeenKey, "1");
    setOpen(false);
  }

  function openGuide() {
    close();
    onNavigate("guide");
  }

  if (!open) return null;

  const steps = [
    {
      icon: Sparkles,
      eyebrow: "欢迎来到日常屿",
      title: "这里不是必须一次学会的复杂系统",
      copy: "先完成“记录一件事—安排一段时间—晚上回看”这三个动作，其他模块需要时再打开。",
    },
    {
      icon: Command,
      eyebrow: "最快入口",
      title: "手机先点“＋”，复杂操作再用“更多指令”",
      copy: "写一句话、拍照、语音和饮食都在两次点击内完成；输入“明晚七点学习英语一小时”时，系统会先展示将写入的模块，确认后执行并可撤销。",
    },
    {
      icon: Cloud,
      eyebrow: "手机与电脑",
      title: "它是可安装的网页应用",
      copy: "手机浏览器打开同一网址并登录后，可以像 App 一样添加到桌面；记录保存在同一个私密云端空间，可在手机和电脑继续编辑。",
    },
  ];
  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="guide-overlay" role="dialog" aria-modal="true" aria-labelledby="first-guide-title">
      <section className="first-guide-card">
        <button className="guide-close" onClick={close} aria-label="暂时关闭使用引导">
          <X size={19} />
        </button>
        <div className="first-guide-visual">
          <span><Icon size={30} /></span>
          <div className="guide-step-dots" aria-label={`第 ${step + 1} 步，共 ${steps.length} 步`}>
            {steps.map((item, index) => (
              <i className={index === step ? "active" : ""} key={item.eyebrow} />
            ))}
          </div>
        </div>
        <span className="eyebrow">{current.eyebrow}</span>
        <h2 id="first-guide-title">{current.title}</h2>
        <p>{current.copy}</p>
        <div className="first-guide-actions">
          <button className="secondary-button" onClick={openGuide}>
            <BookOpenCheck size={16} /> 查看完整指南
          </button>
          {step < steps.length - 1 ? (
            <button className="primary-button" onClick={() => setStep((value) => value + 1)}>
              下一步 <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={() => {
                close();
                onNavigate("today");
              }}
            >
              开始使用 <CheckCircle2 size={16} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function UserGuide({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  return (
    <section className="standard-page user-guide">
      <div className="page-intro guide-hero">
        <div>
          <span className="eyebrow">START HERE · 使用指南</span>
          <h1>先学会一天，再慢慢建立自己的生活系统</h1>
          <p>
            日常屿把“记录、安排、整理、回顾”连接在一起。第一次使用只需按下面的四步走，
            不需要先配置完所有模块。
          </p>
        </div>
        <button className="primary-button" onClick={() => onNavigate("today")}>
          回到今日工作台 <ArrowRight size={16} />
        </button>
      </div>

      <section className="guide-section">
        <header>
          <span className="eyebrow">10 MINUTES</span>
          <h2>第一次使用，建议完成这四件事</h2>
        </header>
        <div className="guide-route-grid">
          {quickRoutes.map(({ eyebrow, title, copy, action, view, icon: Icon }, index) => (
            <article key={view}>
              <div className="guide-route-number">{String(index + 1).padStart(2, "0")}</div>
              <span><Icon size={20} /></span>
              <small>{eyebrow}</small>
              <h3>{title}</h3>
              <p>{copy}</p>
              <button onClick={() => onNavigate(view)}>
                {action} <ArrowRight size={14} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="guide-two-column">
        <section className="guide-section guide-day-flow">
          <header>
            <span className="eyebrow">A SIMPLE DAY</span>
            <h2>最轻松的一日使用流程</h2>
          </header>
          <ol>
            {dailyFlow.map(([time, copy]) => (
              <li key={time}>
                <strong>{time}</strong>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="guide-section guide-command">
          <header>
            <span className="eyebrow">手机＋ / CTRL / ⌘ + K</span>
            <h2>简单内容快速记，复杂内容交给指令</h2>
          </header>
          <p>
            手机点击底部“＋”可直接写一句话、拍照、录音、记录饮食或打开收件箱；
            长按“＋”会优先显示语音入口。需要一次创建日程、账目和多条记录时再打开“更多指令”。
          </p>
          <div className="command-examples">
            <p>“明天晚上 7 点安排一小时英语学习”</p>
            <p>“记录今天完成了第一次公开课，心情很好”</p>
            <p>“午饭花了 32 元”</p>
            <p>“午饭鸡肉饭，花了 32 元，心情不错”</p>
            <p>“建立一个教资错题表”</p>
          </div>
          <button className="primary-button" onClick={() => onNavigate("today")}>
            回到首页使用指令 <Command size={16} />
          </button>
        </section>
      </div>

      <section className="guide-section guide-video">
        <div className="guide-video-copy">
          <span className="eyebrow">VIDEO WALKTHROUGH · 操作视频</span>
          <h2>用三分钟认识完整的生活闭环</h2>
          <p>
            视频从“计划—实际—回忆”开始，依次讲解今日工作台、批量时间安排、生活收件箱、
            情报阅读、饮食记录、财务与兼职、手机安装，以及 AI 和隐私边界。支持中文字幕，
            静音时也能完整观看。
          </p>
          <div className="guide-video-links">
            <a href="/tutorial/richangyu-quick-start.mp4" download>下载讲解视频</a>
            <a href="/tutorial/richangyu-quick-start.vtt" download>下载字幕</a>
          </div>
        </div>
        <video
          controls
          playsInline
          preload="metadata"
          poster="/tutorial/quick-start-poster.png"
          aria-label="日常屿中文快速上手讲解视频"
        >
          <source src="/tutorial/richangyu-quick-start.mp4" type="video/mp4" />
          <track
            default
            kind="captions"
            label="简体中文字幕"
            src="/tutorial/richangyu-quick-start.vtt"
            srcLang="zh-CN"
          />
          你的浏览器暂不支持播放视频，可以使用左侧链接下载观看。
        </video>
      </section>

      <section className="guide-section">
        <header>
          <span className="eyebrow">MODULE MAP</span>
          <h2>功能很多，但只围绕六件事展开</h2>
        </header>
        <div className="guide-module-map">
          {moduleMap.map(({ icon: Icon, title, copy, view }) => (
            <button key={view} onClick={() => onNavigate(view)}>
              <span><Icon size={21} /></span>
              <strong>{title}</strong>
              <small>{copy}</small>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </section>

      <div className="guide-two-column">
        <section className="guide-section guide-week">
          <header>
            <span className="eyebrow">YOUR FIRST WEEK</span>
            <h2>不要一次配置全部模块</h2>
          </header>
          <ol>
            {firstWeek.map(([day, action]) => (
              <li key={day}>
                <strong>{day}</strong>
                <p>{action}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="guide-section guide-data-flow">
          <header>
            <span className="eyebrow">ONE SOURCE OF TRUTH</span>
            <h2>同一件事只记录一次</h2>
          </header>
          <p>
            例如完成一次家教后，工作时长进入兼职项目，应收款进入收款中心，真实到账才进入财务账户，
            同时在生活时间线生成一条记录。课程、照片、地点和反思都可以继续关联，不需要重复录入。
          </p>
          <div>
            <span><BriefcaseBusiness size={17} /> 兼职打卡</span>
            <i>→</i>
            <span><CircleDollarSign size={17} /> 应收与到账</span>
            <i>→</i>
            <span><Network size={17} /> 生活时间线</span>
          </div>
        </section>
      </div>

      <section className="guide-section">
        <header>
          <span className="eyebrow">IMPORTANT NOTES</span>
          <h2>三个容易误解的地方</h2>
        </header>
        <div className="guide-notes">
          <article>
            <Cloud size={21} />
            <h3>手机端是网页，也能像 App 一样安装</h3>
            <p>在手机浏览器打开同一网址并登录，选择“添加到主屏幕”。首次访问会显示安装提示，同一账号的数据会同步并可继续编辑。</p>
          </article>
          <article>
            <Command size={21} />
            <h3>先用简洁模式，不会丢失任何功能</h3>
            <p>在“我的”选择日常、教师、科研、兼职、健康或财务场景；侧栏只显示常用入口，“查看全部功能”随时可以展开完整系统。</p>
          </article>
          <article>
            <Smartphone size={21} />
            <h3>换手机前先确认同步与备份</h3>
            <p>顶部会直接显示“已同步、离线或待同步”。离线重新打开后可继续写文字并排队，换手机前仍应确认云端同步并导出完整备份。</p>
          </article>
          <article>
            <Newspaper size={21} />
            <h3>情报不是让 AI 凭空编新闻</h3>
            <p>系统每天读取默认国内外来源，再由 AI 提炼。你也可以在订阅中心添加常看的官网或 RSS，并随时打开原文核对。</p>
          </article>
          <article>
            <Utensils size={21} />
            <h3>照片热量是估算，不是医学检测</h3>
            <p>餐食照片看不出准确重量和配料，请确认食物名称、份量和烹饪方式；涉及疾病或治疗时以专业意见为准。</p>
          </article>
          <article>
            <ShieldCheck size={21} />
            <h3>私密内容默认隔离</h3>
            <p>私密记录不会进入普通首页、搜索和默认总结。导出与分享前仍应检查是否包含金额、位置或敏感照片。</p>
          </article>
        </div>
      </section>
    </section>
  );
}
