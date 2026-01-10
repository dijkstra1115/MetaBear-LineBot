import os
from dotenv import load_dotenv

# 載入 .env 檔案
load_dotenv()


class Settings:
    """應用程式配置"""
    
    # Database
    database_url: str = os.getenv("DATABASE_URL", "")
    
    # LINE Bot
    line_channel_access_token: str = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
    line_channel_secret: str = os.getenv("LINE_CHANNEL_SECRET", "")
    
    # LLM
    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    llm_api_base: str = os.getenv("LLM_API_BASE", "https://openrouter.ai/api/v1")  # OpenRouter API
    llm_model: str = os.getenv("LLM_MODEL", "deepseek/deepseek-r1-0528:free")  # DeepSeek R1 免費模型
    llm_http_referer: str = os.getenv("LLM_HTTP_REFERER", "")  # OpenRouter 可選：HTTP-Referer header
    llm_x_title: str = os.getenv("LLM_X_TITLE", "Investment Q&A Bot")  # OpenRouter 可選：X-Title header (必須為 ASCII)
    max_tokens: int = int(os.getenv("MAX_TOKENS", "5000"))
    
    # Server
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))


settings = Settings()

