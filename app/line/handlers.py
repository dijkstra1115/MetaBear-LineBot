from loguru import logger
import hmac
import hashlib
import json
import base64
from urllib.parse import parse_qs
from linebot.v3.webhooks import (
    MessageEvent,
    TextMessageContent,
    PostbackEvent
)
from linebot.v3.exceptions import InvalidSignatureError
from app.config import settings
from app.db.session import SessionLocal
from app.db import crud
from app.line.client import line_client, question_manager
from app.llm.client import llm_client


def verify_signature(body: str, signature: str) -> bool:
    """驗證 LINE webhook signature"""
    # 1. 計算 HMAC-SHA256 (取得二進位 digest)
    hash_digest = hmac.new(
        settings.line_channel_secret.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha256
    ).digest()
    
    # 2. 將二進位結果轉為 Base64 字串 (LINE 的標準)
    # 這裡移除了多餘的 hashlib.sha256() 呼叫
    expected_signature = base64.b64encode(hash_digest).decode('utf-8')
    
    # 3. 比對簽章
    return hmac.compare_digest(signature, expected_signature)


async def handle_line_webhook(body: str, signature: str):
    """處理 LINE webhook 請求"""
    # 驗證 signature
    if not verify_signature(body, signature):
        logger.error("Invalid signature")
        raise InvalidSignatureError("Invalid signature")
    
    # 解析事件
    data = json.loads(body)
    events = data.get('events', [])
    
    for event in events:
        event_type = event.get('type')
        
        if event_type == 'message':
            await handle_message_event(event)
        elif event_type == 'postback':
            await handle_postback_event(event)
        else:
            logger.info(f"未處理的事件類型: {event_type}")


async def handle_message_event(event: dict):
    """處理訊息事件"""
    message = event.get('message', {})
    message_type = message.get('type')
    
    if message_type != 'text':
        return
    
    user_id = event['source']['userId']
    reply_token = event['replyToken']
    user_text = message.get('text', '').strip()
    
    logger.info(f"收到訊息 from {user_id}: {user_text}")
    logger.debug(f"訊息處理 - 原始文字: '{user_text}', 小寫: '{user_text.lower()}'")
    
    db = SessionLocal()
    try:
        # 確保使用者存在
        crud.get_or_create_user(db, user_id)
        
        # 檢查是否為選單觸發關鍵字（更寬鬆的匹配）
        menu_keywords = ['menu', '選單', 'メニュー', '選項', '選項單']
        user_text_lower = user_text.lower().strip()
        
        if user_text_lower in menu_keywords:
            logger.info(f"觸發選單顯示，關鍵字: '{user_text_lower}'")
            try:
                # 顯示主選單
                quick_reply = line_client.create_menu_quick_reply()
                topics = question_manager.get_menu_topics()
                logger.info(f"選單主題數量: {len(topics)}")
                if not topics:
                    logger.warning("選單主題列表為空，無法顯示選單")
                    line_client.reply_text(reply_token, "選單資料尚未設定，請聯繫管理員。")
                    return
                
                menu_title = question_manager.data.get('menu', {}).get('title', '請選擇主題')
                logger.info(f"準備發送選單，標題: '{menu_title}', Quick Reply 項目數: {len(quick_reply.items)}")
                line_client.reply_text(reply_token, menu_title, quick_reply)
                logger.info("選單已成功發送")
            except Exception as e:
                logger.error(f"發送選單時發生錯誤", exc_info=True)
                # 嘗試發送錯誤訊息給使用者
                try:
                    line_client.reply_text(reply_token, "選單顯示失敗，請稍後再試。")
                except Exception:
                    logger.warning("回覆錯誤訊息給使用者時也失敗", exc_info=True)
            return
        else:
            logger.debug(f"不是選單關鍵字，繼續處理為一般訊息")
        
        # 一般文字訊息：呼叫 LLM
        await handle_llm_query(db, user_id, reply_token, user_text)
        
    finally:
        db.close()


async def handle_postback_event(event: dict):
    """處理 postback 事件"""
    user_id = event['source']['userId']
    reply_token = event['replyToken']
    postback_data = event['postback']['data']
    
    # 解析 postback data
    params = parse_qs(postback_data)
    action_type = params.get('action_type', [None])[0]
    
    logger.info(f"收到 postback from {user_id}: {action_type}")
    
    db = SessionLocal()
    try:
        # 確保使用者存在
        crud.get_or_create_user(db, user_id)
        
        if action_type == 'SHOW_TOPIC':
            # 顯示該主題的問題列表
            topic = params.get('topic', [None])[0]
            if topic:
                topic_info = question_manager.get_topic_info(topic)
                quick_reply = line_client.create_topic_quick_reply(topic)
                line_client.reply_text(
                    reply_token,
                    f"【{topic_info.display_name}】\n請選擇你想了解的問題：",
                    quick_reply
                )
        
        elif action_type == 'ASK_QUESTION':
            # 使用者點選問題，直接送給 LLM
            question_text = params.get('question_text', [None])[0]
            if question_text:
                await handle_llm_query(db, user_id, reply_token, question_text)
        
        elif action_type == 'TOGGLE_LLM':
            # 切換 LLM 模式
            enabled_str = params.get('enabled', ['true'])[0]
            enabled = enabled_str.lower() == 'true'
            crud.update_llm_enabled(db, user_id, enabled)
            
            if enabled:
                status_text = "✅ 已開啟 LLM 解釋模式\n\n現在可以問我投資概念相關的問題，我會用 AI 為你解釋！"
            else:
                status_text = "✅ 已切換為預約真人回應模式\n\nLLM 解釋已關閉。如需真人協助，請透過其他管道聯繫我們。"
            
            line_client.reply_text(reply_token, status_text)
        
        else:
            logger.warning(f"未知的 action_type: {action_type}")
    
    finally:
        db.close()


async def handle_llm_query(db, user_id: str, reply_token: str, user_text: str):
    """處理 LLM 查詢"""
    # 檢查 LLM 是否啟用
    user_setting = crud.get_or_create_user_setting(db, user_id)
    
    if not user_setting.llm_enabled:
        line_client.reply_text(
            reply_token,
            "目前已關閉 LLM 解釋模式，請到選單開啟。"
        )
        return
    
    # 顯示載入動畫（設定 30 秒，如果 LLM 回應較快會自動消失）
    line_client.start_loading(user_id, loading_seconds=30)
    
    # 取得最近對話歷史
    chat_history = crud.get_recent_chat_history(db, user_id, limit=4)
    
    # 呼叫 LLM
    response_text = await llm_client.get_response(user_text, chat_history)
    
    # 儲存對話歷史
    crud.add_chat_history(db, user_id, 'user', user_text)
    crud.add_chat_history(db, user_id, 'assistant', response_text)
    
    # 清理舊對話（保留最近 4 則）
    crud.clear_old_chat_history(db, user_id, keep_last=4)
    
    # 回覆使用者（發送新訊息時，載入動畫會自動消失）
    line_client.reply_text(reply_token, response_text)

