/**
 * Web App 前端介面與 API 控制器 (05_API.js)
 */

/**
 * Web App 入口函式
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    const action = e.parameter.action;
    let res = { success: false, message: "未知 action" };
    if (action === "test_Phase12") {
      res = test_Phase12_ComprehensiveUpgrades();
    } else if (action === "api_getDashboardOverview") {
      res = api_getDashboardOverview();
    } else if (action === "api_getProjectionByDate") {
      res = api_getProjectionByDate(e.parameter.date || "2026/09/30");
    } else if (action === "api_getBookingList") {
      res = api_getBookingList();
    } else if (action === "api_getProcurementList") {
      res = api_getProcurementList();
    }
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const template = HtmlService.createTemplateFromFile("index");
  return template.evaluate()
    .setTitle("DIY_物料庫存與預約接單管理系統")
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
        const groupName = String(r[4] || "");
        const note = String(r[8] || "");
        // 排除測試產生的假資料
        if (groupName.includes("測試") || note.includes("測試")) return;

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
              groupName: groupName,
              light: r[7],
              status: r[8]
            });
          }
        }
      });
      // 依活動日期由近到遠排序
      recentBookings.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    }

    // 取得在途採購清單 (排除測試假資料)
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const poLastRow = poSheet.getLastRow();
    const pendingPOs = [];
    if (poLastRow > 1) {
      const poRows = poSheet.getRange(2, 1, poLastRow - 1, 9).getValues();
      poRows.forEach(r => {
        const poNote = String(r[8] || "");
        const bookingRef = String(r[7] || "");
        if (poNote.includes("測試") || bookingRef.includes("測試")) return;

        let orderDateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd") : String(r[1] || "");
        let deadlineStr = r[2] instanceof Date ? Utilities.formatDate(r[2], "Asia/Taipei", "yyyy/MM/dd") : String(r[2] || "");
        pendingPOs.push({
          poNumber: String(r[0] || "").trim(),
          orderDate: orderDateStr,
          demandDate: orderDateStr,
          deadline: deadlineStr,
          replenishmentDate: deadlineStr,
          itemCode: String(r[3] || "").trim(),
          itemName: String(r[4] || "").trim(),
          qty: Number(r[5]) || 0,
          status: String(r[6] || "").trim(),
          bookingNo: String(r[7] || "").trim(),
          refNo: String(r[7] || "").trim(),
          note: poNote
        });
      });
    }

    // 散客保底配置
    const safetyFloorCfg = getSafetyFloorConfig();

    const dynamicConfig = getDynamicProductsAndBOM();
    const dynamicMaterials = getDynamicMasterMaterials();

    return {
      success: true,
      capacities: capacities,
      capacitiesList: capacitiesList,
      materials: dynamicMaterials,
      products: dynamicConfig.products,
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
 * API: 庫存管理端依指定日期查詢預估推移庫存 (秒級計算，不依賴底表行數)
 */
