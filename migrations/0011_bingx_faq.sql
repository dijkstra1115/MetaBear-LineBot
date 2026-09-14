-- Reviewed BingX FAQ seed, checked 2026-09-14. Preserve administrator edits.

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-code-channel','收不到驗證碼怎麼辦？','收不到驗證碼
驗證碼收不到
驗證碼沒收到
沒有收到驗證碼','你是收不到 Email、手機簡訊，還是 Google Authenticator 的驗證碼無法使用？

先選下方對應問題，我會給你該方式的排查步驟。這裡處理的是 BingX 帳戶驗證；不要把驗證碼貼到 LINE。','0','published','來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257235797391-Unable-to-Receive-BingX-Email-Verification-Code-Here-s-What-to-Do
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-code-channel' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257235797391-Unable-to-Receive-BingX-Email-Verification-Code-Here-s-What-to-Do
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-email-code','收不到 Email 驗證碼','收不到email
email驗證碼
郵件驗證碼
信箱收不到
收不到郵件
收不到驗證信
電子郵件驗證碼','先查看垃圾郵件匣，再確認信箱是否已滿，以及是否攔截 BingX 郵件。

仍收不到時，請從 BingX App 聯絡官方線上客服，確認寄送狀況。若原信箱已無法使用，依官方驗證頁的「驗證項不可用？」申請處理；資料只交到官方頁面。','0','published','來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257235797391-Unable-to-Receive-BingX-Email-Verification-Code-Here-s-What-to-Do
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-email-code' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257235797391-Unable-to-Receive-BingX-Email-Verification-Code-Here-s-What-to-Do
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-sms-code','收不到手機簡訊驗證碼','收不到簡訊
簡訊驗證碼
收不到短信
短信驗證碼
sms驗證碼
手機驗證碼收不到','先重啟手機，確認簡訊收件空間可用；雙 SIM 卡手機也可檢查使用的 SIM 卡。

仍收不到時，請聯絡 BingX 官方線上客服確認簡訊寄送。若綁定門號已停用，從官方驗證頁的「驗證項不可用？」處理。變更安全設定可能影響提幣，依帳戶提示確認。','0','published','來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245487887-Unable-to-Receive-BingX-SMS-Verification-Code-Here-s-What-to-Do
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-sms-code' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245487887-Unable-to-Receive-BingX-SMS-Verification-Code-Here-s-What-to-Do
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-authenticator','Google 驗證碼一直錯誤','google驗證碼
google驗證器
authenticator
2fa錯誤
谷歌驗證碼
動態驗證碼錯誤','確認輸入的是 BingX 對應帳戶目前顯示的動態驗證碼，並將手機日期與時間設為自動同步，再重新開啟 BingX 嘗試。

仍無法登入，或已遺失驗證器時，請聯絡 BingX 官方客服辦理帳戶驗證。不要傳送動態碼或驗證器備份金鑰給 LINE。','0','published','來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257212430095-What-to-Do-if-the-Google-Authenticator-Code-Is-Incorrect
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-authenticator' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257212430095-What-to-Do-if-the-Google-Authenticator-Code-Is-Incorrect
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-kyc-failed','KYC 被退件怎麼辦？','kyc失敗
kyc被退
kyc不通過
kyc沒通過
認證失敗
驗證被拒
身分驗證失敗
身份驗證失敗
證件已被使用
認證一直過不了
驗證一直過不了
kyc被打回','先到 BingX「訊息中心」查看退件原因。核對填寫資料、證件有效期，以及照片是否清晰完整，再依官方認證頁補件。

若顯示證件已在其他帳戶使用，請由官方客服協助確認，不要反覆建立新帳戶。證件與自拍只上傳 BingX 官方認證頁。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257119198607-%E5%80%8B%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%AA%8D%E8%AD%89-KYC-%E5%A4%B1%E6%95%97%E5%B8%B8%E8%A6%8B%E5%8E%9F%E5%9B%A0%E5%8F%8A%E8%A7%A3%E6%B1%BA%E6%96%B9%E6%A1%88
官方頁更新：2026-04-16
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-kyc-failed' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257119198607-%E5%80%8B%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%AA%8D%E8%AD%89-KYC-%E5%A4%B1%E6%95%97%E5%B8%B8%E8%A6%8B%E5%8E%9F%E5%9B%A0%E5%8F%8A%E8%A7%A3%E6%B1%BA%E6%96%B9%E6%A1%88
官方頁更新：2026-04-16
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-kyc-pending','KYC 一直審核中','kyc審核中
kyc要多久
kyc多久
認證中
認證等很久
審核一直沒過
身分認證卡住','先確認目前是「審核中」還是「認證失敗」：失敗需要依退件原因補件；審核中則查看帳戶通知。

