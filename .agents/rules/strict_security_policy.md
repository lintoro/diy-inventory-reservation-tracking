# 嚴格資安與機密保護守則 (Strict Security Policy)

本規範適用於本專案的所有開發、除錯、建置與維護行為：

1. **參考資料隔離防線**：
   - 根目錄下之 `/參考資料不要上推/`（包含 ERP 全庫存原始檔、物料對照表、企劃書等內部檔案）嚴格禁止透過 Git 上推至遠端儲存庫。
   - 必須透過 `.gitignore` 阻絕追蹤，防止營業秘密與內部物料成本/庫存數據外洩。
2. **機密檔案與憑證保護**：
   - `.env`, `.env.*`, `*.pem`, `*.key`, `credentials.json`, `service_account*.json` 等敏感設定檔嚴禁納入 Git 追蹤。
   - 嚴禁在程式碼中硬編碼任何資料庫密碼、API Key（如 Google API Key, Gemini Key）或私密試算表 ID。
3. **資料驗證與覆寫防護**：
   - 對 Google Sheets 與 ERP 清洗寫入時，務必採用欄位對齊與防呆機制，避免空資料或清洗異常沖銷既有有效資料。
