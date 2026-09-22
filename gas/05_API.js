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
/**
 * API: 取得系統儀表板總覽資料 (給主管看板與業務端初始載入)
 */
function api_getDashboardOverview() {
  try {
    const capacities = calculateProductCapacities();
    const capacitiesList = Object.keys(capacities).map(id => capacities[id]);
    const effectiveList = getEffectiveInventory();
    
    // 取得「今天起 30 天內」之有效預約明細
    const ss = getSpreadsheet();
    const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
    const bkLastRow = bkSheet.getLastRow();
    const recentBookings = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    in30Days.setHours(23, 59, 59, 999);

    if (bkLastRow > 1) {
      const bkRows = bkSheet.getRange(2, 1, bkLastRow - 1, 9).getValues();
      bkRows.forEach(r => {
        let evDate = r[1] instanceof Date ? r[1] : new Date(String(r[1]));
        if (!isNaN(evDate.getTime())) {
          evDate.setHours(0, 0, 0, 0);
          if (evDate >= today && evDate <= in30Days) {
            let dateStr = Utilities.formatDate(evDate, "Asia/Taipei", "yyyy/MM/dd");
            recentBookings.push({
              bookingNo: r[0],
              eventDate: dateStr,
              productName: r[2],
              qty: r[3],
              groupName: r[4],
              light: r[7],
              status: r[8]
            });
          }
        }
      });
      // 依活動日期由近到遠排序
      recentBookings.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
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

    // 散客保底配置
    const safetyFloorCfg = getSafetyFloorConfig();

    return {
      success: true,
      capacities: capacities,
      capacitiesList: capacitiesList,
      materials: CONFIG.MASTER_MATERIALS,
      products: CONFIG.PRODUCTS,
      recentBookings: recentBookings,
      pendingPOs: pendingPOs,
      safetyFloorConfig: safetyFloorCfg
    };
  } catch (err) {
    return {
      success: false,
      message: "取得儀表板資料異常: " + err.message,
      capacities: {},
      capacitiesList: [],
      recentBookings: [],
      pendingPOs: []
    };
  }
}

/**
 * API: 庫管或管理者調整散客保底配置並重新試算 45 天推移
 */
function api_updateSafetyFloor(userEmpNo, weekday, weekend, specialDates) {
  try {
    const cleanEmpNo = String(userEmpNo || "").trim().toUpperCase();
    // 檢查是否有權限 (INVENTORY 或 ADMIN)
    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    let hasPermission = false;

    if (lastRow > 1) {
      const users = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      for (let i = 0; i < users.length; i++) {
        if (String(users[i][0]).trim().toUpperCase() === cleanEmpNo) {
          const role = String(users[i][3]).trim();
          const status = String(users[i][4]).trim();
          if (status === CONFIG.USER_STATUS.ACTIVE && (role === CONFIG.ROLES.INVENTORY || role === CONFIG.ROLES.ADMIN)) {
            hasPermission = true;
          }
          break;
        }
      }
    }

    if (!hasPermission) {
      return { success: false, message: "權限不足：僅庫管人員或管理者可調整現場保底！" };
    }

    const updatedCfg = setSafetyFloorConfig(weekday, weekend, specialDates);
    // 自動重新計算 45 天推移表
    generate45DaysProjection();

    return {
      success: true,
      message: `散客保底設定已儲存 (平日: ${updatedCfg.weekday} 份 / 假日: ${updatedCfg.weekend} 份)，並已自動重新完成 45 天推移計算！`,
      config: updatedCfg
    };
  } catch (err) {
    return { success: false, message: "保底設定失敗: " + err.message };
  }
}

/**
 * API: 庫存管理端依指定日期查詢預估推移庫存
 */
function api_getProjectionByDate(targetDateStr) {
  try {
    if (!targetDateStr) return { success: false, message: "請指定查詢日期" };
    
    const ss = getSpreadsheet();
    const projSheet = ss.getSheetByName(CONFIG.SHEETS.ROLLING_PROJECTION);
    const lastRow = projSheet.getLastRow();
    if (lastRow <= 1) {
      generate45DaysProjection();
    }

    const rows = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 10).getValues();
    for (let i = 0; i < rows.length; i++) {
      let rDate = rows[i][0];
      let rDateStr = rDate instanceof Date ? Utilities.formatDate(rDate, "Asia/Taipei", "yyyy/MM/dd") : String(rDate);
      if (rDateStr === targetDateStr) {
        return {
          success: true,
          date: rDateStr,
          dayOfWeek: rows[i][1],
          dateType: rows[i][2],
          safetyFloor: getSafetyFloor(new Date(rDateStr)),
          capacities: {
            "1": { name: "手能生巧", netQty: rows[i][3] },
            "2": { name: "繪聲繪影 - 胖胖盒", netQty: rows[i][4] },
            "3": { name: "繪聲繪影 - TB200", netQty: rows[i][5] },
            "4": { name: "繪聲繪影 - TB9", netQty: rows[i][6] },
            "5": { name: "旁敲側擊 (折疊籃)", netQty: rows[i][7] },
            "6": { name: "請多紙膠", netQty: rows[i][8] }
          },
          lastCalculatedAt: rows[i][9]
        };
      }
    }

    // 若底表中未找到，即時試算
    const parsedDate = new Date(targetDateStr);
    const floor = getSafetyFloor(parsedDate);
    const baseCaps = calculateProductCapacities();
    const dayCaps = {};
    Object.keys(baseCaps).forEach(id => {
      dayCaps[id] = {
        name: baseCaps[id].productName,
        netQty: Math.max(0, baseCaps[id].maxCapacity - floor)
      };
    });

    return {
      success: true,
      date: targetDateStr,
      dayOfWeek: "",
      dateType: isHolidayOrWeekend(parsedDate) ? "假日" : "平日",
      safetyFloor: floor,
      capacities: dayCaps,
      lastCalculatedAt: "即時計算"
    };
  } catch (err) {
    return { success: false, message: "查詢推移失敗: " + err.message };
  }
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
