param(
  [string]$OutputPath = "outputs/walkthrough/narration-v12.wav"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$sections = @(
  "欢迎来到日常屿，一个开源、隐私优先、可以自己部署的个人生活工作台。它不是把日记、日历和表格简单堆在一起，而是把记录、计划、行动和回顾连接成一套长期可用的生活系统。",
  "整个产品围绕三条时间轨道展开。计划记录准备做什么，实际记录真正做了什么，回忆保存文字、照片、心情和反思。这样周总结看到的不是漂亮的计划，而是真实投入和变化。",
  "每天可以从今日工作台开始。这里集中显示当天激励、今日三件事、时间表、照片、心情、收件箱、财务与兼职概况。首页卡片可以调整，只保留此刻真正有用的信息。",
  "时间表支持今日、三日、周、月和学期视图。除了逐条新建，也可以批量录入一天或一周的课程、学习和工作。结束后补充实际时间、结果和感受，系统就能比较计划与实际。",
  "来不及整理时，把文字、照片、语音、文件或链接先放进生活收件箱。之后再把它整理成生活记录、日程、表格行或专题。一次记录可以同时关联人物、地点、项目和照片。",
  "情报中心先读取国内外公开来源，再由人工智能提炼热点、研究信号和行动建议。每条结论都应该能回到原始来源。真正有价值的信息可以转为阅读任务、研究专题或求职行动。",
  "在饮食与营养中上传早餐、午餐或晚餐照片，视觉模型会估算食物、份量、热量和营养素。照片无法判断准确重量和用油，所以请手动确认。这里用于生活记录，不代替医学建议。",
  "财务和兼职彼此联动，但不会混成一个数字。兼职打卡记录做了多久，应收款记录应该拿到多少，结算记录实际到账，财务账户记录钱真正进入哪里。这样才能看见待收款、成本、净利润和真实有效时薪。",
  "手机端是可安装的网页应用。用手机浏览器打开同一网址并登录，再添加到主屏幕，就能像应用一样使用。同一账号读取同一份云端数据，离线记录会先排队，联网后继续同步。",
  "人工智能是可选增强层。没有模型密钥时，普通记录、日程、表格和财务仍然可以使用。文字模型和视觉模型可以分别配置。人工智能内容保留来源，写入正式数据前由你确认，私密内容默认隔离。",
  "第一周不需要一次配置全部模块。第一天只记录一件事并安排明天。第二到第三天开始使用收件箱。第四到第五天补充实际投入。第六天建立一个专题或表格。第七天生成周总结，并下载一次完整备份。",
  "日常屿的目标不是让你每天完成更多，而是帮助你看见时间花在了哪里，哪些经历值得保存，以及下一步真正重要的是什么。现在，从今天的一条真实记录开始。"
)

$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$directory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
[System.IO.Directory]::CreateDirectory($directory) | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$chineseVoice = $synth.GetInstalledVoices() |
  Where-Object { $_.VoiceInfo.Culture.Name -like "zh-*" } |
  Select-Object -First 1

if ($null -ne $chineseVoice) {
  $synth.SelectVoice($chineseVoice.VoiceInfo.Name)
}

$synth.Rate = 3
$synth.Volume = 100
$culture = [System.Globalization.CultureInfo]::GetCultureInfo("zh-CN")
$builder = New-Object System.Speech.Synthesis.PromptBuilder($culture)

foreach ($section in $sections) {
  $builder.AppendText($section)
  $builder.AppendBreak([System.TimeSpan]::FromMilliseconds(520))
}

$synth.SetOutputToWaveFile($resolvedOutput)
$synth.Speak($builder)
$synth.Dispose()

Write-Output "旁白已生成：$resolvedOutput"
