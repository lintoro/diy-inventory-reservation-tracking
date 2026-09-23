/**
 * ERP 原始資料清洗引擎與雙軌庫存融合模組 (02_ERPCleaner.js)
 */

/**
 * 1. 從 [01_ERP原始匯入] 讀取並清洗資料
 * @returns {Object} cleanedMap: { [itemCode]: { qty, itemName, warehouse } }
 */
function cleanERPDataFromRawSheet() {
  const ss = getSpreadsheet();
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.ERP_RAW);
  const lastRow = rawSheet.getLastRow();
  
  if (lastRow <= 1) {
    return {
      success: false,
      message: "ERP 原始匯入表中尚無資料",
      count: 0,
      stockMap: {}
    };
  }

  // 取得 A 到 G 欄 (包含品號 A、品名 B、庫別 E、庫存數量 G)
  const values = rawSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const validWhCodes = ["640"]; // 鎖定門市 DIY 640 倉
  const stockMap = {};
  let validCount = 0;

  values.forEach(row => {
    const itemCode = String(row[0] || "").trim();
    const itemName = String(row[1] || "").trim();
    const whCode = String(row[4] || "").trim();
    const qtyVal = Number(row[6]) || 0;

    // 排除品號空白、小計列、合計列
    if (!itemCode || itemCode.includes("小計") || itemName.includes("小計") || whCode.includes("小計") || itemName.includes("合計")) {
      return;
    }

    // 鎖定 640 倉
    if (!validWhCodes.includes(whCode)) {
      return;
    }

    // 累加同品號數量 (防同一倉多批號拆列)
    if (!stockMap[itemCode]) {
      stockMap[itemCode] = {
        itemCode: itemCode,
        itemName: itemName,
        whCode: whCode,
        qty: 0
      };
      validCount++;
    }
    stockMap[itemCode].qty += qtyVal;
  });

  return {
    success: true,
    message: `成功清洗 ERP 資料，鎖定 640 倉共納入 ${validCount} 項物料`,
    count: validCount,
    stockMap: stockMap
  };
}

/**
 * 2. 登記現場隨手抽盤流水帳 (Cycle Counting)
 * @param {string} itemCode 材料品號
 * @param {number} actualQty 實盤數量
 * @param {string} staffName 盤點人員
 * @param {string} note 備註
 */
function recordCycleCount(itemCode, actualQty, staffName, note) {
  const ss = getSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.SHEETS.CYCLE_COUNT_LOG);
  
  // 取得當前 ERP 帳面數量作為比對基準
  const erpCleanResult = cleanERPDataFromRawSheet();
  const erpItem = erpCleanResult.stockMap[itemCode];
  const erpQty = erpItem ? erpItem.qty : 0;
  
  // 取得品名或種類
  const mat = CONFIG.MASTER_MATERIALS.find(m => m.itemCode === itemCode);
  const itemName = mat ? `${mat.itemName} (${mat.category})` : (erpItem ? erpItem.itemName : "自訂物料");

  // 計算盤差
  const diff = Number(actualQty) - Number(erpQty);
  let status = "正常";
  if (diff === 0) {
    status = "帳實相符";
  } else if (Math.abs(diff) <= 2) {
    status = "微小盤差";
  } else if (Math.abs(diff) <= 10) {
    status = "盤差注意";
  } else {
    status = "嚴重盤差";
  }

  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  logSheet.appendRow([
    nowStr,
    itemCode,
    itemName,
    Number(actualQty),
    Number(erpQty),
    diff,
    staffName || "現場門市人員",
    status,
    note || ""
  ]);

  return {
    success: true,
    itemCode: itemCode,
    actualQty: Number(actualQty),
    erpQty: Number(erpQty),
    diff: diff,
    status: status
  };
}

/**
 * 3. 雙軌庫存融合 (Effective Inventory Engine)
 * 規則：當日有現場抽盤者優先採用抽盤實數；未盤點者以 ERP 640 倉兜底
 * @returns {Array<Object>} 核心材料清單及其當前生效庫存
 */
