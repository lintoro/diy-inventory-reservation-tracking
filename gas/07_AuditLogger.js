/**
 * 系統操作日誌與稽核模組 (07_AuditLogger.js)
 * 責任：
 * 1. 提供 writeAuditLog 統一非同步/安全寫入日誌 (包 try-catch，日誌失敗絕不影響業務邏輯)
 * 2. 提供 api_getAuditLogs 供 ADMIN 查詢與篩選 (支援分頁、多條件篩選與統計)
 * 3. 提供 onEditAuditTrigger 捕捉 Google Sheets 直接手動修改
 * 4. 提供 archiveAuditLogs 依 180 天策略封存逾期紀錄
 */

/**
 * 核心：寫入一筆系統操作日誌
 * @param {Object} logEntry
 * @param {string} [logEntry.operatorEmpNo] 操作人工號 (預設 "SYSTEM")
 * @param {string} [logEntry.operatorName] 操作人姓名
 * @param {string} [logEntry.operatorRole] 操作人角色
 * @param {string} logEntry.module 功能模組 (BOOKING, PROCUREMENT, RECEIPT, INVENTORY, ERP, BOM, MATERIAL, SAFETY_FLOOR, AUTH, USER_ADMIN, SYSTEM, SHEET)
 * @param {string} logEntry.action 動作 (CREATE, UPDATE, DELETE, IMPORT, UPLOAD, RECEIVE, SHORT_CLOSE, TOGGLE, APPROVE, RESET_PWD, AUTO_SYNC, MANUAL_EDIT)
 * @param {string} [logEntry.target] 目標物件 (單號、品號、工號等)
 * @param {string} logEntry.summary 人類可讀之操作摘要說明
 * @param {string} [logEntry.status="成功"] 結果 ("成功" 或 "失敗")
 * @param {string} [logEntry.errorMessage=""] 錯誤訊息
 * @param {string} [logEntry.source="WEB_APP"] 來源 ("WEB_APP", "SHEET_MANUAL", "SYSTEM_AUTO")
 */
function writeAuditLog(logEntry) {
  try {
    if (!logEntry) return;

    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.AUDIT_LOG);
    if (!sheet) {
      // 若尚未建立底表則自動補建
      sheet = ss.insertSheet(CONFIG.SHEETS.AUDIT_LOG);
      const headers = ["紀錄ID", "操作時間", "工號", "姓名", "角色", "功能模組", "動作類型", "目標物件", "操作摘要", "結果", "錯誤訊息", "來源"];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#334155").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
      sheet.setRowHeight(1, 36);
      sheet.setFrozenRows(1);
    }

    const now = new Date();
    const timeStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    const idCompact = Utilities.formatDate(now, "Asia/Taipei", "yyyyMMddHHmmss");
    const rand = String(Math.floor(Math.random() * 900) + 100);
    const logId = `LOG-${idCompact}-${rand}`;

    const empNo = String(logEntry.operatorEmpNo || "SYSTEM").trim();
    const name = String(logEntry.operatorName || (empNo === "SYSTEM" ? "系統自動" : "")).trim();
    const role = String(logEntry.operatorRole || (empNo === "SYSTEM" ? "SYSTEM" : "")).trim();
    const moduleName = String(logEntry.module || "SYSTEM").trim();
    const action = String(logEntry.action || "UPDATE").trim();
    const target = String(logEntry.target || "").trim();
    const summary = String(logEntry.summary || "").trim();
    const status = String(logEntry.status || "成功").trim();
    const errMsg = String(logEntry.errorMessage || "").trim();
    const source = String(logEntry.source || (empNo === "SYSTEM" ? "SYSTEM_AUTO" : "WEB_APP")).trim();

    sheet.appendRow([
      logId,
      timeStr,
      empNo,
      name,
      role,
      moduleName,
      action,
      target,
      summary,
      status,
      errMsg,
      source
    ]);
  } catch (err) {
    // 嚴格隔離原則：日誌失敗絕對不能讓主業務操作中斷
    console.error("writeAuditLog 失敗: " + err.message);
  }
}

/**
 * API: ADMIN 查詢系統操作日誌 (支援分頁、條件過濾與統計)
 * @param {string} adminEmpNo 管理者工號
 * @param {Object} filters 篩選條件
 * @param {number} [page=1] 頁碼 (由 1 起算)
 * @param {number} [pageSize=50] 每頁筆數
 */
