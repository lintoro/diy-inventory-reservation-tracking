/**
 * 45 天動態推移、15 天交期時間閘門防呆與缺料採購單生成 (04_ProjectionAndGate.js)
 */

/**
 * 判斷指定日期是否為假日 (週六、週日)
 * @param {Date} dateObj 
 * @returns {boolean}
 */
function isHolidayOrWeekend(dateObj) {
  const day = dateObj.getDay();
  return day === 0 || day === 6; // 0=週日, 6=週六
}

/**
 * 取得指定日期的散客保底用量 (平日 10 / 假日 20，支援庫管動態調整與特殊日覆蓋)
 * @param {Date} dateObj 
 * @returns {number}
 */
function getSafetyFloor(dateObj) {
  const cfg = getSafetyFloorConfig();
  const dateStr = Utilities.formatDate(dateObj, "Asia/Taipei", "yyyy/MM/dd");
  
  // 優先檢查特殊指定日期覆蓋
  if (cfg.specialDates && cfg.specialDates[dateStr] !== undefined) {
    return Number(cfg.specialDates[dateStr]);
  }

  return isHolidayOrWeekend(dateObj) ? cfg.weekend : cfg.weekday;
}

/**
 * 計算指定活動日與今日的天數差距 (Δdays)
 * @param {string|Date} eventDate 
 * @returns {number}
 */
