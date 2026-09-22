/**
 * Web App 前端介面與 API 控制器 (05_API.js)
 */

/**
 * Web App 入口函式
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile("index");
  return template.evaluate()
    .setTitle("DIY 活動物料庫存與預約接單管理系統")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API: 取得系統儀表板總覽資料 (給主管看板與業務端初始載入)
 */
function api_getDashboardOverview() {
  const capacities = calculateProductCapacities();
  const effectiveList = getEffectiveInventory();
  
  // 取得最新 10 筆預約明細
  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const bkLastRow = bkSheet.getLastRow();
  const recentBookings = [];
  if (bkLastRow > 1) {
    const startRow = Math.max(2, bkLastRow - 9);
    const bkRows = bkSheet.getRange(startRow, 1, bkLastRow - startRow + 1, 9).getValues();
    bkRows.reverse().forEach(r => {
      let dateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd") : String(r[1] || "");
      recentBookings.push({
        bookingNo: r[0],
        eventDate: dateStr,
        productName: r[2],
        qty: r[3],
        groupName: r[4],
        light: r[7],
        status: r[8]
      });
    });
  }

  // 取得在途採購清單
  const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
  const poLastRow = poSheet.getLastRow();
  const pendingPOs = [];
  if (poLastRow > 1) {
    const poRows = poSheet.getRange(2, 1, poLastRow - 1, 8).getValues();
    poRows.forEach(r => {
      let orderDateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd") : String(r[1] || "");
      let deadlineStr = r[2] instanceof Date ? Utilities.formatDate(r[2], "Asia/Taipei", "yyyy/MM/dd") : String(r[2] || "");
      pendingPOs.push({
        poNumber: r[0],
        orderDate: orderDateStr,
        deadline: deadlineStr,
        itemCode: r[3],
        itemName: r[4],
        qty: r[5],
        status: r[6],
        bookingNo: r[7]
      });
    });
  }

  return {
    success: true,
    capacities: capacities,
    materials: CONFIG.MASTER_MATERIALS,
    products: CONFIG.PRODUCTS,
    recentBookings: recentBookings,
    pendingPOs: pendingPOs
  };
}

/**
 * API: 業務端即時試算活動日可接單上限與燈號
 */
function api_checkEligibility(eventDateStr, productId, qty) {
  try {
    return checkBookingEligibility(eventDateStr, productId, qty);
  } catch (err) {
    return { success: false, message: "試算失敗: " + err.message };
  }
}

/**
 * API: 業務端送出預約登記
 */
function api_submitBooking(data) {
  try {
    return submitBookingRecord(
      data.eventDate,
      data.productId,
      data.qty,
      data.groupName,
      data.phone,
      data.note
    );
  } catch (err) {
    return { success: false, message: "送出預約失敗: " + err.message };
  }
}

/**
 * API: 主管端現場 3 秒抽盤回報
 */
function api_recordCycleCount(itemCode, actualQty, staffName, note) {
  try {
    const res = recordCycleCount(itemCode, actualQty, staffName, note);
    // 抽盤後自動重新生成推移表
    generate45DaysProjection();
    return res;
  } catch (err) {
    return { success: false, message: "抽盤回報失敗: " + err.message };
  }
}

/**
 * API: 主管端貼上 ERP 原始文字 (TSV/Excel) 一鍵清洗
 */
function api_importERPPastedText(text) {
  try {
    if (!text || !text.trim()) {
      return { success: false, message: "貼上的內容為空" };
    }
    const lines = text.trim().split(/\r?\n/);
    const parsedRows = lines.map(line => line.split("\t"));
    
    // 若第一列為表頭則跳過
    let dataRows = parsedRows;
    if (parsedRows[0][0] && parsedRows[0][0].includes("品號")) {
      dataRows = parsedRows.slice(1);
    }

    const res = importERPRawData(dataRows);
    generate45DaysProjection();
    return res;
  } catch (err) {
    return { success: false, message: "匯入清洗失敗: " + err.message };
  }
}

/**
 * API: 主管端一鍵重置載入真實 ERP 範例資料
 */
function api_resetSampleERP() {
  try {
    const res = importERPRawData(SAMPLE_ERP_RAW_ROWS);
    generate45DaysProjection();
    return res;
  } catch (err) {
    return { success: false, message: "重置失敗: " + err.message };
  }
}
