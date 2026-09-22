/**
 * 試算表 7 大底表結構初始化與主檔匯入 (01_InitDB.js)
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚀 DIY庫存系統管理")
    .addItem("1. ⚡ 初始化 8 大底表、帳號與主檔", "initDatabase")
    .addItem("2. 🧪 執行階段一驗證測試 (底表結構)", "test_Phase1_DBStructure")
    .addSeparator()
    .addItem("3. 🧹 匯入原始 ERP 資料並清洗", "menu_importAndCleanERP")
    .addItem("4. 🧪 執行階段二驗證測試 (ERP清洗與雙軌融合)", "test_Phase2_ERPCleaningAndInventory")
    .addSeparator()
    .addItem("5. 📊 即時試算 6 大商品可接單上限與短板", "menu_checkBOMCapacities")
    .addItem("6. 🧪 執行階段三驗證測試 (BOM短板木桶)", "test_Phase3_BOMCapacity")
    .addSeparator()
    .addItem("7. 📈 刷新 45 天動態推移底表", "menu_refreshProjection")
    .addItem("8. 🧪 執行階段四驗證測試 (15天時間閘門)", "test_Phase4_TimeGateAndProjection")
    .addSeparator()
    .addItem("9. 🧪 執行階段六驗證測試 (帳號權限與ERP直傳)", "test_Phase6_AuthAndERPUpload")
    .addSeparator()
    .addItem("10. 🖥️ 在試算表右側開啟操作面板 (Sidebar)", "menu_openSidebar")
    .addItem("11. 🪟 在試算表中央開啟全功能視窗 (Dialog)", "menu_openDialog")
    .addItem("12. 🌐 取得外部 Web App 獨立網址", "menu_openWebApp")
    .addToUi();
}

/**
 * 試算表選單觸發：在右側開啟無縫側邊欄面板 (免切換網頁、無帳號衝突)
 */
function menu_openSidebar() {
  const html = HtmlService.createTemplateFromFile("index").evaluate()
    .setTitle("DIY 活動庫存與預約管理");
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * 試算表選單觸發：在中央開啟全功能大視窗 (900x650)
 */
function menu_openDialog() {
  const html = HtmlService.createTemplateFromFile("index").evaluate()
    .setWidth(950)
    .setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(html, "🚀 DIY 活動物料庫存與預約管理系統");
}

/**
 * 試算表選單觸發：彈窗提供 Web App 專屬連結
 */
function menu_openWebApp() {
  const url = ScriptApp.getService().getUrl();
  const html = `
    <div style="font-family:'Noto Sans TC',sans-serif; padding:12px;">
      <h3 style="color:#1e3a8a; margin-bottom:10px;">🚀 外部獨立 Web App 連結</h3>
      <p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:12px;">
        若瀏覽器同時登入多個 Google 帳號，請直接使用<b>試算表選單中的第 9 項【側邊欄】</b>或第 10 項【全功能視窗】，享有 100% 穩定免登入操作體驗！
      </p>
      <div style="text-align:center; margin:16px 0;">
        <a href="${url}" target="_blank" style="
          display:inline-block; padding:10px 20px; background:#1e3a8a; color:white;
          text-decoration:none; border-radius:8px; font-weight:700; font-size:14px;
        ">
          在新分頁開啟獨立 Web App ➔
        </a>
      </div>
      <p style="font-size:11px; color:#94a3b8; word-break:break-all;">
        原始網址: ${url}
      </p>
    </div>
  `;
  const htmlOutput = HtmlService.createHtmlOutput(html).setWidth(480).setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, "獨立 Web App 網址");
}

