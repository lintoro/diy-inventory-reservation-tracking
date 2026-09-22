/**
 * 帳號管理、權限驗證與密碼安全模組 (06_AuthManager.js)
 * 核心規則：
 * 1. 工號即帳號，完全不收集、不綁定 Gmail
 * 2. 密碼採用 SHA-256 雜湊存儲
 * 3. 初始預設密碼為 000000，核准或重設後「首次登入強制修改密碼」
 * 4. ADMIN 角色可切換三種視角，業務與庫存角色分流鎖定
 */

/**
 * 密碼 SHA-256 雜湊運算
 * @param {string} password 明碼密碼
 * @returns {string} 64 字元十六進位小寫雜湊字串
 */
function hashPassword_(password) {
  if (!password) return "";
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password),
    Utilities.Charset.UTF_8
  );
  let hashStr = "";
  for (let i = 0; i < rawBytes.length; i++) {
    let byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = "0" + byteHex;
    hashStr += byteHex;
  }
  return hashStr;
}

/**
 * 取得使用者帳號表工作表
 */
function getUserAccountSheet_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.USER_ACCOUNTS);
  if (!sheet) {
    initDatabase();
    sheet = ss.getSheetByName(CONFIG.SHEETS.USER_ACCOUNTS);
  }
  return sheet;
}

/**
 * API: 工號登入驗證
 * @param {string} empNo 公司工號
 * @param {string} password 密碼
 */
function api_login(empNo, password) {
  try {
    const cleanEmpNo = String(empNo || "").trim().toUpperCase();
    if (!cleanEmpNo || !password) {
      return { success: false, message: "請輸入工號與密碼！" };
    }

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, message: "尚未建立使用者帳號資料庫！" };
    }

    // 欄位順序：
    // 0:工號, 1:姓名, 2:密碼Hash, 3:角色, 4:狀態, 5:需改密碼, 6:建立時間, 7:最後登入時間
    const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    const inputHash = hashPassword_(password);

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowEmpNo = String(row[0] || "").trim().toUpperCase();

      if (rowEmpNo === cleanEmpNo) {
        const storedHash = String(row[2] || "").trim();
        const role = String(row[3] || "").trim();
        const status = String(row[4] || "").trim();
        const mustChange = (row[5] === true || String(row[5]).toUpperCase() === "TRUE");
        const name = String(row[1] || "").trim();

        // 狀態防呆
        if (status === CONFIG.USER_STATUS.DISABLED) {
          return { success: false, message: "此工號帳號已被停用，請洽詢管理者！" };
        }
        if (status === CONFIG.USER_STATUS.PENDING) {
          return { success: false, message: "此帳號尚在待審核中，請靜待管理者核准開通！" };
        }

        // 驗證密碼
        if (storedHash !== inputHash) {
          return { success: false, message: "工號或密碼錯誤，請重新確認！" };
        }

        // 登入成功，更新最後登入時間 (第 8 欄, index 8)
        const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
        sheet.getRange(i + 2, 8).setValue(nowStr);

        return {
          success: true,
          message: "登入成功！",
          user: {
            empNo: rowEmpNo,
            name: name,
            role: role,
            mustChangePassword: mustChange
          }
        };
      }
    }

    return { success: false, message: "查無此工號帳號，請先線上申請！" };
  } catch (err) {
    return { success: false, message: "登入異常: " + err.message };
  }
}

/**
 * API: 首次登入或自主修改密碼
 * @param {string} empNo 工號
 * @param {string} oldPassword 舊密碼 (預設通常為 000000)
 * @param {string} newPassword 新密碼
 */
function api_changePassword(empNo, oldPassword, newPassword) {
  try {
    const cleanEmpNo = String(empNo || "").trim().toUpperCase();
    if (!cleanEmpNo || !oldPassword || !newPassword) {
      return { success: false, message: "請完整填寫工號、舊密碼與新密碼！" };
    }

    if (String(newPassword).length < 6) {
      return { success: false, message: "新密碼長度至少需 6 碼！" };
    }
    if (newPassword === "000000") {
      return { success: false, message: "新密碼不可使用預設密碼 000000！" };
    }

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const oldHash = hashPassword_(oldPassword);
    const newHash = hashPassword_(newPassword);

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowEmpNo = String(row[0] || "").trim().toUpperCase();

      if (rowEmpNo === cleanEmpNo) {
        const storedHash = String(row[2] || "").trim();
        if (storedHash !== oldHash) {
          return { success: false, message: "舊密碼不正確！" };
        }

        // 更新密碼 Hash (第 3 欄) 與解除強制改密碼標籤 (第 6 欄)
        const rowIndex = i + 2;
        sheet.getRange(rowIndex, 3).setValue(newHash);
        sheet.getRange(rowIndex, 6).setValue(false);

        return {
          success: true,
          message: "密碼修改成功！已解除首次修改限制，歡迎使用系統。"
        };
      }
    }

    return { success: false, message: "找不到該工號資料！" };
  } catch (err) {
    return { success: false, message: "密碼修改失敗: " + err.message };
  }
}

