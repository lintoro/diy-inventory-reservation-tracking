/**
 * 系統全域設定與常數 (00_Config.js)
 */

const CONFIG = {
  // 試算表 ID（若未設定 ScriptProperties 則自動使用當前綁定之試算表）
  SPREADSHEET_ID: (function() {
    try {
      return PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "";
    } catch (e) {
      return "";
    }
  })(),

  // 8 大工作表名稱
  SHEETS: {
    USER_ACCOUNTS: "00_使用者帳號表",
    ERP_RAW: "01_ERP原始匯入",
    MATERIAL_MASTER: "02_材料品號對照表",
    BOM_RULES: "03_BOM配方設定表",
    CYCLE_COUNT_LOG: "04_現場抽盤流水帳",
    PROCUREMENT: "05_在途採購清冊",
    BOOKING_RECORDS: "06_預約登記明細",
    ROLLING_PROJECTION: "07_45天動態推移底表",
    AUDIT_LOG: "10_系統操作日誌"
  },

  // 稽核日誌常數
  AUDIT: {
    RETENTION_DAYS: 180, // 主表保留 180 天
    PAGE_SIZE: 50
  },

  // 帳號權限角色 (RBAC)
  ROLES: {
    ADMIN: "ADMIN",         // 系統管理者 (全功能存取與人員管理)
    SALES: "SALES",         // 業務單位 (預約登記與庫存速查)
    INVENTORY: "INVENTORY"  // 庫存管理單位 (現場抽盤與ERP上傳)
  },

  // 帳號狀態
  USER_STATUS: {
    ACTIVE: "ACTIVE",       // 正常啟用
    PENDING: "PENDING",     // 待審核
    DISABLED: "DISABLED"    // 停用
  },

  // 預設最高管理者工號設定 (純工號認證，不綁定 Gmail)
  INITIAL_ADMIN: {
    empNo: "ADM00001",
    name: "系統管理員",
    role: "ADMIN",
    defaultPassword: "password123"
  },

  // 散客保底底線 (Hard Safety Floor)
  SAFETY_FLOOR: {
    WEEKDAY: 10,  // 平日 (週一至週五)
    WEEKEND: 20   // 假日 (週六日與國定假日，預設10/20可由庫管動態調整)
  },

  // 叫貨交期時間閘門 (天數)
  LEAD_TIME_DAYS: 15,

  // 滾動推移預測天數
  PROJECTION_DAYS: 45,

  // 儀表板「近期預約」顯示視窗（天數）
  DASHBOARD_RECENT_DAYS: 30,

  // 6 大銷售體驗商品
  PRODUCTS: [
    { id: "1", name: "手能生巧", desc: "3合1多功能工具組裝體驗", isBuiltin: true },
    { id: "2", name: "繪聲繪影 - 經典透亮款", desc: "手提收納盒 + 彩繪框圖 + 顏料組", isBuiltin: true },
    { id: "3", name: "繪聲繪影 - 雅緻多格款", desc: "多格工具箱 + 彩繪框圖 + 顏料組", isBuiltin: true },
    { id: "4", name: "繪聲繪影 - 活力隨身款", desc: "隨行工具盒 + 彩繪框圖 + 顏料組", isBuiltin: true },
    { id: "5", name: "旁敲側擊 (折疊收納籃)", desc: "折疊收納籃，外框底板長短栓組裝", isBuiltin: true },
    { id: "6", name: "巧手紙膠", desc: "多功能手提收納盒 + 創意紙膠帶", isBuiltin: true }
  ],

  // 28 項核心物料主檔資料 (去敏化通用標準物料主檔)
  MASTER_MATERIALS: [
    { itemCode: "MAT-HTB-001", itemName: "3合1多功能組裝工具組/經典紅", category: "手能生巧", color: "紅" },
    
    // 旁敲側擊 - 框 (5色)
    { itemCode: "MAT-FBA-001", itemName: "折疊收納籃-外框/湖水藍", category: "旁敲側擊A", color: "海軍藍" },
    { itemCode: "MAT-FBA-002", itemName: "折疊收納籃-外框/森之綠", category: "旁敲側擊A", color: "綠" },
    { itemCode: "MAT-FBA-003", itemName: "折疊收納籃-外框/櫻花粉", category: "旁敲側擊A", color: "通心粉" },
    { itemCode: "MAT-FBA-004", itemName: "折疊收納籃-外框/象牙白", category: "旁敲側擊A", color: "米白" },
    { itemCode: "MAT-FBA-005", itemName: "折疊收納籃-外框/向日黃", category: "旁敲側擊A", color: "黃" },

    // 旁敲側擊 - 底 (5色)
    { itemCode: "MAT-FBB-001", itemName: "折疊收納籃-底板/湖水藍", category: "旁敲側擊B", color: "海軍藍" },
    { itemCode: "MAT-FBB-002", itemName: "折疊收納籃-底板/森之綠", category: "旁敲側擊B", color: "綠" },
    { itemCode: "MAT-FBB-003", itemName: "折疊收納籃-底板/櫻花粉", category: "旁敲側擊B", color: "通心粉" },
    { itemCode: "MAT-FBB-004", itemName: "折疊收納籃-底板/象牙白", category: "旁敲側擊B", color: "米白" },
    { itemCode: "MAT-FBB-005", itemName: "折疊收納籃-底板/向日黃", category: "旁敲側擊B", color: "黃" },

    // 旁敲側擊 - 長側板 (5色)
    { itemCode: "MAT-FBC-001", itemName: "折疊收納籃-長側板/湖水藍", category: "旁敲側擊C", color: "海軍藍" },
    { itemCode: "MAT-FBC-002", itemName: "折疊收納籃-長側板/森之綠", category: "旁敲側擊C", color: "綠" },
    { itemCode: "MAT-FBC-003", itemName: "折疊收納籃-長側板/櫻花粉", category: "旁敲側擊C", color: "通心粉" },
    { itemCode: "MAT-FBC-004", itemName: "折疊收納籃-長側板/象牙白", category: "旁敲側擊C", color: "米白" },
    { itemCode: "MAT-FBC-005", itemName: "折疊收納籃-長側板/向日黃", category: "旁敲側擊C", color: "黃" },

    // 旁敲側擊 - 短側板 (4色)
    { itemCode: "MAT-FBD-001", itemName: "折疊收納籃-短側板/湖水藍", category: "旁敲側擊D", color: "海軍藍" },
    { itemCode: "MAT-FBD-002", itemName: "折疊收納籃-短側板/森之綠", category: "旁敲側擊D", color: "綠" },
    { itemCode: "MAT-FBD-003", itemName: "折疊收納籃-短側板/櫻花粉", category: "旁敲側擊D", color: "通心粉" },
    { itemCode: "MAT-FBD-004", itemName: "折疊收納籃-短側板/象牙白", category: "旁敲側擊D", color: "米白" },

    // 旁敲側擊 - 短栓、長栓
    { itemCode: "MAT-FBE-001", itemName: "折疊收納籃-短軸插栓/鍍鋅五彩", category: "旁敲側擊E", color: "鍍五彩" },
    { itemCode: "MAT-FBF-001", itemName: "折疊收納籃-長軸插栓/鍍鋅五彩", category: "旁敲側擊F", color: "鍍五彩" },

    // 巧手紙膠 - 手提多格收納盒 (2色)
    { itemCode: "MAT-PAN-001", itemName: "手提多格收納盒/曜石黑", category: "請多紙膠A", color: "黑" },
    { itemCode: "MAT-PAN-002", itemName: "手提多格收納盒/雪映白", category: "請多紙膠A", color: "白" },

    // 繪聲繪影 - 共用料 (框圖、顏料)
    { itemCode: "MAT-ART-001", itemName: "DIY彩繪框圖卡紙/精裝款", category: "繪聲繪影A", color: "共用" },
    { itemCode: "MAT-ART-002", itemName: "DIY環保彩繪顏料組/4色", category: "繪聲繪影B", color: "共用" },

    // 繪聲繪影 - 專用箱體 (晶亮透, 雅緻混色, 活力混色)
    { itemCode: "MAT-BOX-001", itemName: "多層手提收納盒A型/晶亮透", category: "繪聲繪影C_胖胖盒", color: "本透" },
    { itemCode: "MAT-BOX-002", itemName: "多層手提工具盒B型/雅緻混色", category: "繪聲繪影C_TB200", color: "混色" },
    { itemCode: "MAT-BOX-003", itemName: "多層隨行工具盒C型/活力混色", category: "繪聲繪影C_TB9", color: "混色" }
  ],

  // BOM 配方規則
  BOM_RULES: [
    // 手能生巧
    { productId: "1", productName: "手能生巧", category: "手能生巧", qty: 1, note: "經典小工具1:1" },

    // 繪聲繪影 - 經典透亮款
    { productId: "2", productName: "繪聲繪影 - 經典透亮款", category: "繪聲繪影A", qty: 1, note: "彩繪框圖 (共用總量)" },
    { productId: "2", productName: "繪聲繪影 - 經典透亮款", category: "繪聲繪影B", qty: 1, note: "彩繪顏料 (共用總量)" },
    { productId: "2", productName: "繪聲繪影 - 經典透亮款", category: "繪聲繪影C_胖胖盒", qty: 1, note: "收納盒A款專用箱" },

    // 繪聲繪影 - 雅緻多格款
    { productId: "3", productName: "繪聲繪影 - 雅緻多格款", category: "繪聲繪影A", qty: 1, note: "彩繪框圖 (共用總量)" },
    { productId: "3", productName: "繪聲繪影 - 雅緻多格款", category: "繪聲繪影B", qty: 1, note: "彩繪顏料 (共用總量)" },
    { productId: "3", productName: "繪聲繪影 - 雅緻多格款", category: "繪聲繪影C_TB200", qty: 1, note: "工具盒B款專用箱" },

    // 繪聲繪影 - 活力隨身款
    { productId: "4", productName: "繪聲繪影 - 活力隨身款", category: "繪聲繪影A", qty: 1, note: "彩繪框圖 (共用總量)" },
    { productId: "4", productName: "繪聲繪影 - 活力隨身款", category: "繪聲繪影B", qty: 1, note: "彩繪顏料 (共用總量)" },
    { productId: "4", productName: "繪聲繪影 - 活力隨身款", category: "繪聲繪影C_TB9", qty: 1, note: "工具盒C款專用箱" },

    // 旁敲側擊 (折疊收納籃)
    { productId: "5", productName: "旁敲側擊 (折疊收納籃)", category: "旁敲側擊A", qty: 1, note: "外框 (共用總量)" },
    { productId: "5", productName: "旁敲側擊 (折疊收納籃)", category: "旁敲側擊B", qty: 1, note: "底板 (共用總量)" },
    { productId: "5", productName: "旁敲側擊 (折疊收納籃)", category: "旁敲側擊C", qty: 4, note: "長側板 (共用總量)" },
    { productId: "5", productName: "旁敲側擊 (折疊收納籃)", category: "旁敲側擊D", qty: 2, note: "短側板 (共用總量)" },
    { productId: "5", productName: "旁敲側擊 (折疊收納籃)", category: "旁敲側擊E", qty: 12, note: "短插栓 (鍍鋅五彩)" },
    { productId: "5", productName: "旁敲側擊 (折疊收納籃)", category: "旁敲側擊F", qty: 4, note: "長插栓 (鍍鋅五彩)" },

    // 巧手紙膠
    { productId: "6", productName: "巧手紙膠", category: "請多紙膠A", qty: 1, note: "手提收納盒 (共用總量)" },
    { productId: "6", productName: "巧手紙膠", category: "請多紙膠B", qty: 1, note: "創意紙膠帶 (待建檔)" }
  ]
};