function calculateDaysDiff(eventDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let target = eventDate instanceof Date ? new Date(eventDate.getTime()) : new Date(String(eventDate));
  target.setHours(0, 0, 0, 0);
  
  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 核心時間閘門檢核：試算指定日期、商品之接單燈號與上限
 * @param {string|Date} eventDate 活動日期 (如 "2026/10/15")
 * @param {string} productId 商品方案編號 ("1" ~ "6")
 * @param {number} bookingQty 欲預訂套數
 * @returns {Object} 試算與檢核報告 (含燈號 GREEN / YELLOW / RED)
 */
function checkBookingEligibility(eventDate, productId, bookingQty) {
  const targetDate = eventDate instanceof Date ? eventDate : new Date(String(eventDate));
  const daysDiff = calculateDaysDiff(targetDate);
  const safetyFloor = getSafetyFloor(targetDate);
  const isWeekend = isHolidayOrWeekend(targetDate);

  // 取得全產品當前基礎上限 (木桶短板)
  const capacities = calculateProductCapacities();
  const prod = capacities[productId];
  if (!prod) {
    return { success: false, message: `無效的商品編號: ${productId}` };
  }

  // 讀取該日期及之前已存在的團體預約已扣量 (累計扣除，避免跨日超賣)
  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const bkLastRow = bkSheet.getLastRow();
  let existingBookedQty = 0;
  
  const targetDateStr = Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy/MM/dd");
  if (bkLastRow > 1) {
    const bkRows = bkSheet.getRange(2, 1, bkLastRow - 1, 10).getValues();
    bkRows.forEach(r => {
      let rDateStr = "";
      if (r[1] instanceof Date) {
        rDateStr = Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd");
      } else {
        rDateStr = String(r[1] || "").substring(0, 10).replace(/-/g, "/");
      }
      const rProdName = String(r[2] || "");
      const rQty = Number(r[3]) || 0;
      // 只要活動日 <= 查詢目標日，即代表物料在此日期或之前已被佔用
      if (rDateStr <= targetDateStr && rProdName.includes(prod.productName)) {
        existingBookedQty += rQty;
      }
    });
  }

  // 可預約上限 = 基礎短板可做套數 - 散客保底 - 累計已預訂套數
  const maxAvailableForBooking = Math.max(0, prod.maxCapacity - safetyFloor - existingBookedQty);
  const requestedQty = Number(bookingQty) || 0;

  let light = "GREEN";
  let statusText = "庫存充足，可正常接單";
  let canBook = true;
  let procurementNeeded = false;
  let shortageQty = 0;
  let latestOrderDateStr = "";

  // 15 天交期時間閘門與 45 天長期預約判定
  const isOver45Days = (daysDiff > 45);

  if (isOver45Days) {
    // 【情境 C：距今 > 45 天，交期充裕皆可預訂】
    light = "GREEN";
    canBook = true;
    procurementNeeded = false;
    statusText = `【交期充裕，皆可預訂】活動日距今 ${daysDiff} 天 (>45天)，備料期極為充足，排單無限制，可直接接單預約！`;
  } else if (daysDiff < CONFIG.LEAD_TIME_DAYS) {
    // 【情境 B：距今 < 15 天，不可補貨凍結期】
    if (requestedQty > maxAvailableForBooking) {
      light = "RED";
      canBook = false;
      statusText = `【紅燈禁接】活動日距今僅 ${daysDiff} 天 (<15天不可補貨期)，可接上限鎖定為 ${maxAvailableForBooking} 套 (已扣散客保底 ${safetyFloor} 套與累計已預訂 ${existingBookedQty} 套)，禁止超額接單！`;
    } else {
      light = "GREEN";
      statusText = `【綠燈正常】活動日距今 ${daysDiff} 天，目前可用量 ${maxAvailableForBooking} 套充足，可直接接單。`;
    }
  } else {
    // 【情境 A：距今 15~45 天，可補貨彈性期】
    if (requestedQty > maxAvailableForBooking) {
      light = "YELLOW";
      canBook = true; // 允許彈性超額接單
      procurementNeeded = true;
      shortageQty = requestedQty - maxAvailableForBooking;
      
      // 計算最晚下單叫貨日 (活動日 - 15天)
      const latestOrderDate = new Date(targetDate.getTime() - (CONFIG.LEAD_TIME_DAYS * 24 * 60 * 60 * 1000));
      latestOrderDateStr = Utilities.formatDate(latestOrderDate, "Asia/Taipei", "yyyy/MM/dd");

      statusText = `【黃燈需叫貨】活動日距今 ${daysDiff} 天 (>=15天)，庫存尚缺 ${shortageQty} 套。允許彈性接單，但需於【最晚叫貨日 ${latestOrderDateStr}】前通知主管向工廠下單！`;
    } else {
      light = "GREEN";
      statusText = `【綠燈正常】活動日距今 ${daysDiff} 天，在庫庫存充足 (${maxAvailableForBooking} 套)，可正常接單。`;
    }
  }

  return {
    success: true,
    productId: productId,
    productName: prod.productName,
    eventDate: targetDateStr,
    daysDiff: daysDiff,
    isWeekend: isWeekend,
    safetyFloor: safetyFloor,
    baseCapacity: prod.maxCapacity,
    existingBookedQty: existingBookedQty,
    maxAvailableForBooking: maxAvailableForBooking,
    requestedQty: requestedQty,
    canBook: canBook,
    light: light,
    statusText: statusText,
    procurementNeeded: procurementNeeded,
    shortageQty: shortageQty,
    latestOrderDate: latestOrderDateStr,
    bottleneckCategory: prod.bottleneckCategory
  };
}

/**
 * 送出預約登記明細 (不自動生成採購單，改為記錄缺口提醒)
 * @param {string} eventDate 活動日 (如 "2026/10/15")
 * @param {string} productId 商品編號
 * @param {number} bookingQty 套數
 * @param {string} groupName 預約團體或窗口
 * @param {string} phone 聯絡電話
 * @param {string} note 備註
 * @param {string} [customBookingNo] 自訂預約單號 (選填)
 * @returns {Object} 登記結果
 */
function submitBookingRecord(eventDate, productId, bookingQty, groupName, phone, note, customBookingNo) {
  // 先執行時間閘門防呆試算
  const check = checkBookingEligibility(eventDate, productId, bookingQty);
  if (!check.canBook) {
    return {
      success: false,
      light: check.light,
      message: check.statusText
    };
  }

  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const now = new Date();
  const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  const dateCompact = Utilities.formatDate(now, "Asia/Taipei", "yyyyMMdd");
  
  // 決定預約單號 (若有傳入自訂單號則優先採用)
  let bookingNo = String(customBookingNo || "").trim();
  const lastRow = bkSheet.getLastRow();
  const existingNos = (lastRow > 1) 
    ? bkSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim())
    : [];

  if (!bookingNo) {
    const bkCount = lastRow;
    bookingNo = `BK-${dateCompact}-${String(bkCount).padStart(3, "0")}`;
  }

  // 防重複檢查：若單號已在資料庫中存在，自動附加隨機後綴確保唯一性
  if (existingNos.includes(bookingNo)) {
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    bookingNo = `${bookingNo}-${suffix}`;
  }

  // 缺口提醒狀態 (取代原先的自動叫貨機制)
  const procurementReminder = check.procurementNeeded 
    ? `⚠️ 尚缺 ${check.shortageQty} 套 (最晚叫貨: ${check.latestOrderDate})` 
    : "無須採購 (庫存充裕)";

  bkSheet.appendRow([
    bookingNo,
    check.eventDate,
    check.productName,
    Number(bookingQty),
    groupName || "一般團體",
    phone || "",
    nowStr,
    check.light,
    procurementReminder,
    note || ""
  ]);

  // 重新刷新推移預估
  generate45DaysProjection();

  let finalMessage = check.statusText;
  if (check.procurementNeeded) {
    finalMessage = `預約單 [${bookingNo}] 建立成功！⚠️【缺口提醒】活動日 ${check.eventDate} 庫存尚缺 ${check.shortageQty} 套，請通知主管手動叫貨 (最晚下單日：${check.latestOrderDate})！`;
  }

  return {
    success: true,
    bookingNo: bookingNo,
    poNumber: "",
    light: check.light,
    message: finalMessage,
    checkResult: check
  };
}

