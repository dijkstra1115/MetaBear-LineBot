# 流動性實驗：暫停

由 flow-arena 分支 5b968b6 保存的快照：maker／taker 流動性比較、隨機限價委託市場、買賣方向對照，以及原測試與說明。

未納入根目錄日常建置或正式網站發布；再次開發前先確認範圍。完整原環境可依 archive/README.md 使用來源提交復原。

FLOW ARENA 仍匯入 taker-only-engine.js；這是共用的持續維護依賴，不能因本實驗暫停而在 ARENA 分支刪除。此處只是固定快照，不是讓遊戲改從 experiments 載入的要求。

從根目錄驗證：node --test experiments/liquidity/tests/*.test.mjs。
