# 專案交接手冊 (PROJECT_HANDOVER.md)

本文件定義 **DIY_物料庫存與預約接單管理系統** 之架構、部署網址、資料庫規格、異地接續開發環境建置 SOP 與後續待辦重點。

---

## 一、 系統正式線上入口 (Production Endpoints)

- **Web App 操作介面（工號登入 ＋ 活動抽屜 ＋ 採購核銷與單據直傳 ＋ 商品BOM維護中心 ＋ 原物料主檔管理 ＋ 三軌庫存透視 ＋ ERP 直傳）**：
  👉 [https://script.google.com/macros/s/AKfycby7P0D0_j15Zc7h1BkM1Q5FXLzk1umFPicaqA4WoUOk8qg5Op-r050rUdTKiViAh7QL0g/exec](https://script.google.com/macros/s/AKfycby7P0D0_j15Zc7h1BkM1Q5FXLzk1umFPicaqA4WoUOk8qg5Op-r050rUdTKiViAh7QL0g/exec)
  - 部署版本：`@11`（活動日連動右側方案可用組數、距今>45天自動標記皆可預訂、徹底去除「6 大」寫死字樣、升級 7 欄式三軌庫存透視：ERP系統帳面數 ＋ 現場抽盤實數 ＋ 計算生效在庫、實盤優先融合計算）
  - 預設初始最高管理者：工號 `B111014`，密碼已在系統中啟用
  - 介面：響應式多角色視角（ADMIN 人員管理 + 業務預約端 + 庫存盤點與 ERP 上傳 + 🎨 商品與 BOM 維護中心 + 🔩 原物料品號管理）
- **Google 試算表（資料庫 SSOT）**：
  👉 [https://docs.google.com/spreadsheets/d/1D_rEF40gUEuGtNHhOpE165p5fhTmtD14vORIPZclrQc/edit](https://docs.google.com/spreadsheets/d/1D_rEF40gUEuGtNHhOpE165p5fhTmtD14vORIPZclrQc/edit)
- **Google Apps Script 專案後端**：
  👉 [https://script.google.com/d/1lgyHf-Z4aZszBDlYzNYgime0E3LGnSZDSDkzOtdI0JWRP_tnPqGKjJpn/edit](https://script.google.com/d/1lgyHf-Z4aZszBDlYzNYgime0E3LGnSZDSDkzOtdI0JWRP_tnPqGKjJpn/edit)
- **GitHub 程式碼儲存庫**：
  👉 [https://github.com/lintoro/diy-inventory-reservation-tracking](https://github.com/lintoro/diy-inventory-reservation-tracking)

---

## 二、 異地接續開發快速啟動指南 (Off-site Setup SOP)

若在另一台電腦或工作站接續開發，請依以下步驟操作：

### 1. 複製專案
```bash
git clone https://github.com/lintoro/diy-inventory-reservation-tracking.git
cd diy-inventory-reservation-tracking
```

### 2. 環境與授權確認
專案採用 `@google/clasp` 作為 GAS 同步工具，無須全域安裝，直接使用 `npx clasp`：
```bash
# 若尚未在該電腦登入 Google 帳號授權 clasp：
npx clasp login
```
登入時請使用與 Google 試算表擁有者相同的 Google 帳號（`lcc5201129@gmail.com`）。

### 3. 日常同步與推送流程
- **推送程式碼至 GAS 雲端**：
  ```bash
  npx clasp push -f
  ```
- **更新 Web App 部署版本（重要：push 後必須更新部署才會生效）**：
  ```bash
  npx clasp deploy --deploymentId "AKfycby7P0D0_j15Zc7h1BkM1Q5FXLzk1umFPicaqA4WoUOk8qg5Op-r050rUdTKiViAh7QL0g" --description "更新說明"
  ```
- **同步回 GitHub**：
  ```bash
  git add .
  git commit -m "feat/fix: 更新內容說明"
  git push origin main
  ```

---

## 三、 核心資料庫 8 大底表結構

| 工作表名稱 | 用途與運作機制 | 關鍵欄位 |
| :--- | :--- | :--- |
| **00_使用者帳號表** | 工號即帳號認證（零 Gmail 留存）、SHA-256 密碼、審核狀態與首次強制改密碼 | 工號、姓名、密碼Hash、角色、狀態、首次改密碼、建立時間、最後登入 |
| **01_ERP原始匯入** | 每日由 ERP 匯出清冊貼上或前端檔案直傳，自動過濾小計、合計列並鎖定 640 倉 | 品號、品名、規格、庫別(640)、數量、匯入時間 |
| **02_材料品號對照表** | 系統基準白名單（29 項核心材料），定義花色與材料種類分類代碼 | ERP品號、ERP品名、材料種類代碼、花色規格 |
| **03_BOM配方設定表** | 6 大體驗商品之原物料組成用量與共用料關係 | 產品代碼、銷售方案、所需材料種類、單份用量 |
| **04_現場抽盤流水帳** | 門市同仁 3 秒隨手抽盤回報，當日實數優先覆蓋 ERP 帳面 | 記錄時間、品號、實盤數、ERP數、盤差、狀態 |
| **05_在途採購清冊** | 黃燈超額接單時自動產生缺料採購單，標註最晚叫貨日 | 採購單號、叫貨日、最晚下單日、品號、缺額、狀態 |
| **06_預約登記明細** | 業務窗口送單登記明細，防呆阻擋紅燈單入庫 | 預約單號、活動日、商品、套數、團體、燈號、叫貨狀態 |
| **07_45天動態推移底表** | 滾動推移未來 45 天每日扣除平日(10)/假日(35)散客保底之淨可用量 | 日期、星期、型態、各商品淨可用量、試算時間 |

---

## 四、 核心後端模組清單 (GAS Codebase)

1. `gas/00_Config.js`：系統全域常數、8 大底表定義、29 項材料主檔、6 大商品 BOM 規則、初始管理者設定 `B111014`。
2. `gas/00_SampleERP.js`：門市 175 筆真實 ERP 原始匯出範例資料集。
3. `gas/01_InitDB.js`：試算表 8 大底表樣式排版、主檔與初始管理者自動匯入、自訂管理選單。
4. `gas/02_ERPCleaner.js`：ERP 原始資料清洗過濾、檔案二維陣列直傳自動清洗 (`api_uploadAndCleanERP`)、現場抽盤登記與雙軌庫存融合模組。
5. `gas/03_BOMCalculator.js`：折疊籃 6 部件款式花色總量池木桶短板運算、繪聲繪影共用料連動扣抵。
6. `gas/04_ProjectionAndGate.js`：45 天動態推移、15 天交期時間閘門防呆、最晚下單日倒推與採購單生成。
7. `gas/05_API.js`：Web App 前端唯一 `doGet(e)` 與遠端 API 控制器。
8. `gas/06_AuthManager.js`：工號認證、SHA-256 密碼雜湊、線上申請、ADMIN 審核、停用/啟用、重設密碼與首次強制修改密碼 API。
9. `gas/99_Tests.js`：各階段自動化單元測試套件（含 Phase 6 帳號與上傳自動化驗證函式）。
10. `gas/index.html`：整合 SheetJS 引擎之多角色響應式現代化前端介面。

---

## 五、 踩坑防護與關鍵注意事項 (Critical Gotchas)

1. **唯一 `doGet` 原則**：
   - GAS 整個專案中**絕不可在多個 `.js` 檔案重複宣告 `doGet(e)`**，否則字母排序在後的檔案會無情覆蓋前者的 HTML 渲染（如先前 `99_Tests.js` 覆蓋 `05_API.js`）。
2. **Web App 存取試算表不可單靠 `getActiveSpreadsheet()`**：
   - 透過獨立網址存取 Web App 時，沒有「當前作用中試算表」，`getActiveSpreadsheet()` 會回傳 null；必須保留 `SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)` 兜底。
3. **Google Sheets Date 物件格式化**：
   - 讀取試算表日期時，儲存格常為 JavaScript `Date` 物件，轉字串必須統一使用 `Utilities.formatDate(val, "Asia/Taipei", "yyyy/MM/dd")`，嚴禁使用 `String(val)` 以免產生 GMT 字串引發格式解析錯誤。
4. **機密資料隔離鐵律**：
   - `/參考資料不要上推/`（含定價、企劃書與全庫存 Excel）已被 `.gitignore` 嚴格阻絕，異地作業時亦切勿手動上推。

---

## 六、 下次開發待辦清單 (Next Action Items)

- [ ] **完成主幹修改**：依業務反饋調整預約接單與主管看板核心流程。
- [ ] **多語系/文案與欄位校對**：確認預約登記欄位（聯絡人、備註、時段等）是否貼合門市現場慣用語。
- [ ] **推移表自動排程觸發器 (Time-driven Trigger)**：評估是否設定每日凌晨自動執行一次 `generate45DaysProjection()` 滾動推移最新 45 天資料。
