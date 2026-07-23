"""
系统模板预置数据
包含各行业的精品 Prompt 制图模板，作为模板中心的"系统模板"展示
"""

SYSTEM_TEMPLATES = [
    # ============================================================
    # 📸 穿搭分享
    # ============================================================
    {
        "name": "INS 风穿搭封面",
        "description": "极简留白的 INS 风格穿搭展示，适合日常穿搭分享、OOTD 打卡",
        "category": "穿搭",
        "style_tag": "极简、INS风",
        "sort_order": 10,
        "config": {
            "ai_prompt_template": (
                "Generate a high-end fashion photography poster. "
                "Theme: '{title}'. "
                "Style: minimal INS aesthetic, clean background with soft natural lighting, "
                "subtle shadows, muted tones. {style_desc}. "
                "Color palette: {color_desc}. "
                "The outfit should be the focal point, shot from a flattering angle. "
                "No text overlay on the image."
            ),
            "text_slots": [
                {"name": "title", "label": "穿搭主题", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },
    {
        "name": "韩系清冷风穿搭",
        "description": "韩系高级感穿搭图，冷色调、胶片质感，适合氛围感穿搭分享",
        "category": "穿搭",
        "style_tag": "韩系、胶片感",
        "sort_order": 11,
        "config": {
            "ai_prompt_template": (
                "Generate a Korean style fashion editorial photo. "
                "Theme: '{title}'. "
                "Style: cool-toned, film grain texture, muted desaturated colors, "
                "editorial composition with negative space. {style_desc}. "
                "Color palette: {color_desc}. "
                "Atmosphere: effortlessly chic, understated luxury. "
                "No text on the image."
            ),
            "text_slots": [
                {"name": "title", "label": "穿搭风格描述", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },

    # ============================================================
    # 🍜 美食探店
    # ============================================================
    {
        "name": "美食打卡特写",
        "description": "精致美食特写图，突出食物质感与色泽，适合探店打卡、美食安利",
        "category": "美食",
        "style_tag": "美食摄影、暖调",
        "sort_order": 20,
        "config": {
            "ai_prompt_template": (
                "Generate a stunning food photography image. "
                "Dish: '{dish_name}'. Restaurant: '{restaurant_name}'. "
                "Style: top-down or 45-degree angle shot, warm golden-hour lighting, "
                "shallow depth of field, steam or sauce glistening. {style_desc}. "
                "Color palette: {color_desc}. "
                "Background: rustic wooden table or marble surface with minimal props. "
                "Make the food look irresistibly appetizing. No text."
            ),
            "text_slots": [
                {"name": "dish_name", "label": "菜品名称", "required": True},
                {"name": "restaurant_name", "label": "餐厅名称", "required": False},
            ],
            "default_aspect_ratio": "1:1",
        },
    },
    {
        "name": "咖啡 / 甜品氛围图",
        "description": "治愈系咖啡甜品图，强调氛围感和生活方式，适合下午茶安利",
        "category": "美食",
        "style_tag": "治愈系、氛围感",
        "sort_order": 21,
        "config": {
            "ai_prompt_template": (
                "Generate a cozy café still-life photograph. "
                "Subject: '{item_name}'. "
                "Style: warm ambient lighting, soft bokeh background, pastel tones, "
                "lifestyle aesthetic with linen napkin and dried flowers as props. {style_desc}. "
                "Color palette: {color_desc}. "
                "Mood: relaxing, inviting, Sunday afternoon vibes. "
                "No text overlay."
            ),
            "text_slots": [
                {"name": "item_name", "label": "饮品/甜品名称", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },

    # ============================================================
    # 📚 知识干货
    # ============================================================
    {
        "name": "知识干货卡片",
        "description": "清晰的知识分享信息图，适合干货科普、学习笔记、技能分享",
        "category": "知识",
        "style_tag": "信息图、清晰",
        "sort_order": 30,
        "config": {
            "ai_prompt_template": (
                "Generate a clean, modern infographic-style card background. "
                "Topic: '{topic}'. "
                "Style: flat design with subtle gradients, geometric shapes, "
                "professional color blocking, ample white space for text overlay. {style_desc}. "
                "Color palette: {color_desc}. "
                "The design should feel educational and organized, "
                "with visual hierarchy suggesting sections for key points. "
                "Do NOT include any text - this is a background only."
            ),
            "text_slots": [
                {"name": "topic", "label": "知识主题", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },
    {
        "name": "书单 / 学习推荐",
        "description": "精美书单或学习资源推荐图，适合读书笔记、好书分享",
        "category": "知识",
        "style_tag": "书卷气、文艺",
        "sort_order": 31,
        "config": {
            "ai_prompt_template": (
                "Generate a sophisticated book recommendation poster background. "
                "Book/Topic: '{book_title}'. "
                "Style: literary aesthetic, warm reading lamp lighting, "
                "stack of elegant books, cozy reading nook atmosphere. {style_desc}. "
                "Color palette: {color_desc}. "
                "Props: reading glasses, a cup of tea, autumn leaves or dried flowers. "
                "Mood: intellectual, warm, inviting to read. No text."
            ),
            "text_slots": [
                {"name": "book_title", "label": "书名或主题", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },

    # ============================================================
    # 🏠 家居好物
    # ============================================================
    {
        "name": "家居场景图",
        "description": "高级感家居单品场景展示，适合好物推荐、居家改造分享",
        "category": "家居",
        "style_tag": "家居、高级感",
        "sort_order": 40,
        "config": {
            "ai_prompt_template": (
                "Generate a premium interior design product photography. "
                "Product: '{product_name}'. Scene: '{scene_desc}'. "
                "Style: Scandinavian minimalism, natural daylight from large windows, "
                "clean lines, neutral palette with one accent color. {style_desc}. "
                "Color palette: {color_desc}. "
                "The product should be showcased in a real living space context. "
                "High-end home magazine quality. No text."
            ),
            "text_slots": [
                {"name": "product_name", "label": "产品名称", "required": True},
                {"name": "scene_desc", "label": "使用场景描述", "required": False},
            ],
            "default_aspect_ratio": "3:4",
        },
    },

    # ============================================================
    # 🌸 情绪壁纸
    # ============================================================
    {
        "name": "治愈系壁纸",
        "description": "高品质治愈系壁纸，适合情绪语录、心灵鸡汤、晚安帖",
        "category": "情绪",
        "style_tag": "治愈、梦幻",
        "sort_order": 50,
        "config": {
            "ai_prompt_template": (
                "Generate a dreamy, healing wallpaper image. "
                "Mood: '{mood}'. "
                "Style: soft ethereal atmosphere, pastel colors, gentle light leaks, "
                "nature elements like clouds, flowers, aurora, or ocean waves. {style_desc}. "
                "Color palette: {color_desc}. "
                "The image should evoke peace, comfort, and emotional warmth. "
                "Leave clean space for text overlay. No text in the image."
            ),
            "text_slots": [
                {"name": "mood", "label": "情绪/氛围关键词", "required": True},
            ],
            "default_aspect_ratio": "9:16",
        },
    },
    {
        "name": "文艺语录配图",
        "description": "文艺清新的语录配图背景，适合每日文案、心情分享",
        "category": "情绪",
        "style_tag": "文艺、清新",
        "sort_order": 51,
        "config": {
            "ai_prompt_template": (
                "Generate an artistic quote background image. "
                "Theme: '{theme}'. "
                "Style: watercolor wash effect, soft gradients, subtle botanical "
                "elements like pressed flowers or leaves, paper texture overlay. {style_desc}. "
                "Color palette: {color_desc}. "
                "Large clean center area reserved for text overlay. "
                "Mood: poetic, contemplative, gently uplifting. No text in image."
            ),
            "text_slots": [
                {"name": "theme", "label": "语录主题", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },

    # ============================================================
    # ✈️ 旅行日记
    # ============================================================
    {
        "name": "旅行封面图",
        "description": "杂志级旅行封面图，适合旅行攻略、目的地安利",
        "category": "旅行",
        "style_tag": "旅行、杂志感",
        "sort_order": 60,
        "config": {
            "ai_prompt_template": (
                "Generate a travel magazine cover-quality photograph. "
                "Destination: '{destination}'. "
                "Style: vibrant yet sophisticated, golden hour or blue hour lighting, "
                "sweeping landscape or iconic landmark composition. {style_desc}. "
                "Color palette: {color_desc}. "
                "The image should inspire wanderlust, with cinematic depth and "
                "professional color grading. No text overlay."
            ),
            "text_slots": [
                {"name": "destination", "label": "目的地名称", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },

    # ============================================================
    # 🎨 通用创意
    # ============================================================
    {
        "name": "渐变抽象背景",
        "description": "高品质渐变抽象背景图，适合万能配图、品牌宣传",
        "category": "通用",
        "style_tag": "渐变、抽象",
        "sort_order": 70,
        "config": {
            "ai_prompt_template": (
                "Generate an abstract gradient background with artistic flair. "
                "Theme: '{theme}'. "
                "Style: smooth flowing gradients, organic shapes, glass morphism effects, "
                "3D rendered floating elements. {style_desc}. "
                "Color palette: {color_desc}. "
                "Modern, premium feel suitable for tech or lifestyle branding. "
                "Clean composition with space for overlay content. No text."
            ),
            "text_slots": [
                {"name": "theme", "label": "主题/氛围", "required": True},
            ],
            "default_aspect_ratio": "3:4",
        },
    },
    {
        "name": "电商产品展示",
        "description": "高端电商产品展示模板，纯净背景突出商品，适合好物推荐",
        "category": "通用",
        "style_tag": "电商、高端",
        "sort_order": 71,
        "config": {
            "ai_prompt_template": (
                "Generate a premium e-commerce product showcase image. "
                "Product: '{product_name}'. Description: '{product_desc}'. "
                "Style: clean studio lighting, minimalist white or gradient background, "
                "subtle reflection on glossy surface, product hero shot. {style_desc}. "
                "Color palette: {color_desc}. "
                "Professional commercial photography quality. "
                "The product should appear prestigious and desirable. No text."
            ),
            "text_slots": [
                {"name": "product_name", "label": "产品名称", "required": True},
                {"name": "product_desc", "label": "产品特点描述", "required": False},
            ],
            "default_aspect_ratio": "1:1",
        },
    },
]
