"use client";

import {
  Bell,
  Camera,
  Check,
  Command,
  Inbox,
  Mic,
  PenLine,
  Share2,
  Smartphone,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { usePwa } from "./pwa-client";

type MobileQuickSheetProps = {
  open: boolean;
  voiceFirst?: boolean;
  onClose: () => void;
  onText: () => void;
  onPhoto: (file: File) => void;
  onVoice: (file: File) => void;
  onMeal: (file?: File) => void;
  onInbox: () => void;
  onCommand: () => void;
};

function haptic() {
  if ("vibrate" in navigator) navigator.vibrate(12);
}

export function MobileQuickSheet({
  open,
  voiceFirst = false,
  onClose,
  onText,
  onPhoto,
  onVoice,
  onMeal,
  onInbox,
  onCommand,
}: MobileQuickSheetProps) {
  const photoId = useId();
  const voiceId = useId();
  const mealId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="mobile-quick-layer"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="mobile-quick-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-quick-title"
      >
        <header>
          <div>
            <span>QUICK CAPTURE</span>
            <h2 id="mobile-quick-title">
              {voiceFirst ? "长按已打开语音入口" : "现在想记录什么？"}
            </h2>
            <p>最常用的操作都可以在两次点击内完成。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭快捷记录">
            <X size={19} />
          </button>
        </header>

        <div className="mobile-quick-grid">
          <button
            type="button"
            className="text"
            onClick={() => {
              haptic();
              onText();
            }}
          >
            <span><PenLine size={23} /></span>
            <strong>写一句话</strong>
            <small>日记、感受或补记</small>
          </button>

          <label className="photo" htmlFor={photoId}>
            <span><Camera size={23} /></span>
            <strong>拍照记录</strong>
            <small>直接调用手机相机</small>
            <input
              id={photoId}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  haptic();
                  onPhoto(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>

          <label
            className={`voice ${voiceFirst ? "recommended" : ""}`}
            htmlFor={voiceId}
          >
            <span><Mic size={23} /></span>
            <strong>语音随手记</strong>
            <small>{voiceFirst ? "再点一次开始录音" : "录完先放入收件箱"}</small>
            <input
              id={voiceId}
              type="file"
              accept="audio/*"
              capture
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  haptic();
                  onVoice(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>

          <label className="meal" htmlFor={mealId}>
            <span><Utensils size={23} /></span>
            <strong>记录饮食</strong>
            <small>拍照后直接估算热量</small>
            <input
              id={mealId}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                haptic();
                onMeal(file);
                event.currentTarget.value = "";
              }}
            />
          </label>

          <button
            type="button"
            className="inbox"
            onClick={() => {
              haptic();
              onInbox();
            }}
          >
            <span><Inbox size={23} /></span>
            <strong>先存收件箱</strong>
            <small>文字、链接或文件</small>
          </button>

          <button
            type="button"
            className="command"
            onClick={() => {
              haptic();
              onCommand();
            }}
          >
            <span><Command size={23} /></span>
            <strong>更多指令</strong>
            <small>日程、记账与建表</small>
          </button>
        </div>

        <footer>
          <Share2 size={15} />
          也可以从相册或浏览器点“分享”，发送到日常屿收件箱。
        </footer>
      </section>
    </div>
  );
}

const installDismissedKey = "richangyu-mobile-install-dismissed-v15";

export function MobileInstallNudge({
  onGuide,
}: {
  onGuide: () => void;
}) {
  const { canInstall, install, isIos, isStandalone } = usePwa();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone) return;
    const dismissedAt = Number(
      window.localStorage.getItem(installDismissedKey) || 0,
    );
    const recentlyDismissed = Date.now() - dismissedAt < 7 * 24 * 60 * 60_000;
    if (recentlyDismissed || !window.matchMedia("(max-width: 760px)").matches) {
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 1800);
    return () => window.clearTimeout(timer);
  }, [isStandalone]);

  if (!visible || isStandalone) return null;

  function dismiss() {
    window.localStorage.setItem(installDismissedKey, String(Date.now()));
    setVisible(false);
  }

  return (
    <aside className="mobile-install-nudge" aria-label="安装日常屿到手机">
      <span><Smartphone size={20} /></span>
      <div>
        <strong>把日常屿放到手机桌面</strong>
        <small>
          {isIos
            ? "Safari 点“分享”→“添加到主屏幕”"
            : "全屏使用，并继续同步电脑端数据"}
        </small>
      </div>
      {canInstall ? (
        <button
          type="button"
          onClick={async () => {
            await install();
            dismiss();
          }}
        >
          安装
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            dismiss();
            onGuide();
          }}
        >
          看步骤
        </button>
      )}
      <button type="button" className="close" onClick={dismiss} aria-label="稍后提醒">
        <X size={15} />
      </button>
    </aside>
  );
}

export function NotificationSetupCard({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
  );

  async function requestPermission() {
    if (typeof Notification === "undefined") {
      onNotice("当前浏览器不支持系统通知。");
      return;
    }
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next !== "granted") {
      onNotice("未开启通知；你仍可以在工作台内查看提醒。");
      return;
    }
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification("日常屿提醒已开启", {
        body: "日程和自动化提醒会在系统允许时显示。",
        icon: "/app-icon-192.png",
        badge: "/app-icon-192.png",
        tag: "richangyu-notification-ready",
      });
    } else {
      new Notification("日常屿提醒已开启", {
        body: "日程和自动化提醒会在系统允许时显示。",
      });
    }
    onNotice("系统提醒已经开启。");
  }

  return (
    <section className="settings-card notification-setup-card">
      <div className="panel-heading">
        <span className="heading-icon rose"><Bell size={17} /></span>
        <div>
          <h3>手机系统提醒</h3>
          <p>日程、自动化和同步问题及时看到</p>
        </div>
      </div>
      <div className={`notification-permission ${permission}`}>
        <span>
          {permission === "granted" ? <Check size={18} /> : <Bell size={18} />}
        </span>
        <div>
          <strong>
            {permission === "granted"
              ? "系统提醒已允许"
              : permission === "denied"
                ? "系统提醒已被浏览器关闭"
                : permission === "unsupported"
                  ? "当前浏览器不支持通知"
                  : "需要你主动允许一次"}
          </strong>
          <small>
            手机系统可能限制后台网页通知；工作台内提醒和自动化日志始终保留。
          </small>
        </div>
      </div>
      {permission === "default" && (
        <button
          type="button"
          className="pwa-install-button"
          onClick={() => void requestPermission()}
        >
          <Bell size={16} /> 开启并测试提醒
        </button>
      )}
    </section>
  );
}
