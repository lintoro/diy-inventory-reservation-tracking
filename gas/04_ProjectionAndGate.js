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
 * 取得指定日期的散客保底用量 (平日 10 / 假日 35)
 * @param {Date} dateObj 
 * @returns {number}
 */
function getSafetyFloor(dateObj) {
  return isHolidayOrWeekend(dateObj) 
    ? CONFIG.SAFETY_FLOOR.WEEKEND 
    : CONFIG.SAFETY_FLOOR.WEEKDAY;
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

  // 讀取該日期已存在的團體預約已扣量
  const ss = getSpreadsheet();
  const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
  const bkLastRow = bkSheet.getLastRow();
  let existingBookedQty = 0;
  
  const targetDateStr = Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy/MM/dd");
  if (bkLastRow > 1) {
    const bkRows = bkSheet.getRange(2, 1, bkLastRow - 1, 4).getValues();
    bkRows.forEach(r => {
      let rDateStr = "";
      if (r[1] instanceof Date) {
        rDateStr = Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd");
      } else {
        rDateStr = String(r[1] || "").substring(0, 10);
      }
      const rProdName = String(r[2] || "");
      const rQty = Number(r[3]) || 0;
      if (rDateStr === targetDateStr && rProdName.includes(prod.productName)) {
        existingBookedQty += rQty;
      }
    });
  }

  // 可預約上限 = 基礎短板可做套數 - 散客保底 - 已預訂套數
  const maxAvailableForBooking = Math.max(0, prod.maxCapacity - safetyFloor - existingBookedQty);
  const requestedQty = Number(bookingQty) || 0;

  let light = "GREEN";
  let statusText = "庫存充足，可正常接單";
  let canBook = true;
  let procurementNeeded = false;
  let shortageQty = 0;
  let latestOrderDateStr = "";

  // 15 天交期時間閘門判定
  if (daysDiff < CONFIG.LEAD_TIME_DAYS) {
    // 【情境 B：距今 < 15 天，不可補貨凍結期】
    if (requestedQty > maxAvailableForBooking) {
      light = "RED";
      canBook = false;
      statusText = `【紅燈禁接】活動日距今僅 ${daysDiff} 天 (<15天不可補貨期)，可接上限鎖定為 ${maxAvailableForBooking} 套 (已扣散客保底 ${safetyFloor} 套與既有預訂 ${existingBookedQty} 套)，禁止超額接單！`;
    } else {
      light = "GREEN";
      statusText = `【綠燈正常】活動日距今 ${daysDiff} 天，目前可用量 ${maxAvailableForBooking} 套充足，可直接接單。`;
    }
  } else {
    // 【情境 A：距今 >= 15 天，可補貨彈性期】
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
 * 送出預約登記明細，若為黃燈則自動生成採購待辦單
 * @param {string} eventDate 活動日 (如 "2026/10/15")
 * @param {string} productId 商品編號
 * @param {number} bookingQty 套數
 * @param {string} groupName 預約團體或窗口
 * @param {string} phone 聯絡電話
 * @param {string} note 備註
 * @returns {Object} 登記結果
 */
function submitBookingRecord(eventDate, productId, bookingQty, groupName, phone, note) {
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
  
  // 生成預約單號 BK-YYYYMMDD-XXX
  const bkCount = bkSheet.getLastRow();
  const bookingNo = `BK-${dateCompact}-${String(bkCount).padStart(3, "0")}`;

  const procurementStatus = check.procurementNeeded ? "待採購叫貨" : "無須採購";

  bkSheet.appendRow([
    bookingNo,
    check.eventDate,
    check.productName,
    Number(bookingQty),
    groupName || "一般團體",
    phone || "",
    nowStr,
    check.light,
    procurementStatus,
    note || ""
  ]);

  // 若為黃燈需採購，自動排入 [05_在途採購清冊]
  let poNumber = "";
  if (check.procurementNeeded) {
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const poCount = poSheet.getLastRow();
    poNumber = `PO-${dateCompact}-${String(poCount).padStart(3, "0")}`;

    poSheet.appendRow([
      poNumber,
      Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd"),
      check.latestOrderDate, // 預計最晚下單日
      `PR-${productId}`,
      `${check.productName} (缺口補料)`,
      check.shortageQty,
      "待主管叫貨",
      bookingNo,
      `源自預約 ${bookingNo}，活動日 ${check.eventDate}，最晚下單日: ${check.latestOrderDate}`
    ]);
  }

  // 預約完成後動態更新 45 天推移表
  generate45DaysProjection();

  return {
    success: true,
    bookingNo: bookingNo,
    poNumber: poNumber,
    light: check.light,
    message: check.statusText,
    checkResult: check
  };
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
  
  const daysList = [];
  const weekDayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

  for (let i = 0; i < CONFIG.PROJECTION_DAYS; i++) {
    const targetDate = new Date(now.getTime() + (i * 24 * 60 * 60 * 1000));
    const dateStr = Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy/MM/dd");
    const dayOfWeek = weekDayNames[targetDate.getDay()];
    const isWk = isHolidayOrWeekend(targetDate);
    const typeStr = isWk ? "假日 (保底35)" : "平日 (保底10)";
    const safety = isWk ? CONFIG.SAFETY_FLOOR.WEEKEND : CONFIG.SAFETY_FLOOR.WEEKDAY;

    // 計算各商品扣除散客保底後的可用量
    const p1Avail = Math.max(0, capacities["1"].maxCapacity - safety);
    const p2Avail = Math.max(0, capacities["2"].maxCapacity - safety);
    const p3Avail = Math.max(0, capacities["3"].maxCapacity - safety);
    const p4Avail = Math.max(0, capacities["4"].maxCapacity - safety);
    const p5Avail = Math.max(0, capacities["5"].maxCapacity - safety);
    const p6Avail = Math.max(0, capacities["6"].maxCapacity - safety);

    daysList.push([
      dateStr,
      dayOfWeek,
      typeStr,
      p1Avail,
      p2Avail,
      p3Avail,
      p4Avail,
      p5Avail,
      p6Avail,
      nowStr
    ]);
  }

  // 寫入工作表 (保留表頭)
  const maxRows = projSheet.getLastRow();
  if (maxRows > 1) {
    projSheet.getRange(2, 1, maxRows - 1, projSheet.getMaxColumns()).clearContent();
  }

  projSheet.getRange(2, 1, daysList.length, daysList[0].length).setValues(daysList);
  projSheet.autoResizeColumns(1, 10);

  return {
    success: true,
    count: daysList.length,
    message: `成功推移計算未來 ${CONFIG.PROJECTION_DAYS} 天庫存可用量`
  };
}

/**
 * 試算表選單觸發：手動刷新 45 天動態推移表
 */
function menu_refreshProjection() {
  const ui = SpreadsheetApp.getUi();
  const res = generate45DaysProjection();
  ui.alert("📈 45 天動態推移底表刷新完成", `${res.message}，已扣除平日(10)/假日(35)散客保底底線！\n請切換至 [07_45天動態推移底表] 檢視。`, ui.ButtonSet.OK);
}
