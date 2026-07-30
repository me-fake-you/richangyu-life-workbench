"""Build the repository's captioned quick-start video from real UI screenshots.

Requirements:
  - Python 3.11+
  - Pillow
  - ffmpeg on PATH, FFMPEG_BINARY, or imageio-ffmpeg

An optional narration WAV can be passed with --audio. The generated MP4 and
poster are written to public/tutorial so both the product guide and GitHub
README can link to the same assets.
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH = 1280
HEIGHT = 720
PURPLE = (111, 62, 158)
INK = (58, 45, 63)
MUTED = (111, 96, 108)
CREAM = (250, 246, 241)

SLIDES = [
    {
        "title": "日常屿 · 生活工作台",
        "caption": "开源、隐私优先、可自部署的个人生活操作系统",
        "image": None,
        "layout": "intro",
        "duration": 16,
    },
    {
        "title": "01  先理解三条时间轨道",
        "caption": "计划回答“准备做什么”，实际记录“真正做了什么”，回忆保存“这段经历意味着什么”。",
        "image": None,
        "layout": "tracks",
        "duration": 16,
    },
    {
        "title": "02  从“今日”开始",
        "caption": "每天变化的激励、今日三件事、日程、照片与心情都集中在一个页面。",
        "image": "01-today-workbench.png",
        "duration": 15,
    },
    {
        "title": "03  一次安排一天或一周",
        "caption": "批量填写标题、日期、开始与结束时间；完成后继续补充实际投入和结果。",
        "image": "02-schedule-batch.png",
        "duration": 15,
    },
    {
        "title": "04  来不及整理，就先放进收件箱",
        "caption": "文字、照片、语音、文件和链接先被接住，之后再整理为记录、日程、表格或专题。",
        "image": None,
        "layout": "capture",
        "duration": 15,
    },
    {
        "title": "05  热点必须能够回到来源",
        "caption": "先读取国内外公开来源，再用 AI 提炼热点、研究信号与下一步行动。",
        "image": "03-intelligence-center.png",
        "duration": 16,
    },
    {
        "title": "06  拍下三餐，再确认份量",
        "caption": "餐食照片会得到热量与营养素估算；人工修正让长期趋势更可信。",
        "image": "04-nutrition-center.png",
        "duration": 16,
    },
    {
        "title": "07  财务与兼职分开记，又彼此联动",
        "caption": "工作、应收、到账和账户交易各自独立，系统才能算出待收款、成本、净利润和有效时薪。",
        "image": None,
        "layout": "finance",
        "duration": 18,
    },
    {
        "title": "08  手机安装后像 App 一样使用",
        "caption": "同一网址、同一账号、同一份云端数据；底部导航保留最常用的五个入口。",
        "image": "07-mobile-today.png",
        "duration": 16,
        "mobile": True,
    },
    {
        "title": "09  AI 是可选助理，数据边界由你决定",
        "caption": "没有密钥也能记录和管理；AI 结果保留来源，写入正式数据前需要确认。",
        "image": None,
        "layout": "privacy",
        "duration": 17,
    },
    {
        "title": "10  第一周不要一次打开全部功能",
        "caption": "先形成记录—安排—回顾的习惯，再逐步启用专题、表格、财务和自动化。",
        "image": None,
        "layout": "week",
        "duration": 18,
    },
    {
        "title": "从一条真实记录开始",
        "caption": "今天记录一件事 · 明天安排一段时间 · 周末回看一次",
        "image": None,
        "layout": "outro",
        "duration": 15,
    },
]


def font_path(bold: bool = False) -> str:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError("找不到可显示中文的字体，请通过 --font 修改脚本字体列表。")


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def fit_inside(image: Image.Image, box: tuple[int, int], mobile: bool = False) -> Image.Image:
    max_w, max_h = box
    source = image.convert("RGB")
    ratio = min(max_w / source.width, max_h / source.height)
    if mobile:
        ratio = min(ratio, 1.05)
    size = (max(1, round(source.width * ratio)), max(1, round(source.height * ratio)))
    return source.resize(size, Image.Resampling.LANCZOS)


def gradient_background() -> Image.Image:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), CREAM)
    pixels = canvas.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            glow = max(0.0, 1.0 - math.dist((x, y), (1040, 90)) / 760)
            rose = max(0.0, 1.0 - math.dist((x, y), (110, 650)) / 650)
            pixels[x, y] = (
                int(250 - 10 * glow + 2 * rose),
                int(246 - 15 * glow + 2 * rose),
                int(241 + 7 * glow + 7 * rose),
            )
    return canvas


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for character in text:
        candidate = current + character
        if current and draw.textbbox((0, 0), candidate, font=font)[2] > max_width:
            lines.append(current)
            current = character
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_concept_card(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    eyebrow: str,
    title: str,
    copy: str,
    *,
    dark: bool = False,
) -> None:
    x1, y1, x2, y2 = box
    fill = PURPLE if dark else (255, 255, 255)
    title_color = (255, 255, 255) if dark else INK
    copy_color = (236, 223, 245) if dark else MUTED
    draw.rounded_rectangle(box, radius=26, fill=fill, outline=(226, 215, 229), width=1)
    eyebrow_font = ImageFont.truetype(font_path(True), 16)
    card_title_font = ImageFont.truetype(font_path(True), 30)
    card_copy_font = ImageFont.truetype(font_path(False), 20)
    draw.text((x1 + 26, y1 + 24), eyebrow, font=eyebrow_font, fill=(222, 198, 235) if dark else PURPLE)
    draw.text((x1 + 26, y1 + 62), title, font=card_title_font, fill=title_color)
    line_y = y1 + 112
    for line in wrap_text(draw, copy, card_copy_font, x2 - x1 - 52):
        draw.text((x1 + 26, line_y), line, font=card_copy_font, fill=copy_color)
        line_y += 30


def render_concept(draw: ImageDraw.ImageDraw, spec: dict[str, object]) -> None:
    layout = str(spec.get("layout", "outro"))
    large_font = ImageFont.truetype(font_path(True), 56)
    body_font = ImageFont.truetype(font_path(False), 26)

    if layout == "intro":
        draw.rounded_rectangle((50, 270, 1230, 590), radius=38, fill=PURPLE)
        draw.text((105, 345), "把生活的碎片，连接成自己的故事。", font=large_font, fill=(255, 255, 255))
        draw.text((108, 455), "网页可直接使用，也可以安装到手机桌面。", font=body_font, fill=(235, 221, 245))
        return

    if layout == "tracks":
        draw_concept_card(draw, (50, 265, 415, 570), "PLAN", "计划", "日程、课程、任务与时间块")
        draw_concept_card(draw, (457, 265, 822, 570), "ACTUAL", "实际", "真实开始、结束、结果与中断")
        draw_concept_card(draw, (864, 265, 1229, 570), "MEMORY", "回忆", "文字、照片、心情与反思", dark=True)
        return

    if layout == "capture":
        items = [("收件箱", "先接住"), ("生活事件", "再整理"), ("专题 / 表格", "建立关系"), ("总结", "重新理解")]
        x = 52
        for index, (title, copy) in enumerate(items):
            draw_concept_card(draw, (x, 300, x + 250, 535), f"STEP {index + 1}", title, copy, dark=index == 1)
            x += 304
            if index < len(items) - 1:
                draw.text((x - 39, 390), "→", font=large_font, fill=(157, 132, 164))
        return

    if layout == "finance":
        items = [
            ("WORK", "兼职打卡", "做了多久"),
            ("DUE", "应收款", "应该收到多少"),
            ("PAID", "结算到账", "实际收到多少"),
            ("MONEY", "财务账户", "钱真正去了哪里"),
        ]
        x = 50
        for index, (eyebrow, title, copy) in enumerate(items):
            draw_concept_card(draw, (x, 270, x + 265, 500), eyebrow, title, copy, dark=index == 2)
            x += 305
        draw.rounded_rectangle((330, 530, 950, 594), radius=28, fill=(239, 228, 246))
        draw.text((388, 547), "净利润 ÷ 全部投入时间 = 真实有效时薪", font=body_font, fill=PURPLE)
        return

    if layout == "privacy":
        cards = [
            ("CORE", "无密钥可用", "记录、日程、表格与财务"),
            ("AI", "按需开启", "文字模型和视觉模型可分开配置"),
            ("SOURCE", "保留来源", "总结与情报可以回到原始记录"),
            ("PRIVATE", "默认隔离", "私密内容不进入普通搜索与总结"),
        ]
        x = 50
        for index, card in enumerate(cards):
            draw_concept_card(draw, (x, 270, x + 270, 565), *card, dark=index == 3)
            x += 305
        return

    if layout == "week":
        week = [
            ("第 1 天", "记录一件事"),
            ("第 2—3 天", "使用收件箱"),
            ("第 4—5 天", "补充实际投入"),
            ("第 6 天", "建立专题或表格"),
            ("第 7 天", "生成周总结并备份"),
        ]
        y = 270
        for index, (day, action) in enumerate(week):
            x = 70 if index % 2 == 0 else 360
            width = 850 if index % 2 == 0 else 850
            draw.rounded_rectangle((x, y, x + width, y + 52), radius=22, fill=PURPLE if index == 4 else (255, 255, 255))
            color = (255, 255, 255) if index == 4 else INK
            draw.text((x + 24, y + 12), f"{day}  ·  {action}", font=body_font, fill=color)
            y += 63
        return

    draw.rounded_rectangle((50, 270, 1230, 590), radius=38, fill=PURPLE)
    draw.text((116, 345), "记录一件事", font=large_font, fill=(255, 255, 255))
    draw.text((505, 345), "安排一段时间", font=large_font, fill=(255, 255, 255))
    draw.text((952, 345), "回顾今天", font=large_font, fill=(255, 255, 255))
    draw.text((286, 480), "不必一次学会全部功能，先让它陪你认真过完一天。", font=body_font, fill=(235, 221, 245))


def render_slide(spec: dict[str, object], target: Path) -> None:
    canvas = gradient_background()
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(font_path(True), 42)
    caption_font = ImageFont.truetype(font_path(False), 23)
    brand_font = ImageFont.truetype(font_path(True), 17)

    draw.rounded_rectangle((46, 35, 250, 75), radius=20, fill=(239, 228, 246))
    draw.text((67, 45), "日常屿 QUICK START", font=brand_font, fill=PURPLE)
    draw.text((48, 104), str(spec["title"]), font=title_font, fill=INK)

    caption_y = 169
    for line in wrap_text(draw, str(spec["caption"]), caption_font, 1160):
        draw.text((50, caption_y), line, font=caption_font, fill=MUTED)
        caption_y += 34

    image_name = spec.get("image")
    if image_name:
        screenshot = Image.open(ROOT / "docs" / "images" / str(image_name))
        is_mobile = bool(spec.get("mobile"))
        fitted = fit_inside(screenshot, (1120 if not is_mobile else 350, 440), is_mobile)
        if is_mobile:
            x = 760
            y = 232
            draw.rounded_rectangle((50, 255, 685, 575), radius=28, fill=(255, 255, 255))
            mobile_title = ImageFont.truetype(font_path(True), 34)
            mobile_copy = ImageFont.truetype(font_path(False), 24)
            draw.text((90, 305), "打开手机浏览器", font=mobile_title, fill=INK)
            draw.text((90, 370), "登录同一账号", font=mobile_copy, fill=MUTED)
            draw.text((90, 415), "添加到主屏幕", font=mobile_copy, fill=MUTED)
            draw.text((90, 460), "从桌面图标进入", font=mobile_copy, fill=MUTED)
            draw.rounded_rectangle((90, 515, 420, 565), radius=22, fill=PURPLE)
            draw.text((128, 526), "今日｜时间表｜＋｜时间线｜我的", font=brand_font, fill=(255, 255, 255))
        else:
            x = (WIDTH - fitted.width) // 2
            y = 244 + max(0, (430 - fitted.height) // 2)
        shadow = Image.new("RGBA", (fitted.width + 50, fitted.height + 50), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (20, 20, fitted.width + 30, fitted.height + 30),
            radius=24,
            fill=(59, 40, 66, 65),
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(16))
        canvas.paste(shadow, (x - 25, y - 25), shadow)
        mask = rounded_mask(fitted.size, 18)
        canvas.paste(fitted, (x, y), mask)
    else:
        render_concept(draw, spec)

    draw.text((50, 681), "github.com · 开源 / 隐私优先 / 可自部署", font=brand_font, fill=(133, 113, 128))
    canvas.save(target, quality=94)


def find_ffmpeg() -> str:
    configured = os.environ.get("FFMPEG_BINARY")
    if configured and Path(configured).exists():
        return configured
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:
        raise RuntimeError("找不到 ffmpeg；请安装 ffmpeg 或 imageio-ffmpeg。") from error


def run(command: list[str]) -> None:
    subprocess.run(command, check=True, cwd=ROOT)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, help="可选的 WAV/MP3 配音文件")
    args = parser.parse_args()

    work = ROOT / "outputs" / "walkthrough"
    destination = ROOT / "public" / "tutorial"
    work.mkdir(parents=True, exist_ok=True)
    destination.mkdir(parents=True, exist_ok=True)

    slide_paths: list[Path] = []
    for index, slide in enumerate(SLIDES, start=1):
        path = work / f"slide-{index:02d}.png"
        render_slide(slide, path)
        slide_paths.append(path)

    shutil.copy2(slide_paths[0], destination / "quick-start-poster.png")
    concat = work / "slides.txt"
    with concat.open("w", encoding="utf-8", newline="\n") as handle:
        for path, slide in zip(slide_paths, SLIDES):
            handle.write(f"file '{path.as_posix()}'\n")
            handle.write(f"duration {slide['duration']}\n")
        handle.write(f"file '{slide_paths[-1].as_posix()}'\n")

    ffmpeg = find_ffmpeg()
    silent = work / "walkthrough-silent.mp4"
    run(
        [
            ffmpeg,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat),
            "-vf",
            "fps=30,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "22",
            "-movflags",
            "+faststart",
            str(silent),
        ]
    )

    output = destination / "richangyu-quick-start.mp4"
    if args.audio and args.audio.exists():
        run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(silent),
                "-i",
                str(args.audio.resolve()),
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-shortest",
                "-movflags",
                "+faststart",
                str(output),
            ]
        )
    else:
        shutil.copy2(silent, output)

    print(f"视频：{output}")
    print(f"封面：{destination / 'quick-start-poster.png'}")


if __name__ == "__main__":
    main()
