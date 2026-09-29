import re
from typing import Tuple

# 禁止的關鍵詞列表（中英文）
FORBIDDEN_KEYWORDS = [
    # 交易動作
    r'\b(buy|sell|long|short)\b',
    r'做多', r'做空', r'買入', r'賣出', r'買進', r'賣出',
    r'進場', r'出場', r'入場', r'離場',
    
    # 風險管理
    r'停損', r'止損', r'停利', r'止盈',
    r'槓桿', r'倉位', r'加碼', r'減碼',
    
    # 承諾與預測
    r'保證獲利', r'穩賺', r'必漲', r'必跌',
    r'高勝率', r'勝率.*%',
    r'一定會', r'肯定會',
    
    # 行動建議
    r'現在可以買', r'現在可以賣',
    r'建議.*買', r'建議.*賣',
    r'應該.*買', r'應該.*賣',
    r'適合.*買', r'適合.*賣',
]

# 編譯 regex patterns
FORBIDDEN_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in FORBIDDEN_KEYWORDS]

# Fallback 回覆
FALLBACK_RESPONSE = """我不能提供交易決策或進出場建議。

我的功能是幫你理解投資概念（如 OI、成交量、CVD、委託簿深度、RSI 等），以及這些概念常見的誤解與風險。

如果你願意，可以問我：
• 某個概念是什麼意思？
• 這個指標常見的誤解是什麼？
• 為什麼不能只靠這個指標做決策？

你可以輸入「選單」來看看可以問我什麼問題 😊"""


def check_output_safety(llm_output: str) -> Tuple[bool, str]:
    """
    檢查 LLM 輸出是否安全（硬限制）
    
    Args:
        llm_output: LLM 的輸出文字
    
    Returns:
        (is_safe, final_output)
        - is_safe: True 表示安全，False 表示包含禁止內容
        - final_output: 如果安全則返回原文，否則返回 fallback
    """
    # 檢查每個禁止的 pattern
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(llm_output):
            # 發現禁止內容，返回 fallback
            return False, FALLBACK_RESPONSE
    
    # 通過檢查
    return True, llm_output


def is_trading_question(user_text: str) -> bool:
    """
    簡單檢查使用者問題是否為交易建議類問題
    
    這個函數可以在呼叫 LLM 之前使用，提早攔截明顯的交易建議問題
    """
    trading_question_patterns = [
        r'能不能.*買', r'能不能.*賣',
        r'可以.*買', r'可以.*賣',
        r'該不該.*買', r'該不該.*賣',
        r'要不要.*買', r'要不要.*賣',
        r'現在.*做多', r'現在.*做空',
        r'適不適合.*進場',
    ]
    
    for pattern_str in trading_question_patterns:
        if re.search(pattern_str, user_text, re.IGNORECASE):
            return True
    
    return False

