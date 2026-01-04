from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """應用程式配置"""
    
    # Database
    database_url: str
    
    # LINE Bot
    line_channel_access_token: str
    line_channel_secret: str
    
    # LLM
    llm_api_key: str
    llm_api_base: str = "https://openrouter.ai/api/v1"  # OpenRouter API
    llm_model: str = "deepseek/deepseek-r1-0528:free"  # DeepSeek R1 免費模型
    llm_http_referer: str = ""  # OpenRouter 可選：HTTP-Referer header
    llm_x_title: str = "Investment Q&A Bot"  # OpenRouter 可選：X-Title header (必須為 ASCII)
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