// 輔助函式：取得試算表實例
// - 容器綁定專案 (Container-bound)：優先使用 getActiveSpreadsheet()
// - Web App 獨立執行環境：從 ScriptProperties 取得 SPREADSHEET_ID
function getSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  let sid = CONFIG.SPREADSHEET_ID;
  if (!sid) {
    try {
      sid = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    } catch (e) {}
  }
  if (!sid) {
    throw new Error("未設定試算表 ID！請於 Google Apps Script 之【專案設定 > 指令碼屬性】設定 SPREADSHEET_ID，或自試算表選單開啟。");
  }
  return SpreadsheetApp.openById(sid);
}

/**
 * 取得當前散客保底配置 (平日/假日/特殊日期)
 * 優先採用 ScriptProperties，若無則採用 CONFIG.SAFETY_FLOOR (10/20)
 */
function getSafetyFloorConfig() {
  try {
    const props = PropertiesService.getScriptProperties();
    const weekday = Number(props.getProperty("SAFETY_FLOOR_WEEKDAY")) || CONFIG.SAFETY_FLOOR.WEEKDAY;
    const weekend = Number(props.getProperty("SAFETY_FLOOR_WEEKEND")) || CONFIG.SAFETY_FLOOR.WEEKEND;
    let specialDates = {};
    const specialJson = props.getProperty("SAFETY_FLOOR_SPECIAL_JSON");
    if (specialJson) {
      try {
        specialDates = JSON.parse(specialJson);
      } catch (e) {}
    }
    return {
      weekday: weekday,
      weekend: weekend,
      specialDates: specialDates
    };
  } catch (err) {
    return {
      weekday: CONFIG.SAFETY_FLOOR.WEEKDAY,
      weekend: CONFIG.SAFETY_FLOOR.WEEKEND,
      specialDates: {}
    };
  }
}