/**
 * API: 同仁線上申請帳號 (預設為 PENDING 待審核，密碼預設 000000)
 * @param {string} empNo 工號
 * @param {string} name 姓名
 * @param {string} department 申請單位或備註
 */
function api_registerUser(empNo, name, department) {
  try {
    const cleanEmpNo = String(empNo || "").trim().toUpperCase();
    const cleanName = String(name || "").trim();
    if (!cleanEmpNo || !cleanName) {
      return { success: false, message: "工號與姓名為必填欄位！" };
    }

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const empNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim().toUpperCase());
      if (empNos.includes(cleanEmpNo)) {
        return { success: false, message: `工號 [${cleanEmpNo}] 已經申請過或已存在，請直接登入或聯繫管理者！` };
      }
    }

    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    const defaultHash = hashPassword_(CONFIG.INITIAL_ADMIN.defaultPassword); // 預設 000000

    // 預設為 PENDING 待審核，角色先給 SALES，需改密碼 TRUE
    sheet.appendRow([
      cleanEmpNo,
      cleanName,
      defaultHash,
      CONFIG.ROLES.SALES,
      CONFIG.USER_STATUS.PENDING,
      true, // 首次進入一定要修改密碼
      nowStr,
      "" // 最後登入
    ]);

    return {
      success: true,
      message: `申請提交成功！工號 [${cleanEmpNo}] 已進入待審核名單，請通知管理者核准開通。`
    };
  } catch (err) {
    return { success: false, message: "申請失敗: " + err.message };
  }
}

/**
 * 內部安全校驗：確認執行者是否具備 ACTIVE 的 ADMIN 權限
 */
function verifyAdmin_(adminEmpNo) {
  const cleanAdminEmpNo = String(adminEmpNo || "").trim().toUpperCase();
  const sheet = getUserAccountSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === cleanAdminEmpNo) {
      const role = String(data[i][3]).trim();
      const status = String(data[i][4]).trim();
      return (role === CONFIG.ROLES.ADMIN && status === CONFIG.USER_STATUS.ACTIVE);
    }
  }
  return false;
}

/**
 * API: 管理者查詢所有人員清單 (含待審核與啟用/停用者)
 * @param {string} adminEmpNo 管理者工號
 */
function api_getUsers(adminEmpNo) {
  try {
    if (!verifyAdmin_(adminEmpNo)) {
      return { success: false, message: "權限不足：僅有系統管理者可存取人員管理名單！" };
    }

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    const list = [];
    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      data.forEach(r => {
        let createdStr = r[6] instanceof Date ? Utilities.formatDate(r[6], "Asia/Taipei", "yyyy/MM/dd HH:mm") : String(r[6] || "");
        let loginStr = r[7] instanceof Date ? Utilities.formatDate(r[7], "Asia/Taipei", "yyyy/MM/dd HH:mm") : String(r[7] || "");
        list.push({
          empNo: String(r[0] || ""),
          name: String(r[1] || ""),
          role: String(r[3] || ""),
          status: String(r[4] || ""),
          mustChangePassword: (r[5] === true || String(r[5]).toUpperCase() === "TRUE"),
          createdAt: createdStr,
          lastLoginAt: loginStr
        });
      });
    }

    return {
      success: true,
      users: list
    };
  } catch (err) {
    return { success: false, message: "取得人員名單失敗: " + err.message };
  }
}

/**
 * API: 管理者審核開通人員
 * @param {string} adminEmpNo 管理者工號
 * @param {string} targetEmpNo 欲審核開通的工號
 * @param {string} role 指派角色 (ADMIN / SALES / INVENTORY)
 */
