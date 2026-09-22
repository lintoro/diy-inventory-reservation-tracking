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
| **Phase 6：RBAC 帳號權限管理與 ERP 檔案直傳清洗** | 純工號認證、ADMIN 三頁面全開與人員審核、預設密碼 000000 首次強制修改、SheetJS 支援 .xlsx/.xls/.csv 直傳自動清洗 | 🟢 已完成 (正式交付) | 100% |
| **Phase 7：活動抽屜透視、保底 10/20 調控與預約過濾** | 系統更名 DIY_物料庫存與預約接單管理系統、活動卡片整合專屬用料抽屜、最晚下單提醒、散客保底預設10/20與庫管彈性調控、未來30天預約精準篩選、修復載入中Bug | 🟢 已完成 (正式交付) | 100% |

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
- [x] 完成 Phase 6：
  - 新增 `00_使用者帳號表`（8 大底表架構），純工號登入驗證（零 Gmail 收集）。
  - 建立初始最高管理者帳號 `B111014`（角色 `ADMIN`，可存取與切換全部三個分頁）。
  - 實作同仁線上申請、ADMIN 後台指派角色審核開通、人員停用/啟用、重設密碼為 000000。
  - 實作「首次登入/密碼重置後強制修改密碼」攔截視窗，保護帳號安全。
  - 整合 SheetJS 引擎支援 `.xlsx`、`.xls`、`.csv` 檔案拖曳直傳，自動過濾小計並鎖定 640 倉，免去複製貼上困擾。
  - 完成 Phase 6 單元測試套件 `test_Phase6_AuthAndERPUpload()` 並更新 Web App 部署至 Version `@6`。
- [x] 完成 Phase 7：
  - 系統全面更名為 **`DIY_物料庫存與預約接單管理系統`**。
  - 徹底排查修復前端 Object 轉 Array 引起的 `.map` TypeError，解除畫面卡在「載入中...」問題。
  - 預約清單精準篩選「今天起 30 天內」之預約紀錄，無單時明確呈現「未來 30 天內暫無預約登記紀錄」。
  - 6 大商品組數看板全面升級為「活動用料專屬抽屜 (Accordion/Drawer)」，點擊即時展開專屬用料庫存、換算套數、木桶短板高亮與最晚下單提醒。
  - 散客保底預設改為平日 10 / 假日 20，並為庫管與 ADMIN 提供「現場散客保底調控面板」與特殊檔期加碼覆蓋功能，儲存後即時重新推移。
  - 在庫存管理端新增「📅 未來 45 天指定日期庫存推移速查」下拉選單。
  - 完成 Phase 7 自動化測試套件 `test_Phase7_DrawerAndSafetyFloor()` 並成功部署上線至 Version `@7`。
