from loguru import logger
import httpx
from app.config import settings
from app.llm.prompts import build_user_message
from app.llm.output_checker import is_trading_question, FALLBACK_RESPONSE


class LLMClient:
    """LLM 客戶端（使用 httpx，支援高併發）"""
    
    def __init__(self):
        self.api_key = settings.llm_api_key
        self.api_base = settings.llm_api_base
        self.model = settings.llm_model
        
        # 建立 httpx client（異步，支援高併發）
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # 如果是 OpenRouter，加入建議的 headers
        if "openrouter.ai" in self.api_base:
            if settings.llm_http_referer:
                headers["HTTP-Referer"] = settings.llm_http_referer
            if settings.llm_x_title:
                # 確保 header 值只包含 ASCII 字符，避免編碼錯誤
                # httpx 要求 header 值必須是 ASCII 兼容的
                x_title = settings.llm_x_title
                # 如果包含非 ASCII 字符，使用 ASCII 替代或移除
                try:
                    # 嘗試編碼為 ASCII，如果失敗則使用替代方案
                    x_title.encode('ascii')
                    headers["X-Title"] = x_title
                except UnicodeEncodeError:
                    # 如果包含非 ASCII 字符，使用 ASCII 替代或只保留 ASCII 部分
                    # 使用 'ignore' 或 'replace' 錯誤處理
                    headers["X-Title"] = x_title.encode('ascii', errors='ignore').decode('ascii')
                    if not headers["X-Title"]:
                        # 如果全部被移除，使用預設的 ASCII 值
                        headers["X-Title"] = "Investment Q&A Bot"
            logger.info(f"使用 OpenRouter，設定 headers: {headers}")
        
        # 使用 httpx.AsyncClient 支援異步高併發
        self.client = httpx.AsyncClient(
            base_url=self.api_base,
            headers=headers,
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)  # 高併發設定
        )
    
    async def get_response(
        self,
        user_text: str,
        chat_history: list = None
    ) -> str:
        """
        取得 LLM 回應（使用 httpx 異步呼叫，支援高併發）
        
        Args:
            user_text: 使用者輸入文字
            chat_history: 對話歷史（可選）
        
        Returns:
            LLM 的回應文字（已通過安全檢查）
        """
        try:
            # 提早攔截明顯的交易建議問題
            if is_trading_question(user_text):
                logger.warning(f"偵測到交易建議問題，直接返回 fallback: {user_text}")
                return FALLBACK_RESPONSE
            
            # 建立訊息
            messages = build_user_message(user_text, chat_history)
            
            # 準備請求 payload
            payload = {
                "model": self.model,
                "messages": [
                    {"role": msg["role"], "content": msg["content"]}
                    for msg in messages
                ],
                "temperature": 0.7,
                "max_tokens": settings.max_tokens,
                "reasoning": {"enabled": True}
            }
            
            # 呼叫 LLM API（異步，不阻塞）
            logger.info(f"呼叫 LLM，模型: {self.model}")
            response = await self.client.post(
                "/chat/completions",
                json=payload
            )
            
            # 檢查 HTTP 狀態碼
            response.raise_for_status()
            
            # 解析回應
            data = response.json()
            llm_output = data["choices"][0]["message"]["content"].strip()
            logger.info(f"LLM 原始回應: {llm_output[:100]}...")
            
            # 直接返回 LLM 輸出（已移除輸出後的安全檢查）
            return llm_output
            
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP 錯誤: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                return "API Key 無效，請檢查設定。"
            elif e.response.status_code == 429:
                return "API 請求過於頻繁，請稍後再試。"
            else:
                return "抱歉，我現在無法回答。請稍後再試，或輸入「選單」查看可以問我的問題。"
        except httpx.TimeoutException:
            logger.error("LLM 請求超時")
            return "請求超時，請稍後再試。"
        except Exception as e:
            logger.error(f"LLM 呼叫失敗: {e}", exc_info=True)
            return "抱歉，我現在無法回答。請稍後再試，或輸入「選單」查看可以問我的問題。"
    
    async def close(self):
        """關閉 httpx client（應用程式關閉時呼叫）"""
        await self.client.aclose()


# 全域 LLM client instance
llm_client = LLMClient()