/**
 * 取得所有預約登記明細清冊
 */
function getAllBookingRecords() {
  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const lastRow = bkSheet.getLastRow();
  if (lastRow <= 1) return [];

  const rows = bkSheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const list = [];
  rows.forEach((r, idx) => {
    let bDateStr = "";
    if (r[1] instanceof Date) {
      bDateStr = Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd");
    } else {
      bDateStr = String(r[1] || "").substring(0, 10);
    }

    let createTimeStr = "";
    if (r[6] instanceof Date) {
      createTimeStr = Utilities.formatDate(r[6], "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    } else {
      createTimeStr = String(r[6] || "");
    }

    list.push({
      rowIndex: idx + 2,
      bookingNo: String(r[0] || "").trim(),
      eventDate: bDateStr,
      productName: String(r[2] || "").trim(),
      qty: Number(r[3]) || 0,
      groupName: String(r[4] || "").trim(),
      phone: String(r[5] || "").trim(),
      createdAt: createTimeStr,
      light: String(r[7] || "GREEN").trim(),
      procurementStatus: String(r[8] || "").trim(),
      note: String(r[9] || "").trim()
    });
  });

  // 動態庫存連動核銷試算：根據當前最新有效庫存與散客保底，即時重新評估每筆預約的燈號與缺口狀態
  try {
    const capacities = calculateProductCapacities();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 依活動日先後排序模擬物料消耗 (較早的活動優先佔用庫存)
    const sortedIndices = list.map((item, idx) => ({ idx, date: item.eventDate }))
      .sort((a, b) => (a.date > b.date ? 1 : (a.date < b.date ? -1 : 0)));

    const consumedMap = {}; // productName -> 已佔用套數
    let needSyncToSheet = false;
    const statusUpdates = []; // { row, light, status }

    sortedIndices.forEach(({ idx }) => {
      const item = list[idx];
      const prodName = item.productName;
      if (!consumedMap[prodName]) consumedMap[prodName] = 0;

      // 匹配對應的體驗商品方案
      let targetProd = null;
      Object.keys(capacities).forEach(id => {
        const p = capacities[id];
        if (p.productName === prodName || prodName.includes(p.productName) || p.productName.includes(prodName)) {
          targetProd = p;
        }
      });

      if (targetProd) {
        const parts = item.eventDate.split("/");
        const eventDateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const daysDiff = Math.round((eventDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const floor = getSafetyFloor(eventDateObj);
        const totalCap = targetProd.maxCapacity || 0;

        let newLight = "GREEN";
        let newStatus = "無須採購 (庫存充裕)";

        if (daysDiff < 0) {
          // 活動日期已過：屬於歷史預約，不佔用當前現有可用庫存，也不提示採購
          item.isPast = true;
          newLight = "CLOSED";
          newStatus = "活動已結束 (歷史紀錄)";
        } else if (daysDiff > 45) {
          // 距今 > 45 天，交期充裕，排單無限制
          item.isPast = false;
          newLight = "GREEN";
          newStatus = "無須採購 (庫存充裕)";
        } else {
          item.isPast = false;
          const availBefore = Math.max(0, totalCap - floor - consumedMap[prodName]);
          if (item.qty <= availBefore) {
            // 最新庫存已完全滿足！缺口自動消除
            newLight = "GREEN";
            newStatus = "無須採購 (庫存充裕)";
            consumedMap[prodName] += item.qty;
          } else {
            // 依然有缺口
            const shortage = item.qty - availBefore;
            newLight = (daysDiff < CONFIG.LEAD_TIME_DAYS) ? "RED" : "YELLOW";
            const latestOrderDate = new Date(eventDateObj.getTime() - (CONFIG.LEAD_TIME_DAYS * 24 * 60 * 60 * 1000));
            const latestOrderDateStr = Utilities.formatDate(latestOrderDate, "Asia/Taipei", "yyyy/MM/dd");
            newStatus = `⚠️ 尚缺 ${shortage} 套 (最晚叫貨: ${latestOrderDateStr})`;
            consumedMap[prodName] += availBefore;
          }
        }

        if (item.light !== newLight || item.procurementStatus !== newStatus) {
          item.light = newLight;
          item.procurementStatus = newStatus;
          statusUpdates.push({ row: item.rowIndex, light: newLight, status: newStatus });
          needSyncToSheet = true;
        }
      }
    });

    // 若狀態有更新，非同步同步寫回試算表保持資料一致
    if (needSyncToSheet && statusUpdates.length > 0) {
      statusUpdates.forEach(u => {
        bkSheet.getRange(u.row, 8).setValue(u.light);
        bkSheet.getRange(u.row, 9).setValue(u.status);
      });

      if (typeof writeAuditLog === "function") {
        writeAuditLog({
          operatorEmpNo: "SYSTEM",
          operatorName: "庫存核銷引擎",
          operatorRole: "SYSTEM",
          module: "SYSTEM",
          action: "AUTO_SYNC",
          target: "06_預約登記明細",
          summary: `系統動態試算：自動同步更新 ${statusUpdates.length} 筆預約之最新燈號與缺口提醒`,
          status: "成功",
          source: "SYSTEM_AUTO"
        });
      }
    }
  } catch (syncErr) {
    // 容錯機制：若動態計算有微小偏差，不影響清單回傳
  }

  return list;
}

/**
 * 更新已存在的預約登記資料
 * @param {Object} data { bookingNo, eventDate, productName, qty, groupName, phone, note }
 */
function updateBookingRecord(data) {
  const cleanNo = String(data.bookingNo || "").trim();
  if (!cleanNo) return { success: false, message: "預約單號不得為空" };

  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const lastRow = bkSheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "查無預約紀錄" };

  const rows = bkSheet.getRange(2, 1, lastRow - 1, 10).getValues();
  let targetRowIndex = -1;
  const numRow = Number(data.rowIndex);
  if (numRow >= 2 && numRow <= lastRow) {
    const checkNo = String(bkSheet.getRange(numRow, 1).getValue()).trim();
    if (checkNo === cleanNo || !cleanNo) {
      targetRowIndex = numRow;
    }
  }

  if (targetRowIndex === -1) {
    const rows = bkSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === cleanNo) {
        targetRowIndex = i + 2;
        break;
      }
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, message: `找不到預約單號 [${cleanNo}]` };
  }

  // 格式化日期
  const newDate = String(data.eventDate || "").replace(/-/g, "/").trim();
  const newQty = Number(data.qty) || 0;
  const newProd = String(data.productName || "").trim();
  const newGroup = String(data.groupName || "").trim();
  const newPhone = String(data.phone || "").trim();
  const newNote = String(data.note || "").trim();

  // 更新該行資料
  bkSheet.getRange(targetRowIndex, 2).setValue(newDate);
  bkSheet.getRange(targetRowIndex, 3).setValue(newProd);
  bkSheet.getRange(targetRowIndex, 4).setValue(newQty);
  bkSheet.getRange(targetRowIndex, 5).setValue(newGroup);
  bkSheet.getRange(targetRowIndex, 6).setValue(newPhone);
  bkSheet.getRange(targetRowIndex, 10).setValue(newNote);

  // 重新試算 45 天動態推移
  generate45DaysProjection();

  return {
    success: true,
    message: `預約單 [${cleanNo}] 已成功更新！`,
    bookingNo: cleanNo
  };
}