function api_getProjectionByDate(targetDateStr) {
  try {
    if (!targetDateStr) return { success: false, message: "請指定查詢日期" };
    
    // 相容 yyyy/MM/dd 與 yyyy-MM-dd
    const normalizedDateStr = String(targetDateStr).replace(/-/g, "/");
    const parts = normalizedDateStr.split("/");
    const parsedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

    if (isNaN(parsedDate.getTime())) {
      return { success: false, message: "無效的日期格式: " + targetDateStr };
    }

    const floor = getSafetyFloor(parsedDate);
    const isWk = isHolidayOrWeekend(parsedDate);
    const dateType = isWk ? "假日" : "平日";
    
    // 即時調用木桶短板引擎進行推移
    const capacities = calculateProductCapacities();
    const dayCaps = {};
    
    // 檢查該活動日及之前已預約總套數 (累計扣除，推移正確反映物料消耗)
    const ss = getSpreadsheet();
    const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
    const bkLastRow = bkSheet.getLastRow();
    const bookingsOnDate = {}; // productName -> bookedQty

    if (bkLastRow > 1) {
      const bkRows = bkSheet.getRange(2, 1, bkLastRow - 1, 5).getValues();
      bkRows.forEach(r => {
        let bDateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd") : String(r[1]).substring(0, 10).replace(/-/g, "/");
        // 修正 Bug #1：累計所有活動日 <= normalizedDateStr 的預約套數
        if (bDateStr <= normalizedDateStr) {
          const prodName = String(r[2]);
          bookingsOnDate[prodName] = (bookingsOnDate[prodName] || 0) + (Number(r[3]) || 0);
        }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetMid = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    const daysDiff = Math.ceil((targetMid.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isOver45Days = (daysDiff > 45);

    Object.keys(capacities).forEach(id => {
      const p = capacities[id];
      const booked = bookingsOnDate[p.productName] || 0;
      const netQty = Math.max(0, p.maxCapacity - floor - booked);

      // 彙整該方案相關零件之未到貨補貨明細 (供業務端到貨提醒)
      let incomingNotices = [];
      if (p.partsDetail && Array.isArray(p.partsDetail)) {
        p.partsDetail.forEach(part => {
          if (part.incomingSupplies && part.incomingSupplies.length > 0) {
            part.incomingSupplies.forEach(inc => {
              incomingNotices.push(`預計 ${inc.arrivalDate} 補貨到貨 (${inc.itemName} +${inc.qty})`);
            });
          }
        });
      }

      dayCaps[id] = {
        name: p.productName,
        grossCapacity: p.maxCapacity,
        safetyFloor: floor,
        bookedQty: booked,
        netQty: netQty,
        isOver45Days: isOver45Days,
        displayStatus: isOver45Days ? "皆可預訂" : `${netQty} 套`,
        incomingNotices: incomingNotices,
        incomingNoticeText: incomingNotices.length > 0 ? incomingNotices[0] : ""
      };
    });

    return {
      success: true,
      date: normalizedDateStr,
      dateType: dateType,
      safetyFloor: floor,
      daysDiff: daysDiff,
      isOver45Days: isOver45Days,
      capacities: dayCaps
    };
  } catch (err) {
    return { success: false, message: "試算推移失敗: " + err.message };
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
 * API: 業務端送出預約登記 (支援自訂預約單號)
 */
function api_submitBooking(data) {
  try {
    return submitBookingRecord(
      data.eventDate,
      data.productId,
      data.qty,
      data.groupName,
      data.phone,
      data.note,
      data.bookingNo
    );
  } catch (err) {
    return { success: false, message: "送出預約失敗: " + err.message };
  }
}

/**
 * API: 庫管人員手動登錄在途採購單 (INPUT 表單)
 * @param {Object} data { itemCode, qty, arrivalDate, poNumber, note }
 */
function api_createProcurementOrder(data) {
  try {
    const itemCode = String(data.itemCode || "").trim();
    const qty = Number(data.qty) || 0;
    const arrivalDateStr = String(data.arrivalDate || "").trim();
    if (!itemCode || qty <= 0) {
      return { success: false, message: "請選擇採購材料品號並填寫大於 0 的採購數量！" };
    }

    const ss = getSpreadsheet();
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const now = new Date();
    const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd");
    const dateCompact = Utilities.formatDate(now, "Asia/Taipei", "yyyyMMdd");

    // 單號
    let poNo = String(data.poNumber || "").trim();
    if (!poNo) {
      const count = poSheet.getLastRow();
      poNo = `PO-${dateCompact}-${String(count).padStart(3, "0")}`;
    }

    // 查品名
    const mat = CONFIG.MASTER_MATERIALS.find(m => m.itemCode === itemCode);
    const itemName = mat ? `${mat.itemName} (${mat.category})` : itemCode;

    // 最晚下單日：預設以到貨日 - 15天，或今日
    let deadlineStr = nowStr;
    if (arrivalDateStr) {
      const arrD = new Date(arrivalDateStr.replace(/-/g, "/"));
      if (!isNaN(arrD.getTime())) {
        const deadD = new Date(arrD.getTime() - (CONFIG.LEAD_TIME_DAYS * 24 * 60 * 60 * 1000));
        deadlineStr = Utilities.formatDate(deadD, "Asia/Taipei", "yyyy/MM/dd");
      }
    }

    poSheet.appendRow([
      poNo,
      nowStr,
      deadlineStr,
      itemCode,
      itemName,
      qty,
      "已下單在途",
      "門市庫管採購",
      data.note || ""
    ]);

    return {
      success: true,
      message: `採購單 [${poNo}] 已成功建立並排入在途清冊！`,
      poNumber: poNo
    };
  } catch (err) {
    return { success: false, message: "建立採購單失敗: " + err.message };
  }
}

/**
 * API: 庫管人員將在途採購單標記為「已到貨入庫」
 * @param {string} poNumber 採購單號
 */
function api_markProcurementReceived(poNumber) {
  try {
    const cleanPo = String(poNumber || "").trim();
    if (!cleanPo) return { success: false, message: "採購單號不得為空" };

    const ss = getSpreadsheet();
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const lastRow = poSheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: "目前無採購紀錄" };

    const data = poSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === cleanPo) {
        const rowIndex = i + 2;
        poSheet.getRange(rowIndex, 7).setValue("已到貨入庫");
        
        // 到貨後立即動態重新整理 45 天推移表 (物料庫存自動累加生效)
        generate45DaysProjection();

        return {
          success: true,
          message: `採購/請購單 [${cleanPo}] 已成功核銷為【已到貨入庫】，採購數量已即時併入有效庫存！`
        };
      }
    }

    return { success: false, message: `找不到採購單號 [${cleanPo}]` };
  } catch (err) {
    return { success: false, message: "到貨核銷失敗: " + err.message };
  }
}

/**
 * API: 批次勾選將多筆在途採購單標記為「已到貨入庫」
 * @param {Array<string>} poNumberList 採購單號清單
 */
function api_batchMarkProcurementReceived(poNumberList) {
  try {
    if (!poNumberList || !Array.isArray(poNumberList) || poNumberList.length === 0) {
      return { success: false, message: "未選取任何採購單" };
    }

    const targetSet = new Set(poNumberList.map(p => String(p).trim()));
    const ss = getSpreadsheet();
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const lastRow = poSheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: "目前無採購紀錄" };

    const data = poSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    let updatedCount = 0;

    for (let i = 0; i < data.length; i++) {
      const poNo = String(data[i][0]).trim();
      if (targetSet.has(poNo) && data[i][6] !== "已到貨入庫") {
        poSheet.getRange(i + 2, 7).setValue("已到貨入庫");
        updatedCount++;
      }
    }

    // 重新計算推移與庫存融合
    generate45DaysProjection();

    return {
      success: true,
      count: updatedCount,
      message: `成功將 ${updatedCount} 筆單據標記為【已到貨入庫】，物料庫存已自動累加！`
    };
  } catch (err) {
    return { success: false, message: "批次到貨核銷失敗: " + err.message };
  }
}

/**
 * API: 匯入 PURI05 進貨單 (支援請購單號、品號、品名、請購數量、需求日期，自動 +20 天為補貨日)
 * @param {Array<Object>} ordersList [ { reqNo, itemCode, itemName, qty, reqDate, note } ]
 */
function api_importProcurementPURI(ordersList) {
  try {
    if (!ordersList || !Array.isArray(ordersList) || ordersList.length === 0) {
      return { success: false, message: "上傳或輸入的進貨單明細為空" };
    }

    const ss = getSpreadsheet();
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const now = new Date();
    const nowStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd");
    const dateCompact = Utilities.formatDate(now, "Asia/Taipei", "yyyyMMdd");
    let currentLastRow = poSheet.getLastRow();

    const validRows = [];
    let counter = 1;

    ordersList.forEach(item => {
      const itemCode = String(item.itemCode || "").trim();
      const qty = Number(item.qty) || 0;
      if (!itemCode || qty <= 0) return;

      // 請購單號
      let poNo = String(item.reqNo || item.poNumber || "").trim();
      if (!poNo) {
        poNo = `PR-${dateCompact}-${String(currentLastRow + counter).padStart(3, "0")}`;
        counter++;
      }

      // 品名
      const mat = (typeof getDynamicMasterMaterials === "function" ? getDynamicMasterMaterials() : CONFIG.MASTER_MATERIALS).find(m => m.itemCode === itemCode);
      let itemName = String(item.itemName || "").trim();
      if (!itemName && mat) {
        itemName = `${mat.itemName} (${mat.category})`;
      } else if (!itemName) {
        itemName = itemCode;
      }

      // 需求日期與補貨日計算 (需求日期 + 20 天)
      let reqDateStr = String(item.reqDate || item.demandDate || nowStr).trim().substring(0, 10).replace(/-/g, "/");
      let reqDateObj = new Date(reqDateStr);
      if (isNaN(reqDateObj.getTime())) {
        reqDateObj = new Date();
        reqDateStr = Utilities.formatDate(reqDateObj, "Asia/Taipei", "yyyy/MM/dd");
      }

      // 關鍵規則：補貨日 = 需求日期 + 20 天
      const replenishmentDate = new Date(reqDateObj.getTime() + (20 * 24 * 60 * 60 * 1000));
      const arrivalDateStr = Utilities.formatDate(replenishmentDate, "Asia/Taipei", "yyyy/MM/dd");

      validRows.push([
        poNo,
        reqDateStr,       // 需求日期
        arrivalDateStr,   // 預訂進貨日期 (補貨日 = 需求日 + 20天)
        itemCode,
        itemName,
        qty,
        "已請購在途",     // 狀態
        poNo,             // 關聯請購單號
        String(item.note || "進貨單PURI匯入 (補貨日=需求日+20天)")
      ]);
    });

    if (validRows.length === 0) {
      return { success: false, message: "進貨單中未找到大於 0 的有效品項資料！" };
    }

    poSheet.getRange(currentLastRow + 1, 1, validRows.length, 9).setValues(validRows);

    // 重新運算推移
    generate45DaysProjection();

    return {
      success: true,
      count: validRows.length,
      message: `成功匯入 ${validRows.length} 筆進貨單品項至採購清冊！已自動計算補貨日 (需求日 + 20天)。`
    };
  } catch (err) {
    return { success: false, message: "進貨單匯入失敗: " + err.message };
  }
}

/**
 * API: 取得所有採購清冊清單 (支援請購單號、補貨日、狀態與勾選到貨)
 */
function api_getProcurementList() {
  try {
    const ss = getSpreadsheet();
    const poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    const lastRow = poSheet ? poSheet.getLastRow() : 0;
    const list = [];

    if (lastRow > 1) {
      const data = poSheet.getRange(2, 1, lastRow - 1, 9).getValues();
      data.forEach((row, idx) => {
        let reqDate = "";
        if (row[1] instanceof Date) {
          reqDate = Utilities.formatDate(row[1], "Asia/Taipei", "yyyy/MM/dd");
        } else {
          reqDate = String(row[1] || "").trim().substring(0, 10);
        }

        let arrDate = "";
        if (row[2] instanceof Date) {
          arrDate = Utilities.formatDate(row[2], "Asia/Taipei", "yyyy/MM/dd");
        } else {
          arrDate = String(row[2] || "").trim().substring(0, 10);
        }

        list.push({
          rowIndex: idx + 2,
          poNumber: String(row[0] || "").trim(),
          demandDate: reqDate,
          replenishmentDate: arrDate, // 補貨日
          itemCode: String(row[3] || "").trim(),
          itemName: String(row[4] || "").trim(),
          qty: Number(row[5]) || 0,
          status: String(row[6] || "").trim(),
          refNo: String(row[7] || "").trim(),
          note: String(row[8] || "").trim(),
          isReceived: (String(row[6] || "").trim() === "已到貨入庫")
        });
      });
    }

    return {
      success: true,
      procurements: list.reverse() // 最新建立排在前面
    };
  } catch (err) {
    return { success: false, message: "讀取採購清冊失敗: " + err.message };
  }
}

/**
 * API: 取得業務預約明細清冊 (供編輯與查看)
 */
function api_getBookingList() {
  try {
    const list = getAllBookingRecords();
    return {
      success: true,
      bookings: list.reverse() // 最新預約排前面
    };
  } catch (err) {
    return { success: false, message: "讀取預約清冊失敗: " + err.message };
  }
}

/**
 * API: 修改既有預約單
 * @param {Object} data { bookingNo, eventDate, productName, qty, groupName, phone, note }
 */
function api_updateBooking(data) {
  try {
    return updateBookingRecord(data);
  } catch (err) {
    return { success: false, message: "修改預約失敗: " + err.message };
  }
}

/**
 * API: 刪除既有預約單
 * @param {string} bookingNo 預約單號
 */
function api_deleteBooking(bookingNo) {
  try {
    return deleteBookingRecord(bookingNo);
  } catch (err) {
    return { success: false, message: "刪除預約失敗: " + err.message };
  }
}

/**
 * API: 取得所有 DIY 商品與其 BOM 配方明細及可用材料分類 (供商品維護管理介面使用)
 */
function api_getAllProductsAndBOM() {
  try {
    const dyn = getDynamicProductsAndBOM();
    const dynamicMaterials = getDynamicMasterMaterials(false); // 僅抓取啟用中的材料
    
    // 彙整所有可用的材料分類清單與有效品號
    const categoriesSet = new Set();
    const activeItemCodes = new Set();
    dynamicMaterials.forEach(m => {
      if (m.category) categoriesSet.add(m.category);
      if (m.itemCode) activeItemCodes.add(m.itemCode);
    });

    const sortedCategories = Array.from(categoriesSet).sort((a, b) => a.localeCompare(b, "zh-Hant"));

    // 過濾掉已被停用的原物料配方規則 (在 BOM 表內不見)
    const filteredBomRules = dyn.bomRules.filter(r => {
      const cat = String(r.category || "").trim();
      return activeItemCodes.has(cat) || categoriesSet.has(cat);
    });

    return {
      success: true,
      products: dyn.products,
      bomRules: filteredBomRules,
      availableCategories: sortedCategories,
      masterMaterials: dynamicMaterials
    };
  } catch (err) {
    return { success: false, message: "載入商品與配方失敗: " + err.message };
  }
}

/**
 * API: 取得所有原物料主檔清冊 (供原物料管理介面使用，包含啟用與停用資料)
 */
function api_getAllMaterials() {
  try {
    const list = getDynamicMasterMaterials(true); // 取得包含啟用與停用的完整清單
    const categoriesSet = new Set();
    list.forEach(m => {
      if (m.category) categoriesSet.add(m.category);
    });

    const sortedCategories = Array.from(categoriesSet).sort((a, b) => a.localeCompare(b, "zh-Hant"));

    return {
      success: true,
      materials: list,
      categories: sortedCategories
    };
  } catch (err) {
    return { success: false, message: "載入材料清單失敗: " + err.message };
  }
}

/**
 * API: 建立或更新原物料品號主檔 (寫入 02_材料品號對照表 底表)
 * @param {Object} matData { itemCode, itemName, category, color, note }
 */
function api_saveMaterial(matData) {
  try {
    const list = saveDynamicMasterMaterial(matData);
    generate45DaysProjection();
    return {
      success: true,
      message: `原物料【${matData.itemName}】(品號: ${matData.itemCode}) 已成功儲存！`,
      materials: list
    };
  } catch (err) {
    return { success: false, message: "儲存原物料失敗: " + err.message };
  }
}

/**
 * API: 切換原物料啟用/停用狀態
 * @param {string} itemCode 材料品號
 * @param {string} targetStatus 目標狀態 ("啟用" 或 "停用")
 */
function api_toggleMaterialStatus(itemCode, targetStatus) {
  try {
    const status = (targetStatus === "停用") ? "停用" : "啟用";
    const list = toggleDynamicMasterMaterialStatus(itemCode, status);
    generate45DaysProjection();
    return {
      success: true,
      message: `材料品號 [${itemCode}] 已成功標記為【${status}】！`,
      materials: list
    };
  } catch (err) {
    return { success: false, message: "切換材料狀態失敗: " + err.message };
  }
}

/**
 * API: 停用原物料品號 (相容舊呼叫)
 * @param {string} itemCode 材料品號
 */
function api_deleteMaterial(itemCode) {
  return api_toggleMaterialStatus(itemCode, "停用");
}

/**
 * API: 儲存或更新 DIY 商品及其材料配方 (可新增或修改材料與用量)
 * @param {Object} productData { id, name, desc }
 * @param {Array<Object>} bomItems [ { category, qty, note } ]
 */
function api_saveProductAndBOM(productData, bomItems) {
  try {
    const res = saveDynamicProductAndBOM(productData, bomItems);
    // 重新試算 45 天動態推移
    generate45DaysProjection();
    return {
      success: true,
      message: `商品【${productData.name}】及其 BOM 配方已成功儲存並同步至系統！`,
      products: res.products,
      bomRules: res.bomRules
    };
  } catch (err) {
    return { success: false, message: "儲存商品與配方失敗: " + err.message };
  }
}

/**
 * API: 刪除指定 DIY 商品及其 BOM 配方
 * @param {string} productId 商品代碼
 */
function api_deleteProduct(productId) {
  try {
    const res = deleteDynamicProduct(productId);
    generate45DaysProjection();
    return {
      success: true,
      message: `商品代碼 [${productId}] 及其 BOM 配方已成功刪除！`,
      products: res.products,
      bomRules: res.bomRules
    };
  } catch (err) {
    return { success: false, message: "刪除商品失敗: " + err.message };
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

/**
 * API: 處理進貨驗收單核銷與自動對比入庫 (支援全數到貨、短交結案清零、短交保留在途、無單直接配貨)
 * @param {Object} receiptData { receiptNo, receiptDate, vendorName, items: [ { itemCode, itemName, receivedQty, poNumber, actionType, originalPoQty, shortageQty, note } ] }
 */
function api_processGoodsReceipt(receiptData) {
  try {
    if (!receiptData || !receiptData.items || !Array.isArray(receiptData.items) || receiptData.items.length === 0) {
      return { success: false, message: "未包含任何有效驗收品項！" };
    }

    const ss = getSpreadsheet();
    let poSheet = ss.getSheetByName(CONFIG.SHEETS.PROCUREMENT);
    if (!poSheet) {
      poSheet = ss.insertSheet(CONFIG.SHEETS.PROCUREMENT);
      poSheet.appendRow(["採購/請購單號", "需求日期", "預訂進貨日(補貨日)", "材料品號", "材料名稱", "採購數量", "處理狀態", "關聯單號", "備註說明"]);
    }

    const lastRow = poSheet.getLastRow();
    const existingPoRows = (lastRow > 1) ? poSheet.getRange(2, 1, lastRow - 1, 9).getValues() : [];

    const recNo = String(receiptData.receiptNo || "").trim() || "GR-" + Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd-HHmm");
    const recDate = String(receiptData.receiptDate || "").trim() || Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd");
    const vendor = String(receiptData.vendorName || "").trim();

    let fullCount = 0;
    let shortCloseCount = 0;
    let shortKeepCount = 0;
    let directCount = 0;

    const newRowsToAppend = [];

    receiptData.items.forEach(item => {
      const itemCode = String(item.itemCode || "").trim();
      const itemName = String(item.itemName || itemCode).trim();
      const recQty = Number(item.receivedQty) || 0;
      const poNo = String(item.poNumber || "").trim();
      const actionType = item.actionType || "FULL"; // FULL, SHORT_CLOSE, SHORT_KEEP, DIRECT
      const shortageQty = Number(item.shortageQty) || 0;

      if (!itemCode || recQty <= 0) return;

      // 在清冊中比對未結案的採購單
      let matchedIndex = -1;
      if (poNo) {
        for (let i = 0; i < existingPoRows.length; i++) {
          const rowPo = String(existingPoRows[i][0] || "").trim();
          const rowCode = String(existingPoRows[i][3] || "").trim();
          const rowStatus = String(existingPoRows[i][6] || "").trim();

          if ((rowPo === poNo || (rowPo && poNo && (rowPo.includes(poNo) || poNo.includes(rowPo)))) && rowCode === itemCode && !rowStatus.includes("已到貨")) {
            matchedIndex = i;
            break;
          }
        }
      }

      // 若以單號找不到，嘗試以未結案品號兜底匹配
      if (matchedIndex === -1) {
        for (let i = 0; i < existingPoRows.length; i++) {
          const rowCode = String(existingPoRows[i][3] || "").trim();
          const rowStatus = String(existingPoRows[i][6] || "").trim();
          if (rowCode === itemCode && !rowStatus.includes("已到貨")) {
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        const targetRow = matchedIndex + 2; // 試算表 1-based 列號
        if (actionType === "FULL") {
          // 全數到貨：標記為已到貨入庫
          poSheet.getRange(targetRow, 7).setValue("已到貨入庫");
          poSheet.getRange(targetRow, 8).setValue(recNo);
          poSheet.getRange(targetRow, 9).setValue(`進貨單[${recNo}]全數驗收入庫${vendor ? '(' + vendor + ')' : ''}`);
          fullCount++;
        } else if (actionType === "SHORT_CLOSE") {
          // 短交結案：實收數量入庫，在途清零
          poSheet.getRange(targetRow, 6).setValue(recQty); // 更新為實收數，避免超額累加
          poSheet.getRange(targetRow, 7).setValue(`已到貨 (短交結案，少${shortageQty})`);
          poSheet.getRange(targetRow, 8).setValue(recNo);
          poSheet.getRange(targetRow, 9).setValue(`進貨單[${recNo}]實收${recQty}，原請購${item.originalPoQty || (recQty + shortageQty)}，短交${shortageQty}已強制結案不再補`);
          shortCloseCount++;
        } else if (actionType === "SHORT_KEEP") {
          // 短交保留在途：原本的採購單改為剩餘在途，另新增一筆已到貨入庫
          poSheet.getRange(targetRow, 6).setValue(shortageQty); // 剩餘掛在途
          poSheet.getRange(targetRow, 7).setValue("已請購在途 (部分到貨待補)");
          poSheet.getRange(targetRow, 9).setValue(`進貨單[${recNo}]已到貨${recQty}，剩餘${shortageQty}待補`);

          // 新增已到貨認列
          newRowsToAppend.push([
            recNo,
            recDate,
            recDate,
            itemCode,
            itemName,
            recQty,
            "已到貨入庫 (分批到貨)",
            poNo,
            `進貨單[${recNo}]分批到貨入庫${vendor ? '(' + vendor + ')' : ''}`
          ]);
          shortKeepCount++;
        }
      } else {
        // 無前置單據或直接配貨進貨
        newRowsToAppend.push([
          recNo,
          recDate,
          recDate,
          itemCode,
          itemName,
          recQty,
          "已到貨入庫 (直接配貨)",
          recNo,
          `直接配貨進貨單[${recNo}]${vendor ? '(' + vendor + ')' : ''}`
        ]);
        directCount++;
      }
    });

    if (newRowsToAppend.length > 0) {
      const curLast = poSheet.getLastRow();
      poSheet.getRange(curLast + 1, 1, newRowsToAppend.length, 9).setValues(newRowsToAppend);
    }

    // 重新滾動 45 天推移與在庫庫存
    generate45DaysProjection();

    return {
      success: true,
      message: `進貨驗收單 [${recNo}] 核銷入庫完成！\n• 完工全數到貨：${fullCount} 筆\n• 短交結案清零：${shortCloseCount} 筆\n• 短交保留在途：${shortKeepCount} 筆\n• 直接配貨入庫：${directCount} 筆\n物料庫存已即時累加生效！`,
      stats: { fullCount, shortCloseCount, shortKeepCount, directCount }
    };
  } catch (err) {
    return { success: false, message: "進貨驗收核銷失敗: " + err.message };
  }
}
