# 專案 Agent 行為與開發守則 (Project Rules & Safety Principles)

本文件定義本專案（DIY 活動物料庫存與預約接單管理系統）之核心資安、開發流程、業務防呆鐵律與維護規範，所有 Agent 與開發人員必須嚴格遵守。

---

## 🌐 一、 語言原則 (Language Policy)
1. **強制使用繁體中文（台灣）**：所有對使用者的說明、回應、分析、Plan、Task、Walkthrough 及專案文件，必須 100% 使用「繁體中文（台灣）」。
2. **嚴禁簡體中文**：嚴格禁止出現任何簡體中文詞彙與字元。
3. **技術用語慣例**：優先使用台灣常用技術用語（如：程式碼、專案、伺服器、試算表、工作表、函式、陣列、品號、物料），程式碼、API 名稱、變數名稱及技術專有名詞可保留英文。

---

## 🔒 二、 核心資安與資料隔離守則 (Security & Data Isolation)
1. **機敏資訊全域去敏原則 (Sensitive Data Sanitization)**：
   - 嚴禁於程式碼、設定、測試、文件與提交中出現真實人名、公司工號、單位部門名稱、真實 ERP 貨號 (品號)、精密工業規格、真實資料庫/試算表 ID、雲端 Script ID、Web App 部署 URL、個人 Email、連線金鑰與環境變數。
   - 範例與主檔統一採用標準示範代碼（如 `MAT-xxx`, `ADM00001`）與佔位符（`YOUR_SPREADSHEET_ID`）。
2. **參考資料與機密檔案絕對隔離 (Zero Secret Leak)**：
   - 專案根目錄下之 `/參考資料不要上推/`（含企劃書、BOM與分類參考檔、ERP原始匯出檔）已列入 `.gitignore`，**嚴格禁止上推至遠端儲存庫**。
   - `.env`, `.env.*`, `*.pem`, `*.key`, `credentials.json`, `.clasp.json` 等敏感設定檔嚴禁納入 Git 追蹤，僅保留 `.sample` 或 `.example` 範本。
3. **三道強制確認關卡 (Three-Checkpoint Mandatory Gate)**：
   - **開始作業前**：清查 `.gitignore` 隔離設定，阻絕未去敏真實資料導入。
   - **上傳 Commit 時**：執行 `git diff --cached` 嚴格審查；若發現歷史紀錄有洩漏，強制執行 Git 歷史抹除（Orphan Wipeout），嚴禁單純以新 commit 覆蓋。
   - **結束交接時**：清查交接文件（`PROJECT_HANDOVER.md`），確認 100% 採用佔位符，生產參數僅允許透過離線安全管道交付。
4. **資料庫防覆蓋機制**：
   - ERP 資料清洗匯入時，需精確過濾小計、合計與非 DIY 物料，避免誤沖銷原有有效數據。

---

## ⚙️ 三、 核心業務規則與防呆鐵律 (Business Rules & Guardrails)
1. **6 大體驗商品與 BOM 木桶短板**：
   - **折疊籃（旁敲側擊）**：採「花色總量池」，可做組數受 6 部件短板限制：
     $$\min(\text{框}/1, \text{底}/1, \lfloor\text{長側}/4\rfloor, \lfloor\text{短側}/2\rfloor, \lfloor\text{短栓}/12\rfloor, \lfloor\text{長栓}/4\rfloor)$$
   - **繪聲繪影**：框圖與顏料為三款專用箱（胖胖盒、中型工具箱、小型工具箱）之共用料，接單時自動連動扣抵。
2. **15 天交期時間閘門 (Time Gate)**：
   - **活動日距今 $\ge 15$ 天**：允許超額預約，庫存不足時亮【黃燈】，排入採購待辦清單並標記最晚叫貨日（活動日 － 15天）。
   - **活動日距今 $< 15$ 天**：不可補貨期，上限鎖定為（預估庫存 － 散客保底），超過上限強制亮【紅燈】阻擋接單。
3. **現場散客保底底線 (Hard Safety Floor)**：
   - 平日（週一至週五）：固定保留 10 份。
   - 假日（週六日、國定假日）：固定保留 35 份。
4. **雙軌庫存融合**：
   - 當日有現場抽盤實數者，優先採信抽盤數；未盤點品項以 ERP 當日 640 倉匯入數兜底。

---

## 📜 四、 標準開發歷程、雲端部署與維護紀錄規範 (Standard History, Deployment & Logging SOP)
1. **Web App 固定部署網址鐵律 (Fixed Deployment ID Rule)**：
   - 進行 Google Apps Script 雲端部署時，**必須一律使用 `npx clasp deploy -i <DEPLOYMENT_ID> -d "版本說明"` 更新既有固定部署**，確保正式環境網址維持不變；嚴禁無參數執行 `clasp deploy` 產生新部署網址。
   - 本地機敏部署 ID 與腳本設定僅存於本地環境或未追蹤之設定檔，嚴禁將真實 Deployment ID 寫入公開儲存庫文件（文件內一律使用 `YOUR_DEPLOYMENT_ID` 佔位符）。
2. **標準維護文件更新**：重大開發、架構演進或交接時，必須維護專案根目錄下的標準文件：
   - `PROGRESS.md`（系統開發進度、各階段里程碑與功能完成度對照表）
   - `ISSUES_LOG.md`（踩坑記錄、問題排查與修復日誌）
   - `PROJECT_HANDOVER.md`（專案交接手冊、環境變數需求與部署維運手冊）
