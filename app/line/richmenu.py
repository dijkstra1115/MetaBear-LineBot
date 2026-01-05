"""
Rich Menu 上傳功能

在應用程式啟動時自動上傳 Rich Menu 到 LINE Bot
"""
import os
from loguru import logger
from pathlib import Path
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    MessagingApiBlob,
    ApiException,
    RichMenuRequest,
    RichMenuSize,
    RichMenuArea,
    RichMenuBounds,
    PostbackAction,
    URIAction,
)
from app.config import settings

configuration = Configuration(access_token=settings.line_channel_access_token)
api_client = ApiClient(configuration)
messaging_api = MessagingApi(api_client)
blob_api = MessagingApiBlob(api_client)

def create_rich_menu():
    """建立 Rich Menu 定義"""
    
    # Rich Menu 尺寸：寬 810，高 1200
    # 六格架構：3 列 x 2 行
    # 每格：寬 270 (810/3)，高 600 (1200/2)
    
    # ⚠️ 請替換以下連結為實際的連結
    # 取得 LINE 群組/社群連結：在 LINE 群組中點擊「邀請」→「複製連結」
    # IG 和 Threads 連結：你的社群媒體帳號連結
    
    # 從環境變數讀取連結（如果沒有設定則使用預設值）
    chat_group_url = os.getenv("LINE_CHAT_GROUP_URL", "")
    notes_group_url = os.getenv("LINE_NOTES_GROUP_URL", "")
    instagram_url = os.getenv("INSTAGRAM_URL", "")
    threads_url = os.getenv("THREADS_URL", "")
    
    # 如果沒有設定連結，使用佔位符（Rich Menu 仍可上傳，但點擊會無效）
    # 這樣可以讓 Rich Menu 先顯示，之後再補上實際連結
    if not chat_group_url:
        chat_group_url = "https://line.me/"
        logger.info("LINE_CHAT_GROUP_URL 未設定，使用預設連結")
    if not notes_group_url:
        notes_group_url = "https://line.me/"
        logger.info("LINE_NOTES_GROUP_URL 未設定，使用預設連結")
    if not instagram_url:
        instagram_url = "https://www.instagram.com/"
        logger.info("INSTAGRAM_URL 未設定，使用預設連結")
    if not threads_url:
        threads_url = "https://www.threads.net/"
        logger.info("THREADS_URL 未設定，使用預設連結")
    
    rich_menu = RichMenuRequest(
        size=RichMenuSize(width=2500, height=1686),
        selected=True,
        name="MetaBear 投資問答選單",
        chat_bar_text="開啟選單",
        areas=[
            # 1. 左上：開啟 LLM
            RichMenuArea(
                bounds=RichMenuBounds(x=0, y=0, width=833, height=843),
                action=PostbackAction(
                    data="action_type=TOGGLE_LLM&enabled=true",
                    display_text="開啟 LLM 解釋模式"
                )
            ),
            # 2. 中上：預約真人回應（關閉 LLM）
            RichMenuArea(
                bounds=RichMenuBounds(x=833, y=0, width=834, height=843),
                action=PostbackAction(
                    data="action_type=TOGGLE_LLM&enabled=false",
                    display_text="預約真人回應"
                )
            ),
            # 3. 右上：加入閒聊社群
            RichMenuArea(
                bounds=RichMenuBounds(x=1667, y=0, width=833, height=843),
                action=URIAction(uri=chat_group_url)
            ),
            # 4. 左下：加入點位筆記群
            RichMenuArea(
                bounds=RichMenuBounds(x=0, y=843, width=833, height=843),
                action=URIAction(uri=notes_group_url)
            ),
            # 5. 中下：MetaBear IG
            RichMenuArea(
                bounds=RichMenuBounds(x=833, y=843, width=834, height=843),
                action=URIAction(uri=instagram_url)
            ),
            # 6. 右下：MetaBear Threads
            RichMenuArea(
                bounds=RichMenuBounds(x=1667, y=843, width=833, height=843),
                action=URIAction(uri=threads_url)
            ),
        ]
    )
    
    return rich_menu


