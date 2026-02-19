export const zh = {
  'nav.brand': 'LookBack',
  'nav.language': '语言',
  'nav.language.zh': '中文',
  'nav.language.en': 'EN',

  'hero.badge': '桌面视觉工作台',
  'hero.title': '在一个画布里整理和协作视觉素材',
  'hero.subtitle': '速度轻快，适配日常视觉工作流。',
  'hero.desc':
    'LookBack 将导入、布局、检索、分析与导出串联到同一流程中，减少重复操作和上下文切换。',
  'hero.primary': '下载 mac & win',
  'hero.version': 'v{{version}}',
  'hero.secondary': '查看功能',
  'hero.previewAlt': '拼图导出预览',
  'hero.searchAlt': '搜索预览',

  'features.title': '核心能力',
  'features.desc': '各项能力围绕同一份视觉数据工作，减少重复操作与信息断层。',
  'features.jump': '快速跳转',
  'features.imageAlt': '功能预览 {{index}}',

  'feature.0.title': '自动最优布局',
  'feature.0.desc': '自动计算内容分布与留白，生成结构清晰且可继续编辑的画布布局。',
  'feature.1.title': '可扩展插件系统',
  'feature.1.desc': '按你的业务流程挂载能力模块，保持主流程轻量，同时支持团队标准化沉淀。',
  'feature.2.title': '锚点跳转系统',
  'feature.2.desc': '保存任意缩放与视角状态，一键回到关键工作位置，复盘与协作都更直接。',
  'feature.3.title': '图片分析',
  'feature.3.desc': '内置色调分析与情绪版能力，支持从视觉资产到分析结果的导出。',
  'feature.4.title': '多方式导入',
  'feature.4.desc': '支持网页图片与本地文件导入，混合来源统一管理，减少素材整理成本。',
  'feature.5.title': '多维度搜索',
  'feature.5.desc': '支持色调搜索、颜色搜索与文字搜索，快速定位目标素材，降低检索阻力。',
  'feature.6.title': '穿透模式与置顶模式',
  'feature.6.desc': '在不同场景间自由切换窗口行为，保证工具始终在你需要的位置。',

  'footer.line': 'LookBack · 更顺手的视觉工作流工具。',
} as const;

export const en = {
  'nav.brand': 'LookBack',
  'nav.language': 'Language',
  'nav.language.zh': '中文',
  'nav.language.en': 'EN',

  'hero.badge': 'Desktop Visual Workspace',
  'hero.title': 'Organize and collaborate on visual assets in one canvas',
  'hero.subtitle': 'Fast and lightweight for everyday visual workflows.',
  'hero.desc':
    'LookBack connects import, layout, search, analysis, and export in one flow to reduce repeated steps and context switching.',
  'hero.primary': 'Download mac & win',
  'hero.version': 'v{{version}}',
  'hero.secondary': 'Explore Features',
  'hero.previewAlt': 'Stitch Export Preview',
  'hero.searchAlt': 'Search Preview',

  'features.title': 'Core Features',
  'features.desc':
    'Capabilities share one visual data source to reduce repeated actions and context loss.',
  'features.jump': 'Quick Jump',
  'features.imageAlt': 'Feature Preview {{index}}',

  'feature.0.title': 'Automatic Optimal Layout',
  'feature.0.desc': 'Balances structure and spacing to generate clean, editable canvas compositions.',
  'feature.1.title': 'Extensible Plugin System',
  'feature.1.desc': 'Attach workflow modules for your domain while keeping the core flow lean and team-friendly.',
  'feature.2.title': 'Anchor Snapshot System',
  'feature.2.desc': 'Save any zoom/viewpoint state and jump back instantly for focused execution, review, and collaboration.',
  'feature.3.title': 'Image Analysis',
  'feature.3.desc': 'Built-in tone analysis and moodboard export help turn visual assets into usable output.',
  'feature.4.title': 'Multi-Source Import',
  'feature.4.desc': 'Import from web pages and local files in one stream, then manage all assets with a unified workflow.',
  'feature.5.title': 'Multi-Dimensional Search',
  'feature.5.desc': 'Find assets by tone, color, or text with low friction and high recall.',
  'feature.6.title': 'Pass-Through and Always-on-Top Modes',
  'feature.6.desc': 'Switch window behavior by context so your tool stays exactly where your attention needs it.',

  'footer.line': 'LookBack · A practical tool for visual workflows.',
} satisfies Record<keyof typeof zh, string>;
