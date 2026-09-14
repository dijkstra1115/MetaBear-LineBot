UPDATE knowledge_articles
SET answer='可以繼續在這個 LINE 對話描述問題。系統會通知已綁定的管理員；客服在後台認領後，小幫手會暫停一般問答，避免真人與 Bot 同時回覆。若你想先繼續自助查詢，輸入「繼續使用小幫手」即可恢復。客服仍需在 LINE 官方帳號對話查看並回覆；請不要提供密碼、登入驗證碼、私鑰或 API Secret。',
    source_note='MetaBear 客服案件通知、認領、暫停與恢復流程。',
    revision=revision+1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id='support-process';

INSERT INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor)
SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'migration'
FROM knowledge_articles WHERE id='support-process';
