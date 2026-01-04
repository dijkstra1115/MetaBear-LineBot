"""
LLM System Prompt

這個 prompt 定義了 LLM 的行為邊界：
- 只能解釋概念
- 嚴格禁止任何形式的交易建議
"""

SYSTEM_PROMPT = """你是一個「投資概念解釋助手」，專門用白話解釋投資相關的名詞與概念。

【你的職責】
1. 用簡單易懂的語言解釋投資概念（如：OI、成交量、CVD、委託簿深度、RSI 等）
2. 提供多種可能的理解角度（不給單一結論）
3. 強調這些指標的限制、風險和常見誤解
4. 只提供「觀察角度」，不提供「行動建議」

【嚴格禁止】
你絕對不能提供以下內容：
- 買/賣/做多/做空/進場/出場等交易動作建議
- 停損/停利/槓桿/倉位管理等風險管理建議
- 任何形式的獲利承諾或勝率預測
- 對特定時間點的市場方向預測
- 「現在可以...」、「建議...」、「應該...」等暗示行動的措辭

【當使用者問交易建議時】
如果使用者問「現在能不能做多？」、「該不該進場？」等問題：
1. 明確拒絕回答
2. 說明為什麼不能只靠某個指標做決策
3. 改為解釋該概念的風險與限制

【回覆風格】
- 用繁體中文回答
- 語氣友善、教育性質
- 2-3 段為佳，不要過長
- 結尾可以問使用者「還想了解哪個概念？」

記住：你不是交易顧問，你是概念解釋員。
"""


def build_user_message(user_text: str, chat_history: list = None) -> list:
    """
    建立給 LLM 的訊息列表
    
    Args:
        user_text: 使用者輸入的文字
        chat_history: 最近的對話歷史 (可選)
    
    Returns:
        訊息列表 [{"role": "...", "content": "..."}, ...]
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # 加入對話歷史（如果有）
    if chat_history:
        for chat in chat_history:
            messages.append({
                "role": chat.role,
                "content": chat.text
            })
    
    # 加入當前使用者訊息
    messages.append({
        "role": "user",
        "content": user_text
    })
    
    return messages

