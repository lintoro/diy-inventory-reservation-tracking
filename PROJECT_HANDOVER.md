# 專案交接手冊 (PROJECT_HANDOVER.md)

本文件定義 DIY 活動物料庫存與預約接單管理系統之環境架構、部署網址、資料庫結構與維運交接重點。

---

## 一、 系統正式線上入口 (Production Endpoints)

- **Web App 操作介面（業務速查 ＋ 主管看板）**：
  👉 [https://script.google.com/macros/s/AKfycby7P0D0_j15Zc7h1BkM1Q5FXLzk1umFPicaqA4WoUOk8qg5Op-r050rUdTKiViAh7QL0g/exec](https://script.google.com/macros/s/AKfycby7P0D0_j15Zc7h1BkM1Q5FXLzk1umFPicaqA4WoUOk8qg5Op-r050rUdTKiViAh7QL0g/exec)
- **Google 試算表（資料庫 SSOT）**：
  👉 [https://docs.google.com/spreadsheets/d/1D_rEF40gUEuGtNHhOpE165p5fhTmtD14vORIPZclrQc/edit](https://docs.google.com/spreadsheets/d/1D_rEF40gUEuGtNHhOpE165p5fhTmtD14vORIPZclrQc/edit)
- **Google Apps Script 專案主機**：
  👉 [https://script.google.com/d/1lgyHf-Z4aZszBDlYzNYgime0E3LGnSZDSDkzOtdI0JWRP_tnPqGKjJpn/edit](https://script.google.com/d/1lgyHf-Z4aZszBDlYzNYgime0E3LGnSZDSDkzOtdI0JWRP_tnPqGKjJpn/edit)

---

## 二、 核心資料庫 7 大底表結構

| 工作表名稱 | 用途與運作機制 | 關鍵欄位 |
| :--- | :--- | :--- |
| **01_ERP原始匯入** | 每日由 ERP 匯出清冊貼上，自動過濾小計、合計列並鎖定 640 倉 | 品號、品名、庫別(640)、數量、匯入時間 |
| **02_材料品號對照表** | 系統基準白名單（29 項核心材料），定義花色與材料種類分類代碼 | ERP品號、ERP品名、材料種類代碼、花色規格 |
| **03_BOM配方設定表** | 6 大體驗商品之原物料組成用量與共用料關係 | 產品代碼、銷售方案、所需材料種類、單份用量 |
| **04_現場抽盤流水帳** | 門市同仁 3 秒隨手抽盤回報，當日實數優先覆蓋 ERP 帳面 | 記錄時間、品號、實盤數、ERP數、盤差、狀態 |
| **05_在途採購清冊** | 黃燈超額接單時自動產生缺料採購單，標註最晚叫貨日 | 採購單號、叫貨日、最晚下單日、品號、缺額、狀態 |
| **06_預約登記明細** | 業務窗口送單登記明細，防呆阻擋紅燈單入庫 | 預約單號、活動日、商品、套數、團體、燈號、叫貨狀態 |
| **07_45天動態推移底表** | 滾動推移未來 45 天每日扣除平日(10)/假日(35)散客保底之淨可用量 | 日期、星期、型態、各商品淨可用量、試算時間 |

---

## 三、 核心後端模組清單 (GAS Codebase)

1. `gas/00_Config.js`：系統全域常數、29 項材料主檔、6 大商品 BOM 規則、平日/假日保底參數。
2. `gas/00_SampleERP.js`：門市 175 筆真實 ERP 原始匯出範例資料集。
3. `gas/01_InitDB.js`：試算表 7 大底表樣式排版、主檔自動匯入、`🚀 DIY庫存系統管理` 自訂選單。
4. `gas/02_ERPCleaner.js`：ERP 原始資料清洗過濾、現場抽盤登記與雙軌庫存融合模組。
5. `gas/03_BOMCalculator.js`：折疊籃 6 部件款式花色總量池木桶短板運算、繪聲繪影共用料連動扣抵。
6. `gas/04_ProjectionAndGate.js`：45 天動態推移、15 天交期時間閘門防呆、最晚下單日倒推與採購單生成。
7. `gas/05_API.js`：Web App 後端 API 控制器。
8. `gas/99_Tests.js`：各階段自動化單元測試套件。
9. `gas/index.html`：雙視角現代化響應式前端介面（支援手機與桌面操作）。

---

## 四、 資安與維運守則
1. 本地根目錄下之 `/參考資料不要上推/`（含企劃書、定價與全庫存 Excel）已由 `.gitignore` 阻絕，嚴禁推送到 GitHub。
2. 若需更新 Web App 程式碼：
   - 於本地編輯 `gas/` 檔案後執行：`npx clasp push -f`
   - 重新部署新版本：`npx clasp deploy --description "更新說明"`
