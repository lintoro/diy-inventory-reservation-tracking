/**
 * 系統自動化測試套件 (99_Tests.js)
 */

/**
 * 階段一單元測試：驗證 Google Sheets 7 大底表與主檔匯入
 */
function test_Phase1_DBStructure() {
  const ss = getSpreadsheet();
  const results = {
    testName: "階段一測試：試算表底表結構與主檔驗證",
    timestamp: new Date().toISOString(),
    passed: true,
    details: []
  };

  function assert(condition, description) {
    results.details.push({
      item: description,
      status: condition ? "PASS" : "FAIL"
    });
    if (!condition) {
      results.passed = false;
    }
  }

  // 1. 檢驗 7 張工作表是否齊全
  const requiredSheets = [
    CONFIG.SHEETS.ERP_RAW,
    CONFIG.SHEETS.MATERIAL_MASTER,
    CONFIG.SHEETS.BOM_RULES,
    CONFIG.SHEETS.CYCLE_COUNT_LOG,
    CONFIG.SHEETS.PROCUREMENT,
    CONFIG.SHEETS.BOOKING_RECORDS,
    CONFIG.SHEETS.ROLLING_PROJECTION
  ];

  requiredSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    assert(sheet !== null, `工作表 [${sheetName}] 存在`);
  });

  // 2. 檢驗 [02_材料品號對照表] 是否有 28 項物料
  const matSheet = ss.getSheetByName(CONFIG.SHEETS.MATERIAL_MASTER);
  if (matSheet) {
    const matRows = matSheet.getLastRow() - 1; // 扣除表頭
    assert(matRows === 28, `材料主檔筆數為 28 筆 (實際: ${matRows})`);

    const matCodes = matSheet.getRange(2, 1, matRows > 0 ? matRows : 1, 1).getValues().flat();
    const expectedSampleCodes = ["411HTBX001-RR1001", "21PIFBXX000001", "5D2000003", "411OFXX013-TT1001"];
    expectedSampleCodes.forEach(code => {
      assert(matCodes.includes(code), `材料對照表包含品號 [${code}]`);
    });
  }

  // 3. 檢驗 [03_BOM配方設定表] 是否完整
  const bomSheet = ss.getSheetByName(CONFIG.SHEETS.BOM_RULES);
  if (bomSheet) {
    const bomRows = bomSheet.getLastRow() - 1;
    assert(bomRows >= 14, `BOM 配方表至少有 14 條關聯規則 (實際: ${bomRows})`);
  }

  // 若在試算表介面中觸發，顯示 UI 彈窗通知
  try {
    const ui = SpreadsheetApp.getUi();
    const statusIcon = results.passed ? "✅" : "❌";
    const detailMsg = results.details.map(d => `${d.status === "PASS" ? "✔️" : "✖️"} ${d.item}`).join("\n");
    ui.alert(
      `${statusIcon} ${results.testName}`,
      `測試狀態: ${results.passed ? "全部通過 (SUCCESS)" : "存在失敗項目"}\n\n檢驗細項:\n${detailMsg}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    // 非 UI 執行環境（如 Web App 呼叫）不拋錯
  }

  return results;
}

/**
 * 階段二單元測試：ERP 資料清洗引擎與雙軌庫存融合驗證
 */
function test_Phase2_ERPCleaningAndInventory() {
  const ss = getSpreadsheet();
  const results = {
    testName: "階段二測試：ERP清洗引擎與雙軌庫存融合驗證",
    timestamp: new Date().toISOString(),
    passed: true,
    details: []
  };

  function assert(condition, description) {
    results.details.push({
      item: description,
      status: condition ? "PASS" : "FAIL"
    });
    if (!condition) {
      results.passed = false;
    }
  }

  // 1. 執行真實 ERP 資料匯入與清洗
  const importRes = importERPRawData(SAMPLE_ERP_RAW_ROWS);
  assert(importRes.success === true, "ERP 原始資料成功寫入 [01_ERP原始匯入]");

  const cleanRes = cleanERPDataFromRawSheet();
  assert(cleanRes.success === true, "ERP 資料清洗引擎正常運行");
  assert(cleanRes.count >= 28, `清洗後核心物料納入 ${cleanRes.count} 項 (符合 >= 28 規格)`);

  // 2. 檢驗小計過濾與倉庫鎖定
  let hasSubtotal = false;
  let hasWrongWarehouse = false;
  Object.keys(cleanRes.stockMap).forEach(code => {
    const item = cleanRes.stockMap[code];
    if (code.includes("小計") || item.itemName.includes("小計") || item.itemName.includes("合計")) {
      hasSubtotal = true;
    }
    if (item.whCode !== "640") {
      hasWrongWarehouse = true;
    }
  });
  assert(!hasSubtotal, "已 100% 排除所有小計列與合計列");
  assert(!hasWrongWarehouse, "已 100% 鎖定門市 DIY 640 倉");

  // 3. 檢驗關鍵品號 ERP 帳面數量
  const stockMap = cleanRes.stockMap;
  assert(stockMap["5D2000003"] && stockMap["5D2000003"].qty === 984, "著色框圖A7 數量為 984 (PASS)");
  assert(stockMap["5D2000004"] && stockMap["5D2000004"].qty === 832, "創意貼顏料四色 數量為 832 (PASS)");
  assert(stockMap["411HTBX001-RR1001"] && stockMap["411HTBX001-RR1001"].qty === 675, "手能生巧小工具 數量為 675 (PASS)");
  assert(stockMap["411OFXX013-TT1001"] && stockMap["411OFXX013-TT1001"].qty === 7, "胖胖盒專用箱 數量為 7 (PASS)");
  assert(stockMap["21PIFBXX000001"] && stockMap["21PIFBXX000001"].qty === 4730, "折疊籃短栓 數量為 4730 (PASS)");

  // 4. 檢驗現場隨手抽盤流水帳與雙軌庫存融合優先覆蓋
  const testItemCode = "310FBXX001B000101"; // 海軍藍短側板 (ERP 帳面為 59)
  const countRes = recordCycleCount(testItemCode, 50, "測試員小明", "階段二自動化測試抽盤");
  assert(countRes.success === true, "現場抽盤記錄成功寫入 [04_現場抽盤流水帳]");
  assert(countRes.diff === -9, `盤差正確計算為 -9 (實盤50 - ERP59)`);

  // 取得雙軌融合後庫存
  const effectiveList = getEffectiveInventory();
  const targetMat = effectiveList.find(m => m.itemCode === testItemCode);
  const untouchedMat = effectiveList.find(m => m.itemCode === "5D2000003");

  assert(targetMat && targetMat.effectiveQty === 50, "有抽盤品項之生效庫存成功由實盤數 50 覆蓋 (PASS)");
  assert(targetMat && targetMat.source === "現場實盤優先", "有抽盤品項資料來源標記為 [現場實盤優先] (PASS)");
  assert(untouchedMat && untouchedMat.effectiveQty === 984, "未抽盤品項維持 ERP 帳面數 984 (PASS)");
  assert(untouchedMat && untouchedMat.source === "ERP帳面兜底", "未抽盤品項資料來源標記為 [ERP帳面兜底] (PASS)");

  // UI 彈窗回報
  try {
    const ui = SpreadsheetApp.getUi();
    const statusIcon = results.passed ? "✅" : "❌";
    const detailMsg = results.details.map(d => `${d.status === "PASS" ? "✔️" : "✖️"} ${d.item}`).join("\n");
    ui.alert(
      `${statusIcon} ${results.testName}`,
      `測試狀態: ${results.passed ? "全部通過 (SUCCESS)" : "存在失敗項目"}\n\n檢驗細項:\n${detailMsg}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    // 忽略非 UI 環境
  }

  return results;
}

