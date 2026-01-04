import logging
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from alembic import command
from alembic.config import Config
from app.config import settings

logger = logging.getLogger(__name__)

# 建立資料庫引擎
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=False
)

# 建立 Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 建立 Base class
Base = declarative_base()


def get_db():
    """取得資料庫 session（用於依賴注入）"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化資料庫（建立所有 tables）- 已棄用，改用 run_migrations()"""
    from app.db import models  # noqa
    Base.metadata.create_all(bind=engine)


def run_migrations():
    """自動執行 Alembic migrations"""
    try:
        logger.info("正在執行資料庫 migrations...")
        
        # 取得專案根目錄（alembic.ini 所在位置）
        # 從 app/db/session.py 往上兩層到專案根目錄
        project_root = Path(__file__).parent.parent.parent
        alembic_ini_path = project_root / "alembic.ini"
        
        if not alembic_ini_path.exists():
            raise FileNotFoundError(f"找不到 alembic.ini：{alembic_ini_path}")
        
        # 載入 Alembic 設定
        alembic_cfg = Config(str(alembic_ini_path))
        
        # 確保使用正確的資料庫 URL
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
        
        # 執行 migrations（升級到最新版本）
        command.upgrade(alembic_cfg, "head")
        
        logger.info("✅ 資料庫 migrations 執行完成")
        
    except Exception as e:
        logger.error(f"❌ 執行 migrations 失敗：{e}", exc_info=True)
        # 如果 migrations 失敗，應用程式無法啟動
        raise