function getEffectiveInventory() {
  const ss = getSpreadsheet();
  
  // 1. 取得 ERP 640 倉最新帳面數
  const erpResult = cleanERPDataFromRawSheet();
  const erpMap = erpResult.stockMap || {};

  // 2. 取得今日現場抽盤最新紀錄 (當日 00:00 至今)
  const logSheet = ss.getSheetByName(CONFIG.SHEETS.CYCLE_COUNT_LOG);
  const logLastRow = logSheet.getLastRow();
  const todayCycleCountMap = {}; // itemCode -> { actualQty, time, diff }

  if (logLastRow > 1) {
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd");
    const logData = logSheet.getRange(2, 1, logLastRow - 1, 8).getValues();
    
    logData.forEach(row => {
      const rawDateVal = row[0];
      let logDateStr = "";
      if (rawDateVal instanceof Date) {
        logDateStr = Utilities.formatDate(rawDateVal, "Asia/Taipei", "yyyy/MM/dd");
      } else if (rawDateVal) {
        const parsedDate = new Date(String(rawDateVal));
        if (!isNaN(parsedDate.getTime())) {
          logDateStr = Utilities.formatDate(parsedDate, "Asia/Taipei", "yyyy/MM/dd");
        } else {
          logDateStr = String(rawDateVal).substring(0, 10);
        }
      }

      const itemCode = String(row[1] || "").trim();
      const actualQty = Number(row[3]) || 0;
      const diff = Number(row[5]) || 0;
      
      // 比對是否為今日之抽盤 (安全比對 yyyy/MM/dd)
      if (logDateStr === todayStr) {
        // 後面筆數覆蓋前面筆數 (取當日最新)
        todayCycleCountMap[itemCode] = {
          actualQty: actualQty,
          diff: diff,
          logTime: logDateStr
        };
      }
    });
  }

  // 3. 雙軌融合：對齊材料主檔 (支援動態新材料與預設物料)
  const masterMaterials = (typeof getDynamicMasterMaterials === "function") 
    ? getDynamicMasterMaterials() 
    : CONFIG.MASTER_MATERIALS;

  const effectiveList = masterMaterials.map(mat => {
    const erpItem = erpMap[mat.itemCode];
    const erpQty = erpItem ? Number(erpItem.qty) : 0;
    const countItem = todayCycleCountMap[mat.itemCode];

    let effectiveQty = erpQty;
    let source = "未更動 (ERP帳面兜底)";
    let diff = 0;
    let hasCountToday = false;
    let cycleCountQty = null;

    if (countItem) {
      effectiveQty = countItem.actualQty;
      cycleCountQty = countItem.actualQty;
      source = "現場實盤優先";
      diff = countItem.diff;
      hasCountToday = true;
    }

    return {
      itemCode: mat.itemCode,
      itemName: mat.itemName,
      category: mat.category,
      color: mat.color,
      effectiveQty: Math.max(0, effectiveQty), // 庫存非負防呆
      erpQty: erpQty,
      cycleCountQty: cycleCountQty,
      hasCountToday: hasCountToday,
      diff: diff,
      source: source
    };
  });

  return effectiveList;
}

/**
 * 4. 直接批次匯入原始 ERP 陣列資料至 [01_ERP原始匯入]
 * @param {Array<Array>} rawRows 二維資料陣列
 */
function importERPRawData(rawRows) {
  if (!rawRows || rawRows.length === 0) {
    return { success: false, message: "無匯入資料" };
  }
  const ss = getSpreadsheet();
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.ERP_RAW);
  
  // 保留表頭，清除舊資料
  const lastRow = rawSheet.getLastRow();
  if (lastRow > 1) {
    rawSheet.getRange(2, 1, lastRow - 1, rawSheet.getMaxColumns()).clearContent();
  }

  // 加上匯入時間戳記 (第 15 欄)
  const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  const formattedRows = rawRows.map(row => {
    const newRow = [...row];
    while (newRow.length < 14) newRow.push("");
    newRow[14] = nowStr;
    return newRow;
  });

  rawSheet.getRange(2, 1, formattedRows.length, formattedRows[0].length).setValues(formattedRows);

  // 立即觸發清洗
  const cleanResult = cleanERPDataFromRawSheet();
  return {
    success: true,
    message: `成功匯入 ${formattedRows.length} 筆 ERP 原始資料，清洗後 640 倉有效物料 ${cleanResult.count} 項。`,
    cleanResult: cleanResult
  };
}

/**
 * 試算表選單觸發：一鍵匯入真實 ERP 原始資料並自動清洗
 */
function menu_importAndCleanERP() {
  const ui = SpreadsheetApp.getUi();
  const res = importERPRawData(SAMPLE_ERP_RAW_ROWS);
  ui.alert(
    "🧹 ERP 資料匯入與清洗完成",
    `${res.message}\n\n已成功排除所有「小計」、「合計」與非 640 倉之雜項。\n請前往 [01_ERP原始匯入] 檢視成果！`,
    ui.ButtonSet.OK
  );
}

/**
 * 5. 前端檔案上傳專用 API：接收解析後之二維資料陣列直接清洗寫入
 * @param {Array<Array>} fileRows 前端 SheetJS 解析之二維陣列
 */
function api_uploadAndCleanERP(fileRows) {
  try {
    if (!fileRows || !Array.isArray(fileRows) || fileRows.length === 0) {
      return { success: false, message: "上傳的檔案無有效資料列！" };
    }

    // 若第一列為表頭（包含品號字樣），將其排除
    let dataRows = fileRows;
    const firstRowStr = (fileRows[0] || []).join(",");
    if (firstRowStr.includes("品號") || firstRowStr.includes("料號")) {
      dataRows = fileRows.slice(1);
    }

    if (dataRows.length === 0) {
      return { success: false, message: "過濾表頭後無資料內容！" };
    }

    // 匯入與清洗
    const importRes = importERPRawData(dataRows);
    
    // 自動連動刷新 45 天推移表
    generate45DaysProjection();

    return {
      success: true,
      totalParsedRows: dataRows.length,
      validMaterialsCount: importRes.cleanResult ? importRes.cleanResult.count : 0,
      message: `🎉 ERP 報表檔案上傳與清洗完成！\n總共解析 ${dataRows.length} 列資料，640 倉有效納入 ${importRes.cleanResult ? importRes.cleanResult.count : 0} 項物料，已自動連動刷新 45 天動態推移表！`
    };
  } catch (err) {
    return { success: false, message: "檔案清洗寫入失敗: " + err.message };
  }
}

