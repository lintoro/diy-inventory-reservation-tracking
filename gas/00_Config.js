/**
 * 系統全域設定與常數 (00_Config.js)
 */

const CONFIG = {
  // 試算表 ID（綁定型專案預設使用當前試算表）
  SPREADSHEET_ID: "1D_rEF40gUEuGtNHhOpE165p5fhTmtD14vORIPZclrQc",

  // 7 大工作表名稱
  SHEETS: {
    ERP_RAW: "01_ERP原始匯入",
    MATERIAL_MASTER: "02_材料品號對照表",
    BOM_RULES: "03_BOM配方設定表",
    CYCLE_COUNT_LOG: "04_現場抽盤流水帳",
    PROCUREMENT: "05_在途採購清冊",
    BOOKING_RECORDS: "06_預約登記明細",
    ROLLING_PROJECTION: "07_45天動態推移底表"
  },

  // 散客保底底線 (Hard Safety Floor)
  SAFETY_FLOOR: {
    WEEKDAY: 10,  // 平日 (週一至週五)
    WEEKEND: 35   // 假日 (週六日與國定假日)
  },

  // 叫貨交期時間閘門 (天數)
  LEAD_TIME_DAYS: 15,

  // 滾動推移預測天數
  PROJECTION_DAYS: 45,

  // 6 大銷售體驗商品
  PRODUCTS: [
    { id: "1", name: "手能生巧", desc: "HTB-50 經典3合1小工具組裝" },
    { id: "2", name: "繪聲繪影 - 胖胖盒款", desc: "胖胖盒 + 框圖A7 + 顏料四色" },
    { id: "3", name: "繪聲繪影 - TB-200款", desc: "TB-200工具箱 + 框圖A7 + 顏料四色" },
    { id: "4", name: "繪聲繪影 - TB-9款", desc: "TB-9隨手工具箱 + 框圖A7 + 顏料四色" },
    { id: "5", name: "旁敲側擊 (折疊籃)", desc: "FB-4531折疊籃，框底側板長短栓多色池組裝" },
    { id: "6", name: "請多紙膠", desc: "CTB-3215L 潘朵拉盒 + 紙膠帶" }
  ],

  // 28 項核心物料主檔資料 (依據 DIY參考資料20260922.xlsx 定義)
  MASTER_MATERIALS: [
    { itemCode: "411HTBX001-RR1001", itemName: "HTB-50 樹德50經典3合1小工具/紅", category: "手能生巧", color: "紅" },
    
    // 旁敲側擊 - 框 (5色)
    { itemCode: "310FBXX001B000071", itemName: "2-FB-4531折疊籃-框/2955U海軍藍", category: "旁敲側擊A", color: "海軍藍" },
    { itemCode: "310FBXX001G000131", itemName: "2-FB-4531折疊籃-框/16-5907綠", category: "旁敲側擊A", color: "綠" },
    { itemCode: "310FBXX001R000111", itemName: "2-FB-4531折疊籃-框/691U通心粉", category: "旁敲側擊A", color: "通心粉" },
    { itemCode: "310FBXX001W000131", itemName: "2-FB-4531折疊籃-框/420C米白", category: "旁敲側擊A", color: "米白" },
    { itemCode: "310FBXX001Y000051", itemName: "2-FB-4531折疊籃-框/1215U黃", category: "旁敲側擊A", color: "黃" },

    // 旁敲側擊 - 底 (5色)
    { itemCode: "310FBXX001B000081", itemName: "2-FB-4531折疊籃-底/2955U海軍藍", category: "旁敲側擊B", color: "海軍藍" },
    { itemCode: "310FBXX001G000141", itemName: "2-FB-4531折疊籃-底/16-5907綠", category: "旁敲側擊B", color: "綠" },
    { itemCode: "310FBXX001R000121", itemName: "2-FB-4531折疊籃-底/691U通心粉", category: "旁敲側擊B", color: "通心粉" },
    { itemCode: "310FBXX001W000141", itemName: "2-FB-4531折疊籃-底/420C米白", category: "旁敲側擊B", color: "米白" },
    { itemCode: "310FBXX001Y000061", itemName: "2-FB-4531折疊籃-底/1215U黃", category: "旁敲側擊B", color: "黃" },

    // 旁敲側擊 - 長側板 (5色)
    { itemCode: "310FBXX001B000091", itemName: "2-FB-4531折疊籃-長側/2955U海軍藍", category: "旁敲側擊C", color: "海軍藍" },
    { itemCode: "310FBXX001G000151", itemName: "2-FB-4531折疊籃-長側/16-5907綠", category: "旁敲側擊C", color: "綠" },
    { itemCode: "310FBXX001R000131", itemName: "2-FB-4531折疊籃-長側/691U通心粉", category: "旁敲側擊C", color: "通心粉" },
    { itemCode: "310FBXX001W000151", itemName: "2-FB-4531折疊籃-長側/420C米白", category: "旁敲側擊C", color: "米白" },
    { itemCode: "310FBXX001Y000071", itemName: "2-FB-4531折疊籃-長側/1215U黃", category: "旁敲側擊C", color: "黃" },

    // 旁敲側擊 - 短側板 (4色)
    { itemCode: "310FBXX001B000101", itemName: "2-FB-4531折疊籃-短側/2955U海軍藍", category: "旁敲側擊D", color: "海軍藍" },
    { itemCode: "310FBXX001G000161", itemName: "2-FB-4531折疊籃-短側/16-5907綠", category: "旁敲側擊D", color: "綠" },
    { itemCode: "310FBXX001R000141", itemName: "2-FB-4531折疊籃-短側/691U通心粉", category: "旁敲側擊D", color: "通心粉" },
    { itemCode: "310FBXX001W000161", itemName: "2-FB-4531折疊籃-短側/420C米白", category: "旁敲側擊D", color: "米白" },

    // 旁敲側擊 - 短栓、長栓
    { itemCode: "21PIFBXX000001", itemName: "栓/FB-4531串仔(鍍五彩)短", category: "旁敲側擊E", color: "鍍五彩" },
    { itemCode: "21PIFBXX000002", itemName: "栓/FB-4531串仔(鍍五彩)長", category: "旁敲側擊F", color: "鍍五彩" },

    // 請多紙膠 - 潘朵拉盒 (2色)
    { itemCode: "411TBXX037-KT1001", itemName: "CTB-3215L潘朵拉收納盒/黑色本體+純白提把隔板+本透上蓋", category: "請多紙膠A", color: "黑" },
    { itemCode: "411TBXX037-WT1001", itemName: "CTB-3215L潘朵拉收納盒/純白本體提把隔板+本透上蓋", category: "請多紙膠A", color: "白" },

    // 繪聲繪影 - 共用料 (框圖、顏料)
    { itemCode: "5D2000003", itemName: "著色框圖A7-4款", category: "繪聲繪影A", color: "共用" },
    { itemCode: "5D2000004", itemName: "創意貼顏料四色", category: "繪聲繪影B", color: "共用" },

    // 繪聲繪影 - 專用箱體 (胖胖盒, TB-200, TB-9)
    { itemCode: "411OFXX013-TT1001", itemName: "OF-A03L厚片胖胖盒/本透本體+本透扣子", category: "繪聲繪影C_胖胖盒", color: "本透" },
    { itemCode: "411TBXX019-TX1002", itemName: "TB-200工具箱/本透本體+混色-8暖米灰6淺黛綠6珍奶內盒+雪白把手", category: "繪聲繪影C_TB200", color: "混色" },
    { itemCode: "414TBXX050-XX1001", itemName: "TB-9小家私隨手工具箱/混色-2通心粉2淺黛綠3暖米灰2霧灰藍3特仕藍蓋底+白把手", category: "繪聲繪影C_TB9", color: "混色" }
  ],

  // BOM 配方規則
  BOM_RULES: [
    // 手能生巧
    { productId: "1", productName: "手能生巧", category: "手能生巧", qty: 1, note: "經典小工具1:1" },

    // 繪聲繪影 - 胖胖盒款
    { productId: "2", productName: "繪聲繪影 - 胖胖盒款", category: "繪聲繪影A", qty: 1, note: "框圖A7 (三款共用)" },
    { productId: "2", productName: "繪聲繪影 - 胖胖盒款", category: "繪聲繪影B", qty: 1, note: "顏料四色 (三款共用)" },
    { productId: "2", productName: "繪聲繪影 - 胖胖盒款", category: "繪聲繪影C_胖胖盒", qty: 1, note: "胖胖盒專用箱" },

    // 繪聲繪影 - TB-200款
    { productId: "3", productName: "繪聲繪影 - TB-200款", category: "繪聲繪影A", qty: 1, note: "框圖A7 (三款共用)" },
    { productId: "3", productName: "繪聲繪影 - TB-200款", category: "繪聲繪影B", qty: 1, note: "顏料四色 (三款共用)" },
    { productId: "3", productName: "繪聲繪影 - TB-200款", category: "繪聲繪影C_TB200", qty: 1, note: "TB-200工具箱專用箱" },

    // 繪聲繪影 - TB-9款
    { productId: "4", productName: "繪聲繪影 - TB-9款", category: "繪聲繪影A", qty: 1, note: "框圖A7 (三款共用)" },
    { productId: "4", productName: "繪聲繪影 - TB-9款", category: "繪聲繪影B", qty: 1, note: "顏料四色 (三款共用)" },
    { productId: "4", productName: "繪聲繪影 - TB-9款", category: "繪聲繪影C_TB9", qty: 1, note: "TB-9工具箱專用箱" },

    // 旁敲側擊 (折疊籃)
    { productId: "5", productName: "旁敲側擊 (折疊籃)", category: "旁敲側擊A", qty: 1, note: "框 (5色總量池)" },
    { productId: "5", productName: "旁敲側擊 (折疊籃)", category: "旁敲側擊B", qty: 1, note: "底 (5色總量池)" },
    { productId: "5", productName: "旁敲側擊 (折疊籃)", category: "旁敲側擊C", qty: 4, note: "長側板 (5色總量池)" },
    { productId: "5", productName: "旁敲側擊 (折疊籃)", category: "旁敲側擊D", qty: 2, note: "短側板 (4色總量池)" },
    { productId: "5", productName: "旁敲側擊 (折疊籃)", category: "旁敲側擊E", qty: 12, note: "短栓 (鍍五彩)" },
    { productId: "5", productName: "旁敲側擊 (折疊籃)", category: "旁敲側擊F", qty: 4, note: "長栓 (鍍五彩)" },

    // 請多紙膠
    { productId: "6", productName: "請多紙膠", category: "請多紙膠A", qty: 1, note: "潘朵拉盒 (2色總量池)" },
    { productId: "6", productName: "請多紙膠", category: "請多紙膠B", qty: 1, note: "紙膠帶 (待建檔)" }
  ]
};

// 輔助函式：取得試算表實例
// - Sidebar/Menu 環境：getActiveSpreadsheet() 有效
// - Web App (doGet) 環境：沒有「作用中試算表」，必須用 openById
function getSpreadsheet() {
  // 先嘗試當前作用中試算表（Sidebar/Menu 呼叫時有效）
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {
    // Web App 環境下 getActiveSpreadsheet() 會拋例外，屬正常，繼續往下走
  }
  
  // Web App 環境：直接用 SPREADSHEET_ID 開啟
  // Container-bound script 存取自己的試算表只需要 spreadsheets scope，不需要 drive scope
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}
