from typing import Optional
from pydantic import BaseModel


class PostbackData(BaseModel):
    """Postback 資料結構"""
    action_type: Optional[str] = None
    topic: Optional[str] = None
    question_text: Optional[str] = None
    enabled: Optional[bool] = None


class QuestionItem(BaseModel):
    """問題項目"""
    text: str


class TopicInfo(BaseModel):
    """主題資訊"""
    display_name: str
    questions: list[str]

