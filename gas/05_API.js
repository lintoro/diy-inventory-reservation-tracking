/**
 * Web App 前端介面與 API 控制器 (05_API.js)
 */

/**
 * Web App 入口函式
 */
function doGet(e) {
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

    const dynamicConfig = getDynamicProductsAndBOM();

    return {
      success: true,
      capacities: capacities,
      capacitiesList: capacitiesList,
      materials: CONFIG.MASTER_MATERIALS,
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
    
    // 檢查該活動日已預約總套數 (扣除測試資料)
    const ss = getSpreadsheet();
    const bkSheet = ss.getSheetByName(CONFIG.SHEETS.BOOKING_RECORDS);
    const bkLastRow = bkSheet.getLastRow();
    const bookingsOnDate = {}; // productId -> bookedQty

    if (bkLastRow > 1) {
      const bkRows = bkSheet.getRange(2, 1, bkLastRow - 1, 5).getValues();
      bkRows.forEach(r => {
        let bDateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd") : String(r[1]);
        if (bDateStr === normalizedDateStr) {
          const prodName = String(r[2]);
          bookingsOnDate[prodName] = (bookingsOnDate[prodName] || 0) + (Number(r[3]) || 0);
        }
      });
    }

    Object.keys(capacities).forEach(id => {
      const p = capacities[id];
      const booked = bookingsOnDate[p.productName] || 0;
      const netQty = Math.max(0, p.maxCapacity - floor - booked);
      dayCaps[id] = {
        name: p.productName,
        grossCapacity: p.maxCapacity,
        safetyFloor: floor,
        bookedQty: booked,
        netQty: netQty
      };
    });

    return {
      success: true,
      date: normalizedDateStr,
      dateType: dateType,
      safetyFloor: floor,
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
        return {
          success: true,
          message: `採購單 [${cleanPo}] 已成功核銷並標記為【已到貨入庫】！`
        };
      }
    }

    return { success: false, message: `找不到採購單號 [${cleanPo}]` };
  } catch (err) {
    return { success: false, message: "到貨核銷失敗: " + err.message };
  }
}

/**
 * API: 批次新增多筆採購單 (單據上傳/表格直接輸入)
 * @param {Array<Object>} ordersList [ { itemCode, qty, arrivalDate, poNumber, note } ]
 */
function api_batchCreateProcurementOrders(ordersList) {
  try {
    if (!ordersList || !Array.isArray(ordersList) || ordersList.length === 0) {
      return { success: false, message: "上傳或輸入的單據內容為空" };
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

      const arrivalDateStr = String(item.arrivalDate || "").trim();
      let poNo = String(item.poNumber || "").trim();
      if (!poNo) {
        poNo = `PO-${dateCompact}-${String(currentLastRow + counter).padStart(3, "0")}`;
        counter++;
      }

      // 查詢品名
      const mat = CONFIG.MASTER_MATERIALS.find(m => m.itemCode === itemCode);
      let itemName = mat ? `${mat.itemName} (${mat.category})` : itemCode;
      if (item.itemName && !mat) {
        itemName = String(item.itemName);
      }

      // 計算最晚下單日
      let deadlineStr = nowStr;
      if (arrivalDateStr) {
        const arrD = new Date(arrivalDateStr.replace(/-/g, "/"));
        if (!isNaN(arrD.getTime())) {
          const deadD = new Date(arrD.getTime() - (CONFIG.LEAD_TIME_DAYS * 24 * 60 * 60 * 1000));
          deadlineStr = Utilities.formatDate(deadD, "Asia/Taipei", "yyyy/MM/dd");
        }
      }

      validRows.push([
        poNo,
        nowStr,
        deadlineStr,
        itemCode,
        itemName,
        qty,
        "已下單在途",
        "批量單據匯入",
        String(item.note || "")
      ]);
    });

    if (validRows.length === 0) {
      return { success: false, message: "單據中沒有符合條件的有效採購明細 (品號與數量需大於0)" };
    }

    poSheet.getRange(currentLastRow + 1, 1, validRows.length, 9).setValues(validRows);

    // 重新運算推移
    generate45DaysProjection();

    return {
      success: true,
      count: validRows.length,
      message: `成功批量登錄 ${validRows.length} 筆在途採購明細，並已自動同步 45 天推移預估！`
    };
  } catch (err) {
    return { success: false, message: "批量登錄採購單失敗: " + err.message };
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

    // 重新計算推移
    generate45DaysProjection();

    return {
      success: true,
      count: updatedCount,
      message: `成功將 ${updatedCount} 筆採購單標記為【已到貨入庫】！`
    };
  } catch (err) {
    return { success: false, message: "批次到貨核銷失敗: " + err.message };
  }
}

/**
 * API: 取得所有 DIY 商品與其 BOM 配方明細及可用材料分類 (供商品維護管理介面使用)
 */
function api_getAllProductsAndBOM() {
  try {
    const dyn = getDynamicProductsAndBOM();
    
    // 彙整所有可用的材料分類清單
    const categoriesSet = new Set();
    CONFIG.MASTER_MATERIALS.forEach(m => {
      if (m.category) categoriesSet.add(m.category);
    });

    return {
      success: true,
      products: dyn.products,
      bomRules: dyn.bomRules,
      availableCategories: Array.from(categoriesSet),
      masterMaterials: CONFIG.MASTER_MATERIALS
    };
  } catch (err) {
    return { success: false, message: "載入商品與配方失敗: " + err.message };
  }
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