若持續停留在認證中，請聯絡 BingX 官方線上客服查詢。實際審核進度由交易所確認，MetaBear 無法代為通過。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257118976143-%E5%80%8B%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%AA%8D%E8%AD%89-KYC-%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C
官方頁更新：2026-02-03
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-kyc-pending' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257118976143-%E5%80%8B%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%AA%8D%E8%AD%89-KYC-%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C
官方頁更新：2026-02-03
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-deposit-pending','充值轉出卻還沒到帳','充值未到帳
充值未到賬
充值沒到
入金沒到帳
入金未到帳
轉了沒到
轉了還沒到
錢還沒到
轉出成功但沒收到','先看轉出平台是否已完成轉出，取得 TxID 查詢鏈上進度，再對照 BingX 的充值紀錄與到帳帳戶。

若仍未入帳，從 BingX 充值紀錄的「充值未到賬」提交查詢；準備幣種、網路、數量與 TxID，由官方核實。轉出成功不等於已入帳。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2
官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-deposit-pending' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2
官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-deposit-network','充值網路怎麼選？','網路怎麼選
網絡怎麼選
充值網路
充值網絡
網路要一樣
trc20還是erc20','先確認轉出平台與 BingX 都支援並開放同一幣種、同一網路，再複製自己帳戶的充值地址。

不要只看地址相似就判斷網路相同，也不要照抄教學圖的地址。若兩邊找不到一致選項，先停止轉帳並向平台確認。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257098058639-BingX-%E6%95%99%E5%AD%B8-%E5%A6%82%E4%BD%95%E5%85%85%E5%80%BC%E5%8A%A0%E5%AF%86%E8%B2%A8%E5%B9%A3
官方頁更新：2026-03-08
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-deposit-network' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257098058639-BingX-%E6%95%99%E5%AD%B8-%E5%A6%82%E4%BD%95%E5%85%85%E5%80%BC%E5%8A%A0%E5%AF%86%E8%B2%A8%E5%B9%A3
官方頁更新：2026-03-08
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-deposit-minimum','最低充值額與入群門檻','最低充值
最小充值
最低充幣
低於最低
小於最低
入金不是沒門檻
不設最低為什麼','BingX 每個幣種／網路的最低充值數量，與 MetaBear 社群的入群門檻是兩件事。

請在 BingX 充值頁核對最低數量，並計入轉出端扣除的費用。MetaBear 不設最低入金金額、允許內部轉帳，不代表交易所任何小額轉帳都會入帳。已低於最低數量時，先向官方確認處理方式。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257098058639-BingX-%E6%95%99%E5%AD%B8-%E5%A6%82%E4%BD%95%E5%85%85%E5%80%BC%E5%8A%A0%E5%AF%86%E8%B2%A8%E5%B9%A3
官方頁更新：2026-03-08
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-deposit-minimum' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257098058639-BingX-%E6%95%99%E5%AD%B8-%E5%A6%82%E4%BD%95%E5%85%85%E5%80%BC%E5%8A%A0%E5%AF%86%E8%B2%A8%E5%B9%A3
官方頁更新：2026-03-08
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-deposit-memo','漏填 Memo／Tag 怎麼辦？','漏填memo
忘記填memo
填錯memo
漏填tag
忘記填tag
填錯tag
memo是什麼
tag是什麼','若 BingX 充值頁要求 Memo／Tag，轉出時也需填寫。已漏填或填錯，請從 BingX 充值紀錄的「充值未到賬」提交交易資料。

是否能找回、如何處理及費用，須由官方核實；MetaBear 不能替交易所退回資產。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2
官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-deposit-memo' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2
官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-withdraw-returned','提幣被退回怎麼辦？','提幣被退
提幣退回
提現被退
提現退回
轉帳被退回','向接收平台取得退回的 TxID 與退回紀錄，再交給 BingX 官方客服查詢。退回交易與原始提幣可能有不同 TxID。

