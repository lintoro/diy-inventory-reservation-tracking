# 專案進度與里程碑追蹤 (PROGRESS.md)

最後更新時間：2026-09-22

## 項目進度摘要

| 階段 | 工作重點 | 狀態 | 完成度 |
| :--- | :--- | :---: | :---: |
| **Phase 0：環境與規則初始化** | 建立全域/專案規則、.gitignore 隔離、企劃書與物料理解 | 🟢 已完成 | 100% |
| **Phase 1：雲端試算表與 7 大底表建置** | 建立綁定試算表、7 大底表樣式結構、28 項物料與 BOM 主檔、單元測試 | 🟢 已完成 (已驗收) | 100% |
| **Phase 2：ERP 資料清洗引擎與雙軌融合** | ERP 原始報表過濾小計/雜項、640 倉鎖定、抽盤實數優先覆蓋、階段二測試 | 🟢 已完成 (已驗收) | 100% |
| **Phase 3：BOM 短板與花色總量池運算** | 折疊籃 6 部件短板、繪聲繪影共用料連動扣抵、極端邊界測試、階段三測試 | 🟢 已完成 (已驗收) | 100% |
| **Phase 4：45 天推移與 15 天時間閘門防呆** | 散客保底底線、黃/紅燈防呆判定、最晚叫貨日倒推、缺料採購單自動生成 | 🟢 已完成 (已驗收) | 100% |
| **Phase 5：雙視角 Web App 介面與整合部署** | 業務預約端 + 主管盤點看板端、部署上線與手動驗收 SOP | 🟢 已完成 (正式交付) | 100% |

---

## 詳細執行日誌

### 2026-09-22
- [x] 完成環境與規則建立，建立 `.gitignore`、`.gemini/rules/`、`.agents/rules/`。
- [x] 透過 `clasp create` 於雲端 Drive 自動建立專屬 Google Spreadsheet 與綁定之 Apps Script 專案。
  - **試算表連結**：https://docs.google.com/spreadsheets/d/1D_rEF40gUEuGtNHhOpE165p5fhTmtD14vORIPZclrQc/edit
  - **Apps Script 專案**：https://script.google.com/d/1lgyHf-Z4aZszBDlYzNYgime0E3LGnSZDSDkzOtdI0JWRP_tnPqGKjJpn/edit
- [x] 完成 `gas/00_Config.js`：配置 7 大工作表常數、28 項核心物料主檔、6 大商品 BOM 關聯規則。
- [x] 完成 `gas/01_InitDB.js`：實現 7 大底表自動建立、色彩表頭排版、凍結首列與主檔資料寫入；加入 `onOpen()` 自訂管理選單。
- [x] 完成 `gas/99_Tests.js`：撰寫 `test_Phase1_DBStructure()` 階段一驗證測試套件，手動驗收通過。
- [x] 完成 Phase 2：ERP 清洗引擎與雙軌融合機制（`gas/02_ERPCleaner.js`），手動驗收通過。
- [x] 完成 Phase 3：BOM 木桶短板運算與花色總量池機制（`gas/03_BOMCalculator.js`），手動驗收通過。
- [x] 完成 Phase 4：45 天動態推移與 15 天交期時間閘門防呆（`gas/04_ProjectionAndGate.js`），手動驗收通過。
- [x] 完成 Phase 5：雙視角 Web App 前後端介面開發（`gas/05_API.js`、`gas/index.html`）。
- [x] 排查並排除多重 doGet 覆蓋問題，成功部署並更新至 Version `@5`，手機與新瀏覽器皆可正常載入。
- [x] 完成本地 Git 倉庫初始化，確認 `.gitignore` 嚴格隔離敏感與參考資料，成功推送到遠端 GitHub 儲存庫（`lintoro/diy-inventory-reservation-tracking`）。
- [x] 完成 `PROJECT_HANDOVER.md` 異地接續開發 SOP、踩坑指引與後續待辦事項更新，準備進行異地交接。
