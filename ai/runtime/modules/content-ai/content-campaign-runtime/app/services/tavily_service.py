"""
Tavily 搜索服务
在生成视频脚本前搜索主题相关资料，用真实数据增强文案质量
"""
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class TavilySearchService:
    """Tavily 搜索服务 — 为视频脚本提供真实数据支撑"""

    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY", "")
        self._client = None
        if self.api_key:
            print("[Tavily] OK: 搜索服务已配置")
        else:
            print("[Tavily] WARNING: 未配置 TAVILY_API_KEY，搜索功能不可用")

    def _get_client(self):
        """惰性初始化 Tavily 客户端"""
        if self._client is None:
            from tavily import TavilyClient
            self._client = TavilyClient(api_key=self.api_key)
        return self._client

    async def search_topic(
        self,
        topic: str,
        max_results: int = 5,
        search_depth: str = "basic",
    ) -> dict:
        """
        搜索主题相关资料

        Args:
            topic: 搜索关键词
            max_results: 最大结果数
            search_depth: 搜索深度 "basic" 或 "advanced"

        Returns:
            {
                "summary": "搜索结果摘要（可直接喂给 LLM）",
                "sources": [{"title": ..., "url": ..., "content": ...}],
                "success": True/False
            }
        """
        if not self.api_key:
            return {"summary": "", "sources": [], "success": False, "error": "未配置 Tavily API Key"}

        try:
            import asyncio
            client = self._get_client()

            # Tavily 同步 API，放到线程池执行
            result = await asyncio.to_thread(
                client.search,
                query=topic,
                max_results=max_results,
                search_depth=search_depth,
                include_answer=True,
            )

            # 提取有用信息
            sources = []
            for item in result.get("results", []):
                sources.append({
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "content": item.get("content", "")[:300],  # 截取前 300 字
                })

            summary = result.get("answer", "")

            # 组装上下文文本（喂给 LLM）
            context_parts = []
            if summary:
                context_parts.append(f"【搜索摘要】{summary}")
            for i, src in enumerate(sources[:3], 1):
                context_parts.append(f"【参考{i}】{src['title']}: {src['content']}")

            context_text = "\n\n".join(context_parts)

            print(f"[Tavily] 搜索「{topic}」返回 {len(sources)} 条结果")
            return {
                "summary": context_text,
                "sources": sources,
                "success": True,
            }

        except Exception as e:
            print(f"[Tavily] 搜索失败: {e}")
            return {"summary": "", "sources": [], "success": False, "error": str(e)}


# 单例
tavily_service = TavilySearchService()
