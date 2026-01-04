from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.models import User, UserSetting, ChatHistory


def get_or_create_user(db: Session, line_user_id: str) -> User:
    """取得或建立使用者"""
    user = db.query(User).filter(User.line_user_id == line_user_id).first()
    if not user:
        user = User(line_user_id=line_user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_or_create_user_setting(db: Session, line_user_id: str) -> UserSetting:
    """取得或建立使用者設定"""
    # 先確保使用者存在
    get_or_create_user(db, line_user_id)
    
    setting = db.query(UserSetting).filter(UserSetting.line_user_id == line_user_id).first()
    if not setting:
        setting = UserSetting(line_user_id=line_user_id, llm_enabled=True)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def update_llm_enabled(db: Session, line_user_id: str, enabled: bool) -> UserSetting:
    """更新 LLM 啟用狀態"""
    setting = get_or_create_user_setting(db, line_user_id)
    setting.llm_enabled = enabled
    db.commit()
    db.refresh(setting)
    return setting


def add_chat_history(db: Session, line_user_id: str, role: str, text: str) -> ChatHistory:
    """新增對話歷史"""
    # 先確保使用者存在
    get_or_create_user(db, line_user_id)
    
    history = ChatHistory(
        line_user_id=line_user_id,
        role=role,
        text=text
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    return history


def get_recent_chat_history(db: Session, line_user_id: str, limit: int = 4) -> List[ChatHistory]:
    """取得最近的對話歷史（最多 4 則，維持 2 輪對話）"""
    return (
        db.query(ChatHistory)
        .filter(ChatHistory.line_user_id == line_user_id)
        .order_by(desc(ChatHistory.created_at))
        .limit(limit)
        .all()
    )[::-1]  # 反轉順序，從舊到新


def clear_old_chat_history(db: Session, line_user_id: str, keep_last: int = 4):
    """清理舊的對話歷史，保留最近 N 則"""
    # 取得所有對話，從新到舊排序
    all_chats = (
        db.query(ChatHistory)
        .filter(ChatHistory.line_user_id == line_user_id)
        .order_by(desc(ChatHistory.created_at))
        .all()
    )
    
    # 刪除超過保留數量的對話
    if len(all_chats) > keep_last:
        for chat in all_chats[keep_last:]:
            db.delete(chat)
        db.commit()