def upload_rich_menu():
    """上傳 Rich Menu 到 LINE"""
    
    # 檢查圖片檔案是否存在（在 app/line/ 目錄下）
    current_dir = Path(__file__).resolve().parent
    image_path = current_dir / "rich_menu.png"
    
    logger.debug(f"Rich Menu 上傳 - 當前檔案: {__file__}")
    logger.debug(f"Rich Menu 上傳 - 解析路徑: {image_path}")
    logger.debug(f"Rich Menu 上傳 - 路徑是否存在: {image_path.exists()}")
    logger.debug(f"Rich Menu 上傳 - 當前工作目錄: {os.getcwd()}")
    
    if not image_path.exists():
        logger.warning(f"找不到 Rich Menu 圖片：{image_path}")
        logger.info("Rich Menu 上傳已跳過（圖片檔案不存在）")
        return False
    
    try:
        logger.info("正在上傳 Rich Menu...")
        
        # 1. 建立 Rich Menu
        rich_menu = create_rich_menu()
        if rich_menu is None:
            logger.warning("Rich Menu 建立已取消（預設連結未設定）")
            return False

        try:
            response = messaging_api.create_rich_menu(rich_menu_request=rich_menu)
            rich_menu_id = response.rich_menu_id
            logger.info(f"Rich Menu 已建立，ID: {rich_menu_id}")
        except ApiException as e:
            logger.error(f"建立 Rich Menu 失敗 (API 錯誤): status={e.status}, reason={e.reason}, body={e.body}")
            return False
        except Exception as e:
            logger.error(f"建立 Rich Menu 失敗: {type(e).__name__}: {e}", exc_info=True)
            return False

        # 2. 上傳圖片（改用 blob_api + Content-Type）
        try:
            logger.info(f"正在上傳圖片：{image_path}")
            image_size = image_path.stat().st_size
            logger.debug(f"圖片大小: {image_size} bytes")
            with open(image_path, "rb") as f:
                image_data = f.read()

            blob_api.set_rich_menu_image(
                rich_menu_id=rich_menu_id,
                body=image_data,
                _headers={"Content-Type": "image/png"},
            )
            logger.info("圖片已上傳")
        except ApiException as e:
            logger.error(f"上傳 Rich Menu 圖片失敗 (API 錯誤): status={e.status}, reason={e.reason}, body={e.body}")
            return False
        except Exception as e:
            logger.error(f"上傳 Rich Menu 圖片失敗: {type(e).__name__}: {e}", exc_info=True)
            return False

        # 3. 設為預設 Rich Menu（用真正的 rich_menu_id 字串）
        try:
            logger.info("正在設為預設 Rich Menu...")
            messaging_api.set_default_rich_menu(rich_menu_id=rich_menu_id)
            logger.info("✅ Rich Menu 上傳成功！")
            logger.info(f"Rich Menu ID: {rich_menu_id}")
            return True
        except ApiException as e:
            logger.error(f"設定預設 Rich Menu 失敗 (API 錯誤): status={e.status}, reason={e.reason}, body={e.body}")
            return False
        except Exception as e:
            logger.error(f"設定預設 Rich Menu 失敗: {type(e).__name__}: {e}", exc_info=True)
            return False
        
    except Exception as e:
        logger.error(f"Rich Menu 上傳失敗：{e}", exc_info=True)
        return False


def setup_rich_menu():
    """設定 Rich Menu（應用程式啟動時呼叫）"""
    if not settings.line_channel_access_token:
        logger.warning("LINE_CHANNEL_ACCESS_TOKEN 未設定，跳過 Rich Menu 上傳")
        return
    
    try:
        upload_rich_menu()
    except Exception as e:
        logger.error(f"Rich Menu 設定失敗：{e}", exc_info=True)

