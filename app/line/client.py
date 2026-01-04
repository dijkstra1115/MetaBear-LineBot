import yaml
import os
from loguru import logger
import httpx
from pathlib import Path
from typing import Dict, List
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    ReplyMessageRequest,
    TextMessage,
    QuickReply,
    QuickReplyItem,
    MessageAction,
    PostbackAction
)
from app.config import settings
from app.line.schemas import TopicInfo

# LINE Bot API 配置
configuration = Configuration(access_token=settings.line_channel_access_token)


class QuestionManager:
    """題庫管理器"""
    
    def __init__(self):
        # 自動抓取目前檔案 (client.py) 的上兩層目錄找到 app/content
        current_dir = Path(__file__).parent.parent  # 指向 app/
        self.yaml_path = current_dir / "content" / "questions.yaml"
        self.data = self._load_yaml()
    
    def _load_yaml(self) -> dict:
        """載入 YAML 題庫"""
        if not os.path.exists(self.yaml_path):
            logger.error(f"找不到題庫檔案: {self.yaml_path}")
            return {"menu": {"topics": []}, "topics": {}}
        
        with open(self.yaml_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    
    def get_menu_topics(self) -> List[dict]:
        """取得選單主題列表"""
        return self.data.get("menu", {}).get("topics", [])
    
    def get_topic_info(self, topic_key: str) -> TopicInfo:
        """取得主題資訊"""
        topic_data = self.data.get("topics", {}).get(topic_key, {})
        return TopicInfo(
            display_name=topic_data.get("display_name", topic_key),
            questions=topic_data.get("questions", [])
        )


# 全域題庫管理器
question_manager = QuestionManager()


class LINEClient:
    """LINE Bot 客戶端"""
    
    def __init__(self):
        self.api_client = ApiClient(configuration)
        self.messaging_api = MessagingApi(self.api_client)
    
    def reply_text(self, reply_token: str, text: str, quick_reply: QuickReply = None):
        """回覆文字訊息"""
        message = TextMessage(text=text, quickReply=quick_reply)
        request = ReplyMessageRequest(
            replyToken=reply_token,
            messages=[message]
        )
        self.messaging_api.reply_message(request)
        logger.info(f"已回覆文字訊息: {text[:50]}...")
    
    def create_menu_quick_reply(self) -> QuickReply:
        """建立主選單 Quick Reply（五個主題）"""
        items = []
        topics = question_manager.get_menu_topics()
        
        for topic in topics:
            items.append(
                QuickReplyItem(
                    action=PostbackAction(
                        label=topic['label'],
                        data=f"action_type=SHOW_TOPIC&topic={topic['key']}"
                    )
                )
            )
        
        return QuickReply(items=items)
    
    def create_topic_quick_reply(self, topic_key: str) -> QuickReply:
        """建立主題問題 Quick Reply（該主題的 3 個問題）"""
        items = []
        topic_info = question_manager.get_topic_info(topic_key)
        
        for question in topic_info.questions:
            # 截斷太長的問題作為 label
            label = question if len(question) <= 20 else question[:18] + "..."
            items.append(
                QuickReplyItem(
                    action=PostbackAction(
                        label=label,
                        data=f"action_type=ASK_QUESTION&topic={topic_key}&question_text={question}"
                    )
                )
            )
        
        return QuickReply(items=items)
    
    def start_loading(self, user_id: str, loading_seconds: int = 30):
        """顯示載入動畫
        
        Args:
            user_id: 使用者 ID
            loading_seconds: 載入動畫持續時間（5-60 秒）
        """
        if loading_seconds < 5:
            loading_seconds = 5
        elif loading_seconds > 60:
            loading_seconds = 60
        
        url = "https://api.line.me/v2/bot/chat/loading/start"
        headers = {
            "Authorization": f"Bearer {settings.line_channel_access_token}",
            "Content-Type": "application/json"
        }
        data = {
            "chatId": user_id,
            "loadingSeconds": loading_seconds
        }
        
        try:
            with httpx.Client() as client:
                response = client.post(url, headers=headers, json=data, timeout=5.0)
                response.raise_for_status()
                logger.info(f"已顯示載入動畫給使用者 {user_id}，持續 {loading_seconds} 秒")
        except Exception as e:
            # 載入動畫失敗不應該影響主要功能，只記錄錯誤
            logger.warning(f"顯示載入動畫失敗: {e}")


# 全域 LINE client instance
line_client = LINEClient()