function initDatabase() {
  const ss = getSpreadsheet();
  const sheetsConfig = [
    {
      name: CONFIG.SHEETS.USER_ACCOUNTS,
      headers: [
        "工號", "姓名", "密碼Hash", "角色", "狀態", "首次登入需改密碼", "建立時間", "最後登入時間"
      ],
      headerColor: "#312E81" // 靛紫
    },
    {
      name: CONFIG.SHEETS.ERP_RAW,
      headers: [
        "品號", "品名", "規格", "單位", "庫別", "庫別名稱", 
        "庫存數量", "庫存金額", "原幣成本", "庫存包裝數量", 
        "材料金額", "人工金額", "製費金額", "加工金額", "匯入時間"
      ],
      headerColor: "#1B365D" // 深藍
    },
    {
      name: CONFIG.SHEETS.MATERIAL_MASTER,
      headers: [
        "ERP品號", "ERP品名", "材料種類代碼", "花色規格", "單份用量說明", "啟用狀態"
      ],
      headerColor: "#0D5C3A" // 墨綠
    },
    {
      name: CONFIG.SHEETS.BOM_RULES,
      headers: [
        "產品代碼", "體驗方案名稱", "所需材料種類代碼", "單份用量", "備註說明"
      ],
      headerColor: "#4A235A" // 深紫
    },
    {
      name: CONFIG.SHEETS.CYCLE_COUNT_LOG,
      headers: [
        "記錄時間", "材料品號", "品名或種類", "現場實盤數", "ERP帳面數", "盤差(實盤-ERP)", "盤點人員", "盤差狀態", "備註"
      ],
      headerColor: "#7D6608" // 褐黃
    },
    {
      name: CONFIG.SHEETS.PROCUREMENT,
      headers: [
        "採購單號", "叫貨日期", "預計到貨日", "ERP品號", "品名規格", "採購數量", "狀態", "關聯預約單號", "備註"
      ],
      headerColor: "#6E2C00" // 磚紅
    },
    {
      name: CONFIG.SHEETS.BOOKING_RECORDS,
      headers: [
        "預約單號", "活動日期", "體驗方案名稱", "預訂套數", "預約團體或窗口", "聯絡電話", "建立時間", "燈號狀態", "叫貨狀態", "備註"
      ],
      headerColor: "#17202A" // 玄黑
    },
    {
      name: CONFIG.SHEETS.ROLLING_PROJECTION,
      headers: [
        "推移日期", "星期", "日期型態", "手能生巧_可用", "胖胖盒_可用", "TB200_可用", "TB9_可用", "折疊籃_可用", "請多紙膠_可用", "最後試算時間"
      ],
      headerColor: "#1F618D" // 海藍
    }
  ];

  // 1. 確保 8 張底表存在並設定表頭
  sheetsConfig.forEach(cfg => {
    let sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.name);
    }
    
    // 設定表頭
    const currentCols = sheet.getMaxColumns();
    if (currentCols < cfg.headers.length) {
      sheet.insertColumnsAfter(currentCols, cfg.headers.length - currentCols);
    }
    
    const headerRange = sheet.getRange(1, 1, 1, cfg.headers.length);
    headerRange.setValues([cfg.headers]);
    headerRange.setBackground(cfg.headerColor);
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);
  });

  // 1.5. 初始化最高管理者帳號 (B111014)
  const userSheet = ss.getSheetByName(CONFIG.SHEETS.USER_ACCOUNTS);
  if (userSheet.getLastRow() <= 1) {
    const adminInit = CONFIG.INITIAL_ADMIN;
    const adminHash = typeof hashPassword_ === "function" 
      ? hashPassword_(adminInit.defaultPassword)
      : "e6c279042e2644f4d352514f466538560219c561ac00152fa9f100c3029a27ec"; // 000000 之 SHA-256
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    userSheet.appendRow([
      adminInit.empNo,
      adminInit.name,
      adminHash,
      adminInit.role,
      CONFIG.USER_STATUS.ACTIVE,
      true, // 首次登入強制修改密碼
      nowStr,
      ""
    ]);
    userSheet.autoResizeColumns(1, 8);
  }

  // 2. 匯入 28 項核心物料主檔至 [02_材料品號對照表]
  const matSheet = ss.getSheetByName(CONFIG.SHEETS.MATERIAL_MASTER);
  const existingMatRows = matSheet.getLastRow();
  if (existingMatRows <= 1) {
    const matData = CONFIG.MASTER_MATERIALS.map(m => [
      m.itemCode,
      m.itemName,
      m.category,
      m.color,
      m.category.includes("旁敲側擊") ? "依BOM短板總量池" : "單份用量1",
      "啟用"
    ]);
    matSheet.getRange(2, 1, matData.length, matData[0].length).setValues(matData);
    matSheet.autoResizeColumns(1, 6);
  }

  // 3. 匯入 6 大方案 BOM 配方至 [03_BOM配方設定表]
  const bomSheet = ss.getSheetByName(CONFIG.SHEETS.BOM_RULES);
  const existingBomRows = bomSheet.getLastRow();
  if (existingBomRows <= 1) {
    const bomData = CONFIG.BOM_RULES.map(b => [
      b.productId,
      b.productName,
      b.category,
      b.qty,
      b.note
    ]);
    bomSheet.getRange(2, 1, bomData.length, bomData[0].length).setValues(bomData);
    bomSheet.autoResizeColumns(1, 5);
  }

  // 4. 清理預設空白工作表 (若存在且非 8 大底表)
  const defaultSheet = ss.getSheetByName("工作表1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      // 忽略刪除例外
    }
  }

  return {
    success: true,
    message: "Google Sheets 8 大底表、初始管理者與主檔資料初始化完成！",
    spreadsheetUrl: ss.getUrl()
  };
}