/**
 * 刪除指定預約紀錄 (支援指定 rowIndex 避免同單號誤刪)
 * @param {string} bookingNo 預約單號
 * @param {number} [rowIndex] 試算表列號
 */
function deleteBookingRecord(bookingNo, rowIndex) {
  const cleanNo = String(bookingNo || "").trim();
  if (!cleanNo && !rowIndex) return { success: false, message: "預約單號或列號不得為空" };

  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const lastRow = bkSheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "查無預約紀錄" };

  let rowToDelete = -1;
  const numRow = Number(rowIndex);
  if (numRow >= 2 && numRow <= lastRow) {
    const checkNo = String(bkSheet.getRange(numRow, 1).getValue()).trim();
    if (checkNo === cleanNo || !cleanNo) {
      rowToDelete = numRow;
    }
  }

  if (rowToDelete === -1 && cleanNo) {
    const rows = bkSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === cleanNo) {
        rowToDelete = i + 2;
        break;
      }
    }
  }

  if (rowToDelete !== -1) {
    bkSheet.deleteRow(rowToDelete);
    generate45DaysProjection();
    return {
      success: true,
      message: `預約單 [${cleanNo}] 已成功刪除，庫存配額已即時釋放！`
    };
  }

  return { success: false, message: `找不到預約單號 [${cleanNo}]` };
}