function api_getAuditLogs(adminEmpNo, filters, page, pageSize) {
  try {
    // 權限檢查：只有 ADMIN 角色可查詢操作日誌
    const ss = getSpreadsheet();
    const userSheet = ss.getSheetByName(CONFIG.SHEETS.USER_ACCOUNTS);
    if (!userSheet) return { success: false, message: "找不到使用者帳號表" };

    const users = userSheet.getDataRange().getValues();
    const adminUser = users.slice(1).find(u => String(u[0]).trim() === String(adminEmpNo).trim());
    if (!adminUser || String(adminUser[3]).trim() !== CONFIG.ROLES.ADMIN) {
      return { success: false, message: "權限不足：僅系統管理者 (ADMIN) 可查詢操作日誌！" };
    }

    const logSheet = ss.getSheetByName(CONFIG.SHEETS.AUDIT_LOG);
    if (!logSheet || logSheet.getLastRow() <= 1) {
      return {
        success: true,
        logs: [],
        totalCount: 0,
        page: 1,
        totalPages: 1,
        stats: { todayCount: 0, todayFailures: 0, todayActiveUsers: 0 }
      };
    }

    const lastRow = logSheet.getLastRow();
    const rawData = logSheet.getRange(2, 1, lastRow - 1, 12).getValues();

    // 建立今日統計
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd");
    let todayCount = 0;
    let todayFailures = 0;
    const todayUsersSet = new Set();

    // 格式化全部紀錄
    const allLogs = rawData.map((r, idx) => {
      let timeStr = "";
      if (r[1] instanceof Date) {
        timeStr = Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
      } else {
        timeStr = String(r[1] || "").trim();
      }

      const itemDateStr = timeStr.substring(0, 10);
      const isFailed = String(r[9] || "").trim() === "失敗";
      const emp = String(r[2] || "").trim();

      if (itemDateStr === todayStr) {
        todayCount++;
        if (isFailed) todayFailures++;
        if (emp && emp !== "SYSTEM") todayUsersSet.add(emp);
      }

      return {
        logId: String(r[0] || "").trim(),
        time: timeStr,
        empNo: emp,
        name: String(r[3] || "").trim(),
        role: String(r[4] || "").trim(),
        module: String(r[5] || "").trim(),
        action: String(r[6] || "").trim(),
        target: String(r[7] || "").trim(),
        summary: String(r[8] || "").trim(),
        status: String(r[9] || "成功").trim(),
        errorMessage: String(r[10] || "").trim(),
        source: String(r[11] || "WEB_APP").trim()
      };
    });

    // 篩選處理
    const f = filters || {};
    const showAuto = f.showAuto === true; // 是否顯示系統自動紀錄 (預設 false)
    const startDate = f.startDate ? String(f.startDate).replace(/-/g, "/") : "";
    const endDate = f.endDate ? String(f.endDate).replace(/-/g, "/") : "";
    const moduleFilter = f.module || "ALL";
    const actionFilter = f.action || "ALL";
    const statusFilter = f.status || "ALL";
    const sourceFilter = f.source || "ALL";
    const empFilter = (f.empNo || "").trim().toLowerCase();
    const keyword = (f.keyword || "").trim().toLowerCase();

    let filtered = allLogs.filter(item => {
      // 1. 系統自動紀錄預設排除 (除非勾選)
      if (!showAuto && item.source === "SYSTEM_AUTO") return false;

      // 2. 日期範圍過濾 (比對 yyyy/MM/dd)
      const itemDate = item.time.substring(0, 10);
      if (startDate && itemDate < startDate) return false;
      if (endDate && itemDate > endDate) return false;

      // 3. 模組過濾
      if (moduleFilter !== "ALL" && item.module !== moduleFilter) return false;

      // 4. 動作過濾
      if (actionFilter !== "ALL" && item.action !== actionFilter) return false;

      // 5. 結果過濾
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;

      // 6. 來源過濾
      if (sourceFilter !== "ALL" && item.source !== sourceFilter) return false;

      // 7. 工號/姓名過濾
      if (empFilter && !item.empNo.toLowerCase().includes(empFilter) && !item.name.toLowerCase().includes(empFilter)) {
        return false;
      }

      // 8. 關鍵字搜尋 (目標物件、摘要、錯誤訊息)
      if (keyword) {
        const text = `${item.target} ${item.summary} ${item.errorMessage} ${item.empNo} ${item.name}`.toLowerCase();
        if (!text.includes(keyword)) return false;
      }

      return true;
    });

    // 排序：最新在上 (依時間倒序)
    filtered.sort((a, b) => b.time.localeCompare(a.time));

    // 分頁計算
    const p = Math.max(1, Number(page) || 1);
    const size = Math.max(10, Number(pageSize) || CONFIG.AUDIT.PAGE_SIZE);
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / size));
    const startIdx = (p - 1) * size;
    const pagedLogs = filtered.slice(startIdx, startIdx + size);

    return {
      success: true,
      logs: pagedLogs,
      totalCount: totalCount,
      page: p,
      totalPages: totalPages,
      pageSize: size,
      stats: {
        todayCount: todayCount,
        todayFailures: todayFailures,
        todayActiveUsers: todayUsersSet.size
      }
    };
  } catch (err) {
    return { success: false, message: "讀取操作日誌失敗: " + err.message };
  }
}