/**
 * 儲存散客保底配置 (庫管人員與管理者皆可設定)
 */
function setSafetyFloorConfig(weekday, weekend, specialDates) {
  const props = PropertiesService.getScriptProperties();
  if (weekday !== undefined && !isNaN(Number(weekday))) {
    props.setProperty("SAFETY_FLOOR_WEEKDAY", String(Number(weekday)));
  }
  if (weekend !== undefined && !isNaN(Number(weekend))) {
    props.setProperty("SAFETY_FLOOR_WEEKEND", String(Number(weekend)));
  }
  if (specialDates && typeof specialDates === "object") {
    props.setProperty("SAFETY_FLOOR_SPECIAL_JSON", JSON.stringify(specialDates));
  }
  return getSafetyFloorConfig();
}

/**
 * 取得當前所有 DIY 商品與其 BOM 配方 (由 03_BOM配方設定表 底表驅動，若底表為空則回退至預設常數)
 * @returns {Object} { products: Array, bomRules: Array }
 */
function getDynamicProductsAndBOM() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BOM_RULES);
    if (!sheet) {
      return { products: CONFIG.PRODUCTS, bomRules: CONFIG.BOM_RULES };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { products: CONFIG.PRODUCTS, bomRules: CONFIG.BOM_RULES };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const productsMap = {};
    const bomRules = [];

    rows.forEach(r => {
      const pId = String(r[0] || "").trim();
      const pName = String(r[1] || "").trim();
      const cat = String(r[2] || "").trim();
      const qty = Number(r[3]) || 1;
      const note = String(r[4] || "").trim();

      if (!pId || !pName || !cat) return;

      if (!productsMap[pId]) {
        // 從預設 PRODUCTS 尋找對應描述，或使用預設
        const defaultProd = CONFIG.PRODUCTS.find(p => p.id === pId);
        productsMap[pId] = {
          id: pId,
          name: pName,
          desc: defaultProd ? defaultProd.desc : `${pName} DIY體驗材料包`,
          isBuiltin: !!defaultProd  // 在 CONFIG.PRODUCTS 中有定義者為內建商品
        };
      }

      bomRules.push({
        productId: pId,
        productName: pName,
        category: cat,
        qty: qty,
        note: note
      });
    });

    const products = Object.values(productsMap);
    if (products.length === 0) {
      return { products: CONFIG.PRODUCTS, bomRules: CONFIG.BOM_RULES };
    }

    return { products: products, bomRules: bomRules };
  } catch (err) {
    return { products: CONFIG.PRODUCTS, bomRules: CONFIG.BOM_RULES };
  }
}