/**
 * 階段三單元測試：BOM 木桶短板與款式花色總量池運算驗證
 */
function test_Phase3_BOMCapacity() {
  const results = {
    testName: "階段三測試：BOM木桶短板與花色總量池運算驗證",
    timestamp: new Date().toISOString(),
    passed: true,
    details: []
  };

  function assert(condition, description) {
    results.details.push({
      item: description,
      status: condition ? "PASS" : "FAIL"
    });
    if (!condition) {
      results.passed = false;
    }
  }

  // 1. 基於當前真實生效庫存進行基準換算
  const realCapacities = calculateProductCapacities();
  
  // 1.1 手能生巧驗證 (HTB-50 應為 675 套)
  assert(realCapacities["1"] && realCapacities["1"].maxCapacity === 675, "手能生巧: 可接單上限為 675 套 (1:1對齊小工具庫存)");

  // 1.2 胖胖盒款短板驗證 (胖胖盒專用箱僅剩 7 個，應精確受限為 7 套)
  assert(realCapacities["2"] && realCapacities["2"].maxCapacity === 7, "繪聲繪影胖胖盒: 可接單上限為 7 套 (受限於專用箱短板)");
  assert(realCapacities["2"] && realCapacities["2"].bottleneckCategory.includes("胖胖盒"), "繪聲繪影胖胖盒: 短板正確識別為專用箱");

  // 1.3 旁敲側擊 (折疊籃) 木桶短板驗證
  // 框=52(52套), 底=45(45套), 長側=98(24套), 短側=90(45套), 短栓=4730(394套), 長栓=2344(586套)
  // 最短板必定為長側板 (24套)
  assert(realCapacities["5"] && realCapacities["5"].maxCapacity === 24, "旁敲側擊折疊籃: 總量池可做上限精確為 24 套");
  assert(realCapacities["5"] && realCapacities["5"].bottleneckCategory.includes("長側板"), "旁敲側擊折疊籃: 短板正確定位為長側板 (98片 / 4 = 24套)");

  // 2. 極端短板模擬測試 (邊界值注入)
  // 模擬情境 A：短栓斷料 (短栓僅剩 24 支，其他零件各有 1000 份)
  const mockStockShortPin = CONFIG.MASTER_MATERIALS.map(m => {
    let qty = 1000;
    if (m.category === "旁敲側擊E") qty = 24; // 24 支短栓 (單份12支 ➔ 應為 2 套)
    return { itemCode: m.itemCode, category: m.category, effectiveQty: qty };
  });
  const mockCapacitiesA = calculateProductCapacities(mockStockShortPin);
  assert(mockCapacitiesA["5"].maxCapacity === 2, "邊界測試A: 短栓僅 24 支時，折疊籃上限精確降為 2 套");
  assert(mockCapacitiesA["5"].bottleneckCategory.includes("短栓"), "邊界測試A: 短板精確識別為短栓 (短板限制)");

  // 模擬情境 B：繪聲繪影共用料斷料 (框圖僅剩 3 張，箱子與顏料各有 100 份)
  const mockStockShared = CONFIG.MASTER_MATERIALS.map(m => {
    let qty = 100;
    if (m.category === "繪聲繪影A") qty = 3; // 框圖僅 3 張
    return { itemCode: m.itemCode, category: m.category, effectiveQty: qty };
  });
  const mockCapacitiesB = calculateProductCapacities(mockStockShared);
  assert(mockCapacitiesB["2"].maxCapacity === 3, "邊界測試B: 胖胖盒款受限共用框圖上限為 3 套");
  assert(mockCapacitiesB["3"].maxCapacity === 3, "邊界測試B: TB-200款受限共用框圖上限為 3 套");
  assert(mockCapacitiesB["2"].bottleneckCategory.includes("框圖"), "邊界測試B: 短板正確識別為框圖 (共用料)");

  // UI 彈窗回報
  try {
    const ui = SpreadsheetApp.getUi();
    const statusIcon = results.passed ? "✅" : "❌";
    const detailMsg = results.details.map(d => `${d.status === "PASS" ? "✔️" : "✖️"} ${d.item}`).join("\n");
    ui.alert(
      `${statusIcon} ${results.testName}`,
      `測試狀態: ${results.passed ? "全部通過 (SUCCESS)" : "存在失敗項目"}\n\n檢驗細項:\n${detailMsg}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    // 忽略非 UI 環境
  }

  return results;
}

/**
 * 階段四單元測試：45 天動態推移、15 天交期時間閘門防呆與缺料採購單驗證
 */
function test_Phase4_TimeGateAndProjection() {
  const ss = getSpreadsheet();
  const results = {
    testName: "階段四測試：45天推移與15天交期防呆時間閘門驗證",
    timestamp: new Date().toISOString(),
    passed: true,
    details: []
  };

  function assert(condition, description) {
    results.details.push({
      item: description,
      status: condition ? "PASS" : "FAIL"
    });
    if (!condition) {
      results.passed = false;
    }
  }

  // 1. 檢驗散客保底底線 (平日 10 / 假日 35)
  const mondayDate = new Date(2026, 8, 28); // 2026/09/28 (週一)
  const sundayDate = new Date(2026, 8, 27); // 2026/09/27 (週日)
  assert(getSafetyFloor(mondayDate) === 10, "散客保底: 平日 (週一至週五) 正確為 10 份");
  assert(getSafetyFloor(sundayDate) === 35, "散客保底: 假日 (週六、週日) 正確為 35 份");

  // 2. 檢驗 45 天動態推移底表生成
  const projRes = generate45DaysProjection();
  assert(projRes.success === true, "成功執行 45 天動態推移試算");
  
  const projSheet = ss.getSheetByName(CONFIG.SHEETS.ROLLING_PROJECTION);
  const projRows = projSheet.getLastRow() - 1; // 扣除表頭
  assert(projRows === 45, `推移底表正確填入 45 天資料列 (實際: ${projRows})`);

  // 3. 檢驗 15 天交期時間閘門防呆 (情境 B：距今 < 15 天，不可補貨期)
  // 設定活動日為 5 天後
  const today = new Date();
  const dateIn5Days = new Date(today.getTime() + (5 * 24 * 60 * 60 * 1000));
  const dateIn5DaysStr = Utilities.formatDate(dateIn5Days, "Asia/Taipei", "yyyy/MM/dd");
  
  // 3.1 正常單測試：以手能生巧 (庫存 675 套，扣除散客保底 35 仍餘 640 套) 測試預約 10 套
  const checkNearNormal = checkBookingEligibility(dateIn5DaysStr, "1", 10);
  assert(checkNearNormal.canBook === true && checkNearNormal.light === "GREEN", "情境B (5天內正常單): 庫存充足時判定為綠燈，允許接單");

  // 3.2 超額單測試：嘗試預約 50 套折疊籃 (遠超庫存 24 套且小於 15 天，應強制判定為紅燈阻擋)
  const checkNearExcess = checkBookingEligibility(dateIn5DaysStr, "5", 50);
  assert(checkNearExcess.canBook === false && checkNearExcess.light === "RED", "情境B (5天內超額單): 強制亮紅燈且 canBook 為 false (防超賣攔截成功)");

  // 嘗試強行送出紅燈單 ➔ 必須被拒絕
  const submitRedRes = submitBookingRecord(dateIn5DaysStr, "5", 50, "測試超額團", "0900000000", "測試強制攔截");
  assert(submitRedRes.success === false && submitRedRes.light === "RED", "情境B (送單防禦): 紅燈單被系統拒絕登記，不可入庫");

  // 4. 檢驗 15 天交期時間閘門 (情境 A：距今 >= 15 天，可補貨彈性期)
  // 設定活動日為 25 天後
  const dateIn25Days = new Date(today.getTime() + (25 * 24 * 60 * 60 * 1000));
  const dateIn25DaysStr = Utilities.formatDate(dateIn25Days, "Asia/Taipei", "yyyy/MM/dd");

  // 預約 30 套折疊籃 (超過庫存，但 >= 15 天)
  const checkFarExcess = checkBookingEligibility(dateIn25DaysStr, "5", 30);
  assert(checkFarExcess.canBook === true && checkFarExcess.light === "YELLOW", "情境A (25天後超額單): 判定為黃燈，允許彈性接單 (提示叫貨)");
  assert(checkFarExcess.procurementNeeded === true, "情境A: 正確標記 procurementNeeded 為 true");

  // 驗證最晚下單日 (活動日 - 15天 ➔ 距今應為 10 天後)
  const expectedOrderDate = new Date(dateIn25Days.getTime() - (15 * 24 * 60 * 60 * 1000));
  const expectedOrderDateStr = Utilities.formatDate(expectedOrderDate, "Asia/Taipei", "yyyy/MM/dd");
  assert(checkFarExcess.latestOrderDate === expectedOrderDateStr, `情境A: 最晚下單日精確反推為活動日-15天 (${checkFarExcess.latestOrderDate})`);

  // 送出黃燈預約單 ➔ 驗證預約登記 ＋ 自動生成採購待辦單
  const submitYellowRes = submitBookingRecord(
    dateIn25DaysStr, "5", 30, "南投國小師生團(測試)", "0912345678", "階段四自動化測試"
  );
  assert(submitYellowRes.success === true && submitYellowRes.light === "YELLOW", "情境A (送單成功): 黃燈單成功寫入 [06_預約登記明細]");
  assert(submitYellowRes.poNumber.startsWith("PO-"), `情境A (自動採購): 成功在 [05_在途採購清冊] 生成缺料採購單 (${submitYellowRes.poNumber})`);

  // UI 彈窗回報
  try {
    const ui = SpreadsheetApp.getUi();
    const statusIcon = results.passed ? "✅" : "❌";
    const detailMsg = results.details.map(d => `${d.status === "PASS" ? "✔️" : "✖️"} ${d.item}`).join("\n");
    ui.alert(
      `${statusIcon} ${results.testName}`,
      `測試狀態: ${results.passed ? "全部通過 (SUCCESS)" : "存在失敗項目"}\n\n檢驗細項:\n${detailMsg}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    // 忽略非 UI 環境
  }

  return results;
}

/**
 * 階段六單元測試：帳號管理、工號認證、首次強制改密碼與 ERP 檔案直傳自動清洗驗證
 */
function test_Phase6_AuthAndERPUpload() {
  const results = {
    testName: "階段六測試：帳號權限管理與 ERP 檔案直傳清洗驗證",
    timestamp: new Date().toISOString(),
    passed: true,
    details: []
  };

  function assert(condition, description) {
    results.details.push({
      item: description,
      status: condition ? "PASS" : "FAIL"
    });
    if (!condition) results.passed = false;
  }

  // 1. 初始化並檢驗 00_使用者帳號表與初始管理者
  initDatabase();
  const ss = getSpreadsheet();
  const userSheet = ss.getSheetByName(CONFIG.SHEETS.USER_ACCOUNTS);
  assert(userSheet !== null, "[00_使用者帳號表] 工作表成功建立");

  // 2. 測試初始最高管理者 (B111014)
  const loginFail = api_login("B111014", "wrong_password");
  assert(loginFail.success === false, "管理者錯誤密碼登入被成功阻擋 (PASS)");

  const loginAdminSuccess = api_login("B111014", "000000");
  assert(loginAdminSuccess.success === true, "管理者使用預設密碼 000000 成功登入 (PASS)");
  assert(loginAdminSuccess.user.role === "ADMIN", "管理者角色確認為 ADMIN (PASS)");
  assert(loginAdminSuccess.user.mustChangePassword === true, "初始管理者標記首次需改密碼 mustChangePassword === true (PASS)");

  // 3. 測試新同仁線上申請
  const testSalesEmpNo = "TEST_SALES_99";
  const regRes = api_registerUser(testSalesEmpNo, "王大明", "業務課");
  assert(regRes.success === true, `新同仁線上申請成功提交 (${testSalesEmpNo})`);

  // 待審核狀態下嘗試登入 ➔ 應阻擋
  const loginPending = api_login(testSalesEmpNo, "000000");
  assert(loginPending.success === false && loginPending.message.includes("待審核"), "待審核同仁登入被正確攔截 (PASS)");

  // 4. 管理者審核名單查詢與核准開通
  const usersListRes = api_getUsers("B111014");
  assert(usersListRes.success === true, "管理者成功查詢人員清單");
  const targetInList = usersListRes.users.find(u => u.empNo === testSalesEmpNo);
  assert(targetInList && targetInList.status === "PENDING", "申請人名單中狀態確認為 PENDING");

  const approveRes = api_approveUser("B111014", testSalesEmpNo, "SALES");
  assert(approveRes.success === true, "管理者成功核准開通並指派為 SALES 角色");

  // 5. 測試核准後同仁登入與首次強制修改密碼
  const loginApproved = api_login(testSalesEmpNo, "000000");
  assert(loginApproved.success === true, "核准同仁以預設密碼 000000 成功登入");
  assert(loginApproved.user.mustChangePassword === true, "核准同仁標記需修改密碼 (PASS)");

  // 修改密碼：禁止使用預設密碼
  const chgToSame = api_changePassword(testSalesEmpNo, "000000", "000000");
  assert(chgToSame.success === false, "禁止修改為相同之預設密碼 000000 (PASS)");

  // 正確修改密碼為新密碼
  const chgSuccess = api_changePassword(testSalesEmpNo, "000000", "pass123456");
  assert(chgSuccess.success === true, "成功修改新密碼並解除首次修改限制 (PASS)");

  // 以新密碼登入
  const loginNewPwd = api_login(testSalesEmpNo, "pass123456");
  assert(loginNewPwd.success === true && loginNewPwd.user.mustChangePassword === false, "以新密碼登入成功且 mustChangePassword 為 false (PASS)");

  // 6. 管理者停用與防呆測試
  const toggleDisable = api_toggleUserStatus("B111014", testSalesEmpNo, "DISABLED");
  assert(toggleDisable.success === true, "管理者成功停用該同仁");
  const loginDisabled = api_login(testSalesEmpNo, "pass123456");
  assert(loginDisabled.success === false && loginDisabled.message.includes("停用"), "停用狀態登入被精確阻擋 (PASS)");

  // 防呆：禁止停用初始最高管理員
  const toggleAdmin = api_toggleUserStatus("B111014", "B111014", "DISABLED");
  assert(toggleAdmin.success === false, "系統防呆機制成功阻擋停用初始最高管理者 B111014 (PASS)");

  // 恢復同仁啟用
  api_toggleUserStatus("B111014", testSalesEmpNo, "ACTIVE");

  // 7. 測試 ERP 二維陣列上傳與自動清洗 API (api_uploadAndCleanERP)
  const mockFileRows = [
    ["品號", "品名", "規格", "單位", "庫別", "庫別名稱", "庫存數量"], // 表頭
    ["411HTBX001-RR1001", "HTB-50 樹德50經典3合1小工具/紅", "小工具", "PCS", "640", "門市", 300], // 640 倉有效
    ["411HTBX001-RR1001", "小計", "", "", "640", "門市", 300], // 小計 (應過濾)
    ["310FBXX001B000071", "2-FB-4531折疊籃-框/2955U海軍藍", "框", "PCS", "101", "大倉", 500], // 101 大倉 (非640倉，應過濾)
    ["310FBXX001B000071", "2-FB-4531折疊籃-框/2955U海軍藍", "框", "PCS", "640", "門市", 120]  // 640 倉有效
  ];
  const erpUploadRes = api_uploadAndCleanERP(mockFileRows);
  assert(erpUploadRes.success === true, "ERP 陣列直傳與自動清洗執行成功");
  assert(erpUploadRes.totalParsedRows === 4, "正確排除第一列表頭，解析 4 列資料");

  // 檢查 640 倉有效清洗數
  const cleanCheck = cleanERPDataFromRawSheet();
  assert(cleanCheck.stockMap["411HTBX001-RR1001"].qty === 300, "有效清洗 640 倉小工具數量為 300 (排除小計)");
  assert(cleanCheck.stockMap["310FBXX001B000071"].qty === 120, "有效排除 101 倉，僅納入 640 倉框數量 120");

  // 還原為預設 ERP 範例資料，以防影響後續展示
  importERPRawData(SAMPLE_ERP_RAW_ROWS);
  generate45DaysProjection();

  // UI 彈窗回報
  try {
    const ui = SpreadsheetApp.getUi();
    const statusIcon = results.passed ? "✅" : "❌";
    const detailMsg = results.details.map(d => `${d.status === "PASS" ? "✔️" : "✖️"} ${d.item}`).join("\n");
    ui.alert(
      `${statusIcon} ${results.testName}`,
      `測試狀態: ${results.passed ? "全部通過 (SUCCESS)" : "存在失敗項目"}\n\n檢驗細項:\n${detailMsg}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    // 忽略非 UI 環境
  }

  return results;
}

// 注意：doGet 入口唯一定義在 05_API.js，此處不重複定義以避免函式衝突