/**
 * 試算表直接編輯觸發器 (捕捉非 Web App 之工作表手動異動)
 * 需於試算表中設定可安裝式 onEdit 觸發器，或簡易 onEdit
 * @param {Object} e 試算表事件物件
 */
function onEditAuditTrigger(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();

    // 日誌表本身異動不記錄，避免無窮迴圈
    if (sheetName === CONFIG.SHEETS.AUDIT_LOG || sheetName.includes("日誌")) return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    // 忽略首列表頭異動
    if (row <= 1) return;

    const oldVal = (e.oldValue !== undefined) ? String(e.oldValue) : "(原值)";
    const newVal = (e.value !== undefined) ? String(e.value) : "(新值)";
    const cellA1 = e.range.getA1Notation();

    let userEmail = "試算表使用者";
    try {
      userEmail = Session.getActiveUser().getEmail() || userEmail;
    } catch (_) {}

    writeAuditLog({
      operatorEmpNo: userEmail,
      operatorName: userEmail.split("@")[0],
      operatorRole: "SHEET_EDITOR",
      module: "SHEET",
      action: "MANUAL_EDIT",
      target: `${sheetName}!${cellA1}`,
      summary: `手動修改儲存格 [${sheetName}!${cellA1}]：從 '${oldVal}' 改為 '${newVal}'`,
      status: "成功",
      source: "SHEET_MANUAL"
    });
  } catch (err) {
    console.error("onEditAuditTrigger 失敗: " + err.message);
  }
}

/**
 * 定期封存逾期操作日誌 (超過 180 天者自動封存)
 */
function archiveOldAuditLogs() {
  try {
    const ss = getSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEETS.AUDIT_LOG);
    if (!logSheet || logSheet.getLastRow() <= 1) return { archivedCount: 0 };

    const retentionDays = CONFIG.AUDIT.RETENTION_DAYS || 180;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = Utilities.formatDate(cutoffDate, "Asia/Taipei", "yyyy/MM/dd");

    const lastRow = logSheet.getLastRow();
    const rawData = logSheet.getRange(2, 1, lastRow - 1, 12).getValues();

    const toArchive = [];
    const toKeep = [];

    rawData.forEach(r => {
      let timeStr = "";
      if (r[1] instanceof Date) {
        timeStr = Utilities.formatDate(r[1], "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
      } else {
        timeStr = String(r[1] || "").trim();
      }
      const logDate = timeStr.substring(0, 10);

      if (logDate < cutoffStr) {
        toArchive.push(r);
      } else {
        toKeep.push(r);
      }
    });

    if (toArchive.length === 0) return { archivedCount: 0 };

    // 建立或取得封存工作表 (10_系統操作日誌_封存)
    const archiveSheetName = `${CONFIG.SHEETS.AUDIT_LOG}_封存`;
    let archSheet = ss.getSheetByName(archiveSheetName);
    if (!archSheet) {
      archSheet = ss.insertSheet(archiveSheetName);
      const headers = ["紀錄ID", "操作時間", "工號", "姓名", "角色", "功能模組", "動作類型", "目標物件", "操作摘要", "結果", "錯誤訊息", "來源"];
      archSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      archSheet.getRange(1, 1, 1, headers.length).setBackground("#475569").setFontColor("#FFFFFF").setFontWeight("bold");
      archSheet.setFrozenRows(1);
    }

    archSheet.getRange(archSheet.getLastRow() + 1, 1, toArchive.length, 12).setValues(toArchive);

    // 清除主表並重新寫回保留的紀錄
    logSheet.getRange(2, 1, lastRow - 1, 12).clearContent();
    if (toKeep.length > 0) {
      logSheet.getRange(2, 1, toKeep.length, 12).setValues(toKeep);
    }

    writeAuditLog({
      operatorEmpNo: "SYSTEM",
      operatorName: "系統維護",
      operatorRole: "SYSTEM",
      module: "SYSTEM",
      action: "ARCHIVE",
      target: archiveSheetName,
      summary: `自動封存超過 ${retentionDays} 天之日誌，共封存 ${toArchive.length} 筆，主表保留 ${toKeep.length} 筆`,
      status: "成功",
      source: "SYSTEM_AUTO"
    });

    return { archivedCount: toArchive.length, keptCount: toKeep.length };
  } catch (err) {
    console.error("archiveOldAuditLogs 失敗: " + err.message);
    return { error: err.message };
  }
}
