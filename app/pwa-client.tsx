"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Check, Download, Share2, Smartphone } from "lucide-react";
import { getDeviceId } from "./offline-sync";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  canInstall: boolean;
  isIos: boolean;
  isStandalone: boolean;
  install: () => Promise<void>;
};

const PwaContext = createContext<PwaContextValue>({
  canInstall: false,
  isIos: false,
  isStandalone: false,
  install: async () => undefined,
});

export function usePwa() {
  return useContext(PwaContext);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const statusTimer = window.setTimeout(() => {
      setIsStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
      setIsIos(
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
          !("MSStream" in window),
      );
    }, 0);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(async (registration) => {
          const worker =
            registration.active || registration.waiting || registration.installing;
          worker?.postMessage({
            type: "SET_DEVICE_ID",
            deviceId: getDeviceId(),
            poll:
              "Notification" in window &&
              Notification.permission === "granted",
          });
          const periodic = registration as ServiceWorkerRegistration & {
            periodicSync?: {
              register: (
                tag: string,
                options: { minInterval: number },
              ) => Promise<void>;
            };
          };
          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            periodic.periodicSync
          ) {
            await periodic.periodicSync
              .register("richangyu-background-reminders", {
                minInterval: 60 * 60 * 1000,
              })
              .catch(() => undefined);
          }
        });
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(statusTimer);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall: Boolean(promptEvent) && !isStandalone,
      isIos,
      isStandalone,
      install: async () => {
        if (!promptEvent) return;
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") setPromptEvent(null);
      },
    }),
    [isIos, isStandalone, promptEvent],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function PwaInstallCard() {
  const { canInstall, install, isIos, isStandalone } = useContext(PwaContext);

  return (
    <section className="settings-card pwa-card">
      <div className="panel-heading">
        <span className="heading-icon blue">
          <Smartphone size={17} />
        </span>
        <div>
          <h3>手机应用体验</h3>
          <p>安装到桌面，全屏打开并保持云端同步</p>
        </div>
      </div>

      <div className={`pwa-status ${isStandalone ? "installed" : ""}`}>
        <span>{isStandalone ? <Check size={18} /> : <Smartphone size={18} />}</span>
        <div>
          <strong>{isStandalone ? "已作为应用运行" : "这是可安装的网页应用"}</strong>
          <small>
            {isStandalone
              ? "记录、照片和时间表仍安全保存在云端，也可以从系统分享菜单发到生活收件箱。"
              : "安装后会像普通 App 一样出现在手机桌面，并接收系统分享。"}
          </small>
        </div>
      </div>

      {canInstall ? (
        <button className="pwa-install-button" onClick={() => void install()}>
          <Download size={16} />
          安装“日常屿”
        </button>
      ) : isIos && !isStandalone ? (
        <div className="pwa-guide">
          <Share2 size={16} />
          <span>在 Safari 点“分享”，再选择“添加到主屏幕”。</span>
        </div>
      ) : !isStandalone ? (
        <div className="pwa-guide">
          <Download size={16} />
          <span>在浏览器菜单中选择“安装应用”或“添加到主屏幕”。</span>
        </div>
      ) : null}

      <p className="pwa-privacy-note">
        离线文字会进入本机同步队列；财务、私密记录和照片原件不会进入公共缓存。
      </p>
    </section>
  );
}