/**
 * 生成並刷新 [07_45天動態推移底表]
 */
function generate45DaysProjection() {
  const ss = getSpreadsheet();
  const projSheet = ss.getSheetByName(CONFIG.SHEETS.ROLLING_PROJECTION);
  
  // 取得基準全品項可做上限
  const capacities = calculateProductCapacities();
  const now = new Date();
  const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  
  // 動態取得所有商品 ID（依 ID 數值遞增排序，確保欄位穩定）
  const productIds = Object.keys(capacities).sort((a, b) => {
    const numA = isNaN(Number(a)) ? 9999 : Number(a);
    const numB = isNaN(Number(b)) ? 9999 : Number(b);
    return numA - numB;
  });

  const daysList = [];
  const weekDayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

  for (let i = 0; i < CONFIG.PROJECTION_DAYS; i++) {
    const targetDate = new Date(now.getTime() + (i * 24 * 60 * 60 * 1000));
    const dateStr = Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy/MM/dd");
    const dayOfWeek = weekDayNames[targetDate.getDay()];
    const isWk = isHolidayOrWeekend(targetDate);
    const safety = getSafetyFloor(targetDate);
    const typeStr = isWk ? `假日 (保底${safety})` : `平日 (保底${safety})`;

    // 動態計算各商品扣除散客保底後的可用量
    const availList = productIds.map(pId => {
      const cap = capacities[pId];
      return Math.max(0, (cap ? cap.maxCapacity : 0) - safety);
    });

    daysList.push([dateStr, dayOfWeek, typeStr, ...availList, nowStr]);
  }

  // 動態重建標頭列（確保自訂商品欄位也出現）
  const headerBase = ["日期", "星期", "日期類型"];
  const headerProducts = productIds.map(pId => {
    const cap = capacities[pId];
    return cap ? `${pId}. ${cap.productName || pId}（可接組數）` : `${pId}（可接組數）`;
  });
  const header = [...headerBase, ...headerProducts, "更新時間"];
  
  // 清除並重寫（包含表頭）
  const totalCols = header.length;
  const maxRows = projSheet.getLastRow();
  if (maxRows > 0) {
    projSheet.getRange(1, 1, maxRows, projSheet.getMaxColumns()).clearContent();
  }
  projSheet.getRange(1, 1, 1, totalCols).setValues([header]);
  
  if (daysList.length > 0) {
    projSheet.getRange(2, 1, daysList.length, daysList[0].length).setValues(daysList);
  }
  projSheet.autoResizeColumns(1, totalCols);

  if (typeof writeAuditLog === "function") {
    writeAuditLog({
      operatorEmpNo: "SYSTEM",
      operatorName: "推移預測引擎",
      operatorRole: "SYSTEM",
      module: "SYSTEM",
      action: "AUTO_SYNC",
      target: "07_45天動態推移底表",
      summary: `重算未來 ${CONFIG.PROJECTION_DAYS} 天庫存可用推移底表（共 ${daysList.length} 天，${productIds.length} 個方案）`,
      status: "成功",
      source: "SYSTEM_AUTO"
    });
  }

  return {
    success: true,
    count: daysList.length,
    message: `成功推移計算未來 ${CONFIG.PROJECTION_DAYS} 天庫存可用量（共 ${productIds.length} 項方案）`
  };
}

/**
 * 試算表選單觸發：手動刷新 45 天動態推移表
 */
function menu_refreshProjection() {
  const ui = SpreadsheetApp.getUi();
  const res = generate45DaysProjection();
  const floorCfg = getSafetyFloorConfig();
  ui.alert("📈 45 天動態推移底表刷新完成", `${res.message}，已扣除平日(${floorCfg.weekday})/假日(${floorCfg.weekend})散客保底底線！\n請切換至 [07_45天動態推移底表] 檢視。`, ui.ButtonSet.OK);
}
