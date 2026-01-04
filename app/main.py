import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.session import run_migrations
from app.line.handlers import handle_line_webhook

# 設定 logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    logger.info("啟動 LINE Bot...")
    
    # 自動執行資料庫 migrations
    try:
        run_migrations()
    except Exception as e:
        logger.error(f"資料庫 migrations 失敗，應用程式無法啟動：{e}")
        raise
    
    # 自動上傳 Rich Menu
    try:
        from app.line.richmenu import setup_rich_menu
        setup_rich_menu()
    except Exception as e:
        logger.warning(f"Rich Menu 上傳失敗（可忽略）：{e}")
    
    # 啟動時初始化完成
    yield
    
    # 關閉時清理資源
    logger.info("關閉 LINE Bot...")
    from app.llm.client import llm_client
    await llm_client.close()  # 關閉 httpx client


app = FastAPI(
    title="投資概念問答 LINE Bot",
    description="專注於概念解釋的投資教育機器人",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/")
async def root():
    """健康檢查端點"""
    return {"status": "ok", "message": "LINE Bot is running"}


@app.post("/webhook/line")
async def webhook(request: Request):
    """LINE Webhook 端點"""
    # 取得 LINE signature
    signature = request.headers.get("X-Line-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Line-Signature header")
    
    # 取得 request body
    body = await request.body()
    body_str = body.decode("utf-8")
    
    try:
        await handle_line_webhook(body_str, signature)
        return JSONResponse(content={"status": "ok"})
    except Exception as e:
        logger.error(f"Webhook 處理錯誤: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level="debug"
    )

