"""
海报/封面生成服务模块
支持四种模式：自定义生成、模板生成、以图改图、风格迁移
使用混合合成架构：AI 生成背景 + 程序叠加文字
"""
import os
import json
import uuid
import asyncio
import base64
import httpx
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from dotenv import load_dotenv

from app.core.errors import CapabilityUnavailableError
from app.core.media import decode_image_base64
from app.core.runtime_context import (
    has_runtime_identity,
    resolve_static_url,
    tenant_static_path,
)

load_dotenv()


# ======================== 尺寸预设 ========================
ASPECT_RATIOS: Dict[str, Dict[str, Any]] = {
    "3:4":    {"width": 1080, "height": 1440, "label": "小红书", "api_size": "1536x2048"},
    "2.35:1": {"width": 1080, "height": 460,  "label": "公众号", "api_size": "1792x768"},
    "9:16":   {"width": 1080, "height": 1920, "label": "抖音", "api_size": "1024x1792"},
    "1:1":    {"width": 1080, "height": 1080, "label": "正方形", "api_size": "1024x1024"},
    "16:9":   {"width": 1920, "height": 1080, "label": "横版", "api_size": "1792x1024"},
}


class PosterService:
    """海报生成服务类"""

    SUPPORTED_PROVIDERS = {"gemini", "gemini_ch", "doubao", "gpt_image"}

    def __init__(self):
        self.project_root = Path(__file__).resolve().parent.parent.parent
        configured_provider = os.getenv("IMAGE_PROVIDER", "gemini").lower()
        self.provider = configured_provider if configured_provider in self.SUPPORTED_PROVIDERS else "gemini"

        # Gemini 代理 1（xunruijie）
        self.api_key = os.getenv("IMAGE_API_KEY", "")
        self.base_url = os.getenv("IMAGE_BASE_URL", "https://api.xunruijie.com")
        self.model = os.getenv("IMAGE_MODEL", "gemini-3-pro-image-preview")

        # Gemini 代理 2（changhuai）
        self.api_key_ch = os.getenv("IMAGE_API_KEY_CH", "")
        self.base_url_ch = os.getenv("IMAGE_BASE_URL_CH", "https://www.changhuai.vip")
        self.model_ch = os.getenv("IMAGE_MODEL_CH", "gemini-3-pro-image-preview")

        # GPT Image 2（scdn）
        self.gpt_image_api_key = os.getenv("GPT_IMAGE_API_KEY", "")
        self.gpt_image_base_url = os.getenv("GPT_IMAGE_BASE_URL", "https://api-cn2.scdn.online")
        self.gpt_image_model = os.getenv("GPT_IMAGE_MODEL", "gpt-image-2")

        # 输出目录
        self.output_dir = Path("static/images/posters")
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # 加载预置数据
        self._templates: List[Dict] = []
        self._style_tags: List[Dict] = []
        self._load_preset_data()

        active_key = self._get_provider_api_key(self.provider)
        if not active_key:
            print(f"[PosterService] 警告: API Key 未配置（当前引擎: {self.provider}），图片生成功能不可用")

        print(f"[PosterService] 图片引擎: {self.provider}")

    def _get_effective_provider(self, provider_override: Optional[str] = None) -> str:
        """获取实际使用的引擎，支持用户偏好覆盖"""
        if provider_override and provider_override != "system" and provider_override in self.SUPPORTED_PROVIDERS:
            return provider_override
        return self.provider

    def _get_provider_api_key(self, provider: str) -> str:
        """返回 provider 对应的 API Key，用于启动时配置检查。"""
        if provider == "doubao":
            return os.getenv("LLM_API_KEY", "")
        if provider == "gemini_ch":
            return self.api_key_ch
        if provider == "gpt_image":
            return self.gpt_image_api_key
        return self.api_key

    def is_configured(
        self,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> bool:
        if image_model_config:
            return bool(
                image_model_config.get("provider_type") in {"openai_image", "gemini", "doubao"}
                and str(image_model_config.get("api_key") or "").strip()
                and str(image_model_config.get("base_url") or "").strip()
                and str(image_model_config.get("model_name") or "").strip()
            )
        provider = self._get_effective_provider(provider_override)
        return bool(self._get_provider_api_key(provider))

    def require_configured(
        self,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self.is_configured(provider_override, image_model_config):
            raise CapabilityUnavailableError(
                "image",
                "图片生成模型未配置，请先在 AI 工程与模型治理中启用可用模型",
            )

    # ======================== 预置数据加载 ========================

    def _load_preset_data(self):
        """加载预置模板和风格标签数据"""
        data_dir = Path(__file__).parent.parent / "data"

        # 加载模板
        templates_file = data_dir / "poster_templates.json"
        if templates_file.exists():
            with open(templates_file, "r", encoding="utf-8") as f:
                self._templates = json.load(f)
            print(f"[PosterService] 已加载 {len(self._templates)} 个预置模板")

        # 加载风格标签
        tags_file = data_dir / "style_tags.json"
        if tags_file.exists():
            with open(tags_file, "r", encoding="utf-8") as f:
                self._style_tags = json.load(f)
            print(f"[PosterService] 已加载 {len(self._style_tags)} 个风格标签")

    # ======================== 对外接口 ========================

    def get_templates(self) -> List[Dict]:
        """获取所有预置模板列表"""
        return self._templates

    def get_template_by_index(self, index: int) -> Optional[Dict]:
        """按索引获取单个模板"""
        if 0 <= index < len(self._templates):
            return self._templates[index]
        return None

    def get_style_tags(self) -> List[Dict]:
        """获取所有风格标签"""
        return self._style_tags

    def get_style_tag_by_name(self, name: str) -> Optional[Dict]:
        """按名称获取风格标签"""
        for tag in self._style_tags:
            if tag["name"] == name or tag.get("name_en") == name:
                return tag
        return None

    def get_aspect_ratios(self) -> Dict[str, Dict[str, Any]]:
        """获取支持的尺寸比例"""
        return ASPECT_RATIOS

    def _resolve_api_size(self, aspect_ratio: Optional[str] = None) -> str:
        """将前端比例映射为图片 API 请求的像素尺寸。"""
        ratio_info = ASPECT_RATIOS.get(aspect_ratio or "3:4", ASPECT_RATIOS["3:4"])
        return ratio_info.get("api_size", "1024x1024")

    def _build_gemini_generation_config(self, aspect_ratio: Optional[str] = None) -> Dict[str, Any]:
        """构建 Gemini 生图 generationConfig，尽量通过 imageConfig 约束比例。"""
        config: Dict[str, Any] = {"responseModalities": ["IMAGE", "TEXT"]}
        ratio = aspect_ratio or "3:4"
        supported = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"}
        if ratio in supported:
            config["imageConfig"] = {"aspectRatio": ratio}
        return config

    # ======================== 自定义生成 ========================

    async def generate_custom(
        self,
        prompt: str,
        style_tags: Optional[List[str]] = None,
        aspect_ratio: str = "3:4",
        color_tone: Optional[str] = None,
        reference_images: Optional[List[Dict[str, Any]]] = None,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
        brand_kit: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        自定义生成海报

        Args:
            prompt: 用户输入的提示词
            style_tags: 可选的风格标签名称列表
            aspect_ratio: 输出比例，默认 3:4
            color_tone: 可选的色调偏好

        Returns:
            包含图片 URL 和元信息的字典
        """
        # 1. 构建增强提示词
        enhanced_prompt = self._build_custom_prompt(
            prompt, style_tags, aspect_ratio, color_tone, brand_kit=brand_kit
        )
        reference_image_inputs = self._extract_reference_image_base64s(reference_images)
        if reference_image_inputs:
            enhanced_prompt += (
                "\n\n【参考图片融合要求】\n"
                f"- 用户上传了 {len(reference_image_inputs)} 张参考图片，请结合这些图片和文字提示一起创作。\n"
                "- 参考图用于提取主体信息、风格、内容元素、构图关系、二维码或需要保留的视觉信息。\n"
                "- 不要机械拼贴原图；应重新设计成一张完整、清晰、可发布的高质量海报。\n"
                "- 当提示词提到“图1、图2、图3”等编号时，按上传顺序理解对应参考图。"
            )

        # 2. 获取尺寸信息
        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])

        # 3. 调用 AI 生成图片
        print(f"[PosterService] 自定义生成: {prompt[:50]}...")
        image_base64 = await self._call_ai_image_api(
            enhanced_prompt,
            input_images_base64=reference_image_inputs,
            provider_override=provider_override,
            image_model_config=image_model_config,
            aspect_ratio=aspect_ratio,
        )

        if not image_base64:
            return {
                "success": False,
                "error": "AI 图片生成失败，请稍后重试",
                "prompt_used": enhanced_prompt,
            }

        # 4. 保存图片
        image_url = self._save_image(image_base64, prefix="poster_custom", brand_kit=brand_kit)

        return {
            "success": True,
            "image_url": image_url,
            "prompt_used": enhanced_prompt,
            "aspect_ratio": aspect_ratio,
            "width": ratio_info["width"],
            "height": ratio_info["height"],
            "mode": "custom",
        }

    # ======================== 模板生成 ========================

    async def generate_from_template(
        self,
        template_index: int,
        params: Dict[str, str],
        style_tag: Optional[str] = None,
        color_option: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
        brand_kit: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        模板生成海报

        Args:
            template_index: 模板索引
            params: 用户填写的文案参数（如 title, subtitle 等）
            style_tag: 可选的风格标签覆盖
            color_option: 可选的色调选择
            aspect_ratio: 可选的尺寸覆盖

        Returns:
            包含图片 URL 和元信息的字典
        """
        # 1. 获取模板配置
        template = self.get_template_by_index(template_index)
        if not template:
            return {"success": False, "error": f"模板索引 {template_index} 不存在"}

        config = template.get("config", {})

        # 2. 验证必填参数
        for slot in config.get("text_slots", []):
            if slot.get("required") and not params.get(slot["name"]):
                return {
                    "success": False,
                    "error": f"缺少必填参数: {slot['label']}",
                }

        # 3. 确定风格描述
        effective_style = style_tag or template.get("style_tag", "")
        style_desc = ""
        if effective_style:
            tag_info = self.get_style_tag_by_name(effective_style)
            if tag_info:
                style_desc = tag_info["prompt_snippet"]
            else:
                style_desc = effective_style

        # 4. 确定色调
        color_desc = color_option or (
            config.get("color_options", ["自然"])[0]
        )

        # 5. 确定输出比例
        effective_ratio = aspect_ratio or config.get("default_aspect_ratio", "3:4")
        ratio_info = ASPECT_RATIOS.get(effective_ratio, ASPECT_RATIOS["3:4"])

        # 6. 构建 AI 提示词
        ai_prompt_template = config.get("ai_prompt_template", "")

        format_params = {
            **params,
            "style_desc": style_desc,
            "color_desc": color_desc,
        }

        if ai_prompt_template:
            try:
                ai_prompt = ai_prompt_template.format(**format_params)
            except KeyError:
                ai_prompt = ""

        if not ai_prompt_template or not ai_prompt.strip():
            parts = [f"生成一张「{template['name']}」主题的高质量海报图片。"]
            for slot in config.get("text_slots", []):
                val = params.get(slot["name"], "")
                if val:
                    parts.append(f"{slot['label']}：{val}")
            if style_desc:
                parts.append(f"风格：{style_desc}")
            if color_desc:
                parts.append(f"色调：{color_desc}")
            parts.append("画面精致，排版美观，适合社交媒体发布。")
            ai_prompt = "\n".join(parts)

        # 7. 添加尺寸约束
        ai_prompt += f"\n\n图片比例要求：{effective_ratio}（{ratio_info['label']}平台适用）"
        if brand_kit:
            ai_prompt = self._inject_brand(ai_prompt, brand_kit)

        # 8. 调用 AI 生成
        print(f"[PosterService] 模板生成 [{template['name']}]: {params.get('title', '')}")
        image_base64 = await self._call_ai_image_api(
            ai_prompt,
            provider_override=provider_override,
            image_model_config=image_model_config,
            aspect_ratio=effective_ratio,
        )

        if not image_base64:
            return {
                "success": False,
                "error": "AI 图片生成失败，请稍后重试",
                "prompt_used": ai_prompt,
            }

        # 9. 保存图片
        image_url = self._save_image(image_base64, prefix="poster_tpl", brand_kit=brand_kit)

        return {
            "success": True,
            "image_url": image_url,
            "prompt_used": ai_prompt,
            "template_name": template["name"],
            "aspect_ratio": effective_ratio,
            "width": ratio_info["width"],
            "height": ratio_info["height"],
            "mode": "template",
            "params": params,
        }

    # ======================== 数据库模板（个人模板）生成 ========================

    async def generate_from_db_template(
        self,
        template_config: Dict[str, Any],
        template_name: str,
        template_style_tag: Optional[str],
        params: Dict[str, str],
        reference_images: Optional[List[Dict[str, Any]]] = None,
        style_tag: Optional[str] = None,
        color_option: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
        brand_kit: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        使用数据库中的个人模板生成海报

        与 generate_from_template 逻辑一致，但模板配置直接从数据库传入
        而非通过 index 查询系统预置 JSON
        """
        config = template_config

        # 1. 确定风格描述
        effective_style = style_tag or template_style_tag or ""
        style_desc = ""
        if effective_style:
            tag_info = self.get_style_tag_by_name(effective_style)
            if tag_info:
                style_desc = tag_info["prompt_snippet"]
            else:
                style_desc = effective_style

        # 2. 确定色调
        color_desc = color_option or (
            config.get("color_options", ["自然"])[0] if config.get("color_options") else "自然"
        )

        # 3. 确定输出比例
        effective_ratio = aspect_ratio or config.get("default_aspect_ratio", "3:4")
        ratio_info = ASPECT_RATIOS.get(effective_ratio, ASPECT_RATIOS["3:4"])

        # 4. 构建 AI 提示词
        ai_prompt_template = config.get("ai_prompt_template", "")

        format_params = {
            **params,
            "style_desc": style_desc,
            "color_desc": color_desc,
        }

        ai_prompt = ""
        if ai_prompt_template:
            try:
                ai_prompt = ai_prompt_template.format(**format_params)
            except KeyError as e:
                print(f"[PosterService] 个人模板提示词格式化失败，缺少变量: {e}")
                ai_prompt = ""

        if not ai_prompt.strip():
            parts = [f"生成一张「{template_name}」主题的高质量海报图片。"]
            for key, val in params.items():
                if val:
                    parts.append(f"{key}：{val}")
            if style_desc:
                parts.append(f"风格：{style_desc}")
            if color_desc:
                parts.append(f"色调：{color_desc}")
            parts.append("画面精致，排版美观，适合社交媒体发布。")
            ai_prompt = "\n".join(parts)

        # 5. 添加尺寸约束
        ai_prompt += f"\n\n图片比例要求：{effective_ratio}（{ratio_info['label']}平台适用）"
        if brand_kit:
            ai_prompt = self._inject_brand(ai_prompt, brand_kit)

        input_images_base64 = self._extract_reference_image_base64s(reference_images)
        input_image_base64 = input_images_base64[0] if input_images_base64 else None
        if reference_images:
            if input_image_base64:
                ai_prompt += f"\n\n请参考上传的 {len(input_images_base64)} 张图片的主体信息、构图关系或二维码内容进行创作。"

        # 6. 调用 AI 生成
        print(f"[PosterService] 个人模板生成 [{template_name}]: {params.get('title', '')}")
        print(f"[PosterService] 提示词: {ai_prompt[:200]}...")
        image_base64 = await self._call_ai_image_api(
            ai_prompt,
            input_image_base64=input_image_base64,
            input_images_base64=input_images_base64,
            provider_override=provider_override,
            image_model_config=image_model_config,
            aspect_ratio=effective_ratio,
        )

        if not image_base64:
            return {
                "success": False,
                "error": "AI 图片生成失败，请稍后重试",
                "prompt_used": ai_prompt,
            }

        # 7. 保存图片
        image_url = self._save_image(image_base64, prefix="poster_tpl", brand_kit=brand_kit)

        return {
            "success": True,
            "image_url": image_url,
            "prompt_used": ai_prompt,
            "template_name": template_name,
            "aspect_ratio": effective_ratio,
            "width": ratio_info["width"],
            "height": ratio_info["height"],
            "mode": "template",
            "params": params,
        }

    # ======================== 以图改图 ========================

    async def generate_edit(
        self,
        image_base64: str,
        edit_prompt: str,
        aspect_ratio: str = "3:4",
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        以图改图 — 上传原始图片 + 编辑指令，AI 修改图片内容

        Args:
            image_base64: 原始图片的 base64 编码数据
            edit_prompt: 编辑指令（如"把背景换成海边日落"）
            aspect_ratio: 输出比例

        Returns:
            包含图片 URL 和元信息的字典
        """
        # 构建编辑提示词
        enhanced_prompt = self._build_edit_prompt(edit_prompt, aspect_ratio)
        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])

        print(f"[PosterService] 以图改图: {edit_prompt[:50]}...")
        image_result_base64 = await self._call_ai_image_api(
            enhanced_prompt, input_image_base64=image_base64,
            provider_override=provider_override,
            image_model_config=image_model_config,
            aspect_ratio=aspect_ratio,
        )

        if not image_result_base64:
            return {
                "success": False,
                "error": "AI 图片编辑失败，请稍后重试",
                "prompt_used": enhanced_prompt,
            }

        image_url = self._save_image(image_result_base64, prefix="poster_edit")

        return {
            "success": True,
            "image_url": image_url,
            "prompt_used": enhanced_prompt,
            "aspect_ratio": aspect_ratio,
            "width": ratio_info["width"],
            "height": ratio_info["height"],
            "mode": "edit",
        }

    # ======================== 风格迁移 ========================

    async def generate_style_transfer(
        self,
        image_base64: str,
        style_tags: List[str],
        strength: str = "medium",
        aspect_ratio: str = "3:4",
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        风格迁移 — 将原始图片转换为目标风格

        Args:
            image_base64: 原始图片的 base64 编码数据
            style_tags: 目标风格标签名称列表
            strength: 迁移强度 (light/medium/strong)
            aspect_ratio: 输出比例

        Returns:
            包含图片 URL 和元信息的字典
        """
        # 构建风格迁移提示词
        enhanced_prompt = self._build_style_transfer_prompt(
            style_tags, strength, aspect_ratio
        )
        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])

        style_names = ", ".join(style_tags)
        print(f"[PosterService] 风格迁移: {style_names} | 强度={strength}")
        image_result_base64 = await self._call_ai_image_api(
            enhanced_prompt, input_image_base64=image_base64,
            provider_override=provider_override,
            image_model_config=image_model_config,
            aspect_ratio=aspect_ratio,
        )

        if not image_result_base64:
            return {
                "success": False,
                "error": "AI 风格迁移失败，请稍后重试",
                "prompt_used": enhanced_prompt,
            }

        image_url = self._save_image(image_result_base64, prefix="poster_style")

        return {
            "success": True,
            "image_url": image_url,
            "prompt_used": enhanced_prompt,
            "aspect_ratio": aspect_ratio,
            "width": ratio_info["width"],
            "height": ratio_info["height"],
            "mode": "style_transfer",
            "style_tags": style_tags,
            "strength": strength,
        }

    # ======================== 局部重绘 (Inpaint) ========================

    async def generate_inpaint(
        self,
        image_base64: str,
        mask_base64: str,
        inpaint_prompt: str,
        aspect_ratio: str = "3:4",
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        局部重绘 — 根据遮罩区域和文字提示替换指定区域内容

        Args:
            image_base64: 原始图片 base64
            mask_base64: 遮罩图片 base64（白色区域 = 需要重绘）
            inpaint_prompt: 重绘提示词（如 "一只金毛犬"）
            aspect_ratio: 输出比例

        Returns:
            包含图片 URL 和元信息的字典
        """
        try:
            enhanced_prompt = self._build_inpaint_prompt(inpaint_prompt, aspect_ratio)

            image_result = await self._call_ai_image_api(
                enhanced_prompt,
                input_image_base64=image_base64,
                mask_image_base64=mask_base64,
                provider_override=provider_override,
                image_model_config=image_model_config,
                aspect_ratio=aspect_ratio,
            )

            if not image_result:
                return {"success": False, "error": "AI 局部重绘失败，未返回图片数据"}

            image_url = self._save_image(image_result, prefix="poster_inpaint")

            return {
                "success": True,
                "image_url": image_url,
                "mode": "inpaint",
                "aspect_ratio": aspect_ratio,
                "ai_prompt": enhanced_prompt,
            }

        except Exception as e:
            print(f"[PosterService] 局部重绘异常: {e}")
            return {"success": False, "error": f"局部重绘失败: {str(e)}"}

    async def generate_erase(
        self,
        image_base64: str,
        mask_base64: str,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        智能擦除 — 擦除遮罩区域的内容并自动补全背景

        Args:
            image_base64: 原始图片 base64
            mask_base64: 遮罩图片 base64（白色区域 = 需要擦除）

        Returns:
            包含图片 URL 和元信息的字典
        """
        try:
            erase_prompt = self._build_erase_prompt()

            image_result = await self._call_ai_image_api(
                erase_prompt,
                input_image_base64=image_base64,
                mask_image_base64=mask_base64,
                provider_override=provider_override,
                image_model_config=image_model_config,
            )

            if not image_result:
                return {"success": False, "error": "AI 智能擦除失败，未返回图片数据"}

            image_url = self._save_image(image_result, prefix="poster_erase")

            return {
                "success": True,
                "image_url": image_url,
                "mode": "erase",
                "ai_prompt": erase_prompt,
            }

        except Exception as e:
            print(f"[PosterService] 智能擦除异常: {e}")
            return {"success": False, "error": f"智能擦除失败: {str(e)}"}

    # ======================== 多尺寸适配 (Adapt / Outpaint) ========================

    async def generate_adapt(
        self,
        image_base64: str,
        source_ratio: str,
        target_ratio: str,
        strategy: str = "outpaint",
        outpaint_prompt: Optional[str] = None,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        将图片从源比例适配到目标比例

        Args:
            image_base64: 原始图片 base64
            source_ratio: 源图当前比例 (如 "3:4")
            target_ratio: 目标比例 (如 "16:9")
            strategy: 适配策略 "crop"(智能裁剪) 或 "outpaint"(AI 扩图)
            outpaint_prompt: AI 扩图时的补充提示词（可选）

        Returns:
            包含图片 URL 和元信息的字典
        """
        if target_ratio not in ASPECT_RATIOS:
            return {"success": False, "error": f"不支持的目标比例: {target_ratio}"}

        try:
            # 根据策略构建不同的提示词
            if strategy == "crop":
                prompt = self._build_crop_prompt(source_ratio, target_ratio)
            else:
                prompt = self._build_outpaint_prompt(
                    source_ratio, target_ratio, outpaint_prompt
                )

            # 调用 AI API（传入原图）
            image_result = await self._call_ai_image_api(
                prompt, input_image_base64=image_base64,
                provider_override=provider_override,
                image_model_config=image_model_config,
                aspect_ratio=target_ratio,
            )

            if not image_result:
                return {"success": False, "error": "AI 尺寸适配失败，未返回图片数据"}

            image_url = self._save_image(image_result, prefix=f"poster_adapt_{strategy}")
            target_info = ASPECT_RATIOS[target_ratio]

            return {
                "success": True,
                "image_url": image_url,
                "mode": "adapt",
                "aspect_ratio": target_ratio,
                "width": target_info["width"],
                "height": target_info["height"],
                "ai_prompt": prompt,
            }

        except Exception as e:
            print(f"[PosterService] 尺寸适配异常: {e}")
            return {"success": False, "error": f"尺寸适配失败: {str(e)}"}

    async def generate_export_all(
        self,
        image_base64: str,
        source_ratio: str,
        strategy: str = "outpaint",
        outpaint_prompt: Optional[str] = None,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        全平台一键导出 — 并发适配为所有不同于源比例的目标尺寸

        Args:
            image_base64: 原始图片 base64
            source_ratio: 源图当前比例
            strategy: 适配策略
            outpaint_prompt: AI 扩图时的补充提示词

        Returns:
            包含多张图片的结果字典
        """
        # 筛出与源比例不同的目标
        target_ratios = [r for r in ASPECT_RATIOS if r != source_ratio]

        if not target_ratios:
            return {"success": False, "error": "没有需要适配的目标比例"}

        # 使用信号量限制并发（避免 API 限速）
        semaphore = asyncio.Semaphore(2)

        async def adapt_one(ratio: str) -> Dict[str, Any]:
            async with semaphore:
                return await self.generate_adapt(
                    image_base64=image_base64,
                    source_ratio=source_ratio,
                    target_ratio=ratio,
                    strategy=strategy,
                    outpaint_prompt=outpaint_prompt,
                    provider_override=provider_override,
                    image_model_config=image_model_config,
                )

        # 并发执行所有适配任务
        results = await asyncio.gather(
            *[adapt_one(r) for r in target_ratios],
            return_exceptions=True,
        )

        images = []
        errors = []
        for ratio, res in zip(target_ratios, results):
            if isinstance(res, Exception):
                errors.append(f"{ratio}: {str(res)}")
            elif res.get("success"):
                images.append({
                    "url": res["image_url"],
                    "ratio": ratio,
                    "width": res.get("width"),
                    "height": res.get("height"),
                })
            else:
                errors.append(f"{ratio}: {res.get('error', '未知错误')}")

        return {
            "success": len(images) > 0,
            "mode": "export_all",
            "images": images,
            "total": len(images),
            "errors": errors if errors else None,
        }

    # ======================== 内部方法 ========================

    def _build_edit_prompt(self, edit_prompt: str, aspect_ratio: str) -> str:
        """构建以图改图的增强提示词"""
        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])
        return (
            f"请根据以下指令编辑这张图片：\n{edit_prompt}\n\n"
            f"【要求】\n"
            f"- 保留图片的主要元素和构图\n"
            f"- 按照指令准确修改对应部分\n"
            f"- 输出比例: {aspect_ratio}（{ratio_info['label']}）\n"
            f"- 保持高质量和自然的编辑效果"
        )

    def _build_style_transfer_prompt(
        self, style_tags: List[str], strength: str, aspect_ratio: str
    ) -> str:
        """构建风格迁移的增强提示词"""
        # 获取风格描述
        style_snippets = []
        for tag_name in style_tags:
            tag = self.get_style_tag_by_name(tag_name)
            if tag:
                style_snippets.append(tag["prompt_snippet"])

        style_desc = ", ".join(style_snippets) if style_snippets else ", ".join(style_tags)

        # 强度映射
        strength_map = {
            "light": "轻微调整画面风格，保留大部分原始细节和色调",
            "medium": "明显转换画面风格，保留主要构图和内容",
            "strong": "大幅度转换画面风格，可以大胆改变色调和氛围",
        }
        strength_desc = strength_map.get(strength, strength_map["medium"])

        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])

        return (
            f"请将这张图片转换为以下风格：\n{style_desc}\n\n"
            f"【迁移强度】\n{strength_desc}\n\n"
            f"【要求】\n"
            f"- 保持原始图片的主体内容和构图\n"
            f"- 将整体视觉风格转变为目标风格\n"
            f"- 调整色调、光影、质感以匹配目标风格\n"
            f"- 输出比例: {aspect_ratio}（{ratio_info['label']}）\n"
            f"- 确保输出高质量、和谐自然的画面"
        )

    def _build_custom_prompt(
        self,
        user_prompt: str,
        style_tags: Optional[List[str]] = None,
        aspect_ratio: str = "3:4",
        color_tone: Optional[str] = None,
        brand_kit: Optional[Any] = None,
    ) -> str:
        """
        构建自定义生成的增强提示词
        将用户原始提示词与风格、尺寸、品牌等约束合并
        """
        parts = []

        # 核心内容
        parts.append(f"请根据以下描述生成一张高质量海报/封面图片：\n{user_prompt}")

        # 添加风格标签
        if style_tags:
            style_snippets = []
            for tag_name in style_tags:
                tag = self.get_style_tag_by_name(tag_name)
                if tag:
                    style_snippets.append(tag["prompt_snippet"])
            if style_snippets:
                parts.append(f"\n【风格要求】\n{', '.join(style_snippets)}")

        # 色调偏好
        if color_tone:
            parts.append(f"\n【色调偏好】\n{color_tone}")

        # 尺寸约束
        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])
        parts.append(
            f"\n【构图要求】\n"
            f"- 图片比例: {aspect_ratio}（{ratio_info['label']}平台适用）\n"
            f"- 画面精致、构图大气、色彩和谐\n"
            f"- 适合作为社交媒体封面/海报使用"
        )

        prompt = "\n".join(parts)

        # 品牌注入
        if brand_kit:
            prompt = self._inject_brand(prompt, brand_kit)

        return prompt

    PROMPT_OPTIMIZER_SYSTEM = """你是一位专业的 AI 图片提示词工程师。你的任务是将用户的创意描述转化为一段高质量、细节丰富的中文提示词，专门用于 AI 图片生成工具（如 Midjourney、DALL-E、Stable Diffusion、Nano Banana Pro）。

规则：
1. 只输出最终的提示词，不要任何解释、markdown 格式或引号。
2. 提示词应为一段连贯的描述，视觉细节丰富。
3. 必须包含：主体描述、构图方式、光影效果、色彩搭配、氛围/情绪、视角/镜头感、画面质感关键词。
4. 自然融入用户指定的风格、色调和尺寸要求。
5. 末尾加上画质增强关键词，如"8K超清、超精细、专业摄影级、高品质渲染"等。
6. 控制在 300 字以内。"""

    async def build_external_prompt(
        self,
        user_prompt: str,
        style_tags: Optional[List[str]] = None,
        aspect_ratio: str = "3:4",
        color_tone: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        调用 LLM 生成供外部图片生成工具（如 Nano Banana Pro）使用的优化英文提示词。
        """
        from app.services.llm_service import llm_service
        from langchain_core.messages import HumanMessage, SystemMessage

        # 收集用户意图上下文
        context_parts = [f"用户描述：{user_prompt}"]

        if style_tags:
            snippets = []
            for tag_name in style_tags:
                tag = self.get_style_tag_by_name(tag_name)
                if tag:
                    snippets.append(f"{tag_name} ({tag['prompt_snippet']})")
                else:
                    snippets.append(tag_name)
            context_parts.append(f"风格要求：{', '.join(snippets)}")

        if color_tone:
            context_parts.append(f"色调偏好：{color_tone}")

        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])
        context_parts.append(
            f"输出尺寸：{aspect_ratio} ({ratio_info['width']}x{ratio_info['height']}, {ratio_info['label']}平台)"
        )

        user_context = "\n".join(context_parts)

        messages = [
            SystemMessage(content=self.PROMPT_OPTIMIZER_SYSTEM),
            HumanMessage(content=user_context),
        ]

        response = await llm_service.llm_fast.ainvoke(messages)
        optimized_prompt = response.content.strip().strip('"\'')

        return {
            "success": True,
            "prompt": optimized_prompt,
            "aspect_ratio": aspect_ratio,
            "width": ratio_info["width"],
            "height": ratio_info["height"],
            "style_tags": style_tags or [],
            "color_tone": color_tone,
        }

    def _inject_brand(self, prompt: str, brand_kit: Any) -> str:
        """
        将品牌包信息注入到 AI 提示词中。
        brand_kit 可以是 BrandKit 模型实例或字典。
        """
        parts = []

        brand_name = self._brand_value(brand_kit, "brand_name")
        if brand_name:
            parts.append(f"品牌名称: {brand_name}。作为品牌识别参考，除非用户明确要求，不要在画面中生成品牌文字。")

        colors = self._brand_value(brand_kit, "colors")
        if colors and isinstance(colors, list) and len(colors) > 0:
            parts.append(f"使用品牌配色方案: {', '.join(colors)}")

        tone_prompt = self._brand_value(brand_kit, "tone_prompt")
        if tone_prompt:
            parts.append(f"设计调性: {tone_prompt}")

        tone = self._brand_value(brand_kit, "tone")
        if tone and not tone_prompt:
            parts.append(f"整体调性: {tone}")

        font_style = self._brand_value(brand_kit, "font_style")
        if font_style:
            parts.append(f"字体风格偏好: {font_style}")

        banned_words = self._brand_value(brand_kit, "banned_words")
        if banned_words and isinstance(banned_words, list) and len(banned_words) > 0:
            parts.append(f"画面中不要出现以下元素或文字: {', '.join(banned_words)}")

        logo_url = self._brand_value(brand_kit, "logo_url")
        if logo_url:
            parts.append("品牌 Logo 将由系统在生成后自动贴附，请不要在 AI 画面中伪造、重绘或扭曲 Logo。")

        if parts:
            prompt += "\n\n【品牌规范】\n" + "\n".join(parts)

        return prompt

    def _brand_value(self, brand_kit: Any, key: str) -> Any:
        """兼容 BrandKit 模型实例和序列化字典。"""
        if isinstance(brand_kit, dict):
            return brand_kit.get(key)
        return getattr(brand_kit, key, None)

    def _build_inpaint_prompt(self, inpaint_prompt: str, aspect_ratio: str = "3:4") -> str:
        """构建局部重绘的增强提示词"""
        ratio_info = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["3:4"])
        return (
            f"请对图片中白色遮罩标记的区域进行内容替换。\n"
            f"保持遮罩区域之外的内容完全不变。\n"
            f"将遮罩区域替换为: {inpaint_prompt}\n"
            f"替换后的内容应与周围环境自然融合，保持光影和色调一致。\n"
            f"输出尺寸参考: {ratio_info['width']}x{ratio_info['height']} ({ratio_info['label']})"
        )

    def _build_erase_prompt(self) -> str:
        """构建智能擦除的增强提示词"""
        return (
            "请移除图片中白色遮罩标记区域内的所有物体和内容。\n"
            "使用周围的背景、纹理和色彩自然地填补被移除的区域。\n"
            "确保填补后的区域与周围环境无缝衔接，看不出擦除痕迹。\n"
            "保持遮罩区域之外的所有内容完全不变。"
        )

    def _build_crop_prompt(self, source_ratio: str, target_ratio: str) -> str:
        """构建智能裁剪的提示词"""
        source_info = ASPECT_RATIOS.get(source_ratio, ASPECT_RATIOS["3:4"])
        target_info = ASPECT_RATIOS.get(target_ratio, ASPECT_RATIOS["3:4"])
        return (
            f"请将这张图片从 {source_ratio} ({source_info['label']}) 比例 "
            f"裁剪适配为 {target_ratio} ({target_info['label']}) 比例。\n"
            f"目标尺寸: {target_info['width']}x{target_info['height']}\n\n"
            f"【裁剪要求】\n"
            f"- 智能识别画面主体，确保主要内容保留在画面中心\n"
            f"- 裁去多余的边缘区域\n"
            f"- 保持图片质量不变，不要拉伸或压缩\n"
            f"- 如有必要可以微调构图使画面更美观\n"
            f"- 不要添加任何新的内容"
        )

    def _build_outpaint_prompt(
        self,
        source_ratio: str,
        target_ratio: str,
        outpaint_prompt: Optional[str] = None,
    ) -> str:
        """构建 AI 扩图 (Outpaint) 的提示词"""
        source_info = ASPECT_RATIOS.get(source_ratio, ASPECT_RATIOS["3:4"])
        target_info = ASPECT_RATIOS.get(target_ratio, ASPECT_RATIOS["3:4"])

        base = (
            f"请将这张图片从 {source_ratio} ({source_info['label']}) 比例 "
            f"扩展适配为 {target_ratio} ({target_info['label']}) 比例。\n"
            f"目标尺寸: {target_info['width']}x{target_info['height']}\n\n"
            f"【扩图要求】\n"
            f"- 完整保留原图的所有内容，不能裁剪或缩放\n"
            f"- 沿需要扩展的方向（上下或左右）生成新的画面内容\n"
            f"- 扩展的内容应与原图风格、色调、光影完全一致\n"
            f"- 确保扩展区域与原图无缝衔接\n"
            f"- 生成的新内容应自然合理，符合原图的场景逻辑"
        )

        if outpaint_prompt:
            base += f"\n- 扩展区域的内容参考提示: {outpaint_prompt}"

        return base

    async def _call_ai_image_api(
        self, prompt: str,
        input_image_base64: Optional[str] = None,
        input_images_base64: Optional[List[str]] = None,
        mask_image_base64: Optional[str] = None,
        provider_override: Optional[str] = None,
        image_model_config: Optional[Dict[str, Any]] = None,
        aspect_ratio: Optional[str] = None,
    ) -> Optional[str]:
        """
        根据 IMAGE_PROVIDER 分派到对应的图片生成 API。
        返回 base64 编码的结果图片数据，失败返回 None。
        """
        self.require_configured(provider_override, image_model_config)
        input_images = self._merge_input_images(input_image_base64, input_images_base64)
        first_input_image = input_images[0] if input_images else None

        if image_model_config:
            provider_type = image_model_config.get("provider_type")
            if provider_type == "openai_image":
                return await self._call_openai_image_api(
                    prompt,
                    image_model_config,
                    input_image_base64=first_input_image,
                    input_images_base64=input_images,
                    mask_image_base64=mask_image_base64,
                    aspect_ratio=aspect_ratio,
                )
            if provider_type == "gemini":
                return await self._call_gemini_api(
                    prompt,
                    first_input_image,
                    mask_image_base64,
                    dynamic_config=image_model_config,
                    input_images_base64=input_images,
                    aspect_ratio=aspect_ratio,
                )
            if provider_type == "doubao":
                return await self._call_doubao_image_api(
                    prompt,
                    first_input_image,
                    dynamic_config=image_model_config,
                    aspect_ratio=aspect_ratio,
                )
            print(f"[PosterService] 未知动态图片模型类型: {provider_type}")
            return None

        effective = self._get_effective_provider(provider_override)
        if effective == "doubao":
            return await self._call_doubao_image_api(
                prompt,
                first_input_image,
                aspect_ratio=aspect_ratio,
            )
        if effective == "gpt_image":
            return await self._call_gpt_image_api(
                prompt,
                first_input_image,
                mask_image_base64,
                input_images_base64=input_images,
                aspect_ratio=aspect_ratio,
            )
        if effective == "gemini_ch":
            return await self._call_gemini_api(
                prompt,
                first_input_image,
                mask_image_base64,
                use_changhuai=True,
                input_images_base64=input_images,
                aspect_ratio=aspect_ratio,
            )
        return await self._call_gemini_api(
            prompt,
            first_input_image,
            mask_image_base64,
            input_images_base64=input_images,
            aspect_ratio=aspect_ratio,
        )


    async def _call_gpt_image_api(
        self,
        prompt: str,
        input_image_base64: Optional[str] = None,
        mask_image_base64: Optional[str] = None,
        input_images_base64: Optional[List[str]] = None,
        aspect_ratio: Optional[str] = None,
    ) -> Optional[str]:
        """调用 GPT Image 2 生图 API（OpenAI 兼容，changhuai 渠道）"""
        return await self._call_openai_image_api(
            prompt,
            {
                "api_key": self.gpt_image_api_key,
                "base_url": self.gpt_image_base_url,
                "model_name": self.gpt_image_model,
                "name": "GPT Image",
            },
            input_image_base64=input_image_base64,
            input_images_base64=input_images_base64,
            mask_image_base64=mask_image_base64,
            aspect_ratio=aspect_ratio,
        )

    async def _call_openai_image_api(
        self,
        prompt: str,
        config: Dict[str, Any],
        input_image_base64: Optional[str] = None,
        input_images_base64: Optional[List[str]] = None,
        mask_image_base64: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
    ) -> Optional[str]:
        """调用 OpenAI Images 兼容接口。"""
        api_key = config.get("api_key", "")
        base_url = (config.get("base_url") or "").rstrip("/")
        model = config.get("model_name") or config.get("model") or "gpt-image-2"
        tag = config.get("name") or "OpenAI-Image"
        size = self._resolve_api_size(aspect_ratio)

        if not api_key:
            print(f"[PosterService] {tag} API Key 未配置")
            return None

        input_images = self._merge_input_images(input_image_base64, input_images_base64)
        is_edit = bool(input_images)
        url = f"{base_url}/v1/images/{'edits' if is_edit else 'generations'}"
        print(f"[PosterService] {tag} 请求 URL: {url}")
        print(f"[PosterService] {tag} 使用模型: {model}")
        print(f"[PosterService] {tag} 生图尺寸: {size} (aspect_ratio={aspect_ratio or '3:4'})")

        payload: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": size,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                if is_edit:
                    files: List[tuple[str, tuple[str, bytes, str]]] = [
                        (
                            "image",
                            self._openai_image_file_tuple(image, filename=f"image_{index + 1}.png"),
                        )
                        for index, image in enumerate(input_images)
                    ]
                    if mask_image_base64:
                        files.append(("mask", self._openai_image_file_tuple(mask_image_base64, filename="mask.png")))
                    response = await client.post(url, data=payload, files=files, headers=headers)
                else:
                    response = await client.post(
                        url,
                        json=payload,
                        headers={**headers, "Content-Type": "application/json"},
                    )
                response.raise_for_status()
                result = response.json()
                data_list = result.get("data", [])
                if data_list:
                    item = data_list[0]
                    if item.get("b64_json"):
                        return item["b64_json"]
                    if item.get("url"):
                        img_resp = await client.get(item["url"], timeout=60.0)
                        img_resp.raise_for_status()
                        return base64.b64encode(img_resp.content).decode("utf-8")

            print(f"[PosterService] {tag} 生图无图片: {str(result)[:200]}")
            return None
        except httpx.HTTPStatusError as e:
            print(f"[PosterService] {tag} HTTP 错误: {e.response.status_code} {e.response.text[:200]}")
            return None
        except Exception as e:
            print(f"[PosterService] {tag} 请求异常: {e}")
            return None

    def _openai_image_file_tuple(self, image_base64: str, *, filename: str = "image.png") -> tuple[str, bytes, str]:
        """将 data URL 或裸 base64 转为 OpenAI Images multipart 文件。"""
        decoded = decode_image_base64(image_base64)
        stem = Path(filename).stem or "image"
        return (f"{stem}{decoded.extension}", decoded.data, decoded.mime_type)

    def _extract_reference_image_base64s(self, reference_images: Optional[List[Dict[str, Any]]]) -> List[str]:
        """从前端参考图数组中提取可传给模型的图片数据，不设置业务张数上限。"""
        images: List[str] = []
        for item in reference_images or []:
            if not isinstance(item, dict):
                continue
            image_data = item.get("image_base64") or item.get("data")
            if isinstance(image_data, str) and image_data.strip():
                images.append(image_data.strip())
        return images

    def _merge_input_images(
        self,
        input_image_base64: Optional[str],
        input_images_base64: Optional[List[str]],
    ) -> List[str]:
        """兼容旧的单图参数和新的多图参数，保持调用方顺序。"""
        images: List[str] = []
        if input_image_base64:
            images.append(input_image_base64)
        for image in input_images_base64 or []:
            if image and image not in images:
                images.append(image)
        return images

    def _split_image_data_url(self, image_base64: str) -> tuple[str, str]:
        """返回 (mime_type, base64_data)，兼容 data URL 和裸 base64。"""
        decoded = decode_image_base64(image_base64)
        return decoded.mime_type, base64.b64encode(decoded.data).decode("ascii")

    async def _call_doubao_image_api(
        self, prompt: str,
        input_image_base64: Optional[str] = None,
        dynamic_config: Optional[Dict[str, Any]] = None,
        aspect_ratio: Optional[str] = None,
    ) -> Optional[str]:
        """
        调用火山方舟 doubao-seedream 图片生成 API。
        使用和 LLM 相同的 API Key，OpenAI 兼容格式。
        """
        llm_api_key = (dynamic_config or {}).get("api_key") or os.getenv("LLM_API_KEY", "")
        llm_base_url = ((dynamic_config or {}).get("base_url") or os.getenv("LLM_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")).rstrip("/")
        model = (dynamic_config or {}).get("model_name") or os.getenv("DOUBAO_IMAGE_MODEL", "doubao-seedream-3-0-t2i-250415")

        if not llm_api_key:
            print("[PosterService] LLM_API_KEY 未配置，无法使用 doubao 生图")
            return None

        size = self._resolve_api_size(aspect_ratio)
        url = f"{llm_base_url}/images/generations"
        payload: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "response_format": "b64_json",
            "size": size,
        }
        print(f"[PosterService] doubao 生图尺寸: {size} (aspect_ratio={aspect_ratio or '3:4'})")

        if input_image_base64:
            if not input_image_base64.startswith("data:"):
                payload["image"] = f"data:image/png;base64,{input_image_base64}"
            else:
                payload["image"] = input_image_base64

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {llm_api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                result = response.json()

                data_list = self._extract_doubao_image_items(result)
                for item in data_list:
                    if not isinstance(item, dict):
                        continue
                    if item.get("b64_json"):
                        return item["b64_json"]
                    if item.get("url"):
                        img_resp = await client.get(item["url"], timeout=60.0)
                        img_resp.raise_for_status()
                        return base64.b64encode(img_resp.content).decode("utf-8")
                    if item.get("error"):
                        print(f"[PosterService] doubao 单图生成失败: {item['error']}")

                error_message = self._extract_doubao_error_message(result)
                if error_message:
                    print(f"[PosterService] doubao 生图返回错误: {error_message}")
                else:
                    print(f"[PosterService] doubao 生图响应中未找到图片: {str(result)[:300]}")
                return None

        except httpx.HTTPStatusError as e:
            print(f"[PosterService] doubao 生图 HTTP 错误: {e.response.status_code} {e.response.text[:300]}")
            return None
        except Exception as e:
            print(f"[PosterService] doubao 生图异常: {e}")
            return None

    def _extract_doubao_image_items(self, result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """兼容方舟/OpenAI 风格和部分代理的嵌套响应结构。"""
        data = result.get("data")
        if isinstance(data, list):
            return data

        if isinstance(data, dict):
            nested = data.get("data")
            if isinstance(nested, list):
                return nested

        images = result.get("images")
        if isinstance(images, list):
            return images

        return []

    def _extract_doubao_error_message(self, result: Dict[str, Any]) -> Optional[str]:
        """提取豆包/代理响应中的错误说明，便于定位失败原因。"""
        candidates = [result.get("error")]
        data = result.get("data")
        if isinstance(data, dict):
            candidates.append(data.get("error"))

        for candidate in candidates:
            if isinstance(candidate, dict):
                return candidate.get("message") or candidate.get("code") or str(candidate)
            if isinstance(candidate, str):
                return candidate

        return None

    async def _call_gemini_api(
        self, prompt: str,
        input_image_base64: Optional[str] = None,
        mask_image_base64: Optional[str] = None,
        use_changhuai: bool = False,
        dynamic_config: Optional[Dict[str, Any]] = None,
        input_images_base64: Optional[List[str]] = None,
        aspect_ratio: Optional[str] = None,
    ) -> Optional[str]:
        """调用 Gemini 图片生成/编辑 API"""
        if dynamic_config:
            api_key = dynamic_config.get("api_key", "")
            base_url = (dynamic_config.get("base_url") or "").rstrip("/")
            model = dynamic_config.get("model_name") or self.model
            tag = dynamic_config.get("name") or "Gemini-Dynamic"
        elif use_changhuai:
            api_key = self.api_key_ch
            base_url = self.base_url_ch
            model = self.model_ch
            tag = "Gemini-CH"
        else:
            api_key = self.api_key
            base_url = self.base_url
            model = self.model
            tag = "Gemini"

        url = f"{base_url}/v1beta/models/{model}:generateContent"
        print(f"[PosterService] {tag} 请求 URL: {url}")
        print(f"[PosterService] {tag} 使用模型: {model}")
        print(f"[PosterService] {tag} 生图比例: {aspect_ratio or '3:4'}")

        parts = []
        input_images = self._merge_input_images(input_image_base64, input_images_base64)
        for image in input_images:
            mime_type, image_data = self._split_image_data_url(image)
            parts.append({
                "inlineData": {
                    "mimeType": mime_type,
                    "data": image_data,
                }
            })
        if mask_image_base64:
            mask_mime_type, mask_data = self._split_image_data_url(mask_image_base64)
            parts.append({
                "inlineData": {
                    "mimeType": mask_mime_type,
                    "data": mask_data,
                }
            })
        parts.append({"text": prompt})

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": self._build_gemini_generation_config(aspect_ratio),
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                result = response.json()

                image_data = self._extract_gemini_image_data(result)
                if image_data:
                    return image_data

                reason = self._extract_gemini_no_image_reason(result)
                if reason:
                    print(f"[PosterService] {tag} 响应中未找到图片数据: {reason}")
                else:
                    print(f"[PosterService] {tag} 响应中未找到图片数据: {str(result)[:300]}")
                return None

        except httpx.HTTPStatusError as e:
            print(f"[PosterService] {tag} HTTP 错误: {e.response.status_code} {e.response.text[:200]}")
            return None
        except Exception as e:
            print(f"[PosterService] {tag} 请求异常: {e}")
            return None

    def _extract_gemini_image_data(self, result: Dict[str, Any]) -> Optional[str]:
        """从 Gemini generateContent 响应中提取图片 base64，兼容代理的 snake_case。"""
        candidates = result.get("candidates")
        if not isinstance(candidates, list):
            return None

        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content")
            if not isinstance(content, dict):
                continue
            parts = content.get("parts")
            if not isinstance(parts, list):
                continue

            for part in parts:
                if not isinstance(part, dict):
                    continue
                inline_data = part.get("inlineData") or part.get("inline_data")
                if isinstance(inline_data, dict) and inline_data.get("data"):
                    return inline_data["data"]

        return None

    def _extract_gemini_no_image_reason(self, result: Dict[str, Any]) -> Optional[str]:
        """提取 Gemini 未返回图片时的文本/结束原因，方便定位配置或内容策略问题。"""
        error = result.get("error")
        if isinstance(error, dict):
            return error.get("message") or str(error)
        if isinstance(error, str):
            return error

        candidates = result.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            return None

        candidate = candidates[0]
        if not isinstance(candidate, dict):
            return None

        details = []
        finish_reason = candidate.get("finishReason") or candidate.get("finish_reason")
        if finish_reason:
            details.append(f"finishReason={finish_reason}")

        content = candidate.get("content")
        if isinstance(content, dict):
            parts = content.get("parts")
            if isinstance(parts, list):
                text_parts = [
                    part.get("text")
                    for part in parts
                    if isinstance(part, dict) and isinstance(part.get("text"), str)
                ]
                text = " ".join(text_parts).strip()
                if text:
                    details.append(f"text={text[:240]}")

        return "; ".join(details) if details else None

    def _save_image(
        self,
        image_base64: str,
        prefix: str = "poster",
        brand_kit: Optional[Any] = None,
    ) -> str:
        """保存 base64 图片到本地，返回访问路径"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        decoded = decode_image_base64(image_base64)
        filename = f"{prefix}_{timestamp}_{unique_id}{decoded.extension}"

        output_dir = (
            tenant_static_path("images/posters")
            if has_runtime_identity()
            else self.output_dir
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        file_path = output_dir / filename
        with open(file_path, "wb") as f:
            f.write(decoded.data)

        if brand_kit:
            self._overlay_brand_logo(file_path, brand_kit)

        print(f"[PosterService] 图片已保存: {file_path}")
        return f"/static/images/posters/{filename}"

    def _overlay_brand_logo(self, image_path: Path, brand_kit: Any) -> None:
        """将品牌 Logo 贴到生成图右下角；缺失或不可读时静默跳过。"""
        logo_url = self._brand_value(brand_kit, "logo_url")
        if not logo_url:
            return

        logo_path = self._resolve_local_static_path(str(logo_url))
        if not logo_path or not logo_path.exists():
            return

        try:
            from PIL import Image  # type: ignore

            with Image.open(image_path).convert("RGBA") as base_img:
                with Image.open(logo_path).convert("RGBA") as logo_img:
                    max_width = max(48, int(base_img.width * 0.16))
                    max_height = max(32, int(base_img.height * 0.10))
                    logo_img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

                    margin = max(16, int(min(base_img.width, base_img.height) * 0.04))
                    position = (
                        max(margin, base_img.width - logo_img.width - margin),
                        max(margin, base_img.height - logo_img.height - margin),
                    )
                    base_img.alpha_composite(logo_img, position)
                    base_img.save(image_path, format="PNG")
        except Exception as exc:
            print(f"[PosterService] 品牌 Logo 贴附失败，已跳过: {exc}")

    def _resolve_local_static_path(self, url_or_path: str) -> Optional[Path]:
        """将 /static/... URL 或本地相对路径解析为项目内文件路径。"""
        if not url_or_path or url_or_path.startswith(("http://", "https://", "data:")):
            return None
        if has_runtime_identity():
            try:
                return resolve_static_url(url_or_path)
            except ValueError:
                return None
        normalized = url_or_path.replace("\\", "/")
        relative_path = Path(normalized.lstrip("/"))
        project_root = self.project_root.resolve()
        candidate = (project_root / relative_path).resolve()
        try:
            candidate.relative_to(project_root)
        except ValueError:
            return None
        return candidate


# ======================== 单例实例 ========================
poster_service = PosterService()