/**
 * 儲存或更新 DIY 商品及其 BOM 配方至 03_BOM配方設定表 底表
 * @param {Object} product { id, name, desc }
 * @param {Array<Object>} bomItems [ { category, qty, note } ]
 */
function saveDynamicProductAndBOM(product, bomItems) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.BOM_RULES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.BOM_RULES);
    sheet.appendRow(["產品代碼", "體驗方案名稱", "所需材料種類代碼", "單份用量", "備註說明"]);
  }

  const pId = String(product.id || "").trim();
  const pName = String(product.name || "").trim();
  if (!pId || !pName) {
    throw new Error("商品代碼與名稱不得為空");
  }
  if (!bomItems || !Array.isArray(bomItems) || bomItems.length === 0) {
    throw new Error("請至少為此商品設定一項材料配方");
  }

  // 讀取現有所有資料
  const lastRow = sheet.getLastRow();
  let remainingRows = [];
  if (lastRow > 1) {
    const existing = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    // 過濾掉該商品原本的舊配方
    remainingRows = existing.filter(r => String(r[0] || "").trim() !== pId);
  }

  // 新的配方列
  const newRows = bomItems.map(item => [
    pId,
    pName,
    String(item.category || "").trim(),
    Number(item.qty) || 1,
    String(item.note || "").trim()
  ]);

  const allRows = remainingRows.concat(newRows);

  // 清空重新寫入
  sheet.clearContents();
  sheet.appendRow(["產品代碼", "體驗方案名稱", "所需材料種類代碼", "單份用量", "備註說明"]);
  if (allRows.length > 0) {
    sheet.getRange(2, 1, allRows.length, 5).setValues(allRows);
  }

  return getDynamicProductsAndBOM();
}