function api_approveUser(adminEmpNo, targetEmpNo, role) {
  try {
    if (!verifyAdmin_(adminEmpNo)) {
      return { success: false, message: "權限不足：無管理者操作權限！" };
    }

    const cleanTarget = String(targetEmpNo || "").trim().toUpperCase();
    const validRoles = [CONFIG.ROLES.ADMIN, CONFIG.ROLES.SALES, CONFIG.ROLES.INVENTORY];
    const targetRole = validRoles.includes(role) ? role : CONFIG.ROLES.SALES;

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === cleanTarget) {
        const rowIndex = i + 2;
        sheet.getRange(rowIndex, 4).setValue(targetRole);                 // 角色
        sheet.getRange(rowIndex, 5).setValue(CONFIG.USER_STATUS.ACTIVE);   // 狀態開通
        sheet.getRange(rowIndex, 6).setValue(true);                        // 首次登入必改密碼

        return {
          success: true,
          message: `已成功核准工號 [${cleanTarget}]，指派角色為 [${targetRole}]！預設密碼為 000000（首次登入將強制修改）。`
        };
      }
    }

    return { success: false, message: "查無此待審核工號！" };
  } catch (err) {
    return { success: false, message: "審核失敗: " + err.message };
  }
}

/**
 * API: 管理者切換人員狀態 (啟用 ACTIVE / 停用 DISABLED)
 */
function api_toggleUserStatus(adminEmpNo, targetEmpNo, targetStatus) {
  try {
    if (!verifyAdmin_(adminEmpNo)) {
      return { success: false, message: "權限不足：無管理者操作權限！" };
    }

    const cleanTarget = String(targetEmpNo || "").trim().toUpperCase();
    if (cleanTarget === CONFIG.INITIAL_ADMIN.empNo && targetStatus === CONFIG.USER_STATUS.DISABLED) {
      return { success: false, message: "防呆保護：系統最高初始管理者工號不允許停用！" };
    }

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === cleanTarget) {
        const rowIndex = i + 2;
        sheet.getRange(rowIndex, 5).setValue(targetStatus);
        return {
          success: true,
          message: `工號 [${cleanTarget}] 狀態已更新為 [${targetStatus}]！`
        };
      }
    }

    return { success: false, message: "找不到該工號人員！" };
  } catch (err) {
    return { success: false, message: "變更狀態失敗: " + err.message };
  }
}

/**
 * API: 管理者重設同仁密碼為 000000，並開啟首次強制修改密碼
 */
function api_resetUserPassword(adminEmpNo, targetEmpNo) {
  try {
    if (!verifyAdmin_(adminEmpNo)) {
      return { success: false, message: "權限不足：無管理者操作權限！" };
    }

    const cleanTarget = String(targetEmpNo || "").trim().toUpperCase();
    const defaultHash = hashPassword_(CONFIG.INITIAL_ADMIN.defaultPassword);

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === cleanTarget) {
        const rowIndex = i + 2;
        sheet.getRange(rowIndex, 3).setValue(defaultHash); // 重設密碼 Hash
        sheet.getRange(rowIndex, 6).setValue(true);        // 需強制改密碼

        return {
          success: true,
          message: `已將工號 [${cleanTarget}] 密碼重設為 000000！同仁下次登入時將強制要求設定新密碼。`
        };
      }
    }

    return { success: false, message: "找不到該工號人員！" };
  } catch (err) {
    return { success: false, message: "密碼重設失敗: " + err.message };
  }
}

/**
 * API: 管理者直接新增人員帳號
 */
function api_createUserByAdmin(adminEmpNo, empNo, name, role) {
  try {
    if (!verifyAdmin_(adminEmpNo)) {
      return { success: false, message: "權限不足：無管理者操作權限！" };
    }

    const cleanEmpNo = String(empNo || "").trim().toUpperCase();
    const cleanName = String(name || "").trim();
    if (!cleanEmpNo || !cleanName) {
      return { success: false, message: "工號與姓名為必填！" };
    }

    const sheet = getUserAccountSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const empNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim().toUpperCase());
      if (empNos.includes(cleanEmpNo)) {
        return { success: false, message: `工號 [${cleanEmpNo}] 已經存在！` };
      }
    }

    const defaultHash = hashPassword_(CONFIG.INITIAL_ADMIN.defaultPassword);
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

    sheet.appendRow([
      cleanEmpNo,
      cleanName,
      defaultHash,
      role || CONFIG.ROLES.SALES,
      CONFIG.USER_STATUS.ACTIVE,
      true, // 首次必改密碼
      nowStr,
      ""
    ]);

    return {
      success: true,
      message: `人員 [${cleanName} (${cleanEmpNo})] 建立完成！預設密碼為 000000，首次登入將強制修改。`
    };
  } catch (err) {
    return { success: false, message: "建立人員失敗: " + err.message };
  }
}
