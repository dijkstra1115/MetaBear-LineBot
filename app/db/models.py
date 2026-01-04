from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship
from app.db.session import Base


class User(Base):
    """使用者資料表"""
    __tablename__ = "users"
    
    line_user_id = Column(String(100), primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    settings = relationship("UserSetting", back_populates="user", uselist=False)
    chat_history = relationship("ChatHistory", back_populates="user", cascade="all, delete-orphan")


class UserSetting(Base):
    """使用者設定資料表"""
    __tablename__ = "user_settings"
    
    line_user_id = Column(String(100), ForeignKey("users.line_user_id"), primary_key=True)
    llm_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="settings")


class ChatHistory(Base):
    """對話歷史資料表（可選，用於維持對話連貫性）"""
    __tablename__ = "chat_history"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    line_user_id = Column(String(100), ForeignKey("users.line_user_id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="chat_history")