/**
 * 刪除 DIY 商品與其在 03_BOM配方設定表 底表之所有配方
 * @param {string} productId 商品代碼
 */
function deleteDynamicProduct(productId) {
  const pId = String(productId || "").trim();
  if (!pId) throw new Error("未指定商品代碼");

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.BOM_RULES);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const existing = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const remaining = existing.filter(r => String(r[0] || "").trim() !== pId);

  sheet.clearContents();
  sheet.appendRow(["產品代碼", "體驗方案名稱", "所需材料種類代碼", "單份用量", "備註說明"]);
  if (remaining.length > 0) {
    sheet.getRange(2, 1, remaining.length, 5).setValues(remaining);
  }

  return getDynamicProductsAndBOM();
}

/**
 * 取得當前所有材料品號 (由 02_材料品號對照表 底表驅動，若底表為空則回退至預設 MASTER_MATERIALS)
 * @param {boolean} [includeInactive=false] 是否包含已停用的材料 (原物料管理介面傳入 true，接單與推移傳入 false)
 * @returns {Array<Object>} 材料主檔清單
 */
function getDynamicMasterMaterials(includeInactive = false) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.MATERIAL_MASTER);
    if (!sheet) return CONFIG.MASTER_MATERIALS;

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return CONFIG.MASTER_MATERIALS;

    const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const list = [];
    rows.forEach(r => {
      const code = String(r[0] || "").trim();
      const name = String(r[1] || "").trim();
      const cat = String(r[2] || "").trim();
      const color = String(r[3] || "").trim();
      const note = String(r[4] || "").trim();
      const status = String(r[5] || "啟用").trim();

      if (code) {
        if (includeInactive || status !== "停用") {
          list.push({
            itemCode: code,
            itemName: name,
            category: cat,
            color: color,
            note: note,
            status: status
          });
        }
      }
    });

    const resultList = list.length > 0 ? list : CONFIG.MASTER_MATERIALS;
    // 依三階層排序：#材料種類代碼 ##ERP品號 ###品名規格
    resultList.sort((a, b) => {
      const catCmp = String(a.category || "").localeCompare(String(b.category || ""), "zh-Hant");
      if (catCmp !== 0) return catCmp;
      const codeCmp = String(a.itemCode || "").localeCompare(String(b.itemCode || ""));
      if (codeCmp !== 0) return codeCmp;
      const nameA = `${a.itemName || ""} ${a.color || ""}`;
      const nameB = `${b.itemName || ""} ${b.color || ""}`;
      return nameA.localeCompare(nameB, "zh-Hant");
    });

    return resultList;
  } catch (e) {
    return CONFIG.MASTER_MATERIALS;
  }
}