請保留幣種、數量、時間與兩邊紀錄；實際入帳與處理結果由平台確認。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2
官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-withdraw-returned' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2
官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-account-transfer','資金帳戶如何轉到合約帳戶？','資金帳戶轉到合約
資金帳戶轉合約
資金賬戶轉合約
帳戶內劃轉
賬戶內劃轉
合約帳戶沒錢
合約賬戶沒錢','先看資金目前在哪個 BingX 帳戶。需要在自己帳號內移動時，到「資產 → 劃轉」，核對轉出／轉入帳戶、幣種與數量再確認。

這是同一帳號內的資金移動，與轉到另一位用戶、或鏈上提幣不同；不會因此自動通過 MetaBear 入群審核。','0','published','來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257143424783-BingX-%E6%95%99%E5%AD%B8%E4%B8%A8%E5%A6%82%E4%BD%95%E5%9C%A8%E8%B3%AC%E6%88%B6%E5%85%A7%E5%8A%83%E8%BD%89%E8%B3%87%E9%87%91
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-account-transfer' AND source_note='來源：https://bingxservice.zendesk.com/hc/zh-tw/articles/11257143424783-BingX-%E6%95%99%E5%AD%B8%E4%B8%A8%E5%A6%82%E4%BD%95%E5%9C%A8%E8%B3%AC%E6%88%B6%E5%85%A7%E5%8A%83%E8%BD%89%E8%B3%87%E9%87%91
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES ('bingx-uid-location','找不到 BingX UID','找不到uid
uid在哪裡
uid在哪
uid怎麼找
用戶編號在哪','BingX App：登入後點左上角個人頭像，在頭像旁找到 UID 並複製。網頁版：登入後開啟右上角個人選單查看 UID。

要提交 MetaBear 查詢資格，回覆「UID 你的數字」。提交 UID 不代表邀請關係、KYC 或入金已通過。','0','published','來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257209092367-BingX-Tutorial-How-to-Find-My-UID
官方頁更新：2025-07-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。');

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='bingx-uid-location' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257209092367-BingX-Tutorial-How-to-Find-My-UID
官方頁更新：2025-07-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

UPDATE knowledge_articles SET title='已綁定別人的邀請碼',keywords='其他人的邀請碼
別人的邀請碼
綁定其他人
綁定別人
其他團隊
別人推薦',answer='這屬於推薦歸屬問題。BingX 官方 FAQ 說明，帳戶綁定推薦碼後不能更改或移除；不要直接再填本團隊的碼，或重新入金嘗試改綁。

MetaBear 可協助核對 UID 與入群資格，但不能代替交易所變更推薦關係。',requires_support='1',status='published',source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='referral-other' AND revision=1 AND status='published' AND source_note='MetaBear 團隊處理流程；推薦歸屬變更須由交易所核實，未承諾可變更。';

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='referral-other' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

UPDATE knowledge_articles SET title='可以更改推薦碼嗎？',keywords='更改邀請碼
修改邀請碼
更換邀請碼
轉移推薦
改綁推薦
更改推薦碼',answer='不能直接承諾能改綁。BingX 官方 FAQ 說明，已綁定的推薦碼不能更改或移除。

若帳戶顯示有疑義，請由官方客服核實。MetaBear 的協助是查詢推薦歸屬與社群資格，不會直接替你更改帳戶。',requires_support='1',status='published',source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='referral-change' AND revision=1 AND status='published' AND source_note='MetaBear 團隊處理流程；未驗證任何帳號可轉移的承諾。';

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='referral-change' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';

UPDATE knowledge_articles SET title='漏填或填錯邀請碼怎麼辦？',keywords='填錯邀請碼
忘記填邀請碼
沒填邀請碼
未填推薦碼
補填邀請碼
漏填邀請碼
邀請碼漏填
推薦碼漏填',answer='你是「沒有填」還是「已填成別人的碼」？

官方 FAQ 說明：尚未充值、買幣或邀請好友，且未綁推薦碼時，可查看「我的推薦人」是否可補填；已有綁定則不能直接更改。

找不到入口或不確定歸屬時，由客服核實。補填與 MetaBear 資格審核是不同步驟。',requires_support='1',status='published',source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='referral-missing' AND revision=1 AND status='published' AND source_note='MetaBear 團隊處理流程；補填規則需向交易所確認。';

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id='referral-missing' AND source_note='來源：https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs
官方頁更新：2024-12-25
查核：2026-09-14
範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。';