/**
 * 儲存或更新原物料品號至 02_材料品號對照表 底表
 * @param {Object} matData { itemCode, itemName, category, color, note }
 */
function saveDynamicMasterMaterial(matData) {
  const code = String(matData.itemCode || "").trim();
  const name = String(matData.itemName || "").trim();
  const cat = String(matData.category || "").trim();
  const color = String(matData.color || "").trim();
  const note = String(matData.note || "").trim();

  if (!code || !name || !cat) {
    throw new Error("材料品號、品名與材料種類代碼為必填項目！");
  }

  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.MATERIAL_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.MATERIAL_MASTER);
    sheet.appendRow(["ERP品號", "ERP品名", "材料種類代碼", "花色規格", "單份用量說明", "啟用狀態"]);
  }

  const lastRow = sheet.getLastRow();
  let found = false;
  if (lastRow > 1) {
    const existing = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (let i = 0; i < existing.length; i++) {
      if (String(existing[i][0]).trim() === code) {
        // 更新現有資料
        sheet.getRange(i + 2, 1, 1, 6).setValues([[code, name, cat, color, note, "啟用"]]);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    sheet.appendRow([code, name, cat, color, note, "啟用"]);
  }

  return getDynamicMasterMaterials(true);
}

/**
 * 切換原物料品號啟用/停用狀態
 * @param {string} itemCode 材料品號
 * @param {string} targetStatus 目標狀態 ("啟用" 或 "停用")
 */
function toggleDynamicMasterMaterialStatus(itemCode, targetStatus) {
  const code = String(itemCode || "").trim();
  if (!code) throw new Error("未指定材料品號");
  const status = (targetStatus === "停用") ? "停用" : "啟用";

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.MATERIAL_MASTER);
  if (!sheet) throw new Error("材料主檔底表不存在");

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error("材料主檔底表無資料");

  const existing = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  let found = false;
  for (let i = 0; i < existing.length; i++) {
    if (String(existing[i][0]).trim() === code) {
      sheet.getRange(i + 2, 6).setValue(status);
      found = true;
      break;
    }
  }

  if (!found) throw new Error(`找不到材料品號 [${code}]`);

  return getDynamicMasterMaterials(true);
}

/**
 * 停用原物料品號 (相容舊呼叫)
 * @param {string} itemCode 材料品號
 */
function deleteDynamicMasterMaterial(itemCode) {
  return toggleDynamicMasterMaterialStatus(itemCode, "停用");
}

